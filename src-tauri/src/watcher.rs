use std::path::PathBuf;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, DebouncedEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::index;
use crate::state::AppState;
use crate::NotesChanged;

/// Watch the notes directory for external writers (editors, git, AI agents).
/// Our own writes are indexed synchronously by the commands; the mtime skip in
/// `index_file` keeps those from echoing back out as change events.
pub fn start(
    app: AppHandle,
    notes_dir: PathBuf,
) -> Option<notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::RecommendedCache>> {
    let handler_app = app.clone();
    let debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => handle(&handler_app, &events),
            Err(errors) => {
                for error in errors {
                    log::error!("watching the notes dir failed: {error}");
                }
            }
        },
    );

    let mut debouncer = match debouncer {
        Ok(debouncer) => debouncer,
        Err(error) => {
            log::error!("could not start the notes watcher: {error}");
            return None;
        }
    };

    if let Err(error) = debouncer.watch(&notes_dir, RecursiveMode::Recursive) {
        log::error!("could not watch {}: {error}", notes_dir.display());
        return None;
    }

    Some(debouncer)
}

fn handle(app: &AppHandle, events: &[DebouncedEvent]) {
    let state = app.state::<AppState>();
    let core = state.core();

    let mut changed: Vec<String> = Vec::new();
    let mut full_scan = false;

    for event in events {
        for path in &event.paths {
            let Some(rel) = index::relative_path(&core.notes_dir, path) else {
                continue;
            };
            if index::is_note_file(path) {
                match index::index_file(&core.conn, &core.notes_dir, &rel) {
                    Ok(true) => changed.push(rel),
                    Ok(false) => {}
                    Err(error) => log::error!("could not index {rel}: {error}"),
                }
            } else if path.is_dir() || !path.exists() {
                // A directory changed (rename/move/delete) -- children events
                // are not guaranteed, so reconcile everything. Attachments and
                // other files that still exist cannot affect the index.
                full_scan = true;
            }
        }
    }

    if full_scan {
        match index::scan_all(&core.conn, &core.notes_dir) {
            Ok(scanned) => changed.extend(scanned),
            Err(error) => log::error!("could not rescan the notes dir: {error}"),
        }
    }

    changed.sort();
    changed.dedup();

    if !changed.is_empty() {
        if let Err(error) = app.emit("notes-changed", NotesChanged { paths: changed }) {
            log::error!("could not emit {}: {error}", "notes-changed");
        }
    }
}
