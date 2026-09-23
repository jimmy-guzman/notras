use std::collections::HashSet;
use std::io;
use std::path::{Path, PathBuf};

use cap_fs_ext::DirExt;
use cap_std::fs::{Dir, ReadDir};
use rusqlite::{Connection, OptionalExtension};

use crate::index::{self, IndexError, ScanReport};
use crate::relative_path::RelativePath;

#[derive(Debug)]
enum Entry {
    Root,
    Entries {
        dir: Dir,
        relative: String,
        entries: Box<ReadDir>,
    },
    Observed(PathBuf),
}

/// A resumable scan of one library. The host serializes each step with file
/// mutations; no document bytes are retained between steps.
#[derive(Debug)]
pub struct Scan {
    pub(crate) root: PathBuf,
    entries: Vec<Entry>,
    force: bool,
    full: bool,
    seen: HashSet<String>,
    folders: HashSet<String>,
    shadowed: Vec<String>,
    paths_complete: bool,
    cleanup: Option<(i64, i64)>,
    stale: Vec<String>,
    deletions: Option<std::vec::IntoIter<String>>,
    report: ScanReport,
}

fn join(relative: &str, name: &str) -> String {
    if relative.is_empty() {
        name.to_owned()
    } else {
        format!("{relative}/{name}")
    }
}

