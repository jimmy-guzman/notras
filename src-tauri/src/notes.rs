use std::path::PathBuf;
use std::sync::atomic::Ordering;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_store::StoreExt;
use tauri_specta::Event;

use crate::bindings::{MutationWarnings, NotesChanged};
use crate::state::AppState;
use crate::watcher;
use notras_core::{
    self, CommandError, CreateNote, DeleteReceipt, Library, MutationReceipt, MutationWarning,
    NoteFile, PathMutationReceipt, PendingOpen, SaveName, SavedNote,
};
use notras_core::{
    CountedTag, GraphResult, GraphTarget, Mention, NoteFilters, NoteMeta, NoteSearch,
};

async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| {
            log::error!("native command task failed: {error}");
            CommandError::from("an unexpected error")
        })?
}

fn emit_warnings<R: Runtime>(app: &AppHandle<R>, warnings: &[MutationWarning]) {
    if !warnings.is_empty() {
        if let Err(error) = (MutationWarnings {
            warnings: warnings.to_vec(),
        })
        .emit(app)
        {
            log::error!("could not emit mutation warnings: {error}");
        }
    }
}

fn emit_changed<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if let Err(error) = (NotesChanged { paths }).emit(app) {
        log::error!("could not emit notes-changed: {error}");
    }
}

#[tauri::command]
#[specta::specta]
pub async fn read_note<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<SavedNote, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.read_note(path)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn attach_file<R: Runtime>(
    app: AppHandle<R>,
    source: String,
) -> Result<String, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.attach_file(source)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn attach_image<R: Runtime>(
    app: AppHandle<R>,
    base64_data: String,
) -> Result<String, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.attach_image(base64_data)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn find_mentions<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<Vec<Mention>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.find_mentions(&path)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_notes<R: Runtime>(
    app: AppHandle<R>,
    filters: NoteFilters,
) -> Result<Vec<NoteMeta>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.list_notes(filters)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_tags<R: Runtime>(app: AppHandle<R>) -> Result<Vec<CountedTag>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.list_tags()
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn search_notes<R: Runtime>(
    app: AppHandle<R>,
    search: NoteSearch,
) -> Result<Vec<NoteMeta>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.search_notes(search)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn read_graph<R: Runtime>(
    app: AppHandle<R>,
    target: GraphTarget,
) -> Result<GraphResult, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        library.read_graph(target)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn create_note<R: Runtime>(
    app: AppHandle<R>,
    options: CreateNote,
) -> Result<MutationReceipt, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = {
            let library = state.library();
            library.create_note(options)?
        };
        emit_warnings(&app, &result.warnings);
        emit_changed(&app, vec![result.path.clone()]);
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn save_note<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    content: String,
    name: Option<SaveName>,
) -> Result<MutationReceipt, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = {
            let library = state.library();
            library.save_note(path.clone(), content, name)?
        };
        emit_warnings(&app, &result.warnings);
        emit_changed(
            &app,
            if path == result.path {
                vec![path]
            } else {
                vec![path, result.path.clone()]
            },
        );
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn move_note<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    folder: String,
) -> Result<PathMutationReceipt, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = {
            let library = state.library();
            library.move_note(path.clone(), folder)?
        };
        emit_warnings(&app, &result.warnings);
        emit_changed(
            &app,
            if path == result.path {
                vec![path]
            } else {
                vec![path, result.path.clone()]
            },
        );
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_note<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<DeleteReceipt, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = {
            let library = state.library();
            library.delete_note(path)?
        };
        emit_warnings(&app, &result.warnings);
        emit_changed(&app, vec![result.path.clone()]);
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn reindex_all<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = {
            let library = state.library();
            library.reindex_all()?
        };
        emit_changed(&app, result.clone());
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn read_external(path: String) -> Result<NoteFile, CommandError> {
    run_blocking(move || notras_core::read_external(path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn write_external<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    content: String,
    name: Option<SaveName>,
) -> Result<MutationReceipt, CommandError> {
    run_blocking(move || {
        let result = notras_core::write_external(path, content, name)?;
        emit_warnings(&app, &result.warnings);
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub fn get_notes_dir(state: State<'_, AppState>) -> String {
    state.library().directory().to_string_lossy().to_string()
}

#[tauri::command]
#[specta::specta]
pub async fn set_notes_dir<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<(), CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();

        // Switches can run on different blocking workers. Keep their saved setting,
        // library swap and watcher replacement in the same order.
        let mut watcher = state.watcher();
        let notes_dir = PathBuf::from(&path);
        let library = Library::open(notes_dir.clone())?;
        library.scan_complete()?;
        // Started first: a folder the app cannot watch is refused whole.
        let fresh = watcher::start(app.clone(), notes_dir.clone())
            .map_err(|error| format!("could not watch the folder: {error}"))?;

        // Persisted before the swap: a folder the next launch cannot find again is
        // worse than one this launch never switched to.
        let store = app
            .store("settings.json")
            .map_err(|error| format!("the setting could not be saved: {error}"))?;
        store.set("notesDir", Value::String(path));
        store
            .save()
            .map_err(|error| format!("the setting could not be saved: {error}"))?;

        crate::allow_assets(&app, &notes_dir);

        {
            let mut current = state.library();
            *current = library;
        }

        // Swap the watcher only after the library lock is released -- dropping the
        // old debouncer joins its thread, which may be waiting on that lock.
        *watcher = Some(fresh);
        drop(watcher);

        emit_changed(&app, vec![]);
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn classify_open_paths<R: Runtime>(
    app: AppHandle<R>,
    paths: Vec<String>,
) -> Result<Vec<PendingOpen>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        Ok(library.classify_opens(paths))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn pending_open_files<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<PendingOpen>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let paths = std::mem::take(&mut *state.pending_open());
        let library = state.library();
        Ok(library.classify_opens(paths))
    })
    .await
}

/// Exit after the frontend has flushed its pending writes.
#[tauri::command]
#[specta::specta]
pub fn quit_app<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

/// Cancel the quit handshake when a pending write fails.
#[tauri::command]
#[specta::specta]
pub fn cancel_quit(state: State<'_, AppState>) {
    state.quitting.store(false, Ordering::SeqCst);
}
