use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_store::StoreExt;
use tempfile::{Builder, NamedTempFile};

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

/// The reason a syscall gives, in the app's voice: lowercase, no errno. The
/// common kinds get a phrase of their own; the rest keep libc's text with the
/// `(os error N)` suffix cut and the first letter lowered.
fn io_reason(error: &io::Error) -> String {
    match error.kind() {
        io::ErrorKind::NotFound => "no such file".to_string(),
        io::ErrorKind::PermissionDenied => "permission denied".to_string(),
        io::ErrorKind::IsADirectory => "that path is a folder".to_string(),
        io::ErrorKind::ReadOnlyFilesystem => "the volume is read-only".to_string(),
        io::ErrorKind::StorageFull => "the disk is full".to_string(),
        _ => {
            let text = error.to_string();
            let text = text.split(" (os error ").next().unwrap_or(&text);
            let mut chars = text.chars();
            chars.next().map_or_else(String::new, |first| {
                first.to_lowercase().chain(chars).collect()
            })
        }
    }
}

/// A missing file is the one failure a tab treats as a deletion; every other
/// syscall failure leaves the note where it was (`D55`).
impl From<io::Error> for CommandError {
    fn from(error: io::Error) -> Self {
        Self {
            kind: if error.kind() == io::ErrorKind::NotFound {
                ErrorKind::NotFound
            } else {
                ErrorKind::Failed
            },
            message: io_reason(&error),
        }
    }
}

impl From<rusqlite::Error> for CommandError {
    fn from(error: rusqlite::Error) -> Self {
        format!("index: {error}").into()
    }
}

