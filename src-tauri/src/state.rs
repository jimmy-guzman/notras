use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard};

use crate::library::{LibraryGuard, LibraryOwner};
use crate::watcher::NotesWatcher;

pub struct AppState {
    pub library: LibraryOwner,
    /// Kept outside `library` so replacing the watcher never happens while the
    /// library lock is held (the watcher callback takes that lock).
    pub watcher: Mutex<Option<NotesWatcher>>,
    /// Files handed to us by "Open With" before the frontend was listening.
    pub pending_open: Mutex<Vec<String>>,
    /// Gives each webview one chance to flush pending writes before the
    /// process goes away.
    pub quit: QuitHandshake,
}

/// What a settled quit does with the process.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum Ending {
    Exit,
    Restart,
}

struct Pending {
    ending: Ending,
    waiting: HashSet<String>,
}

/// The windows an in-flight quit still waits on.
#[derive(Default)]
pub struct QuitHandshake(Mutex<Option<Pending>>);

/// Access panics if a prior operation poisoned the handshake.
impl QuitHandshake {
    /// Wait on `windows`, then end in `ending`. False when a quit is already in
    /// flight.
    pub fn begin(&self, ending: Ending, windows: impl IntoIterator<Item = String>) -> bool {
        let mut pending = self.lock();
        if pending.is_some() {
            return false;
        }
        *pending = Some(Pending {
            ending,
            waiting: windows.into_iter().collect(),
        });
        true
    }

    /// Record that `window` flushed. The ending once every window has, and
    /// never after a cancel.
    pub fn answer(&self, window: &str) -> Option<Ending> {
        self.lock().as_mut().and_then(|pending| {
            pending.waiting.remove(window);
            pending.waiting.is_empty().then_some(pending.ending)
        })
    }

    pub fn cancel(&self) {
        *self.lock() = None;
    }

    /// The ending of the quit in flight, if one is.
    pub fn pending(&self) -> Option<Ending> {
        self.lock().as_ref().map(|pending| pending.ending)
    }

    fn lock(&self) -> MutexGuard<'_, Option<Pending>> {
        self.0.lock().expect("the quit handshake was poisoned")
    }
}

/// Access panics if a prior operation poisoned the requested state.
impl AppState {
    pub fn library(&self) -> LibraryGuard<'_> {
        self.library.read()
    }

    pub fn watcher(&self) -> MutexGuard<'_, Option<NotesWatcher>> {
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
    use notras_core::Library;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[test]
    fn should_settle_a_quit_only_once_every_window_answers() {
        let quit = QuitHandshake::default();
        assert!(quit.begin(Ending::Exit, ["main".into(), "capture".into()]));
        assert!(!quit.begin(Ending::Restart, ["main".into()]));
        assert_eq!(quit.answer("main"), None);
        assert_eq!(quit.answer("main"), None);
        assert_eq!(quit.answer("capture"), Some(Ending::Exit));
        assert_eq!(quit.pending(), Some(Ending::Exit));
    }

    #[test]
    fn should_end_a_restart_as_a_restart() {
        let quit = QuitHandshake::default();
        assert!(quit.begin(Ending::Restart, ["main".into(), "capture".into()]));
        assert_eq!(quit.answer("capture"), None);
        assert_eq!(quit.answer("main"), Some(Ending::Restart));
    }

    #[test]
    fn should_ignore_answers_after_a_cancel_and_allow_a_new_quit() {
        let quit = QuitHandshake::default();
        assert!(quit.begin(Ending::Exit, ["main".into(), "capture".into()]));
        quit.cancel();
        assert_eq!(quit.answer("main"), None);
        assert_eq!(quit.answer("capture"), None);
        assert_eq!(quit.pending(), None);
        assert!(quit.begin(Ending::Exit, ["main".into()]));
        assert_eq!(quit.answer("main"), Some(Ending::Exit));
    }

    #[test]
    fn should_refuse_library_access_after_a_panic() {
        let directory = tempfile::tempdir().unwrap();
        let state = AppState {
            library: LibraryOwner::new(
                Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
                |_| {},
            ),
            watcher: Mutex::new(None),
            pending_open: Mutex::new(vec![]),
            quit: QuitHandshake::default(),
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
            library: LibraryOwner::new(
                Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
                |_| {},
            ),
            watcher: Mutex::new(None),
            pending_open: Mutex::new(vec![]),
            quit: QuitHandshake::default(),
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
            library: LibraryOwner::new(
                Library::open(directory.path(), &directory.path().join(".index")).unwrap(),
                |_| {},
            ),
            watcher: Mutex::new(None),
            pending_open: Mutex::new(vec![]),
            quit: QuitHandshake::default(),
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
