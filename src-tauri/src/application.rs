use std::cell::Cell;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tempfile::{Builder, NamedTempFile};

use crate::{frontmatter, index};

/// The notes directory and its derived index, held under the same operation lock.
pub struct Core {
    pub notes_dir: PathBuf,
    pub conn: rusqlite::Connection,
    pub index_dirty: Cell<bool>,
}

/// Why a command failed. A webview tab has to tell a file that is gone from a
/// read it should retry or report, and a message string cannot carry that.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    Failed,
    NotFound,
}

/// A command failure: the kind the caller branches on, and the message it shows.
#[derive(Debug, Serialize, specta::Type, thiserror::Error)]
#[error("{message}")]
pub struct CommandError {
    pub kind: ErrorKind,
    pub message: String,
}

/// The reason a syscall gives, in the app's voice: lowercase, no errno.
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
/// syscall failure leaves the note where it was.
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

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub content: String,
    #[specta(type = f64)]
    pub updated_at: i64,
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

fn collision(path: &str) -> CommandError {
    let path = Path::new(path);
    let name = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let folder = path
        .parent()
        .and_then(|folder| folder.to_str())
        .filter(|folder| !folder.is_empty())
        .unwrap_or("the notes root");
    format!("a note named {name} already exists in {folder}").into()
}

/// Publish a fully written sibling, refusing a destination that already exists.
fn create_file(path: &Path, rel: &str, content: &str) -> Result<i64, CommandError> {
    let folder = path.parent().ok_or("a note outside any folder")?;
    let mut temp = Builder::new().suffix(".tmp").tempfile_in(folder)?;
    write_temp(&mut temp, content)?;
    let updated_at = checked_mtime(temp.as_file())?;
    temp.persist_noclobber(path).map_err(|error| {
        if error.error.kind() == io::ErrorKind::AlreadyExists {
            collision(rel)
        } else {
            error.error.into()
        }
    })?;
    Ok(updated_at)
}

fn write_temp(temp: &mut NamedTempFile, content: &str) -> io::Result<()> {
    use std::io::Write as _;

    temp.write_all(content.as_bytes())?;
    // `persist` synchronizes neither the bytes nor the directory, so without
    // this the rename can reach disk first and a power cut leaves the empty
    // file this whole dance exists to prevent.
    temp.as_file().sync_all()
}

