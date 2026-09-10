use std::fs;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_store::StoreExt;
use tauri_specta::Event;

use crate::application::{self, CommandError, MutationReceipt, NoteFile, PendingOpen};
use crate::bindings::NotesChanged;
use crate::index;
use crate::state::AppState;
use crate::watcher;

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

fn emit_changed<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if let Err(error) = (NotesChanged { paths }).emit(app) {
        log::error!("could not emit notes-changed: {error}");
    }
}

#[tauri::command]
#[specta::specta]
pub async fn note_exists<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<bool, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let core = state.core();
        application::note_exists(&core, path)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn read_note<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<NoteFile, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let core = state.core();
        application::read_note(&core, path)
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
        let core = state.core();
        application::attach_file(&core, source)
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
        let core = state.core();
        application::attach_image(&core, base64_data)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn db_select<R: Runtime>(
    app: AppHandle<R>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Vec<Value>>, String> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let core = state.core();
        application::db_select(&core, sql, params).map_err(CommandError::from)
    })
    .await
    .map_err(|error| error.message)
}

#[tauri::command]
#[specta::specta]
pub async fn find_mentions<R: Runtime>(
    app: AppHandle<R>,
    path: Option<String>,
    title: String,
) -> Result<Vec<index::BareMention>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();

        let (notes_dir, candidates) = {
            let core = state.core();
            let candidates = if let Some(path) = &path {
                index::mention_candidates(&core.conn, path, &title)?
            } else {
                index::phrase_candidates(&core.conn, &title)?
            };
            (core.notes_dir.clone(), candidates)
        };

        if path.is_some() {
            Ok(index::scan_mentions(&notes_dir, candidates, &title)?)
        } else {
            Ok(index::scan_prose(&notes_dir, candidates, &title, true)?)
        }
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn write_note<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    content: String,
    create: bool,
) -> Result<MutationReceipt, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = {
            let core = state.core();
            application::write_note(&core, path.clone(), content, create)?
        };
        emit_changed(&app, vec![path]);
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn rename_note<R: Runtime>(
    app: AppHandle<R>,
    from: String,
    to: String,
) -> Result<(), CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        {
            let core = state.core();
            application::rename_note(&core, from.clone(), to.clone())?;
        }
        emit_changed(&app, vec![from, to]);
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_note<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        {
            let core = state.core();
            application::delete_note(&core, path.clone())?;
        }
        emit_changed(&app, vec![path]);
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn reindex_all<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let result = {
            let core = state.core();
            application::reindex_all(&core)?
        };
        emit_changed(&app, result.clone());
        Ok(result)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn read_external(path: String) -> Result<NoteFile, CommandError> {
    run_blocking(move || application::read_external(path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn write_external(
    path: String,
    content: String,
) -> Result<MutationReceipt, CommandError> {
    run_blocking(move || application::write_external(path, content)).await
}

#[tauri::command]
#[specta::specta]
pub fn get_notes_dir(state: State<'_, AppState>) -> String {
    state.core().notes_dir.to_string_lossy().to_string()
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
        // core swap and watcher replacement in the same order.
        let mut watcher = state.watcher();
        let notes_dir = PathBuf::from(&path);
        fs::create_dir_all(notes_dir.join(".notras"))?;
        let conn = index::open(&notes_dir)?;
        index::scan_all(&conn, &notes_dir)?;
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
            let mut core = state.core();
            core.notes_dir = notes_dir;
            core.conn = conn;
        }

        // Swap the watcher only after the core lock is released -- dropping the
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
        let core = state.core();
        Ok(application::classify_opens(&core.notes_dir, paths))
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
        let core = state.core();
        Ok(application::classify_opens(&core.notes_dir, paths))
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
