//! Saved notes, their derived index, and library operations without a window runtime.
//!
//! The host serializes access to one [`Library`] and publishes returned changes
//! after releasing its operation lock. The `bindings` feature adds type metadata
//! for the desktop IPC exporter; engine operations do not depend on it.

mod application;
mod conflicts;
mod frontmatter;
mod index;
mod markdown;
mod note_file;
mod queries;
mod relationships;
mod relative_path;
mod scan;

use std::cell::Cell;
use std::fs;
use std::path::{Path, PathBuf};

use cap_std::{ambient_authority, fs::Dir};

pub use application::{
    read_external, write_external, CommandError, CreateNote, DeleteReceipt, ErrorKind,
    MutationReceipt, MutationWarning, NoteFile, NoteName, OpenKind, PathMutationReceipt,
    PendingOpen, SaveName, SavedNote,
};
pub use conflicts::{clear_conflict, read_conflict, stash_conflict, ConflictStash};
pub use queries::{
    CountedTag, GraphResult, GraphTarget, NoteFilters, NoteMeta, NoteSearch, NoteSort, Picture,
    ReadView, SearchFilter,
};
pub use relationships::{Graph, Hub, HubPill, Mention, MentionLine, RingMember};
pub use scan::Scan;

pub(crate) fn index_key(notes_dir: &Path) -> String {
    use sha2::{Digest, Sha256};

    format!(
        "{:x}",
        Sha256::digest(notes_dir.as_os_str().as_encoded_bytes())
    )
}

/// A library directory and its disposable index, accessed under one host-owned lock.
#[derive(Debug)]
pub struct Library {
    notes_dir: PathBuf,
    root: Dir,
    index_dir: PathBuf,
    conn: rusqlite::Connection,
    index_dirty: Cell<bool>,
}

impl Library {
    /// Open or rebuild the index schema under `cache_dir`, keyed by the resolved
    /// root. Scanning is a separate operation so the host can start it off its UI thread.
    pub fn open(notes_dir: &Path, cache_dir: &Path) -> Result<Self, CommandError> {
        fs::create_dir_all(notes_dir)?;
        let notes_dir = notes_dir.canonicalize()?;
        let root = Dir::open_ambient_dir(&notes_dir, ambient_authority())?;
        let index_dir = cache_dir.join(index_key(&notes_dir));
        let conn = index::open(&index_dir)?;
        Ok(Self {
            notes_dir,
            root,
            index_dir,
            conn,
            index_dirty: Cell::new(false),
        })
    }

    /// The selected library root, used by the host's watcher and asset scope.
    pub fn directory(&self) -> &Path {
        &self.notes_dir
    }

    /// The SQLite file this library's index lives in, under the cache directory.
    pub fn index_path(&self) -> PathBuf {
        self.index_dir.join(index::DATABASE)
    }

    /// Scan saved files, retaining successful changes when individual files fail.
    /// Failed scans mark indexed reads for recovery before they return results.
    pub fn scan(&self) -> Result<Vec<String>, CommandError> {
        match index::scan_all(&self.conn, &self.root, &self.notes_dir) {
            Ok(report) => {
                self.index_dirty.set(!report.failures.is_empty());
                Ok(report.changed)
            }
            Err(error) => {
                self.index_dirty.set(true);
                Err(error.into())
            }
        }
    }

    /// Scan every saved file, rejecting a library switch if any file cannot be indexed.
    pub fn scan_complete(&self) -> Result<(), CommandError> {
        index::scan_complete(&self.conn, &self.root, &self.notes_dir)?;
        Ok(())
    }

