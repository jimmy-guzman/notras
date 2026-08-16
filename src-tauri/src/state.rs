use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

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
