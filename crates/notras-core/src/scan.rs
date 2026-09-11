use std::collections::HashSet;
use std::fs::{self, ReadDir};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};

use crate::index::{self, IndexError, ScanReport};
use crate::relative_path::RelativePath;

enum Entry {
    Directory(PathBuf),
    Entries(PathBuf, Box<ReadDir>),
    Observed(PathBuf),
}

/// A resumable scan of one library. The host serializes each step with file
/// mutations; no document bytes are retained between steps.
pub struct Scan {
    pub(crate) root: PathBuf,
    entries: Vec<Entry>,
    force: bool,
    full: bool,
    seen: HashSet<String>,
    shadowed: Vec<String>,
    paths_complete: bool,
    cleanup: Option<(i64, i64)>,
    stale: Vec<String>,
    deletions: Option<std::vec::IntoIter<String>>,
    report: ScanReport,
}

impl Scan {
    pub(crate) fn new(root: &Path, force: bool) -> Self {
        Self {
            root: root.to_owned(),
            entries: vec![Entry::Directory(root.to_owned())],
            force,
            full: true,
            seen: HashSet::new(),
            shadowed: Vec::new(),
            paths_complete: true,
            cleanup: None,
            stale: Vec::new(),
            deletions: None,
            report: ScanReport {
                changed: Vec::new(),
                failures: Vec::new(),
            },
        }
    }

    pub(crate) fn observed(root: &Path, paths: Vec<PathBuf>) -> Self {
        Self {
            entries: paths.into_iter().rev().map(Entry::Observed).collect(),
            full: false,
            ..Self::new(root, false)
        }
    }

    fn unreadable(&mut self, dir: &Path, error: std::io::Error) {
        log::warn!("could not list {}: {error}", dir.display());
        if let Some(relative) = index::relative_path(&self.root, dir) {
            self.shadowed.push(if relative.is_empty() {
                relative
            } else {
                format!("{relative}/")
            });
        } else {
            self.paths_complete = false;
        }
        self.report.failures.push(error.into());
    }

    fn index_path(&mut self, conn: &Connection, path: &str) -> Result<(), IndexError> {
        let result = if self.force {
            index::reindex_file(conn, &self.root, path)
        } else {
            index::index_file(conn, &self.root, path)
        };
        match result {
            Ok(true) => self.report.changed.push(path.to_owned()),
            Ok(false) => {}
            Err(IndexError::Io(error)) => {
                log::warn!("could not read {path}: {error}");
                self.report.failures.push(error.into());
            }
            Err(error) => return Err(error),
        }
        Ok(())
    }

    fn file(&mut self, conn: &Connection, path: &Path) -> Result<(), IndexError> {
        match RelativePath::from_host(&self.root, path) {
            Ok(relative) => {
                self.index_path(conn, relative.as_str())?;
                self.seen.insert(relative.into_string());
            }
            Err(error) => {
                log::warn!("could not index {}: {error}", path.display());
                self.paths_complete = false;
                self.report.failures.push(error.into());
            }
        }
        Ok(())
    }