    /// Reconcile host observations synchronously. Native hosts use the same scan
    /// through `begin_observations` and `advance_scan` to interleave commands.
    pub fn reconcile_paths<'a>(
        &self,
        paths: impl IntoIterator<Item = &'a Path>,
    ) -> Option<Vec<String>> {
        let scan = Scan::observed(
            &self.notes_dir,
            paths.into_iter().map(Path::to_owned).collect(),
        );
        match scan.run(&self.conn, &self.root) {
            Ok(report) => {
                if !report.failures.is_empty() {
                    self.index_dirty.set(true);
                }
                let mut changed = report.changed;
                changed.sort();
                changed.dedup();
                if self.index_dirty.get() {
                    Some(Vec::new())
                } else {
                    (!changed.is_empty()).then_some(changed)
                }
            }
            Err(error) => {
                self.index_dirty.set(true);
                log::error!("could not reconcile observed paths: {error}");
                Some(Vec::new())
            }
        }
    }

    /// Whether indexed reads require a successful forced scan.
    pub fn index_needs_rebuild(&self) -> bool {
        self.index_dirty.get()
    }

    /// Begin a refresh without dropping usable rows. The host must defer indexed
    /// reads until completion and serialize steps with other operations.
    pub fn begin_scan(&self, force: bool) -> Scan {
        self.index_dirty.set(false);
        Scan::new(&self.notes_dir, force)
    }

    /// Begin a debounced observation batch, expanding folder changes to a full scan.
    pub fn begin_observations(&self, paths: Vec<PathBuf>) -> Scan {
        Scan::observed(&self.notes_dir, paths)
    }

    /// Process one traversal entry, note update or cleanup candidate. Returns
    /// `true` when the host should consume the scan with `finish_scan`.
    pub fn advance_scan(&self, scan: &mut Scan) -> Result<bool, CommandError> {
        if scan.root != self.notes_dir {
            return Err(std::io::Error::other("the selected library changed").into());
        }
        scan.step(&self.conn, &self.root).map_err(|error| {
            self.index_dirty.set(true);
            error.into()
        })
    }

    /// Finish a scan, preserving failures from mutations that ran between steps.
    pub fn finish_scan(&self, scan: Scan) -> Result<Vec<String>, CommandError> {
        let report = scan.finish();
        if let Some(error) = report.failures.into_iter().next() {
            self.index_dirty.set(true);
            return Err(error.into());
        }
        if self.index_dirty.get() {
            return Err(std::io::Error::other("the index is still incomplete").into());
        }
        Ok(report.changed)
    }

    /// Drop an unfinished scan; indexed reads then wait for a recovery.
    pub fn abandon_scan(&self, _scan: Scan) {
        self.index_dirty.set(true);
    }

    /// Classify user-selected files as library notes or explicit external files.
    pub fn classify_opens(&self, paths: Vec<String>) -> Vec<PendingOpen> {
        application::classify_opens(&self.notes_dir, paths)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_reconcile_external_files_without_echoing_saved_mutations() {
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let saved = library
            .create_note(&CreateNote {
                content: Some("# saved".into()),
                folder: None,
                name: Some(NoteName::Filename("saved".into())),
            })
            .unwrap();
        let saved_path = library.directory().join(saved.path);
        assert_eq!(library.reconcile_paths([saved_path.as_path()]), None);

        let external = library.directory().join("external.md");
        fs::write(&external, "# external").unwrap();
        assert_eq!(
            library.reconcile_paths([external.as_path(), external.as_path()]),
            Some(vec!["external.md".into()])
        );
        assert_eq!(
            library.list_notes(&NoteFilters::default()).unwrap().len(),
            2
        );
        assert_eq!(library.reconcile_paths([external.as_path()]), None);
    }

    #[test]
    fn should_require_recovery_after_an_abandoned_scan() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Note").unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let mut scan = library.begin_scan(false);
        assert!(!library.advance_scan(&mut scan).unwrap());

        library.abandon_scan(scan);

        assert!(library.index_needs_rebuild());
        assert_eq!(library.list_notes(&Default::default()).unwrap().len(), 1);
        assert!(!library.index_needs_rebuild());
    }

    #[test]
    fn should_reconcile_children_when_only_the_folder_move_is_observed() {
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let source = library.directory().join("before");
        let destination = library.directory().join("after");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("note.md"), "# note").unwrap();
        library.scan_complete().unwrap();

        fs::rename(&source, &destination).unwrap();

        assert_eq!(
            library.reconcile_paths([source.as_path(), destination.as_path()]),
            Some(vec!["after/note.md".into(), "before/note.md".into()])
        );
        let notes = library.list_notes(&NoteFilters::default()).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].path, "after/note.md");
    }

    #[test]
    fn should_request_full_refresh_after_an_observed_file_cannot_be_indexed() {
        let directory = tempfile::tempdir().unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let unreadable = library.directory().join("broken.md");
        fs::write(&unreadable, [0xff]).unwrap();

        assert_eq!(
            library.reconcile_paths([unreadable.as_path()]),
            Some(vec![])
        );
        assert!(library.list_notes(&NoteFilters::default()).is_err());

        fs::write(&unreadable, "# readable").unwrap();
        let notes = library.list_notes(&NoteFilters::default()).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "readable");
        assert_eq!(library.reconcile_paths([unreadable.as_path()]), None);
    }

    #[test]
    fn should_open_a_library_without_creating_notras() {
        let directory = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Note").unwrap();
        let library = Library::open(directory.path(), cache.path()).unwrap();

        library.scan_complete().unwrap();

        assert!(!directory.path().join(".notras").exists());
        assert!(library.index_path().starts_with(cache.path()));
        assert!(library.index_path().is_file());
        assert_eq!(
            library.list_notes(&NoteFilters::default()).unwrap().len(),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_key_the_index_by_the_canonical_root() {
        let directory = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        let real = directory.path().join("real");
        let alias = directory.path().join("alias");
        fs::create_dir(&real).unwrap();
        std::os::unix::fs::symlink(&real, &alias).unwrap();

        let through_alias = Library::open(&alias, cache.path()).unwrap().index_path();
        let through_real = Library::open(&real, cache.path()).unwrap().index_path();

        assert_eq!(through_alias, through_real);
    }

    #[cfg(unix)]
    #[test]
    fn should_reconcile_canonical_paths_when_the_selected_root_is_a_symlink() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("root");
        let link = directory.path().join("selected");
        fs::create_dir(&root).unwrap();
        std::os::unix::fs::symlink(&root, &link).unwrap();
        let library = Library::open(&link, &directory.path().join(".index")).unwrap();
        let note = root.canonicalize().unwrap().join("note.md");
        fs::write(&note, "# note").unwrap();

        assert_eq!(
            library.reconcile_paths([note.as_path()]),
            Some(vec!["note.md".into()])
        );
        assert_eq!(
            library.read_note("note.md".into()).unwrap().content,
            "# note"
        );
    }
}
