use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_store::StoreExt;

use crate::index;
use crate::state::{AppState, Core};
use crate::{watcher, NotesChanged};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub content: String,
    pub updated_at: i64,
}

fn mtime_millis(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or_default()
}

/// Resolve a relative note path against the notes dir, rejecting anything
/// that escapes it or touches hidden files/directories.
fn resolve(core: &Core, rel: &str) -> Result<PathBuf, String> {
    let path = Path::new(rel);
    let escapes = path.is_absolute()
        || path.components().any(|component| {
            !matches!(&component, Component::Normal(name) if !name.to_string_lossy().starts_with('.'))
        });
    if rel.is_empty() || escapes {
        return Err(format!("invalid note path: {rel}"));
    }
    Ok(core.notes_dir.join(path))
}

fn is_markdown(path: &Path) -> bool {
    index::is_note_file(path)
}

fn emit_changed(app: &AppHandle, paths: Vec<String>) {
    let _ = app.emit("notes-changed", NotesChanged { paths });
}

#[tauri::command]
pub fn db_select(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Vec<Value>>, String> {
    let core = state.core.lock().unwrap();
    index::select(&core.conn, &sql, &params)
}

#[tauri::command]
pub fn note_exists(state: State<'_, AppState>, path: String) -> Result<bool, String> {
    let core = state.core.lock().unwrap();
    Ok(resolve(&core, &path)?.exists())
}

#[tauri::command]
pub fn read_note(state: State<'_, AppState>, path: String) -> Result<NoteFile, String> {
    let core = state.core.lock().unwrap();
    let abs = resolve(&core, &path)?;
    let content = fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    Ok(NoteFile {
        content,
        updated_at: mtime_millis(&abs),
    })
}

#[tauri::command]
pub fn write_note(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<i64, String> {
    let core = state.core.lock().unwrap();
    let abs = resolve(&core, &path)?;
    if !is_markdown(&abs) {
        return Err("notes must be markdown files".into());
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&abs, content).map_err(|e| e.to_string())?;
    index::index_file(&core.conn, &core.notes_dir, &path).map_err(|e| e.to_string())?;
    drop(core);
    emit_changed(&app, vec![path]);
    Ok(mtime_millis(&abs))
}

#[tauri::command]
pub fn rename_note(
    app: AppHandle,
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<(), String> {
    let core = state.core.lock().unwrap();
    let source = resolve(&core, &from)?;
    let target = resolve(&core, &to)?;
    if !is_markdown(&target) {
        return Err("notes must be markdown files".into());
    }
    if target.exists() {
        return Err(format!("a note named {to} already exists"));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&source, &target).map_err(|e| e.to_string())?;
    index::remove(&core.conn, &from).map_err(|e| e.to_string())?;
    index::index_file(&core.conn, &core.notes_dir, &to).map_err(|e| e.to_string())?;
    drop(core);
    emit_changed(&app, vec![from, to]);
    Ok(())
}

#[tauri::command]
pub fn delete_note(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let core = state.core.lock().unwrap();
    let abs = resolve(&core, &path)?;
    fs::remove_file(&abs).map_err(|e| e.to_string())?;
    index::remove(&core.conn, &path).map_err(|e| e.to_string())?;
    drop(core);
    emit_changed(&app, vec![path]);
    Ok(())
}

/// Copy a dragged-in file into `attachments/`, deduping the name. Returns the
/// path relative to the notes dir for building the markdown link.
#[tauri::command]
pub fn attach_file(state: State<'_, AppState>, source: String) -> Result<String, String> {
    let core = state.core.lock().unwrap();
    let source = PathBuf::from(source);
    let name = source
        .file_name()
        .ok_or("source has no file name")?
        .to_string_lossy()
        .to_string();

    let dir = core.notes_dir.join("attachments");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (name.clone(), String::new()),
    };
    let mut candidate = name;
    let mut counter = 1;
    while dir.join(&candidate).exists() {
        counter += 1;
        candidate = format!("{stem}-{counter}{ext}");
    }

    fs::copy(&source, dir.join(&candidate)).map_err(|e| e.to_string())?;
    Ok(format!("attachments/{candidate}"))
}

/// Save a pasted clipboard image into `attachments/`, returning the
/// relative path for the markdown link.
#[tauri::command]
pub fn attach_image(state: State<'_, AppState>, base64_data: String) -> Result<String, String> {
    use base64::Engine as _;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;

    let core = state.core.lock().unwrap();
    let dir = core.notes_dir.join("attachments");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let mut candidate = format!("pasted-{stamp}.png");
    let mut counter = 1;
    while dir.join(&candidate).exists() {
        counter += 1;
        candidate = format!("pasted-{stamp}-{counter}.png");
    }

    fs::write(dir.join(&candidate), bytes).map_err(|e| e.to_string())?;
    Ok(format!("attachments/{candidate}"))
}

#[tauri::command]
pub fn read_external(path: String) -> Result<NoteFile, String> {
    let abs = PathBuf::from(&path);
    if !is_markdown(&abs) {
        return Err("only markdown files can be opened".into());
    }
    let content = fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    Ok(NoteFile {
        content,
        updated_at: mtime_millis(&abs),
    })
}

#[tauri::command]
pub fn write_external(path: String, content: String) -> Result<i64, String> {
    let abs = PathBuf::from(&path);
    if !is_markdown(&abs) {
        return Err("only markdown files can be written".into());
    }
    fs::write(&abs, content).map_err(|e| e.to_string())?;
    Ok(mtime_millis(&abs))
}

#[tauri::command]
pub fn get_notes_dir(state: State<'_, AppState>) -> String {
    state
        .core
        .lock()
        .unwrap()
        .notes_dir
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn set_notes_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let notes_dir = PathBuf::from(&path);
    fs::create_dir_all(notes_dir.join(".notras")).map_err(|e| e.to_string())?;
    crate::allow_assets(&app, &notes_dir);

    let conn = rusqlite::Connection::open(notes_dir.join(".notras/index.db"))
        .map_err(|e| e.to_string())?;
    index::ensure_schema(&conn).map_err(|e| e.to_string())?;
    index::scan_all(&conn, &notes_dir).map_err(|e| e.to_string())?;

    {
        let mut core = state.core.lock().unwrap();
        core.notes_dir = notes_dir.clone();
        core.conn = conn;
    }

    // Swap the watcher only after the core lock is released -- dropping the
    // old debouncer joins its thread, which may be waiting on that lock.
    let fresh = watcher::start(app.clone(), notes_dir);
    *state.watcher.lock().unwrap() = fresh;

    if let Ok(store) = app.store("settings.json") {
        store.set("notesDir", Value::String(path));
    }

    emit_changed(&app, vec![]);
    Ok(())
}

/// Rebuild the derived index from the files.
///
/// The rows are dropped before scanning, because `index_file` skips a file whose
/// mtime matches its stored row and a plain re-scan would leave every untouched
/// note holding whatever the old derivation produced.
#[tauri::command]
pub fn reindex_all(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let core = state.core.lock().unwrap();
    index::clear(&core.conn).map_err(|e| e.to_string())?;
    let changed = index::scan_all(&core.conn, &core.notes_dir).map_err(|e| e.to_string())?;
    drop(core);
    // Unconditional, because `clear` is itself a change: a vault whose files were
    // all deleted outside the app scans back empty, and without an event the
    // webview would keep reading the rows that were just dropped.
    emit_changed(&app, changed.clone());
    Ok(changed)
}

#[tauri::command]
pub fn pending_open_files(state: State<'_, AppState>) -> Vec<String> {
    std::mem::take(&mut *state.pending_open.lock().unwrap())
}

/// Called by the frontend once it has flushed pending writes, in answer to the
/// `app-quit` event.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Called instead of `quit_app` when a buffer could not be written: quitting
/// would throw the user's text away, so the exit is called off.
#[tauri::command]
pub fn cancel_quit(state: State<'_, AppState>) {
    state.quitting.store(false, Ordering::SeqCst);
}