/// A committed file change whose derived index or source cleanup needs attention.
#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum MutationWarning {
    Index { path: String, message: String },
    Cleanup { path: String, message: String },
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MutationReceipt {
    pub path: String,
    #[specta(type = f64)]
    pub updated_at: i64,
    pub warnings: Vec<MutationWarning>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PathMutationReceipt {
    pub path: String,
    pub file: NoteFile,
    pub remaining_source: Option<String>,
    pub title: Option<String>,
    pub warnings: Vec<MutationWarning>,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct DeleteReceipt {
    pub path: String,
    pub warnings: Vec<MutationWarning>,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum SaveName {
    Heading,
    Filename(String),
}

#[derive(Deserialize, specta::Type)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum NoteName {
    Filename(String),
    Title(String),
}

#[derive(Default, Deserialize, specta::Type)]
pub struct CreateNote {
    pub content: Option<String>,
    pub folder: Option<String>,
    pub name: Option<NoteName>,
}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty() && !segment.starts_with('.') && !segment.contains(['/', '\\', ':'])
}

fn validate_folder(folder: &str) -> Result<String, CommandError> {
    let folder = folder.trim_matches(frontmatter::is_space);
    if folder.encode_utf16().count() > 120 {
        return Err("folder must be 120 characters or fewer".into());
    }
    if !folder.is_empty() && !folder.split('/').all(valid_segment) {
        return Err(r"folder parts cannot be blank, contain \ or :, or start with a dot".into());
    }
    Ok(folder.to_owned())
}

fn validate_filename(filename: &str) -> Result<String, CommandError> {
    let filename = filename.trim_matches(frontmatter::is_space);
    if filename.is_empty() {
        return Err("filename is required".into());
    }
    if filename.encode_utf16().count() > 120 {
        return Err("filename must be 120 characters or fewer".into());
    }
    if !valid_segment(filename) {
        return Err(r"filename cannot contain / \ : or start with a dot".into());
    }
    Ok(filename.to_owned())
}

fn validate_title(title: &str) -> Result<String, CommandError> {
    let title = title.trim_matches(frontmatter::is_space);
    if title.is_empty() {
        return Err("title is required".into());
    }
    if title.contains(['\n', '\r']) {
        return Err("title cannot span lines".into());
    }
    Ok(title.to_owned())
}

fn truncate_name(name: &str, limit: usize) -> String {
    let mut units = 0;
    name.chars()
        .take_while(|c| {
            units += c.len_utf16();
            units <= limit
        })
        .collect()
}

fn filename_from_title(title: &str) -> String {
    let mut separated = String::new();
    for c in title.to_lowercase().chars() {
        let c = if frontmatter::is_space(c) || c.is_control() || "\"*/:<>?\\|".contains(c) {
            '-'
        } else {
            c
        };
        if c != '-' || !separated.ends_with('-') {
            separated.push(c);
        }
    }
    let slug = truncate_name(&separated, 120)
        .trim_matches(['.', '-'])
        .to_owned();
    if slug.is_empty() {
        "untitled".into()
    } else {
        slug
    }
}

fn suffixed_filename(base: &str, counter: usize) -> String {
    let suffix = format!("-{counter}");
    let room = 120 - suffix.len();
    let stem = if base.encode_utf16().count() > room {
        truncate_name(base, room)
            .trim_end_matches(['.', '-'])
            .to_owned()
    } else {
        base.to_owned()
    };
    format!("{stem}{suffix}")
}

fn note_path(folder: &str, filename: &str) -> String {
    if folder.is_empty() {
        format!("{filename}.md")
    } else {
        format!("{folder}/{filename}.md")
    }
}

fn checked_mtime(file: &fs::File) -> Result<i64, CommandError> {
    let time = file
        .metadata()?
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "the file timestamp precedes the epoch")?;
    i64::try_from(time.as_millis()).map_err(|_| "the file timestamp is too large".into())
}

/// Publish an existing note's replacement and obtain the receipt timestamp before publication.
fn replace(path: &Path, content: &str) -> Result<i64, CommandError> {
    let original = fs::OpenOptions::new().write(true).open(path)?;
    let folder = path.parent().ok_or("a note outside any folder")?;
    let mut temp = Builder::new().suffix(".tmp").tempfile_in(folder)?;
    fs::set_permissions(temp.path(), original.metadata()?.permissions())?;
    write_temp(&mut temp, content)?;
    let updated_at = checked_mtime(temp.as_file())?;
    temp.persist(path).map_err(|error| error.error)?;
    Ok(updated_at)
}

fn reconcile(core: &Core, paths: &[&str]) -> Vec<MutationWarning> {
    let mut warnings = Vec::new();
    for path in paths {
        if let Err(error) = index::reindex_file(&core.conn, &core.notes_dir, path) {
            core.index_dirty.set(true);
            log::error!("committed {path}, but indexing failed: {error}");
            warnings.push(MutationWarning::Index {
                path: (*path).to_owned(),
                message: CommandError::from(error).message,
            });
        }
    }
    warnings
}

pub fn ensure_index(core: &Core) -> Result<(), CommandError> {
    if core.index_dirty.get() {
        reindex_all(core)?;
    }
    Ok(())
}

pub fn db_select(core: &Core, sql: String, params: Vec<Value>) -> Result<Vec<Vec<Value>>, String> {
    ensure_index(core).map_err(|error| error.message)?;
    index::select(&core.conn, &sql, &params)
}

pub fn read_note(core: &Core, path: String) -> Result<NoteFile, CommandError> {
    let abs = resolve(core, &path)?;
    let file = fs::File::open(&abs)?;
    let content = fs::read_to_string(&abs)?;
    Ok(NoteFile {
        content,
        updated_at: checked_mtime(&file)?,
    })
}

