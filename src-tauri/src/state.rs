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

#[derive(Default)]
enum Phase {
    #[default]
    Idle,
    Waiting {
        generation: u64,
        ending: Ending,
        windows: HashSet<String>,
    },
    /// Every window answered, or the backstop gave up on them; the exit or
    /// restart it asked for is under way.
    Settled,
}

#[derive(Default)]
struct Handshake {
    started: u64,
    phase: Phase,
    /// macOS is waiting on `replyToApplicationShouldTerminate:`.
    #[cfg(any(test, target_os = "macos"))]
    held: bool,
}

/// The windows an in-flight quit still waits on.
#[derive(Default)]
pub struct QuitHandshake(Mutex<Handshake>);

/// Access panics if a prior operation poisoned the handshake.
impl QuitHandshake {
    /// Wait on `windows`, then end in `ending`. The new quit's generation, or
    /// `None` while another quit is waiting or settled.
    pub fn begin(&self, ending: Ending, windows: impl IntoIterator<Item = String>) -> Option<u64> {
        let mut handshake = self.lock();
        if !matches!(handshake.phase, Phase::Idle) {
            return None;
        }
        handshake.started += 1;
        handshake.phase = Phase::Waiting {
            generation: handshake.started,
            ending,
            windows: windows.into_iter().collect(),
        };
        Some(handshake.started)
    }

    /// Record that `window` flushed. Settles the quit and returns its ending
    /// once every window has, and never after a cancel.
    pub fn answer(&self, window: &str) -> Option<Ending> {
        let mut handshake = self.lock();
        let Phase::Waiting {
            ending, windows, ..
        } = &mut handshake.phase
        else {
            return None;
        };
        windows.remove(window);
        let ending = windows.is_empty().then_some(*ending)?;
        handshake.phase = Phase::Settled;
        Some(ending)
    }

    /// Give up on the windows of quit `generation`. Settles it and returns its
    /// ending only while that same quit is still waiting.
    pub fn expire(&self, generation: u64) -> Option<Ending> {
        let mut handshake = self.lock();
        let Phase::Waiting {
            generation: waiting,
            ending,
            ..
        } = handshake.phase
        else {
            return None;
        };
        if waiting != generation {
            return None;
        }
        handshake.phase = Phase::Settled;
        Some(ending)
    }

    pub fn cancel(&self) {
        self.lock().phase = Phase::Idle;
    }

    /// Hold a quit macOS delivered until `release`, unless the exit it would
    /// wait on is already under way. One lock covers the check and the hold: a
    /// hold landing after a settled quit's `release` would never be answered.
    #[cfg(any(test, target_os = "macos"))]
    pub fn hold(&self) -> bool {
        let mut handshake = self.lock();
        if matches!(handshake.phase, Phase::Settled) {
            return false;
        }
        handshake.held = true;
        true
    }

    /// Whether macOS was holding a quit, which it no longer is.
    #[cfg(any(test, target_os = "macos"))]
    pub fn release(&self) -> bool {
        std::mem::take(&mut self.lock().held)
    }

    /// Whether the exit or restart a quit asked for is under way.
    pub fn is_settled(&self) -> bool {
        matches!(self.lock().phase, Phase::Settled)
    }

    fn lock(&self) -> MutexGuard<'_, Handshake> {
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
        assert!(quit
            .begin(Ending::Exit, ["main".into(), "capture".into()])
            .is_some());
        assert_eq!(quit.begin(Ending::Restart, ["main".into()]), None);
        assert_eq!(quit.answer("main"), None);
        assert_eq!(quit.answer("main"), None);
        assert!(!quit.is_settled());
        assert_eq!(quit.answer("capture"), Some(Ending::Exit));
        assert!(quit.is_settled());
    }

    #[test]
    fn should_end_a_restart_as_a_restart() {
        let quit = QuitHandshake::default();
        assert!(quit
            .begin(Ending::Restart, ["main".into(), "capture".into()])
            .is_some());
        assert_eq!(quit.answer("capture"), None);
        assert_eq!(quit.answer("main"), Some(Ending::Restart));
    }

    #[test]
    fn should_ignore_answers_after_a_cancel_and_allow_a_new_quit() {
        let quit = QuitHandshake::default();
        assert!(quit
            .begin(Ending::Exit, ["main".into(), "capture".into()])
            .is_some());
        quit.cancel();
        assert_eq!(quit.answer("main"), None);
        assert_eq!(quit.answer("capture"), None);
        assert!(!quit.is_settled());
        assert!(quit.begin(Ending::Exit, ["main".into()]).is_some());
        assert_eq!(quit.answer("main"), Some(Ending::Exit));
    }

    #[test]
    fn should_release_a_held_quit_once() {
        let quit = QuitHandshake::default();

        assert!(quit.hold());
        assert!(quit.release());
        assert!(!quit.release());
    }

    #[test]
    fn should_not_hold_a_quit_once_one_has_settled() {
        let quit = QuitHandshake::default();
        assert!(quit.begin(Ending::Exit, ["main".into()]).is_some());
        assert_eq!(quit.answer("main"), Some(Ending::Exit));

        assert!(!quit.hold());
        assert!(!quit.release());
    }

    #[test]
    fn should_keep_a_hold_through_a_refused_quit() {
        let quit = QuitHandshake::default();
        assert!(quit.begin(Ending::Exit, ["main".into()]).is_some());
        assert!(quit.hold());

        quit.cancel();

        assert!(quit.release());
    }

    #[test]
    fn should_keep_a_hold_until_a_restart_settles() {
        let quit = QuitHandshake::default();
        assert!(quit.begin(Ending::Restart, ["main".into()]).is_some());
        assert!(quit.hold());

        assert_eq!(quit.answer("main"), Some(Ending::Restart));

        assert!(quit.release());
    }

    #[test]
    fn should_let_a_backstop_end_only_the_quit_that_started_it() {
        let quit = QuitHandshake::default();
        let first = quit.begin(Ending::Exit, ["main".into()]).unwrap();
        quit.cancel();
        let second = quit.begin(Ending::Exit, ["main".into()]).unwrap();
        assert_eq!(quit.expire(first), None);
        assert!(!quit.is_settled());
        assert_eq!(quit.expire(second), Some(Ending::Exit));
        assert!(quit.is_settled());
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
