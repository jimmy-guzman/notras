use std::fs;
use std::io;
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

/// Why a command failed. A webview tab has to tell a file that is gone from a
/// read it should retry or report, and a message string cannot carry that
/// (`D55`).
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    Failed,
    NotFound,
}

/// A command failure: the kind the caller branches on, and the message it shows.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub kind: ErrorKind,
    pub message: String,
}

impl CommandError {
    /// Classify a failed read, so a deleted file is distinguishable from a
    /// permission or IO failure that leaves the note where it was.
    fn from_read(error: io::Error) -> Self {
        Self {
            kind: if error.kind() == io::ErrorKind::NotFound {
                ErrorKind::NotFound
            } else {
                ErrorKind::Failed
            },
            message: error.to_string(),
        }
    }
}

/// Every `?` on a `Result<_, String>` lands here, so a command that has nothing
/// to say about the kind keeps its body unchanged.
impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self {
            kind: ErrorKind::Failed,
            message,
        }
    }
}

impl From<&str> for CommandError {
    fn from(message: &str) -> Self {
        message.to_string().into()
    }
}

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
pub fn note_exists(state: State<'_, AppState>, path: String) -> Result<bool, CommandError> {
    let core = state.core.lock().unwrap();
    Ok(resolve(&core, &path)?.exists())
}

#[tauri::command]
pub fn read_note(state: State<'_, AppState>, path: String) -> Result<NoteFile, CommandError> {
    let core = state.core.lock().unwrap();
    let abs = resolve(&core, &path)?;
    let content = fs::read_to_string(&abs).map_err(CommandError::from_read)?;
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
) -> Result<i64, CommandError> {
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
) -> Result<(), CommandError> {
    let core = state.core.lock().unwrap();
    let source = resolve(&core, &from)?;
    let target = resolve(&core, &to)?;
    if !is_markdown(&target) {
        return Err("notes must be markdown files".into());
    }
    if target.exists() {
        return Err(format!("a note named {to} already exists").into());
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
) -> Result<(), CommandError> {
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
pub fn attach_file(state: State<'_, AppState>, source: String) -> Result<String, CommandError> {
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
pub fn attach_image(
    state: State<'_, AppState>,
    base64_data: String,
) -> Result<String, CommandError> {
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
pub fn read_external(path: String) -> Result<NoteFile, CommandError> {
    let abs = PathBuf::from(&path);
    if !is_markdown(&abs) {
        return Err("only markdown files can be opened".into());
    }
    let content = fs::read_to_string(&abs).map_err(CommandError::from_read)?;
    Ok(NoteFile {
        content,
        updated_at: mtime_millis(&abs),
    })
}

#[tauri::command]
pub fn write_external(path: String, content: String) -> Result<i64, CommandError> {
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
) -> Result<(), CommandError> {
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
pub fn reindex_all(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<String>, CommandError> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_reads_as_not_found() {
        let error = fs::read_to_string("/notras-does-not-exist/missing.md").unwrap_err();

        assert_eq!(CommandError::from_read(error).kind, ErrorKind::NotFound);
    }

    #[test]
    fn unreadable_file_reads_as_failed() {
        // A directory opens and then refuses the read on both macOS and Linux,
        // which is the cheapest non-NotFound io error to raise on either.
        let error = fs::read_to_string(std::env::temp_dir()).unwrap_err();

        assert_eq!(CommandError::from_read(error).kind, ErrorKind::Failed);
    }

    #[test]
    fn a_message_without_a_kind_is_a_failure() {
        let error: CommandError = "invalid note path: ../escape".into();

        assert_eq!(error.kind, ErrorKind::Failed);
        assert_eq!(error.message, "invalid note path: ../escape");
    }
}
