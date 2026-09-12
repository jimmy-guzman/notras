use std::ops::Deref;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock, RwLock};

use crate::bindings::IndexStatus;
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
    status: IndexStatus,
    status_revision: u64,
}

struct StatusChange {
    revision: u64,
    status: IndexStatus,
}

fn set_status(state: &mut OwnedLibrary, next: IndexStatus) -> Option<StatusChange> {
    if state.status == next {
        return None;
    }
    state.status = next.clone();
    state.status_revision += 1;
    Some(StatusChange {
        revision: state.status_revision,
        status: next,
    })
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

    fn record_changes(&mut self, paths: &[String]) {
        if let Some(scan) = &mut self.state.active {
            scan.changed.extend_from_slice(paths);
        }
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
    on_status: Box<dyn Fn(IndexStatus) + Send + Sync>,
    reported: Mutex<u64>,
    closing: AtomicBool,
}

impl LibraryOwner {
    pub fn new(library: Library, on_status: impl Fn(IndexStatus) + Send + Sync + 'static) -> Self {
        Self {
            state: Mutex::new(OwnedLibrary {
                library,
                generation: 0,
                initialized: false,
                active: None,
                status: IndexStatus::Scanning,
                status_revision: 0,
            }),
            changed: Condvar::new(),
            waiting: AtomicUsize::new(0),
            publication: RwLock::new(()),
            on_status: Box::new(on_status),
            reported: Mutex::new(0),
            closing: AtomicBool::new(false),
        }
    }

    pub fn closing(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }

    fn closing_error() -> CommandError {
        std::io::Error::other("the library is closing").into()
    }

    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::SeqCst);
        let mut state = self.foreground();
        while state.active.is_some() {
            state = self
                .changed
                .wait(state)
                .expect("library state was poisoned");
        }
    }

    fn report(&self, change: Option<StatusChange>) {
        let Some(change) = change else {
            return;
        };
        let mut reported = self
            .reported
            .lock()
            .expect("status publication was poisoned");
        if change.revision <= *reported {
            return;
        }
        *reported = change.revision;
        (self.on_status)(change.status);
    }

    pub fn status(&self) -> IndexStatus {
        self.foreground().status.clone()
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

    /// Commit a mutation and record its paths before a scan can advance. The
    /// returned changes can be published after releasing the operation guard.
    pub fn mutate<T>(
        &self,
        operation: impl FnOnce(&Library) -> Result<(T, Vec<String>), CommandError>,
    ) -> Result<(T, ScanChanges), CommandError> {
        let mut library = self.read();
        let (result, paths) = operation(&library)?;
        library.record_changes(&paths);
        Ok((
            result,
            ScanChanges {
                generation: library.generation(),
                paths,
            },
        ))
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
        if self.closing() {
            return Err(Self::closing_error());
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
        let waiting = view.is_none();
        state.active = Some(ActiveScan {
            completion: completion.clone(),
            view,
            changed: Vec::new(),
        });
        let change = waiting.then(|| set_status(&mut state, IndexStatus::Scanning));
        drop(state);
        self.report(change.flatten());
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
            if self.closing() {
                state.library.abandon_scan(scan);
                let error = Self::closing_error();
                completion
                    .set(Err(error.clone()))
                    .expect("a scan completes once");
                state.active.take();
                let change = set_status(
                    &mut state,
                    IndexStatus::Failed {
                        reason: error.message.clone(),
                    },
                );
                self.changed.notify_all();
                drop(state);
                self.report(change);
                return Err(error);
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
            let change = set_status(
                &mut state,
                match &result {
                    Ok(_) => IndexStatus::Ready,
                    Err(error) => IndexStatus::Failed {
                        reason: error.message.clone(),
                    },
                },
            );
            self.changed.notify_all();
            drop(state);
            self.report(change);
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

    pub fn prepare(&self, library: &Library) -> Result<(), CommandError> {
        let mut scan = library.begin_scan(false);
        loop {
            if self.closing() {
                return Err(Self::closing_error());
            }
            if library.advance_scan(&mut scan)? {
                break;
            }
        }
        library.finish_scan(scan).map(|_| ())
    }

    /// The caller has scanned the replacement completely and can persist its selection.
    pub fn replace_scanned(&self, library: Library) {
        let change = {
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
            set_status(&mut state, IndexStatus::Ready)
        };
        self.report(change);
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
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        library.scan_complete().unwrap();
        let owner = Arc::new(LibraryOwner::new(library, |_| {}));
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
        let owner = LibraryOwner::new(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
            |_| {},
        );
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
        let owner = LibraryOwner::new(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
            |_| {},
        );
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
        let (_, saved) = owner
            .mutate(|library| {
                assert!(owner.try_read().is_none());
                let result = library.save_note("note.md", "# After", None)?;
                let paths = vec![result.path.clone()];
                Ok((result, paths))
            })
            .unwrap();
        owner.publish(saved.generation, || {
            assert!(owner.try_read().is_some());
        });
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
        let owner = LibraryOwner::new(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
            |_| {},
        );
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
        let owner = LibraryOwner::new(
            Library::open(old.path(), &old.path().join(".index")).unwrap(),
            |_| {},
        );
        owner.scan().unwrap();
        let fresh = tempfile::tempdir().unwrap();
        fs::write(fresh.path().join("new.md"), "# New").unwrap();
        let replacement = Library::open(fresh.path(), &fresh.path().join(".index")).unwrap();
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
        let owner = LibraryOwner::new(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
            |_| {},
        );
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
        let owner = LibraryOwner::new(
            Library::open(old.path(), &old.path().join(".index")).unwrap(),
            |_| {},
        );
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
        let replacement = Library::open(fresh.path(), &fresh.path().join(".index")).unwrap();
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

    fn reporting_owner(library: Library) -> (LibraryOwner, std::sync::mpsc::Receiver<IndexStatus>) {
        let (sender, statuses) = std::sync::mpsc::channel();
        let owner = LibraryOwner::new(library, move |status| sender.send(status).unwrap());
        (owner, statuses)
    }

    #[test]
    fn should_report_scanning_while_readers_wait_and_ready_after_the_scan() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Note").unwrap();
        let (owner, statuses) = reporting_owner(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
        );
        assert_eq!(owner.status(), IndexStatus::Scanning);

        owner.scan().unwrap();

        assert_eq!(
            statuses.try_iter().collect::<Vec<_>>(),
            [IndexStatus::Ready]
        );
        assert_eq!(owner.status(), IndexStatus::Ready);
    }

    #[test]
    fn should_report_a_failed_scan_with_its_reason() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("broken.md"), [0xff]).unwrap();
        let (owner, statuses) = reporting_owner(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
        );

        let Err(error) = owner.query(|view| view.list_tags()) else {
            panic!("an unreadable note must fail recovery");
        };

        let failed = IndexStatus::Failed {
            reason: error.message,
        };
        assert_eq!(
            statuses.try_iter().collect::<Vec<_>>(),
            std::slice::from_ref(&failed)
        );
        assert_eq!(owner.status(), failed);

        fs::write(directory.path().join("broken.md"), "# Repaired").unwrap();
        owner.query(|view| view.list_tags()).unwrap();

        assert_eq!(
            statuses.try_iter().collect::<Vec<_>>(),
            [IndexStatus::Scanning, IndexStatus::Ready]
        );
    }

    #[test]
    fn should_drop_a_status_change_overtaken_before_publication() {
        let old = tempfile::tempdir().unwrap();
        let (owner, statuses) =
            reporting_owner(Library::open(old.path(), &old.path().join(".index")).unwrap());
        owner.scan().unwrap();
        assert_eq!(
            statuses.try_iter().collect::<Vec<_>>(),
            [IndexStatus::Ready]
        );
        let stale = set_status(
            &mut owner.foreground(),
            IndexStatus::Failed {
                reason: "overtaken".into(),
            },
        );
        let fresh = tempfile::tempdir().unwrap();
        let replacement = Library::open(fresh.path(), &fresh.path().join(".index")).unwrap();
        replacement.scan_complete().unwrap();
        owner.replace_scanned(replacement);

        owner.report(stale);

        assert_eq!(
            statuses.try_iter().collect::<Vec<_>>(),
            [IndexStatus::Ready]
        );
        assert_eq!(owner.status(), IndexStatus::Ready);
    }

    #[test]
    fn should_not_report_a_healthy_rebuild_as_scanning() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Note").unwrap();
        let (owner, statuses) = reporting_owner(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
        );
        owner.scan().unwrap();
        assert_eq!(statuses.try_iter().count(), 1);

        owner.rebuild().unwrap();

        assert_eq!(statuses.try_iter().count(), 0);
        assert_eq!(owner.status(), IndexStatus::Ready);
    }

    #[test]
    fn should_report_ready_after_a_replacement() {
        let old = tempfile::tempdir().unwrap();
        fs::write(old.path().join("broken.md"), [0xff]).unwrap();
        let (owner, statuses) =
            reporting_owner(Library::open(old.path(), &old.path().join(".index")).unwrap());
        assert!(owner.query(|view| view.list_tags()).is_err());
        assert!(matches!(owner.status(), IndexStatus::Failed { .. }));
        let fresh = tempfile::tempdir().unwrap();
        let replacement = Library::open(fresh.path(), &fresh.path().join(".index")).unwrap();
        replacement.scan_complete().unwrap();

        owner.replace_scanned(replacement);

        assert_eq!(statuses.try_iter().last(), Some(IndexStatus::Ready));
        assert_eq!(owner.status(), IndexStatus::Ready);
    }

    #[test]
    fn should_abandon_a_running_scan_on_shutdown_and_let_the_next_launch_finish_it() {
        let directory = tempfile::tempdir().unwrap();
        for index in 0..40 {
            fs::write(
                directory.path().join(format!("note-{index}.md")),
                format!("# Note {index}"),
            )
            .unwrap();
        }
        let (owner, statuses) = reporting_owner(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
        );
        let owner = Arc::new(owner);
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
        let paused = owner.read();
        let scanner = owner.clone();
        let scan_completion = completion.clone();
        let scanning = thread::spawn(move || scanner.run_steps(0, scan_completion, scan));
        let closer = owner.clone();
        let closing = thread::spawn(move || closer.shutdown());
        while !owner.closing() {
            thread::yield_now();
        }
        drop(paused);

        let Err(error) = scanning.join().unwrap() else {
            panic!("a scan must not finish after shutdown");
        };
        closing.join().unwrap();

        assert_eq!(error.message, "the library is closing");
        assert!(completion.get().unwrap().is_err());
        assert!(owner.read().index_needs_rebuild());
        let Err(refused) = owner.query(|view| view.list_tags()) else {
            panic!("a query must not answer after shutdown");
        };
        assert_eq!(refused.message, "the library is closing");
        let failed = IndexStatus::Failed {
            reason: "the library is closing".into(),
        };
        assert_eq!(
            statuses.try_iter().collect::<Vec<_>>(),
            std::slice::from_ref(&failed)
        );
        assert_eq!(owner.status(), failed);

        let relaunched = LibraryOwner::new(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
            |_| {},
        );
        relaunched.scan().unwrap();
        assert_eq!(
            relaunched
                .query(|view| view.list_notes(&Default::default()))
                .unwrap()
                .len(),
            40
        );
    }

    #[test]
    fn should_return_from_shutdown_when_no_scan_is_running() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "# Note").unwrap();
        let owner = LibraryOwner::new(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
            |_| {},
        );
        owner.scan().unwrap();

        owner.shutdown();

        let Err(error) = owner.scan() else {
            panic!("a scan must not start after shutdown");
        };
        assert_eq!(error.message, "the library is closing");
        assert_eq!(
            owner.read().read_note("note.md".into()).unwrap().content,
            "# Note"
        );
    }

    #[test]
    fn should_prepare_a_replacement_while_the_operation_guard_is_held() {
        let old = tempfile::tempdir().unwrap();
        fs::write(old.path().join("old.md"), "# Old").unwrap();
        let owner = Arc::new(LibraryOwner::new(
            Library::open(old.path(), &old.path().join(".index")).unwrap(),
            |_| {},
        ));
        owner.scan().unwrap();
        let fresh = tempfile::tempdir().unwrap();
        fs::write(fresh.path().join("one.md"), "# One").unwrap();
        fs::write(fresh.path().join("two.md"), "# Two").unwrap();
        let replacement = Library::open(fresh.path(), &fresh.path().join(".index")).unwrap();
        let held = owner.read();
        let (sender, prepared) = std::sync::mpsc::channel();
        let preparer = owner.clone();
        thread::spawn(move || {
            sender
                .send(preparer.prepare(&replacement).map(|()| replacement))
                .unwrap();
        });

        let replacement = prepared
            .recv_timeout(Duration::from_secs(5))
            .expect("preparation must not wait on the operation guard")
            .unwrap();

        assert_eq!(held.read_note("old.md".into()).unwrap().content, "# Old");
        drop(held);
        owner.replace_scanned(replacement);
        assert_eq!(
            owner
                .query(|view| view.list_notes(&Default::default()))
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn should_stop_preparing_a_replacement_when_closing() {
        let old = tempfile::tempdir().unwrap();
        let owner = LibraryOwner::new(
            Library::open(old.path(), &old.path().join(".index")).unwrap(),
            |_| {},
        );
        let fresh = tempfile::tempdir().unwrap();
        fs::write(fresh.path().join("one.md"), "# One").unwrap();
        let replacement = Library::open(fresh.path(), &fresh.path().join(".index")).unwrap();
        owner.shutdown();

        let Err(error) = owner.prepare(&replacement) else {
            panic!("preparation must stop after shutdown");
        };

        assert_eq!(error.message, "the library is closing");
    }

    #[test]
    fn should_keep_complete_paths_visible_during_a_folder_rescan() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("before")).unwrap();
        fs::write(directory.path().join("before/note.md"), "# Note").unwrap();
        let owner = Arc::new(LibraryOwner::new(
            Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
            |_| {},
        ));
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