impl Scan {
    pub(crate) fn new(root: &Path, force: bool) -> Self {
        Self {
            root: root.to_owned(),
            entries: vec![Entry::Root],
            force,
            full: true,
            seen: HashSet::new(),
            folders: HashSet::new(),
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

    fn unreadable(&mut self, relative: &str, error: io::Error) {
        log::warn!("could not list {relative}: {error}");
        self.shadowed.push(if relative.is_empty() {
            String::new()
        } else {
            format!("{relative}/")
        });
        self.report.failures.push(error.into());
    }

    fn list(&mut self, dir: Dir, relative: String) {
        match dir.entries() {
            Ok(entries) => self.entries.push(Entry::Entries {
                dir,
                relative,
                entries: Box::new(entries),
            }),
            Err(error) => self.unreadable(&relative, error),
        }
    }

    fn index_path(&mut self, conn: &Connection, root: &Dir, path: &str) -> Result<(), IndexError> {
        let result = if self.force {
            index::reindex_file(conn, root, path)
        } else {
            index::index_file(conn, root, path)
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

    fn file(&mut self, conn: &Connection, root: &Dir, relative: &str) -> Result<(), IndexError> {
        match RelativePath::parse(relative) {
            Ok(relative) => {
                self.index_path(conn, root, relative.as_str())?;
                self.seen.insert(relative.into_string());
            }
            Err(error) => {
                log::warn!("could not index {relative}: {error}");
                self.paths_complete = false;
                self.report.failures.push(error.into());
            }
        }
        Ok(())
    }

    fn folder(&mut self, conn: &Connection, relative: &str) -> Result<(), IndexError> {
        if RelativePath::parse(relative).is_err() || !index::is_note_folder(relative) {
            return Ok(());
        }
        if index::record_folder(conn, relative)? {
            self.report.changed.push(relative.to_owned());
        }
        self.folders.insert(relative.to_owned());
        Ok(())
    }

    /// Forget folders a complete walk did not find, keeping any under a
    /// directory it could not list.
    fn prune_folders(&mut self, conn: &Connection, root: &Dir) -> Result<(), IndexError> {
        let known = conn
            .prepare("SELECT path FROM folder")?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for path in known {
            let prefix = format!("{path}/");
            if self.folders.contains(&path)
                || self.shadowed.iter().any(|dir| prefix.starts_with(dir))
            {
                continue;
            }
            // A foreground move may have created it after the walk passed its parent.
            if root
                .symlink_metadata(&path)
                .is_ok_and(|metadata| metadata.is_dir())
            {
                continue;
            }
            if index::remove_folder(conn, &path)? {
                self.report.changed.push(path);
            }
        }
        Ok(())
    }

    fn child(
        &mut self,
        conn: &Connection,
        root: &Dir,
        dir: &Dir,
        relative: &str,
        entry: &cap_std::fs::DirEntry,
    ) -> Result<(), IndexError> {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            self.paths_complete = false;
            self.report.failures.push(
                io::Error::new(io::ErrorKind::InvalidData, "The path is not valid Unicode").into(),
            );
            return Ok(());
        };
        if name.starts_with('.') {
            return Ok(());
        }
        let child = join(relative, name);
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(error) => {
                self.unreadable(relative, error);
                return Ok(());
            }
        };
        if kind.is_dir() {
            match dir.open_dir_nofollow(name) {
                Ok(child_dir) => {
                    self.folder(conn, &child)?;
                    self.list(child_dir, child);
                }
                Err(error) => self.unreadable(&child, error),
            }
        } else if kind.is_file() && index::is_note_file(Path::new(name)) {
            self.file(conn, root, &child)?;
        }
        Ok(())
    }

    pub(crate) fn step(&mut self, conn: &Connection, root: &Dir) -> Result<bool, IndexError> {
        if let Some(entry) = self.entries.pop() {
            match entry {
                Entry::Root => match root.try_clone() {
                    Ok(dir) => self.list(dir, String::new()),
                    Err(error) => self.unreadable("", error),
                },
                Entry::Entries {
                    dir,
                    relative,
                    mut entries,
                } => match entries.next() {
                    None => {}
                    Some(Err(error)) => {
                        self.entries.push(Entry::Entries {
                            dir,
                            relative: relative.clone(),
                            entries,
                        });
                        self.unreadable(&relative, error);
                    }
                    Some(Ok(entry)) => {
                        let parent = Entry::Entries {
                            dir: dir.try_clone()?,
                            relative: relative.clone(),
                            entries,
                        };
                        self.entries.push(parent);
                        self.child(conn, root, &dir, &relative, &entry)?;
                    }
                },
                Entry::Observed(path) => {
                    let Some(relative) = index::relative_path(&self.root, &path) else {
                        return Ok(false);
                    };
                    if index::is_note_file(&path) {
                        self.file(conn, root, &relative)?;
                    } else if path.is_dir() || !path.exists() {
                        self.entries = vec![Entry::Root];
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
                self.prune_folders(conn, root)?;
                return Ok(true);
            };
            // A foreground create or move may have arrived after directory enumeration.
            // Re-read the path under the same lock instead of deleting from an old listing.
            if RelativePath::parse(&path).is_ok() {
                self.index_path(conn, root, &path)?;
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
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::{CreateNote, Library, NoteName, SaveOutcome};

    #[test]
    fn should_list_every_folder_a_note_could_be_filed_in() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir_all(directory.path().join("projects/empty")).unwrap();
        fs::write(directory.path().join("projects/plan.md"), "# Plan").unwrap();
        fs::create_dir(directory.path().join(".hidden")).unwrap();
        fs::create_dir(directory.path().join("attachments")).unwrap();
        fs::write(directory.path().join("attachments/shot.png"), [0]).unwrap();
        fs::create_dir(directory.path().join("images")).unwrap();
        fs::write(directory.path().join("images/shot.png"), [0]).unwrap();
        #[cfg(unix)]
        {
            let outside = tempfile::tempdir().unwrap();
            std::os::unix::fs::symlink(outside.path(), directory.path().join("linked")).unwrap();
        }
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        let mut scan = library.begin_scan(false);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();

        assert_eq!(
            library.read_view().unwrap().list_folders().unwrap(),
            ["images", "projects", "projects/empty"]
        );
    }

    #[test]
    fn should_report_and_forget_empty_folders_removed_or_renamed_on_disk() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("empty")).unwrap();
        fs::create_dir(directory.path().join("named")).unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let mut scan = library.begin_scan(false);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();

        fs::remove_dir(directory.path().join("empty")).unwrap();
        fs::rename(
            directory.path().join("named"),
            directory.path().join("renamed"),
        )
        .unwrap();
        fs::create_dir(directory.path().join("fresh")).unwrap();
        let mut scan = library.begin_observations(vec![
            library.directory().join("empty"),
            library.directory().join("named"),
            library.directory().join("renamed"),
            library.directory().join("fresh"),
        ]);
        while !library.advance_scan(&mut scan).unwrap() {}
        let mut changed = library.finish_scan(scan).unwrap();
        changed.sort();

        assert_eq!(changed, ["empty", "fresh", "named", "renamed"]);
        assert_eq!(
            library.read_view().unwrap().list_folders().unwrap(),
            ["fresh", "renamed"]
        );
    }

    #[test]
    fn should_list_a_folder_a_move_creates_and_keep_it_once_emptied() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Note").unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let mut scan = library.begin_scan(false);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();

        library.move_note("note.md".into(), "inbox/later").unwrap();
        assert_eq!(
            library.read_view().unwrap().list_folders().unwrap(),
            ["inbox", "inbox/later"]
        );
        library.move_note("inbox/later/note.md".into(), "").unwrap();
        let mut scan = library.begin_scan(false);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();

        assert_eq!(
            library.read_view().unwrap().list_folders().unwrap(),
            ["inbox", "inbox/later"]
        );
    }

    #[test]
    fn should_preserve_saves_moves_and_recreated_files_during_cleanup() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("keep.md"), "# Keep").unwrap();
        fs::write(directory.path().join("gone.md"), "# Gone").unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let mut scan = library.begin_scan(false);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();
        fs::remove_file(directory.path().join("gone.md")).unwrap();
        let mut scan = library.begin_scan(true);
        while scan.deletions.is_none() {
            assert!(!library.advance_scan(&mut scan).unwrap());
        }

        library
            .create_note(&CreateNote {
                content: Some("# Recreated".into()),
                name: Some(NoteName::Filename("gone".into())),
            })
            .unwrap();
        let expected = library.read_note("keep.md".into()).unwrap().revision;
        library
            .save_note("keep.md", "# Latest", None, &expected)
            .unwrap();
        library.move_note("keep.md".into(), "moved").unwrap();
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();

        let notes = library
            .read_view()
            .unwrap()
            .list_notes(&Default::default())
            .unwrap();
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let mut scan = library.begin_scan(false);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();
        library
            .conn
            .execute("UPDATE note SET title = 'Previous'", [])
            .unwrap();

        let mut scan = library.begin_scan(true);
        assert_eq!(
            library
                .read_view()
                .unwrap()
                .list_notes(&Default::default())
                .unwrap()[0]
                .title,
            "Previous"
        );
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();
        assert_eq!(
            library
                .read_view()
                .unwrap()
                .list_notes(&Default::default())
                .unwrap()[0]
                .title,
            "Current"
        );
    }

    #[test]
    fn should_not_hide_a_failed_mutation_when_a_scan_finishes() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Before").unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        let mut scan = library.begin_scan(false);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();
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
        let expected = library.read_note("note.md".into()).unwrap().revision;
        let SaveOutcome::Committed { receipt } = library
            .save_note("note.md", "# After", None, &expected)
            .unwrap()
        else {
            panic!("the save should commit at the current revision");
        };
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
        assert!(library.read_view().is_err());
        let mut scan = library.begin_scan(true);
        while !library.advance_scan(&mut scan).unwrap() {}
        library.finish_scan(scan).unwrap();
        assert_eq!(
            library
                .read_view()
                .unwrap()
                .list_notes(&Default::default())
                .unwrap()[0]
                .title,
            "After"
        );
    }
}