impl From<index::IndexError> for CommandError {
    fn from(error: index::IndexError) -> Self {
        match error {
            index::IndexError::Io(error) => error.into(),
            index::IndexError::Db(error) => error.into(),
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

/// Write a file that is not there yet, never truncating one that is.
///
/// `create_new` is atomic where a prior `exists()` is not: `NoteService.create`
/// picks a free filename by asking, and anything landing on that path in the
/// gap would be destroyed by `fs::write`.
fn create_file(path: &Path, rel: &str, content: &str) -> Result<(), CommandError> {
    use std::io::Write as _;

    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| {
            if error.kind() == io::ErrorKind::AlreadyExists {
                let path = Path::new(rel);
                let name = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or(rel);
                let folder = path
                    .parent()
                    .and_then(|folder| folder.to_str())
                    .filter(|folder| !folder.is_empty())
                    .unwrap_or("the notes root");
                CommandError::from(format!("a note named {name} already exists in {folder}"))
            } else {
                CommandError::from(error)
            }
        })?;

    // `create_new` succeeding is the proof this call made the file, so a half
    // written note is this call's to remove and cannot be someone else's.
    if let Err(error) = file.write_all(content.as_bytes()) {
        drop(file);
        let _ = fs::remove_file(path);

        return Err(error.into());
    }

    Ok(())
}

fn write_temp(temp: &mut NamedTempFile, content: &str) -> io::Result<()> {
    use std::io::Write as _;

    temp.write_all(content.as_bytes())?;
    // `persist` synchronizes neither the bytes nor the directory, so without
    // this the rename can reach disk first and a power cut leaves the empty
    // file this whole dance exists to prevent.
    temp.as_file().sync_all()
}

/// Put `content` at `path` by filling a sibling and renaming over it, so a
/// write that fails or is interrupted leaves the note's old bytes rather than a
/// truncated file.
///
/// The sibling shares the directory because `rename` is only atomic inside one
/// filesystem, and ends in `.tmp` so neither the watcher nor a scan takes it
/// for a note (`is_note_file`). `tempfile` names it randomly and drops it on
/// every failure path, so a name left by a crash cannot collide with a later
/// save and nothing here has to remove one by hand.
fn commit(path: &Path, content: &str) -> Result<(), CommandError> {
    let folder = path.parent().ok_or("a note outside any folder")?;

    let mut temp = Builder::new()
        .suffix(".tmp")
        .tempfile_in(folder)?;

    // A temp is private by default, so the note's own mode is carried over
    // rather than narrowed to owner-only by the rename.
    write_temp(&mut temp, content)
        .and_then(|()| fs::metadata(path))
        .and_then(|meta| fs::set_permissions(temp.path(), meta.permissions()))?;

    temp.persist(path).map_err(|error| error.error)?;

    Ok(())
}

/// Overwrite a file that is already there, never creating one.
///
/// Opening without `create` is what refuses a note that has been deleted, so a
/// save still in flight when it goes cannot put the file back. The check is one
/// syscall ahead of the rename rather than fused with it: no portable rename
/// refuses a destination that is absent, and `commit` buys crash safety for
/// every save in exchange for that window.
fn replace(path: &Path, content: &str) -> Result<(), CommandError> {
    fs::OpenOptions::new()
        .write(true)
        .open(path)?;

    commit(path, content)
}

fn emit_changed(app: &AppHandle, paths: Vec<String>) {
    if let Err(error) = app.emit("notes-changed", NotesChanged { paths }) {
        log::error!("could not emit {}: {error}", "notes-changed");
    }
}

#[tauri::command]
pub fn db_select(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Vec<Value>>, String> {
    let core = state.core();
    index::select(&core.conn, &sql, &params)
}

#[tauri::command]
pub fn note_exists(state: State<'_, AppState>, path: String) -> Result<bool, CommandError> {
    let core = state.core();
    Ok(resolve(&core, &path)?.exists())
}

#[tauri::command]
pub fn read_note(state: State<'_, AppState>, path: String) -> Result<NoteFile, CommandError> {
    let core = state.core();
    let abs = resolve(&core, &path)?;
    let content = fs::read_to_string(&abs)?;
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
    create: bool,
) -> Result<i64, CommandError> {
    let core = state.core();
    let abs = resolve(&core, &path)?;
    if !is_markdown(&abs) {
        return Err("notes must be markdown files".into());
    }
    if create {
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent)?;
        }
        create_file(&abs, &path, &content)?;
    } else {
        replace(&abs, &content)?;
    }
    index::index_file(&core.conn, &core.notes_dir, &path)?;
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
    let core = state.core();
    let source = resolve(&core, &from)?;
    let target = resolve(&core, &to)?;
    if !is_markdown(&target) {
        return Err("notes must be markdown files".into());
    }
    if target.exists() {
        let path = Path::new(&to);
        let name = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or(&to);
        let folder = path
            .parent()
            .and_then(|folder| folder.to_str())
            .filter(|folder| !folder.is_empty())
            .unwrap_or("the notes root");
        return Err(format!("a note named {name} already exists in {folder}").into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&source, &target)?;
    index::remove(&core.conn, &from)?;
    index::index_file(&core.conn, &core.notes_dir, &to)?;
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
    let core = state.core();
    let abs = resolve(&core, &path)?;
    fs::remove_file(&abs)?;
    index::remove(&core.conn, &path)?;
    drop(core);
    emit_changed(&app, vec![path]);
    Ok(())
}

/// Copy a dragged-in file into `attachments/`, deduping the name. Returns the
/// path relative to the notes dir for building the markdown link.
#[tauri::command]
pub fn attach_file(state: State<'_, AppState>, source: String) -> Result<String, CommandError> {
    let core = state.core();
    let source = PathBuf::from(source);
    let name = source
        .file_name()
        .ok_or("source has no file name")?
        .to_string_lossy()
        .to_string();

    let dir = core.notes_dir.join("attachments");
    fs::create_dir_all(&dir)?;

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

    fs::copy(&source, dir.join(&candidate))?;
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
        .map_err(|_| "the pasted image is not valid")?;

    let core = state.core();
    let dir = core.notes_dir.join("attachments");
    fs::create_dir_all(&dir)?;

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

    fs::write(dir.join(&candidate), bytes)?;
    Ok(format!("attachments/{candidate}"))
}

#[tauri::command]
pub fn read_external(path: String) -> Result<NoteFile, CommandError> {
    let abs = PathBuf::from(&path);
    if !is_markdown(&abs) {
        return Err("only markdown files can be opened".into());
    }
    let content = fs::read_to_string(&abs)?;
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
    // Nothing creates an external file: it arrives from "Open With" (`D54`).
    replace(&abs, &content)?;
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
    fs::create_dir_all(notes_dir.join(".notras"))?;
    let conn = index::open(&notes_dir)?;
    index::scan_all(&conn, &notes_dir)?;

    // Persisted before the swap: a folder the next launch cannot find again is
    // worse than one this launch never switched to.
    let store = app
        .store("settings.json")
        .map_err(|error| format!("the setting could not be saved: {error}"))?;
    store.set("notesDir", Value::String(path));
    store
        .save()
        .map_err(|error| format!("the setting could not be saved: {error}"))?;

    crate::allow_assets(&app, &notes_dir);

    {
        let mut core = state.core();
        core.notes_dir = notes_dir.clone();
        core.conn = conn;
    }

    // Swap the watcher only after the core lock is released -- dropping the
    // old debouncer joins its thread, which may be waiting on that lock.
    let fresh = watcher::start(app.clone(), notes_dir);
    *state.watcher() = fresh;

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
    let core = state.core();
    index::clear(&core.conn)?;
    let changed = index::scan_all(&core.conn, &core.notes_dir)?;
    drop(core);
    // Unconditional, because `clear` is itself a change: a vault whose files were
    // all deleted outside the app scans back empty, and without an event the
    // webview would keep reading the rows that were just dropped.
    emit_changed(&app, changed.clone());
    Ok(changed)
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OpenKind {
    External,
    Note,
}

/// A queued "Open With" path, classified so the webview opens it as the tab
/// kind the file already is: a note inside the notes dir, external otherwise.
#[derive(Debug, PartialEq, Serialize)]
pub struct PendingOpen {
    pub kind: OpenKind,
    pub path: String,
}

fn classify_open(notes_dir: &Path, path: String) -> PendingOpen {
    let host = fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
    match index::relative_path(notes_dir, &host).filter(|_| index::is_note_file(&host)) {
        Some(rel) => PendingOpen { kind: OpenKind::Note, path: rel },
        None => PendingOpen { kind: OpenKind::External, path },
    }
}

fn classify_opens(notes_dir: &Path, paths: Vec<String>) -> Vec<PendingOpen> {
    let notes_dir = fs::canonicalize(notes_dir).unwrap_or_else(|_| notes_dir.to_path_buf());
    paths
        .into_iter()
        .map(|path| classify_open(&notes_dir, path))
        .collect()
}

/// The kind each restored external tab is today, so a store an older build
/// wrote does not keep a vault note as an external tab.
#[tauri::command]
pub fn classify_open_paths(state: State<'_, AppState>, paths: Vec<String>) -> Vec<PendingOpen> {
    let core = state.core();
    classify_opens(&core.notes_dir, paths)
}

#[tauri::command]
pub fn pending_open_files(state: State<'_, AppState>) -> Vec<PendingOpen> {
    let paths = std::mem::take(&mut *state.pending_open());
    let core = state.core();
    classify_opens(&core.notes_dir, paths)
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

    /// A directory of this test's own, so a shared `/tmp` cannot hand two runs
    /// the same path and nothing here follows a symlink someone else planted.
    /// Wiped on the way in rather than out, so a panicking test still leaves
    /// the next run clean. `index.rs` carries the same helper for its own dirs.
    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("notras-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_reads_as_not_found() {
        let error = fs::read_to_string("/notras-does-not-exist/missing.md").unwrap_err();

        assert_eq!(CommandError::from(error).kind, ErrorKind::NotFound);
    }

    #[test]
    fn unreadable_file_reads_as_failed() {
        // A directory opens and then refuses the read on both macOS and Linux,
        // which is the cheapest non-NotFound io error to raise on either.
        let error = fs::read_to_string(scratch_dir("unreadable")).unwrap_err();

        assert_eq!(CommandError::from(error).kind, ErrorKind::Failed);
    }

    #[test]
    fn replace_refuses_a_file_that_is_not_there() {
        let missing = scratch_dir("replace-missing").join("gone.md");

        let error = replace(&missing, "recreated").unwrap_err();

        assert_eq!(error.kind, ErrorKind::NotFound);
        assert!(!missing.exists());
    }

    /// A read-only directory blocks the sibling `commit` writes, which is the
    /// cheapest way to fail a write after the destination has been proven to
    /// exist. Root ignores the mode, so the assertions only run where it bites.
    #[cfg(unix)]
    #[test]
    fn a_failed_replace_leaves_the_original_bytes() {
        use std::os::unix::fs::PermissionsExt;

        let dir = scratch_dir("replace-failure");
        let note = dir.join("note.md");
        fs::write(&note, "the original bytes").unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o555)).unwrap();

        if fs::File::create(dir.join("probe")).is_err() {
            assert!(replace(&note, "replacement").is_err());
            assert_eq!(fs::read_to_string(&note).unwrap(), "the original bytes");
        }

        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn replace_keeps_the_note_mode() {
        use std::os::unix::fs::PermissionsExt;

        // Neither `tempfile`'s owner-only default nor the usual umask result,
        // so a mode that survives can only have been carried over.
        let note = scratch_dir("replace-mode").join("note.md");
        fs::write(&note, "before").unwrap();
        fs::set_permissions(&note, fs::Permissions::from_mode(0o640)).unwrap();

        replace(&note, "after").unwrap();

        let mode = fs::metadata(&note).unwrap().permissions().mode();

        assert_eq!(mode & 0o777, 0o640);
    }

    #[test]
    fn replace_leaves_no_temporary_behind() {
        let dir = scratch_dir("replace-temp");
        let note = dir.join("note.md");
        fs::write(&note, "before").unwrap();

        replace(&note, "after").unwrap();

        let left: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();

        assert_eq!(left, vec![std::ffi::OsString::from("note.md")]);
    }

    #[test]
    fn create_refuses_a_path_that_is_taken() {
        let taken = scratch_dir("create-taken").join("taken.md");
        fs::write(&taken, "someone else's note").unwrap();

        let error = create_file(&taken, "taken.md", "clobbered").unwrap_err();

        assert_eq!(error.message, "a note named taken already exists in the notes root");
        assert_eq!(fs::read_to_string(&taken).unwrap(), "someone else's note");
    }

    #[test]
    fn replace_overwrites_a_file_that_is_there() {
        let existing = scratch_dir("replace-existing").join("note.md");
        fs::write(&existing, "before").unwrap();

        replace(&existing, "after").unwrap();

        assert_eq!(fs::read_to_string(&existing).unwrap(), "after");
    }

    #[test]
    fn a_message_without_a_kind_is_a_failure() {
        let error: CommandError = "invalid note path: ../escape".into();

        assert_eq!(error.kind, ErrorKind::Failed);
        assert_eq!(error.message, "invalid note path: ../escape");
    }
    #[test]
    fn classifies_a_vault_file_as_a_note() {
        let open = classify_open(Path::new("/vault"), "/vault/work/a.md".into());

        assert_eq!(open, PendingOpen { kind: OpenKind::Note, path: "work/a.md".into() });
    }

    #[test]
    fn classifies_a_file_outside_the_vault_as_external() {
        let open = classify_open(Path::new("/vault"), "/elsewhere/a.md".into());

        assert_eq!(open, PendingOpen { kind: OpenKind::External, path: "/elsewhere/a.md".into() });
    }

    #[test]
    fn a_sibling_dir_sharing_the_prefix_is_outside_the_vault() {
        let open = classify_open(Path::new("/vault"), "/vault-archive/a.md".into());

        assert_eq!(open.kind, OpenKind::External);
    }

    #[test]
    fn a_hidden_segment_inside_the_vault_is_external() {
        let open = classify_open(Path::new("/vault"), "/vault/.drafts/a.md".into());

        assert_eq!(open.kind, OpenKind::External);
    }

    #[test]
    fn a_non_markdown_file_inside_the_vault_is_external() {
        let open = classify_open(Path::new("/vault"), "/vault/a.txt".into());

        assert_eq!(open.kind, OpenKind::External);
    }

    #[test]
    fn an_uppercase_extension_inside_the_vault_is_a_note() {
        let open = classify_open(Path::new("/vault"), "/vault/NOTE.MD".into());

        assert_eq!(open, PendingOpen { kind: OpenKind::Note, path: "NOTE.MD".into() });
    }
    #[test]
    #[cfg(unix)]
    fn classifies_through_a_symlinked_notes_dir() {
        let real = scratch_dir("symlink-real");
        fs::write(real.join("a.md"), "").unwrap();
        let link = std::env::temp_dir().join(format!("notras-test-symlink-link-{}", std::process::id()));
        let _ = fs::remove_file(&link);
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let through_link = classify_opens(&link, vec![real.join("a.md").to_string_lossy().to_string()]);
        let through_real = classify_opens(&real, vec![link.join("a.md").to_string_lossy().to_string()]);

        assert_eq!(through_link, vec![PendingOpen { kind: OpenKind::Note, path: "a.md".into() }]);
        assert_eq!(through_real, vec![PendingOpen { kind: OpenKind::Note, path: "a.md".into() }]);

        let _ = fs::remove_file(&link);
        let _ = fs::remove_dir_all(&real);
    }
    #[test]
    fn a_syscall_failure_reads_as_a_lowercase_reason() {
        let denied = CommandError::from(io::Error::from_raw_os_error(13));
        let missing = CommandError::from(io::Error::from(io::ErrorKind::NotFound));

        assert_eq!(denied.kind, ErrorKind::Failed);
        assert_eq!(denied.message, "permission denied");
        assert_eq!(missing.kind, ErrorKind::NotFound);
        assert_eq!(missing.message, "no such file");
    }

    #[test]
    fn an_unmapped_syscall_failure_keeps_its_text_without_the_errno() {
        let error = CommandError::from(io::Error::from_raw_os_error(24));

        assert_eq!(error.message, "too many open files");
    }
}