pub fn create_note(core: &Core, options: CreateNote) -> Result<MutationReceipt, CommandError> {
    let folder = validate_folder(options.folder.as_deref().unwrap_or(""))?;
    let base = match options.name {
        Some(NoteName::Filename(name)) => validate_filename(&name)?,
        Some(NoteName::Title(title)) => filename_from_title(&validate_title(&title)?),
        None => "untitled".to_owned(),
    };
    let mut path = note_path(&folder, &base);
    let mut counter = 1;
    while resolve(core, &path)?.try_exists()? {
        counter += 1;
        path = note_path(&folder, &suffixed_filename(&base, counter));
    }
    let abs = resolve(core, &path)?;
    let parent = abs.parent().ok_or("a note outside any folder")?;
    fs::create_dir_all(parent)?;
    let updated_at = create_file(&abs, &path, options.content.as_deref().unwrap_or(""))?;
    let warnings = reconcile(core, &[&path]);
    Ok(MutationReceipt {
        path,
        updated_at,
        warnings,
    })
}

fn publish_path_change(
    core: &Core,
    from: String,
    to: String,
    original: NoteFile,
    content: String,
    title: Option<String>,
) -> Result<PathMutationReceipt, CommandError> {
    let source = resolve(core, &from)?;
    let target = resolve(core, &to)?;
    if target.try_exists()? {
        return Err(collision(&to));
    }
    let parent = target.parent().ok_or("a note outside any folder")?;
    fs::create_dir_all(parent)?;
    let metadata = fs::metadata(&source)?;
    let mut temp = Builder::new().suffix(".tmp").tempfile_in(parent)?;
    fs::set_permissions(temp.path(), metadata.permissions())?;
    write_temp(&mut temp, &content)?;
    if content == original.content {
        temp.as_file()
            .set_times(fs::FileTimes::new().set_modified(metadata.modified()?))?;
        temp.as_file().sync_all()?;
    }
    let updated_at = checked_mtime(temp.as_file())?;
    temp.persist_noclobber(&target).map_err(|error| {
        if error.error.kind() == io::ErrorKind::AlreadyExists {
            collision(&to)
        } else {
            error.error.into()
        }
    })?;
    let mut warnings = Vec::new();
    let remaining_source = match fs::remove_file(&source) {
        Ok(()) => None,
        Err(error) => {
            log::error!("committed {to}, but could not remove {from}: {error}");
            warnings.push(MutationWarning::Cleanup {
                path: from.clone(),
                message: io_reason(&error),
            });
            Some(from.clone())
        }
    };
    warnings.extend(reconcile(core, &[&from, &to]));
    Ok(PathMutationReceipt {
        path: to,
        file: NoteFile {
            content,
            updated_at,
        },
        remaining_source,
        title,
        warnings,
    })
}

/// Publish one complete document and its filename without overwriting another note.
fn save_file(
    path: String,
    content: String,
    name: Option<SaveName>,
) -> Result<MutationReceipt, CommandError> {
    let source = PathBuf::from(&path);
    if !is_markdown(&source) {
        return Err("notes must be markdown files".into());
    }
    let metadata = fs::metadata(&source)?;
    let filename = match name {
        Some(SaveName::Heading) => index::leading_heading(frontmatter::parse(&content).body)
            .map(|heading| format!("{}.md", filename_from_title(&heading))),
        Some(SaveName::Filename(filename)) => {
            if !valid_segment(&filename) || !is_markdown(Path::new(&filename)) {
                return Err("invalid note filename".into());
            }
            Some(filename)
        }
        None => None,
    };
    let Some(filename) = filename else {
        return Ok(MutationReceipt {
            path,
            updated_at: replace(&source, &content)?,
            warnings: vec![],
        });
    };
    let folder = source.parent().ok_or("a note outside any folder")?;
    let stem = Path::new(&filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("invalid filename")?;
    let extension = Path::new(&filename)
        .extension()
        .and_then(|s| s.to_str())
        .ok_or("invalid filename")?;
    let mut temp = Builder::new().suffix(".tmp").tempfile_in(folder)?;
    fs::set_permissions(temp.path(), metadata.permissions())?;
    write_temp(&mut temp, &content)?;
    let updated_at = checked_mtime(temp.as_file())?;
    let original = source.canonicalize()?;
    let mut counter = 1;
    loop {
        let candidate = if counter == 1 {
            filename.clone()
        } else {
            format!("{}.{}", suffixed_filename(stem, counter), extension)
        };
        let target = folder.join(candidate);
        let same = target == source
            || match fs::symlink_metadata(&target) {
                Ok(metadata) => metadata.is_file() && target.canonicalize()? == original,
                Err(error) if error.kind() == io::ErrorKind::NotFound => false,
                Err(error) => return Err(error.into()),
            };
        if same {
            temp.persist(&target).map_err(|error| error.error)?;
            return Ok(MutationReceipt {
                path: target.to_string_lossy().into_owned(),
                updated_at,
                warnings: vec![],
            });
        }
        match temp.persist_noclobber(&target) {
            Ok(_) => {
                let warnings = match fs::remove_file(&source) {
                    Ok(()) => vec![],
                    Err(error) => vec![MutationWarning::Cleanup {
                        path: path.clone(),
                        message: io_reason(&error),
                    }],
                };
                return Ok(MutationReceipt {
                    path: target.to_string_lossy().into_owned(),
                    updated_at,
                    warnings,
                });
            }
            Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
                temp = error.file;
                counter += 1;
            }
            Err(error) => return Err(error.error.into()),
        }
    }
}

