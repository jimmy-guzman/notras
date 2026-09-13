use std::fs::{self, File};
use std::io::{self, Write as _};
use std::path::{Path, PathBuf};
use std::process;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};

use crate::application::{CommandError, NoteFile, OpenKind};
use crate::note_file::content_revision;

/// Both sides of an unresolved review: the version the edits started from and the edits.
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictStash {
    pub base: NoteFile,
    pub ours: String,
}

fn stash_path(dir: &Path, kind: OpenKind, path: &str) -> PathBuf {
    let kind = match kind {
        OpenKind::External => "external",
        OpenKind::Note => "note",
    };
    dir.join(format!(
        "{}.json",
        content_revision(&format!("{kind}\0{path}"))
    ))
}

/// Each write gets a sibling of its own, so two stashes of one note in flight
/// cannot truncate each other's bytes before the rename.
fn temp_sibling(target: &Path) -> io::Result<(PathBuf, File)> {
    static WRITES: AtomicU64 = AtomicU64::new(0);
    let attempt = WRITES.fetch_add(1, Ordering::Relaxed);
    let temp = target.with_extension(format!("json.{}-{attempt}.tmp", process::id()));
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    Ok((temp, file))
}

fn write_replacing(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let (temp, mut file) = temp_sibling(target)?;
    let written = file.write_all(bytes).and_then(|()| file.sync_all());
    let published = written.and_then(|()| fs::rename(&temp, target));
    if published.is_err() {
        let _ = fs::remove_file(&temp);
    }
    published
}

/// Keep both sides of a review on disk until a resolution commits.
pub fn stash_conflict(
    dir: &Path,
    kind: OpenKind,
    path: &str,
    stash: &ConflictStash,
) -> Result<(), CommandError> {
    fs::create_dir_all(dir)?;
    let bytes = serde_json::to_vec(stash)
        .map_err(|error| CommandError::with_source("the review could not be stored", error))?;
    write_replacing(&stash_path(dir, kind, path), &bytes)?;
    Ok(())
}

/// Read a stored review, or nothing when the note has none.
pub fn read_conflict(
    dir: &Path,
    kind: OpenKind,
    path: &str,
) -> Result<Option<ConflictStash>, CommandError> {
    let file = match File::open(stash_path(dir, kind, path)) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    serde_json::from_reader(file)
        .map(Some)
        .map_err(|error| CommandError::with_source("the stored review could not be read", error))
}

/// Forget a stored review; a note without one is left as it is.
pub fn clear_conflict(dir: &Path, kind: OpenKind, path: &str) -> Result<(), CommandError> {
    match fs::remove_file(stash_path(dir, kind, path)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stash(ours: &str) -> ConflictStash {
        ConflictStash {
            base: NoteFile {
                content: "# Base".into(),
                revision: content_revision("# Base"),
                updated_at: 1,
            },
            ours: ours.into(),
        }
    }

    #[test]
    fn should_store_and_read_back_a_stash_by_kind_and_path() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path().join("conflicts");

        stash_conflict(&dir, OpenKind::Note, "a.md", &stash("# Ours")).unwrap();

        let read = read_conflict(&dir, OpenKind::Note, "a.md")
            .unwrap()
            .unwrap();
        assert_eq!(read.ours, "# Ours");
        assert_eq!(read.base.content, "# Base");
        assert_eq!(read.base.revision, content_revision("# Base"));
        assert_eq!(read.base.updated_at, 1);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    }

    #[test]
    fn should_report_no_stash_without_creating_the_folder() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path().join("conflicts");

        assert!(read_conflict(&dir, OpenKind::Note, "a.md")
            .unwrap()
            .is_none());

        assert!(!dir.exists());
    }

    #[test]
    fn should_keep_stashes_for_the_same_path_of_different_kinds_apart() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path().join("conflicts");

        stash_conflict(&dir, OpenKind::Note, "a.md", &stash("note side")).unwrap();
        stash_conflict(&dir, OpenKind::External, "a.md", &stash("external side")).unwrap();

        assert_eq!(
            read_conflict(&dir, OpenKind::Note, "a.md")
                .unwrap()
                .unwrap()
                .ours,
            "note side"
        );
        assert_eq!(
            read_conflict(&dir, OpenKind::External, "a.md")
                .unwrap()
                .unwrap()
                .ours,
            "external side"
        );
    }

    #[test]
    fn should_clear_a_stash_and_ignore_a_missing_one() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path().join("conflicts");
        stash_conflict(&dir, OpenKind::Note, "a.md", &stash("# Ours")).unwrap();

        clear_conflict(&dir, OpenKind::Note, "a.md").unwrap();
        clear_conflict(&dir, OpenKind::Note, "a.md").unwrap();

        assert!(read_conflict(&dir, OpenKind::Note, "a.md")
            .unwrap()
            .is_none());
    }

    #[test]
    fn should_give_each_stash_write_a_sibling_of_its_own() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path().join("conflicts");

        stash_conflict(&dir, OpenKind::Note, "a.md", &stash("# one")).unwrap();
        let first = fs::read_dir(&dir).unwrap().count();
        stash_conflict(&dir, OpenKind::Note, "a.md", &stash("# two")).unwrap();

        assert_eq!(first, 1);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        assert_eq!(
            read_conflict(&dir, OpenKind::Note, "a.md")
                .unwrap()
                .unwrap()
                .ours,
            "# two"
        );
        let (path, _file) = temp_sibling(&stash_path(&dir, OpenKind::Note, "a.md")).unwrap();
        let (other, _other) = temp_sibling(&stash_path(&dir, OpenKind::Note, "a.md")).unwrap();
        assert_ne!(path, other);
    }

    #[test]
    fn should_reject_a_stash_that_does_not_parse() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path().join("conflicts");
        fs::create_dir_all(&dir).unwrap();
        fs::write(stash_path(&dir, OpenKind::Note, "a.md"), "{not json").unwrap();

        let error = read_conflict(&dir, OpenKind::Note, "a.md").unwrap_err();

        assert_eq!(error.message, "the stored review could not be read");
    }
}
