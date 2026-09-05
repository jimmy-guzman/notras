use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard, PoisonError};

use notify::RecommendedWatcher;
use notify_debouncer_full::{Debouncer, RecommendedCache};
use rusqlite::Connection;

pub struct Core {
    pub notes_dir: PathBuf,
    pub conn: Connection,
}

pub struct AppState {
    pub core: Mutex<Core>,
    /// Kept outside `core` so replacing the watcher never happens while the
    /// core lock is held (the watcher callback takes that lock).
    pub watcher: Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>,
    /// Files handed to us by "Open With" before the frontend was listening.
    pub pending_open: Mutex<Vec<String>>,
    /// Set once a quit is in flight, so the webview gets exactly one chance to
    /// flush pending writes before the process goes away.
    pub quitting: AtomicBool,
}

/// A poisoned lock means a panic elsewhere already did its damage; recovering
/// the state behind it keeps one panic from becoming one per command.
impl AppState {
    pub fn core(&self) -> MutexGuard<'_, Core> {
        self.core.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn watcher(&self) -> MutexGuard<'_, Option<Debouncer<RecommendedWatcher, RecommendedCache>>> {
        self.watcher.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn pending_open(&self) -> MutexGuard<'_, Vec<String>> {
        self.pending_open.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