/// Persist a live document; reads and watcher observations never request naming.
pub fn save_note(
    core: &Core,
    path: String,
    content: String,
    name: Option<SaveName>,
) -> Result<MutationReceipt, CommandError> {
    let source = resolve(core, &path)?;
    let mut receipt = save_file(source.to_string_lossy().into_owned(), content, name)?;
    receipt.path = Path::new(&receipt.path)
        .strip_prefix(&core.notes_dir)
        .map_err(|_| "a saved note escaped the library")?
        .to_string_lossy()
        .into_owned();
    for warning in &mut receipt.warnings {
        if let MutationWarning::Cleanup {
            path: remaining, ..
        } = warning
        {
            *remaining = path.clone();
        }
    }
    let paths = if path == receipt.path {
        vec![path.as_str()]
    } else {
        vec![path.as_str(), receipt.path.as_str()]
    };
    receipt.warnings.extend(reconcile(core, &paths));
    Ok(receipt)
}

pub fn move_note(
    core: &Core,
    path: String,
    folder: String,
) -> Result<PathMutationReceipt, CommandError> {
    let folder = validate_folder(&folder)?;
    let name = path.rsplit('/').next().ok_or("a note without a filename")?;
    let target = if folder.is_empty() {
        name.to_owned()
    } else {
        format!("{folder}/{name}")
    };
    let file = read_note(core, path.clone())?;
    if path == target {
        return Ok(PathMutationReceipt {
            path,
            file,
            remaining_source: None,
            title: None,
            warnings: vec![],
        });
    }
    publish_path_change(core, path, target, file.clone(), file.content, None)
}

pub fn delete_note(core: &Core, path: String) -> Result<DeleteReceipt, CommandError> {
    fs::remove_file(resolve(core, &path)?)?;
    let warnings = reconcile(core, &[&path]);
    Ok(DeleteReceipt { path, warnings })
}

