use std::path::Path;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_opener::OpenerExt;
use tauri_specta::Event;

use crate::bindings::{IndexStatus, MutationWarnings, NotesChanged};
use crate::settings::Settings;
use crate::state::AppState;
use crate::watcher;
use notras_core::{
    self, CommandError, ConflictStash, CreateNote, DeleteReceipt, Library, MutationReceipt,
    MutationWarning, NoteFile, OpenKind, PathMutationReceipt, PendingOpen, SaveName, SaveOutcome,
};
use notras_core::{
    CountedTag, GraphResult, GraphTarget, Mention, NoteFilters, NoteMeta, NoteSearch,
};

pub(crate) async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    match tauri::async_runtime::spawn_blocking(operation).await {
        Ok(result) => result,
        Err(tauri::Error::JoinError(error)) if error.is_panic() => {
            std::panic::resume_unwind(error.into_panic())
        }
        Err(error) => {
            log::error!("native command task failed: {error}");
            Err(CommandError::with_source("An unexpected error", error))
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

pub(crate) fn emit_changed<R: Runtime>(app: &AppHandle<R>, generation: u64, paths: Vec<String>) {
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
) -> Result<NoteFile, CommandError> {
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

fn opener_reason(error: tauri_plugin_opener::Error) -> CommandError {
    match error {
        tauri_plugin_opener::Error::Io(error) => error.into(),
        error => CommandError::with_source(error.to_string(), error),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn open_linked_file<R: Runtime>(
    app: AppHandle<R>,
    from: String,
    destination: String,
) -> Result<(), CommandError> {
    run_blocking(move || {
        let host = {
            let state = app.state::<AppState>();
            let library = state.library();
            library.linked_file_path(&from, &destination)?
        };
        app.opener()
            .open_path(
                host.to_str().ok_or("The path is not valid Unicode")?,
                None::<&str>,
            )
            .map_err(opener_reason)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn open_external_file<R: Runtime>(
    app: AppHandle<R>,
    document: String,
    destination: String,
) -> Result<(), CommandError> {
    run_blocking(move || {
        let host = notras_core::external_file(Path::new(&document), &destination)?;
        app.opener()
            .open_path(
                host.to_str().ok_or("The path is not valid Unicode")?,
                None::<&str>,
            )
            .map_err(opener_reason)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn resolve_external_link<R: Runtime>(
    app: AppHandle<R>,
    document: String,
    destination: String,
) -> Result<PendingOpen, CommandError> {
    run_blocking(move || {
        let target = notras_core::external_note(Path::new(&document), &destination)?;
        let target = target
            .to_str()
            .ok_or("The path is not valid Unicode")?
            .to_owned();
        let state = app.state::<AppState>();
        let library = state.library();
        Ok(library.classify_open(target))
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
pub async fn list_folders<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        state.library.query(|view| view.list_folders())
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
    expected: String,
) -> Result<SaveOutcome, CommandError> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let (result, changed) = state.library.mutate(|library| {
            let result = library.save_note(&path, &content, name, &expected)?;
            // An empty list tells the frontend the whole vault changed, so a
            // conflict, which wrote nothing, must not reach `emit_changed`.
            let paths = match &result {
                SaveOutcome::Committed { receipt } if path == receipt.path => vec![path],
                SaveOutcome::Committed { receipt } => vec![path, receipt.path.clone()],
                SaveOutcome::Conflict { .. } => vec![],
            };
            Ok((result, paths))
        })?;
        if let SaveOutcome::Committed { receipt } = &result {
            emit_warnings(&app, &receipt.warnings);
            emit_changed(&app, changed.generation, changed.paths);
        }
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
    expected: String,
) -> Result<SaveOutcome, CommandError> {
    run_blocking(move || {
        let result = notras_core::write_external(Path::new(&path), &content, name, &expected)?;
        if let SaveOutcome::Committed { receipt } = &result {
            emit_warnings(&app, &receipt.warnings);
        }
        Ok(result)
    })
    .await
}

fn conflicts_dir<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, CommandError> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::with_source("The data folder is unavailable", error))?;
    Ok(data.join("conflicts"))
}

#[tauri::command]
#[specta::specta]
pub async fn stash_conflict<R: Runtime>(
    app: AppHandle<R>,
    kind: OpenKind,
    path: String,
    stash: ConflictStash,
) -> Result<(), CommandError> {
    run_blocking(move || notras_core::stash_conflict(&conflicts_dir(&app)?, kind, &path, &stash))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn read_conflict<R: Runtime>(
    app: AppHandle<R>,
    kind: OpenKind,
    path: String,
) -> Result<Option<ConflictStash>, CommandError> {
    run_blocking(move || notras_core::read_conflict(&conflicts_dir(&app)?, kind, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_conflict<R: Runtime>(
    app: AppHandle<R>,
    kind: OpenKind,
    path: String,
) -> Result<(), CommandError> {
    run_blocking(move || notras_core::clear_conflict(&conflicts_dir(&app)?, kind, &path)).await
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
pub async fn index_status<R: Runtime>(app: AppHandle<R>) -> Result<IndexStatus, CommandError> {
    run_blocking(move || Ok(app.state::<AppState>().library.status())).await
}

/// Save the chosen folder before the swap: a folder the next launch cannot find
/// again is worse than one this launch never switched to.
fn persist_notes_dir<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<(), CommandError> {
    app.state::<Settings>().save_notes_dir(path)
}

fn watch_error(error: notify::Error) -> CommandError {
    let reason = match &error.kind {
        notify::ErrorKind::Io(error) => CommandError::io_reason(error),
        notify::ErrorKind::PathNotFound => "The folder no longer exists".into(),
        notify::ErrorKind::WatchNotFound => "The folder is no longer being watched".into(),
        notify::ErrorKind::MaxFilesWatch => "The system's file watch limit has been reached".into(),
        notify::ErrorKind::InvalidConfig(_) | notify::ErrorKind::Generic(_) => {
            log::error!("unexpected folder watcher failure: {error}");
            "An unexpected error".into()
        }
    };
    CommandError::with_source(reason, error)
}

/// Switch the library to `path`, running `persist` between preparation and installation.
///
/// The persistence step is injected because it sits inside the window a test has to
/// act in: the replacement is watched and scanned, but not yet installed.
fn switch_notes_dir<R: Runtime>(
    app: &AppHandle<R>,
    path: &str,
    persist: impl FnOnce() -> Result<(), CommandError>,
) -> Result<(), CommandError> {
    let state = app.state::<AppState>();

    // Switches can run on different blocking workers. Keep their saved setting,
    // library swap and watcher replacement in the same order.
    let mut watcher = state.watcher();
    let same_directory = match std::fs::canonicalize(path) {
        Ok(directory) => directory == state.library().directory(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(error.into()),
    };
    // Reopening the current database would create a second writer outside
    // the coordinator while the original library can still save and scan.
    let replacement = if same_directory {
        None
    } else {
        let cache = crate::index_cache(app)
            .map_err(|error| CommandError::with_source("The cache folder is unavailable", error))?;
        let library = Library::open(Path::new(path), &cache)?;
        let notes_dir = library.directory().to_owned();
        // Watched before it is scanned, so a write that lands during the scan
        // reaches the owner, which holds it until the replacement is installed.
        let preparation = state.library.begin_replacement();
        let fresh = watcher::start(app.clone(), notes_dir.clone(), preparation.generation)
            .map_err(watch_error)?;
        state.library.prepare(&library)?;
        Some((library, notes_dir, fresh, preparation))
    };

    persist()?;

    if let Some((library, notes_dir, fresh, preparation)) = replacement {
        let generation = preparation.generation;
        crate::allow_assets(app, &notes_dir);
        let observed = state.library.replace_scanned(library);
        drop(preparation);

        // Dropping the old watcher may join a callback waiting for the library.
        *watcher = Some(fresh);
        drop(watcher);
        if !observed.is_empty() {
            if let Err(error) = state.library.observe(generation, observed) {
                log::error!("could not reconcile paths observed during the switch: {error}");
            }
        }
        emit_changed(app, generation, vec![]);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_notes_dir<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<(), CommandError> {
    run_blocking(move || switch_notes_dir(&app, &path, || persist_notes_dir(&app, &path))).await
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
    use std::fs;
    use std::panic::{catch_unwind, panic_any};
    use std::sync::atomic::AtomicBool;
    use std::sync::{mpsc, Mutex};
    use std::time::{Duration, Instant};

    use serde_json::{json, Value};
    use tauri::Listener;

    #[test]
    fn should_index_a_note_written_while_a_switch_prepares() {
        let directory = tempfile::tempdir().unwrap();
        let initial = directory.path().join("initial");
        let fresh = directory.path().join("fresh");
        fs::create_dir(&initial).unwrap();
        fs::create_dir(&fresh).unwrap();
        fs::write(fresh.join("one.md"), "# One").unwrap();
        let contract = crate::bindings::builder::<tauri::test::MockRuntime>();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().identifier =
            directory.path().join("settings").to_string_lossy().into();
        let app = tauri::test::mock_builder()
            .manage(
                crate::settings::Settings::load(directory.path().join("settings/settings.json"))
                    .unwrap(),
            )
            .manage(AppState {
                library: crate::library::LibraryOwner::new(
                    Library::open(&initial, &directory.path().join(".index")).unwrap(),
                    |_| {},
                ),
                watcher: Mutex::new(None),
                pending_open: Mutex::new(vec![]),
                quitting: AtomicBool::new(false),
            })
            .invoke_handler(contract.invoke_handler())
            .build(context)
            .unwrap();
        contract.mount_events(&app);
        let (sender, changes) = mpsc::channel();
        app.listen("notes-changed", move |event| {
            sender
                .send(serde_json::from_str::<Value>(event.payload()).unwrap())
                .unwrap();
        });
        let handle = app.handle().clone();
        let path = fresh.to_string_lossy().into_owned();

        switch_notes_dir(&handle, &path, || {
            persist_notes_dir(&handle, &path)?;
            fs::write(fresh.join("late.md"), "# Late").unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            while handle.state::<AppState>().library.queued_observations() == 0 {
                assert!(
                    Instant::now() < deadline,
                    "the replacement watcher must report the write before installation"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
            Ok(())
        })
        .unwrap();

        assert_eq!(
            changes.recv_timeout(Duration::from_secs(5)).unwrap(),
            json!({"paths": []})
        );
        let mut paths: Vec<_> = app
            .state::<AppState>()
            .library
            .query(|view| view.list_notes(&Default::default()))
            .unwrap()
            .into_iter()
            .map(|note| note.path)
            .collect();
        paths.sort();
        assert_eq!(paths, vec!["late.md", "one.md"]);
        *app.state::<AppState>().watcher() = None;
    }

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
            serde_json::json!({"kind": "not-found", "message": "No such file"})
        );
    }

    #[test]
    fn should_keep_the_saved_folder_when_saving_a_new_one_fails() {
        let directory = tempfile::tempdir().unwrap();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().identifier =
            directory.path().join("settings").to_string_lossy().into();
        let app = tauri::test::mock_builder()
            .manage(
                crate::settings::Settings::load(directory.path().join("settings/settings.json"))
                    .unwrap(),
            )
            .build(context)
            .unwrap();
        let file = directory.path().join("settings/settings.json");
        persist_notes_dir(app.handle(), "/notes/old").unwrap();
        fs::remove_file(&file).unwrap();
        fs::create_dir(&file).unwrap();

        let error = persist_notes_dir(app.handle(), "/notes/new").unwrap_err();
        assert_eq!(error.kind, notras_core::ErrorKind::Failed);
        assert_eq!(
            error.message,
            if cfg!(windows) {
                "Permission denied"
            } else {
                "That path is a folder"
            }
        );

        fs::remove_dir(&file).unwrap();
        let store = app.state::<crate::settings::Settings>();
        store
            .save_appearance(crate::windows::Appearance::Dark)
            .unwrap();
        let settings: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        assert_eq!(settings["notesDir"], "/notes/old");
    }

    #[test]
    fn should_save_no_folder_when_saving_the_first_one_fails() {
        let directory = tempfile::tempdir().unwrap();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().identifier =
            directory.path().join("settings").to_string_lossy().into();
        let app = tauri::test::mock_builder()
            .manage(
                crate::settings::Settings::load(directory.path().join("settings/settings.json"))
                    .unwrap(),
            )
            .build(context)
            .unwrap();
        let file = directory.path().join("settings/settings.json");
        let store = app.state::<crate::settings::Settings>();
        store
            .save_appearance(crate::windows::Appearance::Dark)
            .unwrap();
        fs::remove_file(&file).unwrap();
        fs::create_dir(&file).unwrap();

        let error = persist_notes_dir(app.handle(), "/notes/new").unwrap_err();
        assert_eq!(error.kind, notras_core::ErrorKind::Failed);
        assert_eq!(
            error.message,
            if cfg!(windows) {
                "Permission denied"
            } else {
                "That path is a folder"
            }
        );

        fs::remove_dir(&file).unwrap();
        store
            .save_appearance(crate::windows::Appearance::Light)
            .unwrap();
        let settings: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        assert_eq!(settings, json!({"appearance": "light"}));
    }

    #[test]
    fn should_report_watcher_reasons_without_marking_a_note_missing() {
        use std::{error::Error as _, io};

        for (source, reason) in [
            (
                notify::Error::io(io::Error::from(io::ErrorKind::PermissionDenied)),
                "Permission denied",
            ),
            (
                notify::Error::io(io::Error::from(io::ErrorKind::NotFound)),
                "No such file",
            ),
            (
                notify::Error::path_not_found(),
                "The folder no longer exists",
            ),
            (
                notify::Error::watch_not_found(),
                "The folder is no longer being watched",
            ),
            (
                notify::Error::new(notify::ErrorKind::MaxFilesWatch),
                "The system's file watch limit has been reached",
            ),
        ] {
            let error = watch_error(source);
            assert_eq!(error.kind, notras_core::ErrorKind::Failed);
            assert_eq!(error.message, reason);
            assert!(error.source().unwrap().is::<notify::Error>());
        }
    }
}
