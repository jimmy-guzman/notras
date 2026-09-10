use std::path::PathBuf;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, DebouncedEvent};
use tauri::{AppHandle, Manager, Runtime};
use tauri_specta::Event;

use crate::bindings::NotesChanged;
use crate::state::AppState;

/// Watch the notes directory for external writers (editors, git, AI agents).
/// Our own writes are indexed synchronously by the commands; the mtime skip in
/// `index_file` keeps those from echoing back out as change events.
pub fn start<R: Runtime>(
    app: AppHandle<R>,
    notes_dir: PathBuf,
) -> Result<
    notify_debouncer_full::Debouncer<
        notify::RecommendedWatcher,
        notify_debouncer_full::RecommendedCache,
    >,
    notify::Error,
> {
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

    let mut debouncer = debouncer?;
    debouncer.watch(&notes_dir, RecursiveMode::Recursive)?;

    Ok(debouncer)
}

fn handle<R: Runtime>(app: &AppHandle<R>, events: &[DebouncedEvent]) {
    let state = app.state::<AppState>();
    let changed = {
        let library = state.library();
        library.reconcile_paths(
            events
                .iter()
                .flat_map(|event| event.paths.iter().map(PathBuf::as_path)),
        )
    };
    if let Some(paths) = changed {
        if let Err(error) = (NotesChanged { paths }).emit(app) {
            log::error!("could not emit notes-changed: {error}");
        }
    }
}
