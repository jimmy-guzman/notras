use std::path::Path;
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
    match tauri::async_runtime::spawn_blocking(operation).await {
        Ok(result) => result,
        Err(tauri::Error::JoinError(error)) if error.is_panic() => {
            std::panic::resume_unwind(error.into_panic())
        }
        Err(error) => {
            log::error!("native command task failed: {error}");
            Err(CommandError::with_source("an unexpected error", error))
        }
    }
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

fn emit_changed<R: Runtime>(app: &AppHandle<R>, generation: u64, paths: Vec<String>) {
    app.state::<AppState>().library.publish(generation, || {
        if let Err(error) = (NotesChanged { paths }).emit(app) {
            log::error!("could not emit notes-changed: {error}");
        }
    });
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
        library.attach_file(Path::new(&source))
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
        library.attach_image(&base64_data)
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
        state.library.query(|view| view.find_mentions(&path))
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
        state.library.query(|view| view.list_notes(&filters))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_tags<R: Runtime>(app: AppHandle<R>) -> Result<Vec<CountedTag>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        state.library.query(|view| view.list_tags())
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
        state.library.query(|view| view.search_notes(search))
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
        state.library.query(|view| view.read_graph(&target))
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
        let (result, changed) = state.library.mutate(|library| {
            let result = library.create_note(&options)?;
            let paths = vec![result.path.clone()];
            Ok((result, paths))
        })?;
        emit_warnings(&app, &result.warnings);
        emit_changed(&app, changed.generation, changed.paths);
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
        let (result, changed) = state.library.mutate(|library| {
            let result = library.save_note(&path, &content, name)?;
            let paths = if path == result.path {
                vec![path]
            } else {
                vec![path, result.path.clone()]
            };
            Ok((result, paths))
        })?;
        emit_warnings(&app, &result.warnings);
        emit_changed(&app, changed.generation, changed.paths);
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
        let (result, changed) = state.library.mutate(|library| {
            let result = library.move_note(path.clone(), &folder)?;
            let paths = if path == result.path {
                vec![path]
            } else {
                vec![path, result.path.clone()]
            };
            Ok((result, paths))
        })?;
        emit_warnings(&app, &result.warnings);
        emit_changed(&app, changed.generation, changed.paths);
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
        let (result, changed) = state.library.mutate(|library| {
            let result = library.delete_note(path)?;
            let paths = vec![result.path.clone()];
            Ok((result, paths))
        })?;
        emit_warnings(&app, &result.warnings);
        emit_changed(&app, changed.generation, changed.paths);
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn reindex_all<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = state.library.rebuild()?;
        emit_changed(&app, result.generation, result.paths.clone());
        Ok(result.paths)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn read_external(path: String) -> Result<NoteFile, CommandError> {
    run_blocking(move || notras_core::read_external(Path::new(&path))).await
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
        let result = notras_core::write_external(Path::new(&path), &content, name)?;
        emit_warnings(&app, &result.warnings);
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_notes_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let library = state.library();
        Ok(library.directory().to_string_lossy().to_string())
    })
    .await
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
        let same_directory = match std::fs::canonicalize(&path) {
            Ok(directory) => directory == state.library().directory(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => return Err(error.into()),
        };
        // Reopening the current database would create a second writer outside
        // the coordinator while the original library can still save and scan.
        let replacement = if same_directory {
            None
        } else {
            let library = Library::open(Path::new(&path))?;
            let notes_dir = library.directory().to_owned();
            library.scan_complete()?;
            let generation = state.library().generation() + 1;
            let fresh =
                watcher::start(app.clone(), notes_dir.clone(), generation).map_err(|error| {
                    CommandError::with_source(format!("could not watch the folder: {error}"), error)
                })?;
            Some((library, notes_dir, fresh, generation))
        };

        // Persisted before the swap: a folder the next launch cannot find again is
        // worse than one this launch never switched to.
        let store = app.store("settings.json").map_err(|error| {
            CommandError::with_source(format!("the setting could not be saved: {error}"), error)
        })?;
        store.set("notesDir", Value::String(path));
        store.save().map_err(|error| {
            CommandError::with_source(format!("the setting could not be saved: {error}"), error)
        })?;

        if let Some((library, notes_dir, fresh, generation)) = replacement {
            crate::allow_assets(&app, &notes_dir);
            state.library.replace_scanned(library);

            // Dropping the old watcher may join a callback waiting for the library.
            *watcher = Some(fresh);
            drop(watcher);
            emit_changed(&app, generation, vec![]);
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::{catch_unwind, panic_any};

    #[test]
    fn should_resume_a_blocking_operation_panic_with_its_original_payload() {
        let panic = catch_unwind(|| {
            tauri::async_runtime::block_on(run_blocking::<()>(|| panic_any(42_u32)))
        })
        .expect_err("a blocking panic must unwind the caller");
        assert_eq!(*panic.downcast::<u32>().unwrap(), 42);
    }

    #[test]
    fn should_return_expected_blocking_errors_unchanged() {
        let error = tauri::async_runtime::block_on(run_blocking::<()>(|| {
            Err(std::io::Error::from(std::io::ErrorKind::NotFound).into())
        }))
        .unwrap_err();
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({"kind": "not-found", "message": "no such file"})
        );
    }
}
