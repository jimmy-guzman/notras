use std::ops::Deref;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock, RwLock};

use notras_core::{CommandError, Library, ReadView, Scan};

type Completion = Arc<OnceLock<Result<(), CommandError>>>;

struct ActiveScan {
    completion: Completion,
    view: Option<Arc<Mutex<ReadView>>>,
    changed: Vec<String>,
}

struct OwnedLibrary {
    library: Library,
    generation: u64,
    initialized: bool,
    active: Option<ActiveScan>,
}

enum ScanKind {
    Refresh,
    Rebuild,
    Recovery,
    Observed(Vec<PathBuf>),
}

struct NotifyOnDrop<'a>(&'a Condvar);

impl Drop for NotifyOnDrop<'_> {
    fn drop(&mut self) {
        self.0.notify_all();
    }
}

pub struct ScanChanges {
    pub generation: u64,
    pub paths: Vec<String>,
}

pub struct LibraryGuard<'a> {
    state: MutexGuard<'a, OwnedLibrary>,
    changed: &'a Condvar,
}

impl LibraryGuard<'_> {
    pub fn generation(&self) -> u64 {
        self.state.generation
    }
}

impl Deref for LibraryGuard<'_> {
    type Target = Library;
    fn deref(&self) -> &Library {
        &self.state.library
    }
}

impl Drop for LibraryGuard<'_> {
    fn drop(&mut self) {
        self.changed.notify_all();
    }
}

/// Serializes native operations, letting queued foreground work precede the
/// next scan step. Indexed reads share recovery instead of rebuilding under a guard.
pub struct LibraryOwner {
    state: Mutex<OwnedLibrary>,
    changed: Condvar,
    waiting: AtomicUsize,
    publication: RwLock<()>,
}

impl LibraryOwner {
    pub fn new(library: Library) -> Self {
        Self {
            state: Mutex::new(OwnedLibrary {
                library,
                generation: 0,
                initialized: false,
                active: None,
            }),
            changed: Condvar::new(),
            waiting: AtomicUsize::new(0),
            publication: RwLock::new(()),
        }
    }

