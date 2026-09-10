use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tempfile::{Builder, NamedTempFile};

use crate::{
    frontmatter, index, markdown,
    note_file::{timestamp_millis, OpenedNote},
    relative_path::RelativePath,
    Library,
};

/// Why a command failed. A webview tab has to tell a file that is gone from a
/// read it should retry or report, and a message string cannot carry that.
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    Failed,
    NotFound,
}

/// A command failure: the kind the caller branches on, and the message it shows.
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize, thiserror::Error)]
#[error("{message}")]
pub struct CommandError {
    pub kind: ErrorKind,
    pub message: String,
    #[serde(skip)]
    #[cfg_attr(feature = "bindings", specta(skip))]
    source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

impl CommandError {
    /// Retain a diagnostic cause without exposing it in the serialized failure.
    pub fn with_source(
        message: impl Into<String>,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        Self {
            kind: ErrorKind::Failed,
            message: message.into(),
            source: Some(Box::new(source)),
        }
    }
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
            source: Some(Box::new(error)),
        }
    }
}

impl From<rusqlite::Error> for CommandError {
    fn from(error: rusqlite::Error) -> Self {
        Self::with_source(format!("index: {error}"), error)
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
            source: None,
        }
    }
}

impl From<&str> for CommandError {
    fn from(message: &str) -> Self {
        message.to_string().into()
    }
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub content: String,
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub updated_at: i64,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedNote {
    pub content: String,
    pub path: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub title: String,
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub updated_at: i64,
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
            CommandError::with_source(collision(rel).message, error.error)
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
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum MutationWarning {
    Index { path: String, message: String },
    Cleanup { path: String, message: String },
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationReceipt {
    pub path: String,
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub updated_at: i64,
    pub warnings: Vec<MutationWarning>,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathMutationReceipt {
    pub path: String,
    pub file: NoteFile,
    pub remaining_source: Option<String>,
    pub title: Option<String>,
    pub warnings: Vec<MutationWarning>,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
pub struct DeleteReceipt {
    pub path: String,
    pub warnings: Vec<MutationWarning>,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum SaveName {
    Heading,
    Filename(String),
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum NoteName {
    Filename(String),
    Title(String),
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Default, Deserialize)]
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
    Ok(timestamp_millis(file.metadata()?.modified())?)
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

fn reconcile(core: &Library, paths: &[&str]) -> Vec<MutationWarning> {
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

fn publish_move(
    core: &Library,
    from: &RelativePath,
    to: &RelativePath,
    content: String,
    metadata: fs::Metadata,
) -> Result<PathMutationReceipt, CommandError> {
    let source = from.resolve(&core.notes_dir)?;
    let target = to.resolve(&core.notes_dir)?;
    if target.try_exists()? {
        return Err(collision(to.as_str()));
    }
    let parent = target.parent().ok_or("a note outside any folder")?;
    fs::create_dir_all(parent)?;
    let mut temp = Builder::new().suffix(".tmp").tempfile_in(parent)?;
    fs::set_permissions(temp.path(), metadata.permissions())?;
    write_temp(&mut temp, &content)?;
    temp.as_file()
        .set_times(fs::FileTimes::new().set_modified(metadata.modified()?))?;
    temp.as_file().sync_all()?;
    let updated_at = checked_mtime(temp.as_file())?;
    temp.persist_noclobber(&target).map_err(|error| {
        if error.error.kind() == io::ErrorKind::AlreadyExists {
            CommandError::with_source(collision(to.as_str()).message, error.error)
        } else {
            error.error.into()
        }
    })?;
    let mut warnings = Vec::new();
    let remaining_source = match fs::remove_file(&source) {
        Ok(()) => None,
        Err(error) => {
            log::error!(
                "committed {}, but could not remove {}: {error}",
                to.as_str(),
                from.as_str()
            );
            warnings.push(MutationWarning::Cleanup {
                path: from.as_str().to_owned(),
                message: io_reason(&error),
            });
            Some(from.as_str().to_owned())
        }
    };
    warnings.extend(reconcile(core, &[from.as_str(), to.as_str()]));
    Ok(PathMutationReceipt {
        path: to.as_str().to_owned(),
        file: NoteFile {
            content,
            updated_at,
        },
        remaining_source,
        title: None,
        warnings,
    })
}

struct FileCommit {
    path: PathBuf,
    updated_at: i64,
    warnings: Vec<MutationWarning>,
}

/// Publish one complete document and its filename without overwriting another note.
fn save_file(
    source: &Path,
    content: &str,
    name: Option<SaveName>,
) -> Result<FileCommit, CommandError> {
    if !is_markdown(source) {
        return Err("notes must be markdown files".into());
    }
    let metadata = fs::metadata(source)?;
    let filename = match name {
        Some(SaveName::Heading) => markdown::leading_heading(frontmatter::parse(content).body)
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
        return Ok(FileCommit {
            path: source.to_owned(),
            updated_at: replace(source, content)?,
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
    write_temp(&mut temp, content)?;
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
            return Ok(FileCommit {
                path: target,
                updated_at,
                warnings: vec![],
            });
        }
        match temp.persist_noclobber(&target) {
            Ok(_) => {
                let warnings = match fs::remove_file(source) {
                    Ok(()) => vec![],
                    Err(error) => vec![MutationWarning::Cleanup {
                        path: source.to_string_lossy().into_owned(),
                        message: io_reason(&error),
                    }],
                };
                return Ok(FileCommit {
                    path: target,
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

pub fn read_external(path: String) -> Result<NoteFile, CommandError> {
    let abs = PathBuf::from(&path);
    if !is_markdown(&abs) {
        return Err("only markdown files can be opened".into());
    }
    let file = OpenedNote::open(&abs)?;
    let updated_at = timestamp_millis(file.metadata()?.modified())?;
    Ok(NoteFile {
        content: file.read()?,
        updated_at,
    })
}

pub fn write_external(
    path: String,
    content: String,
    name: Option<SaveName>,
) -> Result<MutationReceipt, CommandError> {
    let result = save_file(Path::new(&path), &content, name)?;
    Ok(MutationReceipt {
        path: result
            .path
            .to_str()
            .ok_or("the path is not valid unicode")?
            .to_owned(),
        updated_at: result.updated_at,
        warnings: result.warnings,
    })
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum OpenKind {
    External,
    Note,
}

/// A queued "Open With" path, classified so the webview opens it as the tab
/// kind the file already is: a note inside the notes dir, external otherwise.
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, PartialEq, Serialize)]
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

impl Library {
    pub(crate) fn ensure_index(&self) -> Result<(), CommandError> {
        if self.index_dirty.get() {
            self.reindex_all()?;
        }
        Ok(())
    }

    pub fn read_note(&self, path: String) -> Result<SavedNote, CommandError> {
        let relative = RelativePath::parse(&path)?;
        let abs = relative.resolve(&self.notes_dir)?;
        let file = OpenedNote::open(&abs)?;
        let metadata = file.metadata()?;
        let content = file.read()?;
        let parsed = frontmatter::parse(&content);
        let title = markdown::resolve_title(&parsed, &path);
        Ok(SavedNote {
            pinned: parsed.frontmatter.pinned,
            tags: parsed.frontmatter.tags,
            title,
            path,
            content,
            updated_at: timestamp_millis(metadata.modified())?,
        })
    }

    pub fn create_note(&self, options: CreateNote) -> Result<MutationReceipt, CommandError> {
        let folder = validate_folder(options.folder.as_deref().unwrap_or(""))?;
        let base = match options.name {
            Some(NoteName::Filename(name)) => validate_filename(&name)?,
            Some(NoteName::Title(title)) => filename_from_title(&validate_title(&title)?),
            None => "untitled".to_owned(),
        };
        let mut path = RelativePath::parse(&note_path(&folder, &base))?;
        let parent = if folder.is_empty() {
            self.notes_dir.clone()
        } else {
            RelativePath::parse(&folder)?.resolve(&self.notes_dir)?
        };
        fs::create_dir_all(&parent)?;
        let mut counter = 1;
        while match fs::symlink_metadata(self.notes_dir.join(path.as_str())) {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(error.into()),
        } {
            counter += 1;
            path = RelativePath::parse(&note_path(&folder, &suffixed_filename(&base, counter)))?;
        }
        let abs = path.resolve(&self.notes_dir)?;
        let updated_at = create_file(
            &abs,
            path.as_str(),
            options.content.as_deref().unwrap_or(""),
        )?;
        let warnings = reconcile(self, &[path.as_str()]);
        Ok(MutationReceipt {
            path: path.into_string(),
            updated_at,
            warnings,
        })
    }

    /// Persist a live document; reads and watcher observations never request naming.
    pub fn save_note(
        &self,
        path: String,
        content: String,
        name: Option<SaveName>,
    ) -> Result<MutationReceipt, CommandError> {
        let relative = RelativePath::parse(&path)?;
        let source = relative.resolve(&self.notes_dir)?;
        let result = save_file(&source, &content, name)?;
        let mut receipt = MutationReceipt {
            path: RelativePath::from_host(&self.notes_dir, &result.path)?.into_string(),
            updated_at: result.updated_at,
            warnings: result.warnings,
        };
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
        receipt.warnings.extend(reconcile(self, &paths));
        Ok(receipt)
    }

    pub fn move_note(
        &self,
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
        let from = RelativePath::parse(&path)?;
        let to = RelativePath::parse(&target)?;
        let opened = OpenedNote::open(&from.resolve(&self.notes_dir)?)?;
        let metadata = opened.metadata()?;
        let updated_at = timestamp_millis(metadata.modified())?;
        let content = opened.read()?;
        if path == target {
            return Ok(PathMutationReceipt {
                path,
                file: NoteFile {
                    content,
                    updated_at,
                },
                remaining_source: None,
                title: None,
                warnings: vec![],
            });
        }
        publish_move(self, &from, &to, content, metadata)
    }

    pub fn delete_note(&self, path: String) -> Result<DeleteReceipt, CommandError> {
        fs::remove_file(RelativePath::parse(&path)?.resolve(&self.notes_dir)?)?;
        let warnings = reconcile(self, &[&path]);
        Ok(DeleteReceipt { path, warnings })
    }

    pub fn attach_file(&self, source: String) -> Result<String, CommandError> {
        let source = PathBuf::from(source);
        let name = source
            .file_name()
            .ok_or("source has no file name")?
            .to_str()
            .ok_or("the path is not valid unicode")?
            .to_owned();

        RelativePath::parse(&format!("attachments/{name}"))?;
        let dir = RelativePath::parse("attachments")?.resolve(&self.notes_dir)?;
        fs::create_dir_all(&dir)?;

        let (stem, ext) = match name.rsplit_once('.') {
            Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
            None => (name.clone(), String::new()),
        };
        let mut candidate = name;
        let mut counter = 1;
        while match fs::symlink_metadata(dir.join(&candidate)) {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(error.into()),
        } {
            counter += 1;
            candidate = format!("{stem}-{counter}{ext}");
        }

        let relative = RelativePath::parse(&format!("attachments/{candidate}"))?;
        fs::copy(&source, relative.resolve(&self.notes_dir)?)?;
        Ok(format!("attachments/{candidate}"))
    }

    pub fn attach_image(&self, base64_data: String) -> Result<String, CommandError> {
        use base64::Engine as _;

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|error| CommandError::with_source("the pasted image is not valid", error))?;

        let dir = RelativePath::parse("attachments")?.resolve(&self.notes_dir)?;
        fs::create_dir_all(&dir)?;

        let stamp = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        let mut candidate = format!("pasted-{stamp}.png");
        let mut counter = 1;
        while match fs::symlink_metadata(dir.join(&candidate)) {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(error.into()),
        } {
            counter += 1;
            candidate = format!("pasted-{stamp}-{counter}.png");
        }

        let relative = RelativePath::parse(&format!("attachments/{candidate}"))?;
        fs::write(relative.resolve(&self.notes_dir)?, bytes)?;
        Ok(format!("attachments/{candidate}"))
    }

    pub fn reindex_all(&self) -> Result<Vec<String>, CommandError> {
        self.index_dirty.set(true);
        index::clear(&self.conn)?;
        let changed = index::scan_complete(&self.conn, &self.notes_dir)?;
        self.index_dirty.set(false);
        Ok(changed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use serde_json::Value;
    use std::cell::Cell;

    #[test]
    fn should_preserve_missing_file_causes_without_changing_the_wire_error() {
        use std::error::Error as _;
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        let error = library.read_note("missing.md".into()).unwrap_err();

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({"kind": "not-found", "message": "no such file"})
        );
        let source = error.source().unwrap().downcast_ref::<io::Error>().unwrap();
        assert_eq!(source.kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn should_preserve_sqlite_causes_without_changing_the_wire_error() {
        use std::error::Error as _;
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        library.conn.execute_batch("DROP TABLE note").unwrap();
        let error = library.list_notes(Default::default()).unwrap_err();

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({"kind": "failed", "message": "index: no such table: note"})
        );
        assert!(error.source().unwrap().is::<rusqlite::Error>());
    }

    #[test]
    fn should_preserve_invalid_image_causes_without_creating_an_attachment() {
        use std::error::Error as _;
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        let error = library.attach_image("%%%".into()).unwrap_err();

        assert_eq!(error.message, "the pasted image is not valid");
        assert!(error.source().unwrap().is::<base64::DecodeError>());
        assert!(!directory.path().join("attachments").exists());
    }

    #[test]
    fn should_recompute_collision_suffixes_and_exclude_the_current_file() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Library {
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
        let first = core
            .save_note(
                "shopping.md".into(),
                "# Weekend errands\n\nbody".into(),
                Some(SaveName::Heading),
            )
            .unwrap();
        assert_eq!(first.path, "weekend-errands-2.md");
        let second = core
            .save_note(
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
        let third = core
            .save_note(
                second.path,
                "# Weekend errands\n\nbody".into(),
                Some(SaveName::Heading),
            )
            .unwrap();
        assert_eq!(third.path, "weekend-errands.md");
        assert!(!directory.path().join("weekend-errands-2.md").exists());
        assert_eq!(
            core.list_notes(Default::default())
                .unwrap()
                .into_iter()
                .map(|note| note.path)
                .collect::<Vec<_>>(),
            vec!["weekend-errands.md"]
        );
    }

    #[test]
    fn should_keep_filenames_for_reads_body_edits_and_empty_headings() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        fs::write(directory.path().join("shopping.md"), "# Errands\n\nbody").unwrap();
        core.read_note("shopping.md".into()).unwrap();
        assert!(directory.path().join("shopping.md").exists());
        assert!(!directory.path().join("errands.md").exists());
        let body = core
            .save_note("shopping.md".into(), "# Errands\n\nnew body".into(), None)
            .unwrap();
        assert_eq!(body.path, "shopping.md");
        let empty = core
            .save_note(body.path, "# \n\nbody".into(), Some(SaveName::Heading))
            .unwrap();
        assert_eq!(empty.path, "shopping.md");
    }

    #[test]
    fn should_restore_a_filename_for_undo_without_overwriting_another_note() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        fs::write(directory.path().join("weekend.md"), "# Weekend").unwrap();
        let restored = core
            .save_note(
                "weekend.md".into(),
                "# Errands".into(),
                Some(SaveName::Filename("shopping.md".into())),
            )
            .unwrap();
        assert_eq!(restored.path, "shopping.md");
        fs::write(directory.path().join("weekend.md"), "# other").unwrap();
        let redo = core
            .save_note(
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
            serde_json::from_str(include_str!("../../../fixtures/note-mutations.json")).unwrap();
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
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        for name in ["", ".hidden", "a/b", "a\\b", "a:b"] {
            assert!(core
                .create_note(CreateNote {
                    name: Some(NoteName::Filename(name.into())),
                    ..Default::default()
                })
                .is_err());
        }
        assert!(core
            .create_note(CreateNote {
                folder: Some("../outside".into()),
                ..Default::default()
            })
            .is_err());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
        let base = "a".repeat(120);
        let first = core
            .create_note(CreateNote {
                name: Some(NoteName::Filename(base.clone())),
                ..Default::default()
            })
            .unwrap();
        let second = core
            .create_note(CreateNote {
                name: Some(NoteName::Filename(base)),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(first.path, format!("{}.md", "a".repeat(120)));
        assert_eq!(second.path, format!("{}-2.md", "a".repeat(118)));
    }

    #[test]
    fn should_refuse_incomplete_index_recovery_and_keep_direct_file_reads_available() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(true),
        };
        fs::write(directory.path().join("good.md"), "readable").unwrap();
        fs::write(directory.path().join("bad.md"), [0xff]).unwrap();
        assert!(core.list_notes(Default::default()).is_err());
        assert!(core.index_dirty.get());
        assert_eq!(
            core.read_note("good.md".into()).unwrap().content,
            "readable"
        );
        fs::write(directory.path().join("bad.md"), "fixed").unwrap();
        assert_eq!(core.list_notes(Default::default()).unwrap().len(), 2);
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
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        fs::write(directory.path().join("a.md"), "# old").unwrap();
        index::index_file(&core.conn, &core.notes_dir, "a.md").unwrap();
        core.conn.execute_batch("PRAGMA query_only = ON").unwrap();
        let receipt = core
            .save_note("a.md".into(), "# saved".into(), None)
            .unwrap();
        assert!(
            matches!(receipt.warnings.as_slice(), [MutationWarning::Index { path, .. }] if path == "a.md")
        );
        assert_eq!(core.read_note("a.md".into()).unwrap().content, "# saved");
        assert!(core.list_notes(Default::default()).is_err());
        core.conn.execute_batch("PRAGMA query_only = OFF").unwrap();
        assert_eq!(
            core.list_notes(Default::default())
                .unwrap()
                .into_iter()
                .map(|note| note.title)
                .collect::<Vec<_>>(),
            vec!["saved"]
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
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };
        let source = directory.path().join("source");
        fs::set_permissions(&source, fs::Permissions::from_mode(0o555)).unwrap();
        if fs::File::create(source.join("probe")).is_err() {
            let receipt = core
                .move_note("source/a.md".into(), "destination".into())
                .unwrap();
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
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn: index::open(directory.path()).unwrap(),
            index_dirty: Cell::new(false),
        };

        let receipt = core
            .create_note(CreateNote {
                content: Some("# title\nbody".into()),
                name: Some(NoteName::Filename("a".into())),
                folder: None,
            })
            .unwrap();
        let read = core.read_note("a.md".into()).unwrap();

        assert_eq!(receipt.path, "a.md");
        assert_eq!(read.content, "# title\nbody");
        assert_eq!(read.updated_at, receipt.updated_at);
        assert_eq!(
            core.list_notes(Default::default())
                .unwrap()
                .into_iter()
                .map(|note| (note.path, note.title))
                .collect::<Vec<_>>(),
            vec![("a.md".into(), "title".into())]
        );
    }

    #[test]
    fn should_report_a_missing_file_as_not_found() {
        let error = fs::read_to_string("/notras-does-not-exist/missing.md").unwrap_err();

        assert_eq!(CommandError::from(error).kind, ErrorKind::NotFound);
    }

    #[test]
    fn should_report_an_unreadable_file_as_failed() {
        // A directory opens and then refuses the read on both macOS and Linux,
        // which is the cheapest non-NotFound io error to raise on either.
        let directory = tempfile::tempdir().unwrap();
        let error = fs::read_to_string(directory.path()).unwrap_err();

        assert_eq!(CommandError::from(error).kind, ErrorKind::Failed);
    }

    #[test]
    fn should_refuse_to_replace_a_missing_file() {
        let missing_directory = tempfile::tempdir().unwrap();
        let missing = missing_directory.path().to_owned().join("gone.md");

        let error = replace(&missing, "recreated").unwrap_err();

        assert_eq!(error.kind, ErrorKind::NotFound);
        assert!(!missing.exists());
    }

    /// A read-only directory blocks the sibling `commit` writes, which is the
    /// cheapest way to fail a write after the destination has been proven to
    /// exist. Root ignores the mode, so the assertions only run where it bites.
    #[cfg(unix)]
    #[test]
    fn should_leave_original_bytes_when_replacement_fails() {
        use std::os::unix::fs::PermissionsExt;

        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
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
    fn should_keep_the_note_mode_on_replacement() {
        use std::os::unix::fs::PermissionsExt;

        // Neither `tempfile`'s owner-only default nor the usual umask result,
        // so a mode that survives can only have been carried over.
        let note_directory = tempfile::tempdir().unwrap();
        let note = note_directory.path().to_owned().join("note.md");
        fs::write(&note, "before").unwrap();
        fs::set_permissions(&note, fs::Permissions::from_mode(0o640)).unwrap();

        replace(&note, "after").unwrap();

        let mode = fs::metadata(&note).unwrap().permissions().mode();

        assert_eq!(mode & 0o777, 0o640);
    }

    #[test]
    fn should_leave_no_temporary_file_after_replacement() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
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
    fn should_refuse_to_create_at_an_occupied_path() {
        let taken_directory = tempfile::tempdir().unwrap();
        let taken = taken_directory.path().to_owned().join("taken.md");
        fs::write(&taken, "someone else's note").unwrap();

        let error = create_file(&taken, "taken.md", "clobbered").unwrap_err();

        assert_eq!(
            error.message,
            "a note named taken already exists in the notes root"
        );
        assert_eq!(fs::read_to_string(&taken).unwrap(), "someone else's note");
    }

    #[test]
    fn should_replace_an_existing_file() {
        let existing_directory = tempfile::tempdir().unwrap();
        let existing = existing_directory.path().to_owned().join("note.md");
        fs::write(&existing, "before").unwrap();

        replace(&existing, "after").unwrap();

        assert_eq!(fs::read_to_string(&existing).unwrap(), "after");
    }

    #[test]
    fn should_treat_a_message_without_a_kind_as_a_failure() {
        let error: CommandError = "invalid note path: ../escape".into();

        assert_eq!(error.kind, ErrorKind::Failed);
        assert_eq!(error.message, "invalid note path: ../escape");
    }
    #[test]
    fn should_classify_a_library_file_as_a_note() {
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
    fn should_classify_a_file_outside_the_library_as_external() {
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
    fn should_treat_a_sibling_directory_sharing_the_prefix_as_external() {
        let open = classify_open(Path::new("/vault"), "/vault-archive/a.md".into());

        assert_eq!(open.kind, OpenKind::External);
    }

    #[test]
    fn should_treat_a_hidden_segment_inside_the_library_as_external() {
        let open = classify_open(Path::new("/vault"), "/vault/.drafts/a.md".into());

        assert_eq!(open.kind, OpenKind::External);
    }

    #[test]
    fn should_treat_a_non_markdown_file_inside_the_library_as_external() {
        let open = classify_open(Path::new("/vault"), "/vault/a.txt".into());

        assert_eq!(open.kind, OpenKind::External);
    }

    #[test]
    fn should_recognize_an_uppercase_extension_inside_the_library() {
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
    fn should_classify_through_a_symlinked_notes_dir() {
        let real_directory = tempfile::tempdir().unwrap();
        let real = real_directory.path().to_owned();
        fs::write(real.join("a.md"), "").unwrap();
        let link_directory = tempfile::tempdir().unwrap();
        let link = link_directory.path().join("library");
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
    }
    #[test]
    fn should_report_a_syscall_failure_as_a_lowercase_reason() {
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
    fn should_keep_unmapped_syscall_text_without_the_errno() {
        let error = CommandError::from(io::Error::other("Too many open files (os error 24)"));

        assert_eq!(error.message, "too many open files");
    }

    #[test]
    fn should_reject_noncanonical_library_paths() {
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        fs::create_dir(directory.path().join("folder")).unwrap();
        fs::write(directory.path().join("folder/note.md"), "# note").unwrap();
        #[cfg(unix)]
        fs::write(directory.path().join(r"folder\note.md"), "# note").unwrap();

        for path in [
            "folder/./note.md",
            "folder//note.md",
            r"folder\note.md",
            "folder/note.md/",
        ] {
            assert!(library.read_note(path.into()).is_err(), "accepted {path}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_reading_a_symlinked_note() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "# outside").unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("note.md"),
            directory.path().join("note.md"),
        )
        .unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();

        assert!(library.read_note("note.md".into()).is_err());
        assert_eq!(
            read_external(
                outside
                    .path()
                    .join("note.md")
                    .to_string_lossy()
                    .into_owned()
            )
            .unwrap()
            .content,
            "# outside"
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_saving_through_a_symlinked_parent() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "# outside").unwrap();
        std::os::unix::fs::symlink(outside.path(), directory.path().join("linked")).unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();

        assert!(library
            .save_note("linked/note.md".into(), "# changed".into(), None)
            .is_err());
        assert_eq!(
            fs::read_to_string(outside.path().join("note.md")).unwrap(),
            "# outside"
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_deleting_a_symlinked_note() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "# outside").unwrap();
        let link = directory.path().join("note.md");
        std::os::unix::fs::symlink(outside.path().join("note.md"), &link).unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();

        assert!(library.delete_note("note.md".into()).is_err());
        assert!(fs::symlink_metadata(link).unwrap().is_symlink());
        assert_eq!(
            fs::read_to_string(outside.path().join("note.md")).unwrap(),
            "# outside"
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_creating_or_moving_into_a_symlinked_folder() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), directory.path().join("linked")).unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        fs::write(directory.path().join("note.md"), "# source").unwrap();

        assert!(library
            .create_note(CreateNote {
                folder: Some("linked".into()),
                ..Default::default()
            })
            .is_err());
        assert!(library
            .move_note("note.md".into(), "linked".into())
            .is_err());
        assert_eq!(
            fs::read_to_string(directory.path().join("note.md")).unwrap(),
            "# source"
        );
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_writing_attachments_through_a_symlinked_folder() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("source.txt"), "attachment").unwrap();
        std::os::unix::fs::symlink(outside.path(), directory.path().join("attachments")).unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();

        assert!(library
            .attach_file(
                outside
                    .path()
                    .join("source.txt")
                    .to_string_lossy()
                    .into_owned()
            )
            .is_err());
        assert!(library.attach_image("aW1hZ2U=".into()).is_err());
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 1);
    }

    #[test]
    fn should_return_slash_separated_paths_after_saving_in_a_folder() {
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        fs::create_dir(directory.path().join("folder")).unwrap();
        fs::write(directory.path().join("folder/note.md"), "# before").unwrap();

        let receipt = library
            .save_note(
                "folder/note.md".into(),
                "# after".into(),
                Some(SaveName::Heading),
            )
            .unwrap();

        assert_eq!(receipt.path, "folder/after.md");
        assert_eq!(receipt.warnings.len(), 0);
    }
}
