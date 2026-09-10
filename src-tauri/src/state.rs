use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard, PoisonError};

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

/// A poisoned lock means a panic elsewhere already did its damage; recovering
/// the state behind it keeps one panic from becoming one per command.
impl AppState {
    pub fn library(&self) -> MutexGuard<'_, Library> {
        self.library.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn watcher(
        &self,
    ) -> MutexGuard<'_, Option<Debouncer<RecommendedWatcher, RecommendedCache>>> {
        self.watcher.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn pending_open(&self) -> MutexGuard<'_, Vec<String>> {
        self.pending_open
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }
}