    fn foreground(&self) -> MutexGuard<'_, OwnedLibrary> {
        self.waiting.fetch_add(1, Ordering::SeqCst);
        let state = self.state.lock().expect("library state was poisoned");
        self.waiting.fetch_sub(1, Ordering::SeqCst);
        self.changed.notify_all();
        state
    }

    fn background(&self) -> MutexGuard<'_, OwnedLibrary> {
        let mut state = self.state.lock().expect("library state was poisoned");
        while self.waiting.load(Ordering::SeqCst) > 0 {
            state = self
                .changed
                .wait(state)
                .expect("library state was poisoned");
        }
        state
    }

    pub fn read(&self) -> LibraryGuard<'_> {
        LibraryGuard {
            state: self.foreground(),
            changed: &self.changed,
        }
    }

    #[cfg(test)]
    pub fn try_read(&self) -> Option<LibraryGuard<'_>> {
        self.state.try_lock().ok().map(|state| LibraryGuard {
            state,
            changed: &self.changed,
        })
    }

    fn read_index(&self) -> Result<(u64, Arc<Mutex<ReadView>>), CommandError> {
        loop {
            let mut state = self.foreground();
            let generation = state.generation;
            if let Some(scan) = &state.active {
                if !state.library.index_needs_rebuild() {
                    if let Some(view) = &scan.view {
                        return Ok((generation, view.clone()));
                    }
                }
                let completion = scan.completion.clone();
                while generation == state.generation && completion.get().is_none() {
                    state = self
                        .changed
                        .wait(state)
                        .expect("library state was poisoned");
                }
                if generation == state.generation {
                    completion
                        .get()
                        .expect("scan completed before waking readers")
                        .clone()?;
                }
                continue;
            }
            if state.initialized && !state.library.index_needs_rebuild() {
                return Ok((generation, Arc::new(Mutex::new(state.library.read_view()?))));
            }
            drop(state);
            self.run_scan(ScanKind::Recovery, Some(generation))?;
        }
    }

    /// Run an indexed query without the operation guard. Reject a result if its
    /// library was replaced while the query was running.
    pub fn query<T>(
        &self,
        operation: impl FnOnce(&ReadView) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        let (generation, view) = self.read_index()?;
        let result = operation(&view.lock().expect("index reader was poisoned"));
        if self.read().generation() != generation {
            return Err(std::io::Error::other("the selected library changed").into());
        }
        result
    }

    fn run_scan(&self, kind: ScanKind, expected: Option<u64>) -> Result<ScanChanges, CommandError> {
        let mut state = self.foreground();
        let generation = expected.unwrap_or(state.generation);
        while state.active.is_some() && generation == state.generation {
            state = self
                .changed
                .wait(state)
                .expect("library state was poisoned");
        }
        if generation != state.generation {
            if matches!(kind, ScanKind::Refresh | ScanKind::Rebuild) {
                return Err(std::io::Error::other("the selected library changed").into());
            }
            return Ok(ScanChanges {
                generation,
                paths: Vec::new(),
            });
        }
        if matches!(kind, ScanKind::Recovery)
            && state.initialized
            && !state.library.index_needs_rebuild()
        {
            return Ok(ScanChanges {
                generation,
                paths: Vec::new(),
            });
        }
        let dirty = state.library.index_needs_rebuild();
        let view = if state.initialized && !dirty {
            Some(Arc::new(Mutex::new(state.library.read_view()?)))
        } else {
            None
        };
        let scan = match kind {
            ScanKind::Observed(paths) if state.initialized => {
                state.library.begin_observations(paths)
            }
            _ => state
                .library
                .begin_scan(dirty || matches!(kind, ScanKind::Rebuild)),
        };
        let completion = Arc::new(OnceLock::new());
        state.active = Some(ActiveScan {
            completion: completion.clone(),
            view,
            changed: Vec::new(),
        });
        drop(state);
        self.run_steps(generation, completion, scan)
    }

    fn run_steps(
        &self,
        generation: u64,
        completion: Completion,
        mut scan: Scan,
    ) -> Result<ScanChanges, CommandError> {
        // A panicking step poisons state; sleepers must wake to observe it.
        let _notify = NotifyOnDrop(&self.changed);
        loop {
            let mut state = self.background();
            if generation != state.generation {
                return Err(std::io::Error::other("the selected library changed").into());
            }
            let result = match state.library.advance_scan(&mut scan) {
                Ok(false) => continue,
                Ok(true) => state.library.finish_scan(scan),
                Err(error) => Err(error),
            };
            if result.is_ok() {
                state.initialized = true;
            }
            completion
                .set(result.as_ref().map(|_| ()).map_err(Clone::clone))
                .expect("a scan completes once");
            let active = state.active.take().expect("a running scan has an owner");
            self.changed.notify_all();
            drop(state);
            return result.map(|mut paths| {
                paths.extend(active.changed);
                paths.sort();
                paths.dedup();
                ScanChanges { generation, paths }
            });
        }
    }

    pub fn scan(&self) -> Result<ScanChanges, CommandError> {
        self.run_scan(ScanKind::Refresh, None)
    }

    pub fn rebuild(&self) -> Result<ScanChanges, CommandError> {
        self.run_scan(ScanKind::Rebuild, None)
    }

    pub fn observe(
        &self,
        generation: u64,
        paths: Vec<PathBuf>,
    ) -> Result<ScanChanges, CommandError> {
        self.run_scan(ScanKind::Observed(paths), Some(generation))
    }

    /// Repeat mutation invalidations at scan completion: a query responding to
    /// the first event may still have read the version from before the scan.
    pub fn record_changes(&self, generation: u64, paths: &[String]) {
        let mut state = self.foreground();
        if state.generation == generation {
            if let Some(scan) = &mut state.active {
                scan.changed.extend_from_slice(paths);
            }
        }
    }

    /// The caller has scanned the replacement completely and can persist its selection.
    pub fn replace_scanned(&self, library: Library) {
        let _publication = self
            .publication
            .write()
            .expect("library publication was poisoned");
        let mut state = self.foreground();
        if let Some(scan) = state.active.take() {
            scan.completion
                .set(Err(
                    std::io::Error::other("the selected library changed").into()
                ))
                .expect("a scan completes once");
        }
        state.library = library;
        state.generation += 1;
        state.initialized = true;
        self.changed.notify_all();
    }

    /// Emit after releasing the operation guard, without crossing a library switch.
    pub fn publish(&self, generation: u64, operation: impl FnOnce()) {
        let _publication = self
            .publication
            .read()
            .expect("library publication was poisoned");
        let current = self.read().generation();
        if current == generation {
            operation();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};
    use std::{fs, thread};

    #[test]
    fn should_serve_a_waiting_save_before_the_next_scan_step() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Before").unwrap();
        let library = Library::open(directory.path()).unwrap();
        library.scan_complete().unwrap();
        let owner = Arc::new(LibraryOwner::new(library));
        let paused = owner.read();
        let mut scan = paused.begin_scan(true);
        let writer = owner.clone();
        let save = thread::spawn(move || {
            writer.read().save_note("note.md", "# After", None).unwrap();
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while owner.waiting.load(Ordering::SeqCst) == 0 {
            assert!(Instant::now() < deadline, "save did not enter the queue");
            thread::yield_now();
        }
        let scanner = owner.clone();
        let next_step = thread::spawn(move || {
            let state = scanner.background();
            assert_eq!(
                state.library.read_note("note.md".into()).unwrap().content,
                "# After"
            );
            state.library.advance_scan(&mut scan).unwrap();
            drop(state);
            loop {
                let state = scanner.background();
                if state.library.advance_scan(&mut scan).unwrap() {
                    state.library.finish_scan(scan).unwrap();
                    assert_eq!(
                        state.library.list_notes(&Default::default()).unwrap()[0].title,
                        "After"
                    );
                    break;
                }
            }
        });
        drop(paused);
        save.join().unwrap();
        next_step.join().unwrap();
    }

    #[test]
    fn should_index_the_whole_library_when_an_observation_arrives_before_startup() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("observed.md"), "# Observed").unwrap();
        fs::write(directory.path().join("untouched.md"), "# Untouched").unwrap();
        let owner = LibraryOwner::new(Library::open(directory.path()).unwrap());
        let observed = owner.read().directory().join("observed.md");

        owner.observe(0, vec![observed]).unwrap();

        let notes = owner
            .query(|view| view.list_notes(&Default::default()))
            .unwrap();
        assert_eq!(notes.len(), 2);
        assert!(notes.iter().any(|note| note.path == "observed.md"));
        assert!(notes.iter().any(|note| note.path == "untouched.md"));
    }

    #[test]
    fn should_repeat_a_save_invalidation_when_the_scan_finishes() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Before").unwrap();
        let owner = LibraryOwner::new(Library::open(directory.path()).unwrap());
        owner.scan().unwrap();
        let completion = Arc::new(OnceLock::new());
        let scan = {
            let mut state = owner.foreground();
            state.active = Some(ActiveScan {
                completion: completion.clone(),
                view: Some(Arc::new(Mutex::new(state.library.read_view().unwrap()))),
                changed: Vec::new(),
            });
            state.library.begin_scan(false)
        };
        owner.read().save_note("note.md", "# After", None).unwrap();
        owner.record_changes(0, &["note.md".into()]);
        assert_eq!(
            owner
                .query(|view| view.list_notes(&Default::default()))
                .unwrap()[0]
                .title,
            "Before"
        );

        let changes = owner.run_steps(0, completion, scan).unwrap();

        assert_eq!(changes.paths, ["note.md"]);
        assert_eq!(
            owner
                .query(|view| view.list_notes(&Default::default()))
                .unwrap()[0]
                .title,
            "After"
        );
    }

    #[test]
    fn should_allow_a_save_while_a_query_retains_its_read_view() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Before").unwrap();
        let owner = LibraryOwner::new(Library::open(directory.path()).unwrap());
        owner.scan().unwrap();

        let notes = owner
            .query(|view| {
                assert!(owner.try_read().is_some(), "query held the operation guard");
                owner.read().save_note("note.md", "# After", None)?;
                assert_eq!(owner.read().read_note("note.md".into())?.content, "# After");
                view.list_notes(&Default::default())
            })
            .unwrap();

        assert_eq!(notes[0].title, "Before");
        assert_eq!(
            owner
                .query(|view| view.list_notes(&Default::default()))
                .unwrap()[0]
                .title,
            "After"
        );
    }

    #[test]
    fn should_reject_a_query_result_after_its_library_is_replaced() {
        let old = tempfile::tempdir().unwrap();
        fs::write(old.path().join("old.md"), "# Old").unwrap();
        let owner = LibraryOwner::new(Library::open(old.path()).unwrap());
        owner.scan().unwrap();
        let fresh = tempfile::tempdir().unwrap();
        fs::write(fresh.path().join("new.md"), "# New").unwrap();
        let replacement = Library::open(fresh.path()).unwrap();
        replacement.scan_complete().unwrap();

        let result = owner.query(|view| {
            assert!(owner.try_read().is_some());
            owner.replace_scanned(replacement);
            view.list_notes(&Default::default())
        });

        assert_eq!(result.unwrap_err().message, "the selected library changed");
        assert_eq!(
            owner
                .query(|view| view.list_notes(&Default::default()))
                .unwrap()[0]
                .path,
            "new.md"
        );
    }

    #[test]
    fn should_allow_file_operations_when_index_recovery_fails() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Before").unwrap();
        fs::write(directory.path().join("broken.md"), [0xff]).unwrap();
        let owner = LibraryOwner::new(Library::open(directory.path()).unwrap());
        assert!(owner.query(|view| view.list_tags()).is_err());
        owner.read().save_note("note.md", "# After", None).unwrap();
        assert_eq!(
            owner.read().read_note("note.md".into()).unwrap().content,
            "# After"
        );
        assert!(owner.query(|view| view.list_tags()).is_err());
        fs::write(directory.path().join("broken.md"), "# Repaired").unwrap();
        let notes = owner
            .query(|view| view.list_notes(&Default::default()))
            .unwrap();
        assert_eq!(notes.len(), 2);
        assert!(notes.iter().any(|note| note.title == "After"));
        assert!(notes.iter().any(|note| note.title == "Repaired"));
    }

    #[test]
    fn should_cancel_scan_work_and_events_from_a_replaced_library() {
        let old = tempfile::tempdir().unwrap();
        fs::write(old.path().join("old.md"), "# Old").unwrap();
        let owner = LibraryOwner::new(Library::open(old.path()).unwrap());
        let completion = Arc::new(OnceLock::new());
        let scan = {
            let mut state = owner.foreground();
            state.active = Some(ActiveScan {
                completion: completion.clone(),
                view: None,
                changed: Vec::new(),
            });
            state.library.begin_scan(false)
        };
        let fresh = tempfile::tempdir().unwrap();
        fs::write(fresh.path().join("new.md"), "# New").unwrap();
        let replacement = Library::open(fresh.path()).unwrap();
        replacement.scan_complete().unwrap();
        owner.replace_scanned(replacement);

        assert!(owner.run_steps(0, completion.clone(), scan).is_err());
        assert!(completion.get().unwrap().is_err());
        owner.publish(0, || {
            panic!("old events must not reach the current library")
        });
        assert!(owner
            .observe(0, vec![fresh.path().join("new.md")])
            .unwrap()
            .paths
            .is_empty());
        let notes = owner
            .query(|view| view.list_notes(&Default::default()))
            .unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].path, "new.md");
        owner.publish(1, || assert!(owner.try_read().is_some()));
    }

    #[test]
    fn should_keep_complete_paths_visible_during_a_folder_rescan() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("before")).unwrap();
        fs::write(directory.path().join("before/note.md"), "# Note").unwrap();
        let owner = Arc::new(LibraryOwner::new(Library::open(directory.path()).unwrap()));
        owner.scan().unwrap();
        fs::rename(
            directory.path().join("before"),
            directory.path().join("after"),
        )
        .unwrap();
        let completion = Arc::new(OnceLock::new());
        let mut scan = {
            let mut state = owner.foreground();
            state.active = Some(ActiveScan {
                completion: completion.clone(),
                view: Some(Arc::new(Mutex::new(state.library.read_view().unwrap()))),
                changed: Vec::new(),
            });
            state
                .library
                .begin_observations(vec![state.library.directory().join("after")])
        };
        {
            let library = owner.read();
            while library.list_notes(&Default::default()).unwrap().len() < 2 {
                assert!(!library.advance_scan(&mut scan).unwrap());
            }
        }
        let previous = owner
            .query(|view| view.list_notes(&Default::default()))
            .unwrap();
        assert_eq!(previous.len(), 1);
        assert_eq!(previous[0].path, "before/note.md");
        owner.run_steps(0, completion, scan).unwrap();
        let notes = owner
            .query(|view| view.list_notes(&Default::default()))
            .unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].path, "after/note.md");
    }
}
