use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};

use notify::RecommendedWatcher;
use notify_debouncer_full::{Debouncer, RecommendedCache};
use notras_core::Library;

pub struct AppState {
    pub library: Mutex<Library>,
    /// Kept outside `library` so replacing the watcher never happens while the
    /// library lock is held (the watcher callback takes that lock).
    pub watcher: Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>,
    /// Files handed to us by "Open With" before the frontend was listening.
    pub pending_open: Mutex<Vec<String>>,
    /// Set once a quit is in flight, so the webview gets exactly one chance to
    /// flush pending writes before the process goes away.
    pub quitting: AtomicBool,
}

/// Access panics if a prior operation poisoned the requested state.
impl AppState {
    pub fn library(&self) -> MutexGuard<'_, Library> {
        self.library.lock().expect("library state was poisoned")
    }

    pub fn watcher(
        &self,
    ) -> MutexGuard<'_, Option<Debouncer<RecommendedWatcher, RecommendedCache>>> {
        self.watcher.lock().expect("watcher state was poisoned")
    }

    pub fn pending_open(&self) -> MutexGuard<'_, Vec<String>> {
        self.pending_open
            .lock()
            .expect("pending opens were poisoned")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn should_refuse_library_access_after_a_panic() {
        let directory = tempfile::tempdir().unwrap();
        let state = AppState {
            library: Mutex::new(Library::open(directory.path()).unwrap()),
            watcher: Mutex::new(None),
            pending_open: Mutex::new(vec![]),
            quitting: AtomicBool::new(false),
        };
        assert!(catch_unwind(AssertUnwindSafe(|| {
            let _library = state.library();
            panic!("interrupted library operation");
        }))
        .is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| drop(state.library()))).is_err());
    }

    #[test]
    fn should_refuse_watcher_access_after_a_panic() {
        let directory = tempfile::tempdir().unwrap();
        let state = AppState {
            library: Mutex::new(Library::open(directory.path()).unwrap()),
            watcher: Mutex::new(None),
            pending_open: Mutex::new(vec![]),
            quitting: AtomicBool::new(false),
        };
        assert!(catch_unwind(AssertUnwindSafe(|| {
            let _watcher = state.watcher();
            panic!("interrupted watcher replacement");
        }))
        .is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| drop(state.watcher()))).is_err());
    }

    #[test]
    fn should_refuse_pending_opens_after_a_panic() {
        let directory = tempfile::tempdir().unwrap();
        let state = AppState {
            library: Mutex::new(Library::open(directory.path()).unwrap()),
            watcher: Mutex::new(None),
            pending_open: Mutex::new(vec![]),
            quitting: AtomicBool::new(false),
        };
        assert!(catch_unwind(AssertUnwindSafe(|| {
            let mut pending = state.pending_open();
            pending.push("unfinished.md".into());
            panic!("interrupted pending opens");
        }))
        .is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| drop(state.pending_open()))).is_err());
    }
}