    pub(crate) fn step(&mut self, conn: &Connection) -> Result<bool, IndexError> {
        if let Some(entry) = self.entries.pop() {
            match entry {
                Entry::Directory(path) => match fs::read_dir(&path) {
                    Ok(entries) => self.entries.push(Entry::Entries(path, Box::new(entries))),
                    Err(error) => self.unreadable(&path, error),
                },
                Entry::Entries(dir, mut entries) => match entries.next() {
                    None => {}
                    Some(Err(error)) => self.unreadable(&dir, error),
                    Some(Ok(entry)) => {
                        if entry
                            .file_name()
                            .to_str()
                            .is_some_and(|name| name.starts_with('.'))
                        {
                            self.entries.push(Entry::Entries(dir, entries));
                            return Ok(false);
                        }
                        let path = entry.path();
                        match entry.file_type() {
                            Err(error) => self.unreadable(&dir, error),
                            Ok(kind) => {
                                self.entries.push(Entry::Entries(dir, entries));
                                if kind.is_dir() {
                                    self.entries.push(Entry::Directory(path));
                                } else if kind.is_file() && index::is_note_file(&path) {
                                    self.file(conn, &path)?;
                                }
                            }
                        }
                    }
                },
                Entry::Observed(path) => {
                    if index::relative_path(&self.root, &path).is_none() {
                        return Ok(false);
                    }
                    if index::is_note_file(&path) {
                        self.file(conn, &path)?;
                    } else if path.is_dir() || !path.exists() {
                        self.entries = vec![Entry::Directory(self.root.clone())];
                        self.full = true;
                    }
                }
            }
            return Ok(false);
        }
        if !self.full || !self.paths_complete {
            return Ok(true);
        }
        if let Some(deletions) = &mut self.deletions {
            let Some(path) = deletions.next() else {
                return Ok(true);
            };
            // A foreground create or move may have arrived after directory enumeration.
            // Re-read the path under the same lock instead of deleting from an old listing.
            if RelativePath::parse(&path).is_ok() {
                self.index_path(conn, &path)?;
            } else {
                index::remove(conn, &path)?;
                self.report.changed.push(path);
            }
            return Ok(false);
        }
        let (previous, upper) = match self.cleanup {
            Some(cursor) => cursor,
            None => {
                let upper = conn.query_row("SELECT coalesce(max(id), 0) FROM note", [], |row| {
                    row.get(0)
                })?;
                self.cleanup = Some((0, upper));
                return Ok(false);
            }
        };
        let next = conn
            .query_row(
                "SELECT id, path FROM note WHERE id > ?1 AND id <= ?2 ORDER BY id LIMIT 1",
                (previous, upper),
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let Some((id, path)) = next else {
            // Deleting first would lose rows if a later path failed to decode.
            self.deletions = Some(std::mem::take(&mut self.stale).into_iter());
            return Ok(false);
        };
        self.cleanup = Some((id, upper));
        if !self.seen.contains(&path) && !self.shadowed.iter().any(|dir| path.starts_with(dir)) {
            self.stale.push(path);
        }
        Ok(false)
    }

    pub(crate) fn finish(self) -> ScanReport {
        self.report
    }

    pub(crate) fn run(mut self, conn: &Connection) -> Result<ScanReport, IndexError> {
        while !self.step(conn)? {}
        Ok(self.finish())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CreateNote, Library, NoteName};

    #[test]
    fn should_preserve_saves_moves_and_recreated_files_during_cleanup() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("keep.md"), "# Keep").unwrap();
        fs::write(directory.path().join("gone.md"), "# Gone").unwrap();
        let library = Library::open(directory.path()).unwrap();
        library.scan_complete().unwrap();
        fs::remove_file(directory.path().join("gone.md")).unwrap();
        let mut scan = library.begin_scan(true);
        while scan.deletions.is_none() {
            assert!(!library.advance_scan(&mut scan).unwrap());
        }

        library
            .create_note(&CreateNote {
                content: Some("# Recreated".into()),
                name: Some(NoteName::Filename("gone".into())),
                ..Default::default()
            })
            .unwrap();
        library.save_note("keep.md", "# Latest", None).unwrap();
        library.move_note("keep.md".into(), "moved").unwrap();
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();

        let notes = library.list_notes(&Default::default()).unwrap();
        assert_eq!(notes.len(), 2);
        assert!(notes
            .iter()
            .any(|note| note.path == "gone.md" && note.title == "Recreated"));
        assert!(notes
            .iter()
            .any(|note| note.path == "moved/keep.md" && note.title == "Latest"));
        assert_eq!(
            library.read_note("moved/keep.md".into()).unwrap().content,
            "# Latest"
        );
    }

    #[test]
    fn should_keep_last_known_rows_until_a_forced_scan_refreshes_them() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Current").unwrap();
        let library = Library::open(directory.path()).unwrap();
        library.scan_complete().unwrap();
        library
            .conn
            .execute("UPDATE note SET title = 'Previous'", [])
            .unwrap();

        let mut scan = library.begin_scan(true);
        assert_eq!(
            library.list_notes(&Default::default()).unwrap()[0].title,
            "Previous"
        );
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();
        assert_eq!(
            library.list_notes(&Default::default()).unwrap()[0].title,
            "Current"
        );
    }

    #[test]
    fn should_not_hide_a_failed_mutation_when_a_scan_finishes() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Before").unwrap();
        let library = Library::open(directory.path()).unwrap();
        library.scan_complete().unwrap();
        let mut scan = library.begin_scan(true);
        while scan.deletions.is_none() {
            assert!(!library.advance_scan(&mut scan).unwrap());
        }
        library.conn.execute_batch("CREATE TRIGGER refuse_delete BEFORE DELETE ON note_tag BEGIN SELECT RAISE(FAIL, 'unavailable'); END;").unwrap();
        // A tag gives the trigger an existing row to reject.
        library
            .conn
            .execute("INSERT INTO note_tag VALUES ('note.md', 'old')", [])
            .unwrap();
        let receipt = library.save_note("note.md", "# After", None).unwrap();
        assert_eq!(receipt.warnings.len(), 1);
        library
            .conn
            .execute_batch("DROP TRIGGER refuse_delete")
            .unwrap();
        while !library.advance_scan(&mut scan).unwrap() {}
        assert!(library.finish_scan(scan).is_err());
        assert!(library.index_needs_rebuild());
        assert_eq!(
            library.read_note("note.md".into()).unwrap().content,
            "# After"
        );
        assert_eq!(
            library.list_notes(&Default::default()).unwrap()[0].title,
            "After"
        );
    }
}