pub fn attach_file(core: &Core, source: String) -> Result<String, CommandError> {
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

pub fn attach_image(core: &Core, base64_data: String) -> Result<String, CommandError> {
    use base64::Engine as _;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|_| "the pasted image is not valid")?;

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

pub fn read_external(path: String) -> Result<NoteFile, CommandError> {
    let abs = PathBuf::from(&path);
    if !is_markdown(&abs) {
        return Err("only markdown files can be opened".into());
    }
    let content = fs::read_to_string(&abs)?;
    Ok(NoteFile {
        content,
        updated_at: checked_mtime(&fs::File::open(&abs)?)?,
    })
}

pub fn write_external(
    path: String,
    content: String,
    name: Option<SaveName>,
) -> Result<MutationReceipt, CommandError> {
    save_file(path, content, name)
}

pub fn reindex_all(core: &Core) -> Result<Vec<String>, CommandError> {
    core.index_dirty.set(true);
    index::clear(&core.conn)?;
    let changed = index::scan_complete(&core.conn, &core.notes_dir)?;
    core.index_dirty.set(false);
    Ok(changed)
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum OpenKind {
    External,
    Note,
}

/// A queued "Open With" path, classified so the webview opens it as the tab
/// kind the file already is: a note inside the notes dir, external otherwise.
#[derive(Debug, PartialEq, Serialize, specta::Type)]
pub struct PendingOpen {
    pub kind: OpenKind,
    pub path: String,
}

fn classify_open(notes_dir: &Path, path: String) -> PendingOpen {
    let host = fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
    match index::relative_path(notes_dir, &host).filter(|_| index::is_note_file(&host)) {
        Some(rel) => PendingOpen {
            kind: OpenKind::Note,
            path: rel,
        },
        None => PendingOpen {
            kind: OpenKind::External,
            path,
        },
    }
}

pub fn classify_opens(notes_dir: &Path, paths: Vec<String>) -> Vec<PendingOpen> {
    let notes_dir = fs::canonicalize(notes_dir).unwrap_or_else(|_| notes_dir.to_path_buf());
    paths
        .into_iter()
        .map(|path| classify_open(&notes_dir, path))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn should_recompute_collision_suffixes_and_exclude_the_current_file() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        fs::write(directory.path().join("shopping.md"), "# imported").unwrap();
        fs::write(
            directory.path().join("weekend-errands.md"),
            "someone else's note",
        )
        .unwrap();
        let first = save_note(
            &core,
            "shopping.md".into(),
            "# Weekend errands\n\nbody".into(),
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(first.path, "weekend-errands-2.md");
        let second = save_note(
            &core,
            first.path,
            "# Weekend errands\n\nbody".into(),
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(second.path, "weekend-errands-2.md");
        assert_eq!(
            fs::read_to_string(directory.path().join("weekend-errands.md")).unwrap(),
            "someone else's note"
        );
        fs::remove_file(directory.path().join("weekend-errands.md")).unwrap();
        let third = save_note(
            &core,
            second.path,
            "# Weekend errands\n\nbody".into(),
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(third.path, "weekend-errands.md");
        assert!(!directory.path().join("weekend-errands-2.md").exists());
        assert_eq!(
            db_select(&core, "SELECT path FROM note".into(), vec![]).unwrap(),
            vec![vec![Value::from("weekend-errands.md")]]
        );
    }

    #[test]
    fn should_keep_filenames_for_reads_body_edits_and_empty_headings() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        fs::write(directory.path().join("shopping.md"), "# Errands\n\nbody").unwrap();
        read_note(&core, "shopping.md".into()).unwrap();
        assert!(directory.path().join("shopping.md").exists());
        assert!(!directory.path().join("errands.md").exists());
        let body = save_note(
            &core,
            "shopping.md".into(),
            "# Errands\n\nnew body".into(),
            None,
        )
        .unwrap();
        assert_eq!(body.path, "shopping.md");
        let empty = save_note(
            &core,
            body.path,
            "# \n\nbody".into(),
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(empty.path, "shopping.md");
    }

    #[test]
    fn should_restore_a_filename_for_undo_without_overwriting_another_note() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        fs::write(directory.path().join("weekend.md"), "# Weekend").unwrap();
        let restored = save_note(
            &core,
            "weekend.md".into(),
            "# Errands".into(),
            Some(SaveName::Filename("shopping.md".into())),
        )
        .unwrap();
        assert_eq!(restored.path, "shopping.md");
        fs::write(directory.path().join("weekend.md"), "# other").unwrap();
        let redo = save_note(
            &core,
            restored.path,
            "# Weekend".into(),
            Some(SaveName::Filename("weekend.md".into())),
        )
        .unwrap();
        assert_eq!(redo.path, "weekend-2.md");
        assert_eq!(
            fs::read_to_string(directory.path().join("weekend.md")).unwrap(),
            "# other"
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_treat_a_symlink_to_the_current_file_as_a_taken_filename() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("shopping.md");
        let link = directory.path().join("errands.md");
        fs::write(&source, "# imported").unwrap();
        std::os::unix::fs::symlink(&source, &link).unwrap();
        let receipt = write_external(
            source.to_string_lossy().into_owned(),
            "# Errands".into(),
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(
            Path::new(&receipt.path),
            directory.path().join("errands-2.md")
        );
        assert_eq!(fs::read_link(link).unwrap(), source);
        assert!(!source.exists());
    }

    #[test]
    fn should_save_external_heading_edits_without_an_index() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("shopping.md");
        fs::write(&path, "# Errands").unwrap();
        let receipt = write_external(
            path.to_string_lossy().into_owned(),
            "# Weekend errands".into(),
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(
            Path::new(&receipt.path),
            directory.path().join("weekend-errands.md")
        );
        assert!(!path.exists());
        assert!(!directory.path().join(".notras").exists());
    }

    #[test]
    fn should_leave_whole_unicode_characters_at_the_filename_limit() {
        assert_eq!(
            filename_from_title(&format!("{}😀", "a".repeat(119))),
            "a".repeat(119)
        );
        assert_eq!(
            filename_from_title(&format!("{}😀", "a".repeat(118))),
            format!("{}😀", "a".repeat(118))
        );
    }

    #[test]
    fn should_match_the_recorded_filename_fixtures() {
        let fixtures: Value =
            serde_json::from_str(include_str!("../../fixtures/note-mutations.json")).unwrap();
        for case in fixtures["filenames"].as_array().unwrap() {
            assert_eq!(
                filename_from_title(case["title"].as_str().unwrap()),
                case["expected"].as_str().unwrap(),
                "{case}"
            );
        }
    }

    #[test]
    fn should_validate_names_before_creating_any_files_and_suffix_existing_names() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        for name in ["", ".hidden", "a/b", "a\\b", "a:b"] {
            assert!(create_note(
                &core,
                CreateNote {
                    name: Some(NoteName::Filename(name.into())),
                    ..Default::default()
                }
            )
            .is_err());
        }
        assert!(create_note(
            &core,
            CreateNote {
                folder: Some("../outside".into()),
                ..Default::default()
            }
        )
        .is_err());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
        let base = "a".repeat(120);
        let first = create_note(
            &core,
            CreateNote {
                name: Some(NoteName::Filename(base.clone())),
                ..Default::default()
            },
        )
        .unwrap();
        let second = create_note(
            &core,
            CreateNote {
                name: Some(NoteName::Filename(base)),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(first.path, format!("{}.md", "a".repeat(120)));
        assert_eq!(second.path, format!("{}-2.md", "a".repeat(118)));
    }

    #[test]
    fn should_refuse_incomplete_index_recovery_and_keep_direct_file_reads_available() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(true),
        };
        fs::write(directory.path().join("good.md"), "readable").unwrap();
        fs::write(directory.path().join("bad.md"), [0xff]).unwrap();
        assert!(db_select(&core, "SELECT path FROM note".into(), vec![]).is_err());
        assert!(core.index_dirty.get());
        assert_eq!(
            read_note(&core, "good.md".into()).unwrap().content,
            "readable"
        );
        fs::write(directory.path().join("bad.md"), "fixed").unwrap();
        assert_eq!(
            db_select(&core, "SELECT count(*) FROM note".into(), vec![]).unwrap(),
            vec![vec![Value::from(2)]]
        );
    }

    proptest! {
        #[test]
        fn should_derive_a_valid_bounded_filename(title in ".{0,300}") {
            let filename = filename_from_title(&title);
            prop_assert!(valid_segment(&filename));
            prop_assert!(filename.encode_utf16().count() <= 120);
            prop_assert_eq!(filename_from_title(&filename), filename);
        }
    }

    #[test]
    fn should_report_committed_writes_and_refuse_stale_reads_until_recovery_succeeds() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        fs::write(directory.path().join("a.md"), "# old").unwrap();
        index::index_file(&core.conn, &core.notes_dir, "a.md").unwrap();
        core.conn.execute_batch("PRAGMA query_only = ON").unwrap();
        let receipt = save_note(&core, "a.md".into(), "# saved".into(), None).unwrap();
        assert!(
            matches!(receipt.warnings.as_slice(), [MutationWarning::Index { path, .. }] if path == "a.md")
        );
        assert_eq!(read_note(&core, "a.md".into()).unwrap().content, "# saved");
        assert!(db_select(&core, "SELECT title FROM note".into(), vec![]).is_err());
        core.conn.execute_batch("PRAGMA query_only = OFF").unwrap();
        assert_eq!(
            db_select(&core, "SELECT title FROM note".into(), vec![]).unwrap(),
            vec![vec![Value::from("saved")]]
        );
        assert!(!core.index_dirty.get());
    }

    #[cfg(unix)]
    #[test]
    fn should_report_the_destination_and_remaining_source_when_cleanup_fails() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        fs::create_dir(directory.path().join("source")).unwrap();
        fs::write(directory.path().join("source/a.md"), "# original").unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        let source = directory.path().join("source");
        fs::set_permissions(&source, fs::Permissions::from_mode(0o555)).unwrap();
        if fs::File::create(source.join("probe")).is_err() {
            let receipt = move_note(&core, "source/a.md".into(), "destination".into()).unwrap();
            assert_eq!(receipt.path, "destination/a.md");
            assert_eq!(receipt.remaining_source.as_deref(), Some("source/a.md"));
            assert!(matches!(
                receipt.warnings.as_slice(),
                [MutationWarning::Cleanup { .. }]
            ));
            assert_eq!(
                fs::read_to_string(source.join("a.md")).unwrap(),
                "# original"
            );
            assert_eq!(
                fs::read_to_string(directory.path().join("destination/a.md")).unwrap(),
                "# original"
            );
        }
        fs::set_permissions(source, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    fn should_save_and_read_indexed_notes_without_a_native_runtime() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Core {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };

        let receipt = create_note(
            &core,
            CreateNote {
                content: Some("# title\nbody".into()),
                name: Some(NoteName::Filename("a".into())),
                folder: None,
            },
        )
        .unwrap();
        let read = read_note(&core, "a.md".into()).unwrap();

        assert_eq!(receipt.path, "a.md");
        assert_eq!(read.content, "# title\nbody");
        assert_eq!(read.updated_at, receipt.updated_at);
        assert_eq!(
            db_select(&core, "SELECT path, title FROM note".into(), vec![]).unwrap(),
            vec![vec![
                Value::String("a.md".into()),
                Value::String("title".into())
            ]]
        );
    }

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

        assert_eq!(
            error.message,
            "a note named taken already exists in the notes root"
        );
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

        assert_eq!(
            open,
            PendingOpen {
                kind: OpenKind::Note,
                path: "work/a.md".into()
            }
        );
    }

    #[test]
    fn classifies_a_file_outside_the_vault_as_external() {
        let open = classify_open(Path::new("/vault"), "/elsewhere/a.md".into());

        assert_eq!(
            open,
            PendingOpen {
                kind: OpenKind::External,
                path: "/elsewhere/a.md".into()
            }
        );
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

        assert_eq!(
            open,
            PendingOpen {
                kind: OpenKind::Note,
                path: "NOTE.MD".into()
            }
        );
    }
    #[test]
    #[cfg(unix)]
    fn classifies_through_a_symlinked_notes_dir() {
        let real = scratch_dir("symlink-real");
        fs::write(real.join("a.md"), "").unwrap();
        let link =
            std::env::temp_dir().join(format!("notras-test-symlink-link-{}", std::process::id()));
        let _ = fs::remove_file(&link);
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let through_link =
            classify_opens(&link, vec![real.join("a.md").to_string_lossy().to_string()]);
        let through_real =
            classify_opens(&real, vec![link.join("a.md").to_string_lossy().to_string()]);

        assert_eq!(
            through_link,
            vec![PendingOpen {
                kind: OpenKind::Note,
                path: "a.md".into()
            }]
        );
        assert_eq!(
            through_real,
            vec![PendingOpen {
                kind: OpenKind::Note,
                path: "a.md".into()
            }]
        );

        let _ = fs::remove_file(&link);
        let _ = fs::remove_dir_all(&real);
    }
    #[test]
    fn a_syscall_failure_reads_as_a_lowercase_reason() {
        let denied = CommandError::from(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Permission denied (os error 13)",
        ));
        let missing = CommandError::from(io::Error::from(io::ErrorKind::NotFound));

        assert_eq!(denied.kind, ErrorKind::Failed);
        assert_eq!(denied.message, "permission denied");
        assert_eq!(missing.kind, ErrorKind::NotFound);
        assert_eq!(missing.message, "no such file");
    }

    #[test]
    fn an_unmapped_syscall_failure_keeps_its_text_without_the_errno() {
        let error = CommandError::from(io::Error::other("Too many open files (os error 24)"));

        assert_eq!(error.message, "too many open files");
    }
}
