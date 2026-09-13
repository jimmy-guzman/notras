use std::fs::{self, File};
use std::io::{self, Read as _, Seek as _, Write as _};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use cap_std::{ambient_authority, fs::Dir};
use serde::{Deserialize, Serialize};

use crate::{
    frontmatter, index, markdown,
    note_file::{content_revision, timestamp_millis, Exchange, OpenedNote, TempSibling},
    relative_path::{ensure_folder, Located, RelativePath},
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
#[derive(Clone, Debug, Serialize)]
pub struct CommandError {
    pub kind: ErrorKind,
    pub message: String,
    #[serde(skip)]
    #[cfg_attr(feature = "bindings", specta(skip))]
    source: Option<Arc<dyn std::error::Error + Send + Sync>>,
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CommandError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match &self.source {
            Some(source) => Some(source.as_ref()),
            None => None,
        }
    }
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
            source: Some(Arc::new(source)),
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
            source: Some(Arc::new(error)),
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
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub content: String,
    pub revision: String,
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
    pub revision: String,
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
fn create_file(target: &Located, rel: &str, content: &str) -> Result<i64, CommandError> {
    let mut temp = TempSibling::create(&target.dir)?;
    write_temp(temp.file_mut(), content)?;
    let updated_at = checked_mtime(temp.file())?;
    temp.publish(&target.name).map_err(|error| {
        if error.kind() == io::ErrorKind::AlreadyExists {
            CommandError::with_source(collision(rel).message, error)
        } else {
            error.into()
        }
    })?;
    Ok(updated_at)
}

fn write_temp(file: &mut File, content: &str) -> io::Result<()> {
    file.write_all(content.as_bytes())?;
    // A rename can reach disk before the bytes it publishes, so without this
    // a power cut leaves the empty file this whole dance exists to prevent.
    file.sync_all()
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
    pub revision: String,
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub updated_at: i64,
    pub warnings: Vec<MutationWarning>,
}

/// What a save did: published at the expected revision, or refused because the file moved on.
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SaveOutcome {
    Committed { receipt: MutationReceipt },
    Conflict { file: NoteFile },
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

fn checked_mtime(file: &File) -> Result<i64, CommandError> {
    Ok(timestamp_millis(file.metadata()?.modified())?)
}

/// A publication that either landed or found the file changed underneath it.
enum Publication<T> {
    Committed(T),
    Conflict(NoteFile),
}

impl<T> Publication<T> {
    fn map<U>(self, f: impl FnOnce(T) -> U) -> Publication<U> {
        match self {
            Self::Committed(value) => Publication::Committed(f(value)),
            Self::Conflict(file) => Publication::Conflict(file),
        }
    }
}

/// The bytes and timestamp behind an open handle, read from its start.
fn current_file(original: &mut File) -> Result<NoteFile, CommandError> {
    original.rewind()?;
    let mut content = String::new();
    original.read_to_string(&mut content)?;
    Ok(NoteFile {
        revision: content_revision(&content),
        content,
        updated_at: checked_mtime(original)?,
    })
}

fn handle_identity(file: &File) -> io::Result<(u64, u64)> {
    use cap_fs_ext::MetadataExt as _;

    let metadata = cap_std::fs::Metadata::from_file(file)?;
    Ok((metadata.dev(), metadata.ino()))
}

/// An entry moved to a private name, where only this process can reach it.
struct Withdrawn {
    grave: TempSibling,
}

/// Move the entry at `source` to a name no other writer knows.
fn withdraw(source: &Located, handle: &File) -> Result<Withdrawn, CommandError> {
    let mut grave = TempSibling::create(&source.dir)?;
    grave.take(&source.name, handle)?;
    Ok(Withdrawn { grave })
}

impl Withdrawn {
    fn holds(&self, source: &Located, handle: &File) -> Result<bool, CommandError> {
        Ok(source.sibling(self.grave.name())?.identity()? == handle_identity(handle)?)
    }

    fn give_back(mut self, source: &Located, handle: &File) -> Result<(), CommandError> {
        Ok(self.grave.give_back(&source.name, handle)?)
    }
}

/// A replacement beside its original, which stays open until publication decides.
struct Staged {
    original: File,
    temp: TempSibling,
    updated_at: i64,
}

/// Write the replacement only while the original still carries `expected`.
fn stage(
    source: &Located,
    content: &str,
    expected: &str,
) -> Result<Publication<Staged>, CommandError> {
    let mut original = source.open_write()?;
    let current = current_file(&mut original)?;
    if current.revision != expected {
        return Ok(Publication::Conflict(current));
    }
    let mut temp = TempSibling::create(&source.dir)?;
    temp.file()
        .set_permissions(original.metadata()?.permissions())?;
    write_temp(temp.file_mut(), content)?;
    let updated_at = checked_mtime(temp.file())?;
    Ok(Publication::Committed(Staged {
        original,
        temp,
        updated_at,
    }))
}

impl Staged {
    /// True when the original handle still names the bytes the save started from.
    fn original_unchanged(&mut self, expected: &str) -> Result<bool, CommandError> {
        Ok(current_file(&mut self.original)?.revision == expected)
    }

    /// Put the replacement at `target`, re-proving the precondition after the swap
    /// where the platform can swap; elsewhere the check-then-rename window is accepted.
    fn exchange_over(
        &mut self,
        source: &Located,
        target: &str,
        expected: &str,
    ) -> Result<Publication<i64>, CommandError> {
        if self.temp.exchange(target)? == Exchange::Unsupported {
            self.temp.replace(target)?;
            return Ok(Publication::Committed(self.updated_at));
        }
        // After the swap the original inode should sit under the temp name. A
        // different inode means a rename landed over the target in between, and
        // it can carry the very bytes the handle still shows, so identity comes
        // before the hash.
        let displaced = source.sibling(self.temp.name())?;
        let intact = displaced.identity()? == handle_identity(&self.original)?
            && self.original_unchanged(expected)?;
        if intact {
            return Ok(Publication::Committed(self.updated_at));
        }
        self.temp.exchange(target)?;
        let mut current = source.open_read()?;
        Ok(Publication::Conflict(current_file(&mut current)?))
    }

    /// Remove the original after `candidate` was published under a new name, unless
    /// it changed in between, in which case the candidate is withdrawn instead.
    /// Each removal first moves the entry to a private name, so a file that lands
    /// under the public name in the meantime is never the one unlinked.
    fn retire_original(
        &mut self,
        source: &Located,
        candidate: &str,
        expected: &str,
    ) -> Result<Publication<Vec<MutationWarning>>, CommandError> {
        let original = match withdraw(source, &self.original) {
            Ok(original) => original,
            Err(error) => {
                return Ok(Publication::Committed(vec![MutationWarning::Cleanup {
                    path: source.name.clone(),
                    message: error.message,
                }]))
            }
        };
        if original.holds(source, &self.original)? && self.original_unchanged(expected)? {
            drop(original);
            return Ok(Publication::Committed(vec![]));
        }
        original.give_back(source, &self.original)?;
        let published = source.sibling(candidate)?;
        let withdrawn = withdraw(&published, self.temp.file())?;
        if withdrawn.holds(&published, self.temp.file())? {
            drop(withdrawn);
        } else {
            withdrawn.give_back(&published, self.temp.file())?;
        }
        let mut current = source.open_read()?;
        Ok(Publication::Conflict(current_file(&mut current)?))
    }
}

fn reconcile(core: &Library, paths: &[&str]) -> Vec<MutationWarning> {
    let mut warnings = Vec::new();
    for path in paths {
        if let Err(error) = index::reindex_file(&core.conn, &core.root, path) {
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
    metadata: &fs::Metadata,
) -> Result<PathMutationReceipt, CommandError> {
    let source = from.resolve(&core.root)?;
    let (folder, name) = to.split();
    let target = Located {
        dir: ensure_folder(&core.root, folder)?,
        name: name.to_owned(),
    };
    match target.symlink_metadata() {
        Ok(_) => return Err(collision(to.as_str())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    let mut temp = TempSibling::create(&target.dir)?;
    temp.file().set_permissions(metadata.permissions())?;
    write_temp(temp.file_mut(), &content)?;
    temp.file()
        .set_times(fs::FileTimes::new().set_modified(metadata.modified()?))?;
    temp.file().sync_all()?;
    let updated_at = checked_mtime(temp.file())?;
    temp.publish(&target.name).map_err(|error| {
        if error.kind() == io::ErrorKind::AlreadyExists {
            CommandError::with_source(collision(to.as_str()).message, error)
        } else {
            error.into()
        }
    })?;
    let mut warnings = Vec::new();
    let remaining_source = match source.remove_file() {
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
            revision: content_revision(&content),
            content,
            updated_at,
        },
        remaining_source,
        title: None,
        warnings,
    })
}

struct FileCommit {
    name: String,
    updated_at: i64,
    warnings: Vec<MutationWarning>,
}

fn same_file(
    source: &Located,
    candidate: &str,
    identity: (u64, u64),
) -> Result<bool, CommandError> {
    let candidate = source.sibling(candidate)?;
    match candidate.symlink_metadata() {
        Ok(metadata) if metadata.is_file() => Ok(candidate.identity()? == identity),
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

/// Publish one complete document and its filename without overwriting another note.
fn save_file(
    source: &Located,
    content: &str,
    name: Option<SaveName>,
    expected: &str,
) -> Result<Publication<FileCommit>, CommandError> {
    if !is_markdown(Path::new(&source.name)) {
        return Err("notes must be markdown files".into());
    }
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
    let mut staged = match stage(source, content, expected)? {
        Publication::Committed(staged) => staged,
        Publication::Conflict(file) => return Ok(Publication::Conflict(file)),
    };
    let Some(filename) = filename else {
        return Ok(staged
            .exchange_over(source, &source.name, expected)?
            .map(|updated_at| FileCommit {
                name: source.name.clone(),
                updated_at,
                warnings: vec![],
            }));
    };
    let stem = Path::new(&filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("invalid filename")?;
    let extension = Path::new(&filename)
        .extension()
        .and_then(|s| s.to_str())
        .ok_or("invalid filename")?;
    let identity = source.identity()?;
    let mut counter = 1;
    loop {
        let candidate = if counter == 1 {
            filename.clone()
        } else {
            format!("{}.{}", suffixed_filename(stem, counter), extension)
        };
        if candidate == source.name {
            return Ok(staged
                .exchange_over(source, &candidate, expected)?
                .map(|updated_at| FileCommit {
                    name: candidate,
                    updated_at,
                    warnings: vec![],
                }));
        }
        if same_file(source, &candidate, identity)? {
            // The current file under another spelling, a case-only rename on a
            // case-insensitive filesystem or a hard link: a swap would leave that
            // entry under the temp name, so this keeps the plain rename.
            staged.temp.replace(&candidate)?;
            return Ok(Publication::Committed(FileCommit {
                name: candidate,
                updated_at: staged.updated_at,
                warnings: vec![],
            }));
        }
        match staged.temp.publish(&candidate) {
            Ok(()) => {
                let updated_at = staged.updated_at;
                return Ok(staged
                    .retire_original(source, &candidate, expected)?
                    .map(|warnings| FileCommit {
                        name: candidate,
                        updated_at,
                        warnings,
                    }));
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => counter += 1,
            Err(error) => return Err(error.into()),
        }
    }
}

pub fn read_external(path: &Path) -> Result<NoteFile, CommandError> {
    if !is_markdown(path) {
        return Err("only markdown files can be opened".into());
    }
    let file = OpenedNote::new(File::open(path)?);
    let updated_at = timestamp_millis(file.metadata()?.modified())?;
    let content = file.read()?;
    Ok(NoteFile {
        revision: content_revision(&content),
        content,
        updated_at,
    })
}

/// Persist an external document, rejecting non-Unicode paths before file access.
pub fn write_external(
    path: &Path,
    content: &str,
    name: Option<SaveName>,
    expected: &str,
) -> Result<SaveOutcome, CommandError> {
    let host = path.to_str().ok_or("the path is not valid unicode")?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or("a note outside any folder")?;
    let source = Located {
        dir: Dir::open_ambient_dir(parent, ambient_authority())?,
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("a note without a filename")?
            .to_owned(),
    };
    let result = match save_file(&source, content, name, expected)? {
        Publication::Committed(result) => result,
        Publication::Conflict(file) => return Ok(SaveOutcome::Conflict { file }),
    };
    let mut warnings = result.warnings;
    for warning in &mut warnings {
        if let MutationWarning::Cleanup {
            path: remaining, ..
        } = warning
        {
            *remaining = host.to_owned();
        }
    }
    Ok(SaveOutcome::Committed {
        receipt: MutationReceipt {
            path: parent
                .join(result.name)
                .to_str()
                .ok_or("the path is not valid unicode")?
                .to_owned(),
            revision: content_revision(content),
            updated_at: result.updated_at,
            warnings,
        },
    })
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
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
        let file = OpenedNote::new(relative.resolve(&self.root)?.open_read()?);
        let metadata = file.metadata()?;
        let content = file.read()?;
        let parsed = frontmatter::parse(&content);
        let title = markdown::resolve_title(&parsed, &path);
        Ok(SavedNote {
            pinned: parsed.frontmatter.pinned,
            tags: parsed.frontmatter.tags,
            title,
            path,
            revision: content_revision(&content),
            content,
            updated_at: timestamp_millis(metadata.modified())?,
        })
    }

    pub fn create_note(&self, options: &CreateNote) -> Result<MutationReceipt, CommandError> {
        let folder = validate_folder(options.folder.as_deref().unwrap_or(""))?;
        let base = match &options.name {
            Some(NoteName::Filename(name)) => {
                let filename = validate_filename(name)?;
                match filename.rsplit_once('.') {
                    Some((stem, extension)) if extension.eq_ignore_ascii_case("md") => {
                        stem.to_owned()
                    }
                    _ => filename,
                }
            }
            Some(NoteName::Title(title)) => filename_from_title(&validate_title(title)?),
            None => "untitled".to_owned(),
        };
        let mut path = RelativePath::parse(&note_path(&folder, &base))?;
        let parent = ensure_folder(&self.root, &folder)?;
        let mut counter = 1;
        while match parent.symlink_metadata(path.split().1) {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(error.into()),
        } {
            counter += 1;
            path = RelativePath::parse(&note_path(&folder, &suffixed_filename(&base, counter)))?;
        }
        let target = Located {
            dir: parent,
            name: path.split().1.to_owned(),
        };
        let content = options.content.as_deref().unwrap_or("");
        let updated_at = create_file(&target, path.as_str(), content)?;
        let warnings = reconcile(self, &[path.as_str()]);
        Ok(MutationReceipt {
            path: path.into_string(),
            revision: content_revision(content),
            updated_at,
            warnings,
        })
    }

    /// Save a document at the revision it started from, or return the changed file.
    pub fn save_note(
        &self,
        path: &str,
        content: &str,
        name: Option<SaveName>,
        expected: &str,
    ) -> Result<SaveOutcome, CommandError> {
        let relative = RelativePath::parse(path)?;
        let source = relative.resolve(&self.root)?;
        let result = match save_file(&source, content, name, expected)? {
            Publication::Committed(result) => result,
            Publication::Conflict(file) => return Ok(SaveOutcome::Conflict { file }),
        };
        let (folder, _) = relative.split();
        let mut receipt = MutationReceipt {
            path: if folder.is_empty() {
                result.name
            } else {
                format!("{folder}/{}", result.name)
            },
            revision: content_revision(content),
            updated_at: result.updated_at,
            warnings: result.warnings,
        };
        for warning in &mut receipt.warnings {
            if let MutationWarning::Cleanup {
                path: remaining, ..
            } = warning
            {
                *remaining = path.to_owned();
            }
        }
        let paths = if path == receipt.path {
            vec![path]
        } else {
            vec![path, receipt.path.as_str()]
        };
        receipt.warnings.extend(reconcile(self, &paths));
        Ok(SaveOutcome::Committed { receipt })
    }

    pub fn move_note(
        &self,
        path: String,
        folder: &str,
    ) -> Result<PathMutationReceipt, CommandError> {
        let folder = validate_folder(folder)?;
        let name = path.rsplit('/').next().ok_or("a note without a filename")?;
        let target = if folder.is_empty() {
            name.to_owned()
        } else {
            format!("{folder}/{name}")
        };
        let from = RelativePath::parse(&path)?;
        let to = RelativePath::parse(&target)?;
        let opened = OpenedNote::new(from.resolve(&self.root)?.open_read()?);
        let metadata = opened.metadata()?;
        let updated_at = timestamp_millis(metadata.modified())?;
        let content = opened.read()?;
        if path == target {
            return Ok(PathMutationReceipt {
                path,
                file: NoteFile {
                    revision: content_revision(&content),
                    content,
                    updated_at,
                },
                remaining_source: None,
                title: None,
                warnings: vec![],
            });
        }
        publish_move(self, &from, &to, content, &metadata)
    }

    pub fn delete_note(&self, path: String) -> Result<DeleteReceipt, CommandError> {
        RelativePath::parse(&path)?
            .resolve(&self.root)?
            .remove_file()?;
        let warnings = reconcile(self, &[&path]);
        Ok(DeleteReceipt { path, warnings })
    }

    pub fn attach_file(&self, source: &Path) -> Result<String, CommandError> {
        let name = source
            .file_name()
            .ok_or("source has no file name")?
            .to_str()
            .ok_or("the path is not valid unicode")?
            .to_owned();

        RelativePath::parse(&format!("attachments/{name}"))?;
        let dir = ensure_folder(&self.root, "attachments")?;

        let (stem, ext) = match name.rsplit_once('.') {
            Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
            None => (name.clone(), String::new()),
        };
        let mut candidate = name;
        let mut counter = 1;
        while match dir.symlink_metadata(&candidate) {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(error.into()),
        } {
            counter += 1;
            candidate = format!("{stem}-{counter}{ext}");
        }

        let relative = RelativePath::parse(&format!("attachments/{candidate}"))?;
        let target = Located {
            dir,
            name: candidate,
        };
        io::copy(&mut File::open(source)?, &mut target.create_new()?)?;
        Ok(relative.into_string())
    }

    pub fn attach_image(&self, base64_data: &str) -> Result<String, CommandError> {
        use base64::Engine as _;

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|error| CommandError::with_source("the pasted image is not valid", error))?;

        let dir = ensure_folder(&self.root, "attachments")?;

        let stamp = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        let mut candidate = format!("pasted-{stamp}.png");
        let mut counter = 1;
        while match dir.symlink_metadata(&candidate) {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(error.into()),
        } {
            counter += 1;
            candidate = format!("pasted-{stamp}-{counter}.png");
        }

        let relative = RelativePath::parse(&format!("attachments/{candidate}"))?;
        let target = Located {
            dir,
            name: candidate,
        };
        target.create_new()?.write_all(&bytes)?;
        Ok(relative.into_string())
    }

    pub fn reindex_all(&self) -> Result<Vec<String>, CommandError> {
        let mut scan = self.begin_scan(true);
        while !self.advance_scan(&mut scan)? {}
        self.finish_scan(scan)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use serde_json::Value;

    fn located(directory: &Path, name: &str) -> Located {
        Located {
            dir: Dir::open_ambient_dir(directory, ambient_authority()).unwrap(),
            name: name.to_owned(),
        }
    }

    fn committed(outcome: SaveOutcome) -> MutationReceipt {
        match outcome {
            SaveOutcome::Committed { receipt } => receipt,
            SaveOutcome::Conflict { file } => panic!("expected a committed save, got {file:?}"),
        }
    }

    fn conflicted(outcome: SaveOutcome) -> NoteFile {
        match outcome {
            SaveOutcome::Conflict { file } => file,
            SaveOutcome::Committed { receipt } => panic!("expected a conflict, got {receipt:?}"),
        }
    }

    /// Save at the revision the file carries now, the way a session that just read it would.
    fn saved(
        core: &Library,
        path: &str,
        content: &str,
        name: Option<SaveName>,
    ) -> Result<MutationReceipt, CommandError> {
        let expected = core.read_note(path.into())?.revision;
        core.save_note(path, content, name, &expected)
            .map(committed)
    }

    fn written(
        path: &Path,
        content: &str,
        name: Option<SaveName>,
    ) -> Result<MutationReceipt, CommandError> {
        let expected = read_external(path)?.revision;
        write_external(path, content, name, &expected).map(committed)
    }

    /// The old whole-file replacement: stage at the current revision and publish.
    fn replace(source: &Located, content: &str) -> Result<i64, CommandError> {
        let expected = current_file(&mut source.open_read()?)?.revision;
        let Publication::Committed(mut staged) = stage(source, content, &expected)? else {
            panic!("the file changed between reading and staging");
        };
        match staged.exchange_over(source, &source.name, &expected)? {
            Publication::Committed(updated_at) => Ok(updated_at),
            Publication::Conflict(file) => panic!("the file changed underneath: {file:?}"),
        }
    }

    #[test]
    fn should_save_a_same_filename_heading_while_a_reader_holds_the_original() {
        let directory = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let path = directory.path().join("errands.md");
        fs::write(&path, "# Errands\n\noriginal").unwrap();
        let reader = OpenedNote::new(File::open(&path).unwrap());

        let receipt = saved(
            &core,
            "errands.md",
            "# Errands\n\nreplacement",
            Some(SaveName::Heading),
        )
        .unwrap();

        assert_eq!(receipt.path, "errands.md");
        assert!(receipt.warnings.is_empty());
        assert_eq!(reader.read().unwrap(), "# Errands\n\noriginal");
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "# Errands\n\nreplacement"
        );
    }

    #[test]
    fn should_return_the_revision_of_a_created_note() {
        let directory = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        let receipt = core
            .create_note(&CreateNote {
                content: Some("# Created\n\nbody".into()),
                name: Some(NoteName::Filename("created".into())),
                ..Default::default()
            })
            .unwrap();

        assert_eq!(receipt.revision, content_revision("# Created\n\nbody"));
        assert_eq!(receipt.revision.len(), 64);
        assert_eq!(
            core.read_note("created.md".into()).unwrap().revision,
            receipt.revision
        );
    }

    #[test]
    fn should_report_a_revision_that_matches_the_bytes_read() {
        let directory = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::write(directory.path().join("note.md"), "# Read\n\ncaf\u{e9}").unwrap();

        let note = core.read_note("note.md".into()).unwrap();
        let external = read_external(&directory.path().join("note.md")).unwrap();
        let saved = saved(&core, "note.md", "# Read\n\nchanged", None).unwrap();
        let moved = core.move_note("note.md".into(), "folder").unwrap();

        assert_eq!(note.revision, content_revision("# Read\n\ncaf\u{e9}"));
        assert_eq!(external.revision, note.revision);
        assert_eq!(saved.revision, content_revision("# Read\n\nchanged"));
        assert_eq!(moved.file.revision, saved.revision);
        assert_ne!(saved.revision, note.revision);
    }

    #[test]
    fn should_create_explicit_filenames_with_one_markdown_extension() {
        let directory = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        for (name, expected) in [
            ("entry.md", "entry.md"),
            ("entry", "entry-2.md"),
            (" entry.md ", "entry-3.md"),
            ("entry.MD", "entry-4.md"),
            ("entry.Md", "entry-5.md"),
            ("entry.mD", "entry-6.md"),
        ] {
            let receipt = core
                .create_note(&CreateNote {
                    name: Some(NoteName::Filename(name.into())),
                    content: Some("body".into()),
                    ..Default::default()
                })
                .unwrap();
            assert_eq!(receipt.path, expected);
            assert_eq!(
                fs::read_to_string(directory.path().join(expected)).unwrap(),
                "body"
            );
        }
        for name in [".md", "../entry.md", "folder/entry.md", ""] {
            assert!(core
                .create_note(&CreateNote {
                    name: Some(NoteName::Filename(name.into())),
                    ..Default::default()
                })
                .is_err());
        }
    }

    #[test]
    fn should_preserve_missing_file_causes_without_changing_the_wire_error() {
        use std::error::Error as _;
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        library.conn.execute_batch("DROP TABLE note").unwrap();
        let error = library.list_notes(&Default::default()).unwrap_err();

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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let error = library.attach_image("%%%").unwrap_err();

        assert_eq!(error.message, "the pasted image is not valid");
        assert!(error.source().unwrap().is::<base64::DecodeError>());
        assert!(!directory.path().join("attachments").exists());
    }

    #[test]
    fn should_recompute_collision_suffixes_and_exclude_the_current_file() {
        let directory = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::write(directory.path().join("shopping.md"), "# imported").unwrap();
        fs::write(
            directory.path().join("weekend-errands.md"),
            "someone else's note",
        )
        .unwrap();
        let first = saved(
            &core,
            "shopping.md",
            "# Weekend errands\n\nbody",
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(first.path, "weekend-errands-2.md");
        let second = saved(
            &core,
            &first.path,
            "# Weekend errands\n\nbody",
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(second.path, "weekend-errands-2.md");
        assert_eq!(
            fs::read_to_string(directory.path().join("weekend-errands.md")).unwrap(),
            "someone else's note"
        );
        fs::remove_file(directory.path().join("weekend-errands.md")).unwrap();
        let third = saved(
            &core,
            &second.path,
            "# Weekend errands\n\nbody",
            Some(SaveName::Heading),
        )
        .unwrap();
        assert_eq!(third.path, "weekend-errands.md");
        assert!(!directory.path().join("weekend-errands-2.md").exists());
        assert_eq!(
            core.list_notes(&Default::default())
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
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::write(directory.path().join("shopping.md"), "# Errands\n\nbody").unwrap();
        core.read_note("shopping.md".into()).unwrap();
        assert!(directory.path().join("shopping.md").exists());
        assert!(!directory.path().join("errands.md").exists());
        let body = saved(&core, "shopping.md", "# Errands\n\nnew body", None).unwrap();
        assert_eq!(body.path, "shopping.md");
        let empty = saved(&core, &body.path, "# \n\nbody", Some(SaveName::Heading)).unwrap();
        assert_eq!(empty.path, "shopping.md");
    }

    #[test]
    fn should_restore_a_filename_for_undo_without_overwriting_another_note() {
        let directory = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::write(directory.path().join("weekend.md"), "# Weekend").unwrap();
        let restored = saved(
            &core,
            "weekend.md",
            "# Errands",
            Some(SaveName::Filename("shopping.md".into())),
        )
        .unwrap();
        assert_eq!(restored.path, "shopping.md");
        fs::write(directory.path().join("weekend.md"), "# other").unwrap();
        let redo = saved(
            &core,
            &restored.path,
            "# Weekend",
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
        let receipt = written(&source, "# Errands", Some(SaveName::Heading)).unwrap();
        assert_eq!(
            Path::new(&receipt.path),
            directory.path().join("errands-2.md")
        );
        assert_eq!(fs::read_link(link).unwrap(), source);
        assert!(!source.exists());
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_non_unicode_external_paths_before_file_access() {
        use std::os::unix::ffi::OsStringExt;

        let directory = tempfile::tempdir().unwrap();
        let path = directory
            .path()
            .join(std::ffi::OsString::from_vec(b"note-\xff.md".to_vec()));

        let error = write_external(&path, "# changed", None, "").unwrap_err();

        assert_eq!(error.kind, ErrorKind::Failed);
        assert_eq!(error.message, "the path is not valid unicode");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn should_reject_non_unicode_external_paths_before_saving() {
        use std::os::unix::ffi::OsStringExt;

        let directory = tempfile::tempdir().unwrap();
        let path = directory
            .path()
            .join(std::ffi::OsString::from_vec(b"note-\xff.md".to_vec()));
        fs::write(&path, "# original").unwrap();

        let error = write_external(&path, "# changed", None, "").unwrap_err();

        assert_eq!(error.message, "the path is not valid unicode");
        assert_eq!(fs::read_to_string(path).unwrap(), "# original");
    }

    #[cfg(unix)]
    #[test]
    fn should_read_an_external_file_through_a_symlink() {
        let directory = tempfile::tempdir().unwrap();
        let real = directory.path().join("real.md");
        let link = directory.path().join("link.md");
        fs::write(&real, "# Real").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let file = read_external(&link).unwrap();

        assert_eq!(file.content, "# Real");
    }

    #[cfg(unix)]
    #[test]
    fn should_refuse_to_save_an_external_file_through_a_symlink() {
        let directory = tempfile::tempdir().unwrap();
        let real = directory.path().join("real.md");
        let link = directory.path().join("link.md");
        fs::write(&real, "# Real").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        assert!(write_external(&link, "# Changed", None, "").is_err());

        assert_eq!(fs::read_to_string(&real).unwrap(), "# Real");
        assert!(fs::symlink_metadata(&link).unwrap().is_symlink());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
    }

    #[test]
    fn should_save_external_heading_edits_without_an_index() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("shopping.md");
        fs::write(&path, "# Errands").unwrap();
        let receipt = written(&path, "# Weekend errands", Some(SaveName::Heading)).unwrap();
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
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        for name in ["", ".hidden", "a/b", "a\\b", "a:b"] {
            assert!(core
                .create_note(&CreateNote {
                    name: Some(NoteName::Filename(name.into())),
                    ..Default::default()
                })
                .is_err());
        }
        assert!(core
            .create_note(&CreateNote {
                folder: Some("../outside".into()),
                ..Default::default()
            })
            .is_err());
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
        let base = "a".repeat(120);
        let first = core
            .create_note(&CreateNote {
                name: Some(NoteName::Filename(base.clone())),
                ..Default::default()
            })
            .unwrap();
        let second = core
            .create_note(&CreateNote {
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
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        core.index_dirty.set(true);
        fs::write(directory.path().join("good.md"), "readable").unwrap();
        fs::write(directory.path().join("bad.md"), [0xff]).unwrap();
        assert!(core.list_notes(&Default::default()).is_err());
        assert!(core.index_dirty.get());
        assert_eq!(
            core.read_note("good.md".into()).unwrap().content,
            "readable"
        );
        fs::write(directory.path().join("bad.md"), "fixed").unwrap();
        assert_eq!(core.list_notes(&Default::default()).unwrap().len(), 2);
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
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::write(directory.path().join("a.md"), "# old").unwrap();
        index::index_file(&core.conn, &core.root, "a.md").unwrap();
        core.conn.execute_batch("PRAGMA query_only = ON").unwrap();
        let receipt = saved(&core, "a.md", "# saved", None).unwrap();
        assert!(
            matches!(receipt.warnings.as_slice(), [MutationWarning::Index { path, .. }] if path == "a.md")
        );
        assert_eq!(core.read_note("a.md".into()).unwrap().content, "# saved");
        assert!(core.list_notes(&Default::default()).is_err());
        core.conn.execute_batch("PRAGMA query_only = OFF").unwrap();
        assert_eq!(
            core.list_notes(&Default::default())
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
        fs::create_dir(directory.path().join("source")).unwrap();
        fs::write(directory.path().join("source/a.md"), "# original").unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let source = directory.path().join("source");
        fs::set_permissions(&source, fs::Permissions::from_mode(0o555)).unwrap();
        if fs::File::create(source.join("probe")).is_err() {
            let receipt = core.move_note("source/a.md".into(), "destination").unwrap();
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
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        let receipt = core
            .create_note(&CreateNote {
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
            core.list_notes(&Default::default())
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

        let error =
            replace(&located(missing_directory.path(), "gone.md"), "recreated").unwrap_err();

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
            assert!(replace(&located(&dir, "note.md"), "replacement").is_err());
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

        replace(&located(note_directory.path(), "note.md"), "after").unwrap();

        let mode = fs::metadata(&note).unwrap().permissions().mode();

        assert_eq!(mode & 0o777, 0o640);
    }

    #[test]
    fn should_leave_no_temporary_file_after_replacement() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        let note = dir.join("note.md");
        fs::write(&note, "before").unwrap();

        replace(&located(&dir, "note.md"), "after").unwrap();

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

        let error = create_file(
            &located(taken_directory.path(), "taken.md"),
            "taken.md",
            "clobbered",
        )
        .unwrap_err();

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

        replace(&located(existing_directory.path(), "note.md"), "after").unwrap();

        assert_eq!(fs::read_to_string(&existing).unwrap(), "after");
    }

    #[cfg(unix)]
    fn swap_folder_for_link(directory: &Path, folder: &str, outside: &Path) {
        fs::rename(
            directory.join(folder),
            directory.join(format!("{folder}-original")),
        )
        .unwrap();
        std::os::unix::fs::symlink(outside, directory.join(folder)).unwrap();
    }

    fn library_with_folder_note() -> (tempfile::TempDir, tempfile::TempDir, Library) {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("folder")).unwrap();
        fs::write(directory.path().join("folder/note.md"), "original").unwrap();
        fs::write(outside.path().join("note.md"), "outside").unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        (directory, outside, core)
    }

    #[cfg(unix)]
    #[test]
    fn should_write_the_validated_note_after_its_parent_is_swapped_for_a_symlink() {
        let (directory, outside, core) = library_with_folder_note();
        let located = RelativePath::parse("folder/note.md")
            .unwrap()
            .resolve(&core.root)
            .unwrap();
        swap_folder_for_link(directory.path(), "folder", outside.path());

        replace(&located, "written").unwrap();

        assert_eq!(
            fs::read_to_string(outside.path().join("note.md")).unwrap(),
            "outside"
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("folder-original/note.md")).unwrap(),
            "written"
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_read_the_validated_note_after_its_parent_is_swapped() {
        let (directory, outside, core) = library_with_folder_note();
        let located = RelativePath::parse("folder/note.md")
            .unwrap()
            .resolve(&core.root)
            .unwrap();
        swap_folder_for_link(directory.path(), "folder", outside.path());

        let content = OpenedNote::new(located.open_read().unwrap())
            .read()
            .unwrap();

        assert_eq!(content, "original");
    }

    #[cfg(unix)]
    #[test]
    fn should_delete_the_validated_note_and_leave_the_swap_target_alone() {
        let (directory, outside, core) = library_with_folder_note();
        let located = RelativePath::parse("folder/note.md")
            .unwrap()
            .resolve(&core.root)
            .unwrap();
        swap_folder_for_link(directory.path(), "folder", outside.path());

        located.remove_file().unwrap();

        assert_eq!(
            fs::read_to_string(outside.path().join("note.md")).unwrap(),
            "outside"
        );
        assert!(!directory.path().join("folder-original/note.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn should_place_a_move_destination_in_the_validated_folder() {
        let (directory, outside, core) = library_with_folder_note();
        let target = Located {
            dir: ensure_folder(&core.root, "folder").unwrap(),
            name: "moved.md".into(),
        };
        swap_folder_for_link(directory.path(), "folder", outside.path());

        create_file(&target, "folder/moved.md", "moved").unwrap();

        assert!(!outside.path().join("moved.md").exists());
        assert_eq!(
            fs::read_to_string(directory.path().join("folder-original/moved.md")).unwrap(),
            "moved"
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_copy_an_attachment_into_the_validated_attachments_folder() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let target = Located {
            dir: ensure_folder(&core.root, "attachments").unwrap(),
            name: "image.png".into(),
        };
        swap_folder_for_link(directory.path(), "attachments", outside.path());

        target.create_new().unwrap().write_all(b"bytes").unwrap();

        assert!(!outside.path().join("image.png").exists());
        assert_eq!(
            fs::read(directory.path().join("attachments-original/image.png")).unwrap(),
            b"bytes"
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_follow_a_validated_folder_that_moves_outside_the_library() {
        let (directory, outside, core) = library_with_folder_note();
        let located = RelativePath::parse("folder/note.md")
            .unwrap()
            .resolve(&core.root)
            .unwrap();
        core.scan().unwrap();
        fs::rename(
            directory.path().join("folder"),
            outside.path().join("folder"),
        )
        .unwrap();

        replace(&located, "written").unwrap();

        assert_eq!(
            fs::read_to_string(outside.path().join("folder/note.md")).unwrap(),
            "written"
        );
        assert!(!directory.path().join("folder").exists());
        core.scan().unwrap();
        assert!(core.list_notes(&Default::default()).unwrap().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn should_refuse_to_move_a_validated_folder_while_an_operation_holds_it() {
        const ERROR_SHARING_VIOLATION: i32 = 32;
        let (directory, outside, core) = library_with_folder_note();
        let located = RelativePath::parse("folder/note.md")
            .unwrap()
            .resolve(&core.root)
            .unwrap();

        let refused = fs::rename(
            directory.path().join("folder"),
            directory.path().join("folder-original"),
        )
        .unwrap_err();
        replace(&located, "written").unwrap();

        assert_eq!(refused.raw_os_error(), Some(ERROR_SHARING_VIOLATION));
        assert_eq!(
            fs::read_to_string(outside.path().join("note.md")).unwrap(),
            "outside"
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("folder/note.md")).unwrap(),
            "written"
        );
    }

    #[cfg(windows)]
    #[test]
    fn should_refuse_a_junction_as_a_folder_component() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "outside").unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(directory.path().join("link"))
            .arg(outside.path())
            .status()
            .unwrap();
        assert!(status.success());

        let located = RelativePath::parse("link/note.md")
            .unwrap()
            .locate(&core.root);

        assert!(!matches!(located, Ok(Some(_))));
        assert_eq!(
            fs::read_to_string(outside.path().join("note.md")).unwrap(),
            "outside"
        );
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        assert!(library.read_note("note.md".into()).is_err());
        assert_eq!(
            read_external(&outside.path().join("note.md"))
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        assert!(library
            .save_note("linked/note.md", "# changed", None, "")
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::write(directory.path().join("note.md"), "# source").unwrap();

        assert!(library
            .create_note(&CreateNote {
                folder: Some("linked".into()),
                ..Default::default()
            })
            .is_err());
        assert!(library.move_note("note.md".into(), "linked").is_err());
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        assert!(library
            .attach_file(&outside.path().join("source.txt"))
            .is_err());
        assert!(library.attach_image("aW1hZ2U=").is_err());
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 1);
    }

    #[test]
    fn should_return_slash_separated_paths_after_saving_in_a_folder() {
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::create_dir(directory.path().join("folder")).unwrap();
        fs::write(directory.path().join("folder/note.md"), "# before").unwrap();

        let receipt = saved(
            &library,
            "folder/note.md",
            "# after",
            Some(SaveName::Heading),
        )
        .unwrap();

        assert_eq!(receipt.path, "folder/after.md");
        assert_eq!(receipt.warnings.len(), 0);
    }

    #[test]
    fn should_refuse_a_save_whose_expected_revision_is_stale_and_return_the_file_on_disk() {
        let directory = tempfile::tempdir().unwrap();
        let core = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::write(directory.path().join("note.md"), "# on disk").unwrap();

        let file = conflicted(
            core.save_note(
                "note.md",
                "# mine",
                None,
                &content_revision("# started from"),
            )
            .unwrap(),
        );

        assert_eq!(file.content, "# on disk");
        assert_eq!(file.revision, content_revision("# on disk"));
        assert!(file.updated_at > 0);
        assert_eq!(
            fs::read_to_string(directory.path().join("note.md")).unwrap(),
            "# on disk"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
    }

    #[test]
    fn should_refuse_a_stale_external_save_without_writing() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("note.md");
        fs::write(&path, "# on disk").unwrap();

        let file =
            conflicted(write_external(&path, "# mine", Some(SaveName::Heading), "stale").unwrap());

        assert_eq!(file.content, "# on disk");
        assert_eq!(fs::read_to_string(&path).unwrap(), "# on disk");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn should_publish_when_nothing_changed_between_staging_and_publication() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# before").unwrap();
        let source = located(directory.path(), "note.md");
        let expected = content_revision("# before");
        let Publication::Committed(mut staged) = stage(&source, "# after", &expected).unwrap()
        else {
            panic!("staging should pass at the current revision");
        };

        let outcome = staged.exchange_over(&source, "note.md", &expected).unwrap();

        assert!(matches!(outcome, Publication::Committed(_)));
        drop(staged);
        assert_eq!(
            fs::read_to_string(directory.path().join("note.md")).unwrap(),
            "# after"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[cfg(any(target_os = "linux", target_vendor = "apple"))]
    #[test]
    fn should_keep_an_in_place_write_that_landed_between_staging_and_publication() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# before").unwrap();
        let source = located(directory.path(), "note.md");
        let expected = content_revision("# before");
        let Publication::Committed(mut staged) = stage(&source, "# mine", &expected).unwrap()
        else {
            panic!("staging should pass at the current revision");
        };
        fs::write(directory.path().join("note.md"), "# written in place").unwrap();

        let outcome = staged.exchange_over(&source, "note.md", &expected).unwrap();

        let Publication::Conflict(file) = outcome else {
            panic!("an in-place write must be kept");
        };
        assert_eq!(file.content, "# written in place");
        drop(staged);
        assert_eq!(
            fs::read_to_string(directory.path().join("note.md")).unwrap(),
            "# written in place"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[cfg(any(target_os = "linux", target_vendor = "apple"))]
    #[test]
    fn should_keep_a_replacement_that_landed_between_staging_and_publication() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# before").unwrap();
        let source = located(directory.path(), "note.md");
        let expected = content_revision("# before");
        let Publication::Committed(mut staged) = stage(&source, "# mine", &expected).unwrap()
        else {
            panic!("staging should pass at the current revision");
        };
        // The same bytes under a new inode: only the identity check can see it.
        fs::write(directory.path().join("incoming.md"), "# before").unwrap();
        fs::rename(
            directory.path().join("incoming.md"),
            directory.path().join("note.md"),
        )
        .unwrap();

        let outcome = staged.exchange_over(&source, "note.md", &expected).unwrap();

        let Publication::Conflict(file) = outcome else {
            panic!("a renamed-over file must be kept");
        };
        assert_eq!(file.content, "# before");
        drop(staged);
        assert_eq!(
            fs::read_to_string(directory.path().join("note.md")).unwrap(),
            "# before"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn should_keep_a_file_renamed_over_the_original_before_a_rename_could_retire_it() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("shopping.md"), "# before").unwrap();
        let source = located(directory.path(), "shopping.md");
        let expected = content_revision("# before");
        let Publication::Committed(mut staged) = stage(&source, "# Errands", &expected).unwrap()
        else {
            panic!("staging should pass at the current revision");
        };
        staged.temp.publish("errands.md").unwrap();
        fs::write(directory.path().join("incoming.md"), "# before").unwrap();
        fs::rename(
            directory.path().join("incoming.md"),
            directory.path().join("shopping.md"),
        )
        .unwrap();

        let outcome = staged
            .retire_original(&source, "errands.md", &expected)
            .unwrap();

        let Publication::Conflict(file) = outcome else {
            panic!("a renamed-over original must be kept");
        };
        assert_eq!(file.content, "# before");
        drop(staged);
        assert!(!directory.path().join("errands.md").exists());
        assert_eq!(
            fs::read_to_string(directory.path().join("shopping.md")).unwrap(),
            "# before"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn should_keep_the_original_when_it_changed_before_a_rename_could_retire_it() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("shopping.md"), "# before").unwrap();
        let source = located(directory.path(), "shopping.md");
        let expected = content_revision("# before");
        let Publication::Committed(mut staged) = stage(&source, "# Errands", &expected).unwrap()
        else {
            panic!("staging should pass at the current revision");
        };
        staged.temp.publish("errands.md").unwrap();
        fs::write(directory.path().join("shopping.md"), "# written in place").unwrap();

        let outcome = staged
            .retire_original(&source, "errands.md", &expected)
            .unwrap();

        let Publication::Conflict(file) = outcome else {
            panic!("a changed original must be kept");
        };
        assert_eq!(file.content, "# written in place");
        drop(staged);
        assert!(!directory.path().join("errands.md").exists());
        assert_eq!(
            fs::read_to_string(directory.path().join("shopping.md")).unwrap(),
            "# written in place"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
