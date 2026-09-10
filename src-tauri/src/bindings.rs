use serde::{Deserialize, Serialize};
use tauri::Runtime;

use crate::{clipboard, notes, windows};
use notras_core::MutationWarning;

/// Relative paths whose saved content or index rows changed; empty means the library.
#[derive(Clone, Deserialize, Serialize, specta::Type, tauri_specta::Event)]
pub struct NotesChanged {
    pub paths: Vec<String>,
}

#[derive(Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
pub struct MutationWarnings {
    pub warnings: Vec<MutationWarning>,
}

pub fn builder<R: Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::new()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        // Specta collects metadata in a nested function, which needs a concrete
        // runtime. Tauri infers the actual handler runtime independently.
        .commands(tauri_specta::collect_commands![
            clipboard::read_code_clipboard,
            notes::attach_file::<tauri::Wry>,
            notes::attach_image::<tauri::Wry>,
            notes::cancel_quit,
            notes::classify_open_paths::<tauri::Wry>,
            notes::delete_note::<tauri::Wry>,
            notes::find_mentions::<tauri::Wry>,
            notes::get_notes_dir,
            notes::list_notes::<tauri::Wry>,
            notes::list_tags::<tauri::Wry>,
            notes::read_graph::<tauri::Wry>,
            notes::search_notes::<tauri::Wry>,
            notes::pending_open_files::<tauri::Wry>,
            notes::quit_app::<tauri::Wry>,
            notes::read_external,
            notes::read_note::<tauri::Wry>,
            notes::reindex_all::<tauri::Wry>,
            notes::create_note::<tauri::Wry>,
            notes::move_note::<tauri::Wry>,
            notes::set_notes_dir::<tauri::Wry>,
            notes::write_external::<tauri::Wry>,
            notes::save_note::<tauri::Wry>,
            windows::show_capture::<tauri::Wry>,
        ])
        .events(tauri_specta::collect_events![
            NotesChanged,
            MutationWarnings
        ])
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::{atomic::AtomicBool, mpsc, Mutex};

    use serde_json::{json, Value};
    use tauri::{Listener, Manager};

    use crate::state::AppState;
    use notras_core::Library;

    use super::*;

    fn invoke(
        window: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        command: &str,
        args: Value,
    ) -> Result<Value, Value> {
        tauri::test::get_ipc_response(
            window,
            tauri::webview::InvokeRequest {
                cmd: command.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: if cfg!(windows) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: tauri::ipc::InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.into(),
            },
        )
        .map(|body| body.deserialize().unwrap())
    }

    #[test]
    fn should_commit_notes_and_emit_serialized_changes_after_releasing_the_lock() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let contract = builder::<tauri::test::MockRuntime>();
        let app = tauri::test::mock_builder()
            .manage(AppState {
                library: Mutex::new(Library::open(directory.path().to_owned()).unwrap()),
                watcher: Mutex::new(None),
                pending_open: Mutex::new(vec![]),
                quitting: AtomicBool::new(false),
            })
            .invoke_handler(contract.invoke_handler())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        contract.mount_events(&app);
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let (sender, changes) = mpsc::channel();
        let handle = app.handle().clone();
        let listener = app.listen("notes-changed", move |event| {
            let available = handle.state::<AppState>().library.try_lock().is_ok();
            sender
                .send((
                    serde_json::from_str::<Value>(event.payload()).unwrap(),
                    available,
                ))
                .unwrap();
        });

        let receipt = invoke(
            &window,
            "create_note",
            json!({"options": {"folder": "ideas", "name": {"kind": "filename", "value": "a"}, "content": "# first\nbody"}}),
        )
        .unwrap();
        assert_eq!(receipt["path"], "ideas/a.md");
        assert!(receipt["updatedAt"].as_i64().unwrap() > 0);
        assert_eq!(
            fs::read_to_string(directory.path().join("ideas/a.md")).unwrap(),
            "# first\nbody"
        );
        assert_eq!(
            invoke(&window, "read_note", json!({"path": "ideas/a.md"})).unwrap(),
            json!({
                "content": "# first\nbody", "updatedAt": receipt["updatedAt"],
                "path": "ideas/a.md", "title": "first", "pinned": false, "tags": []
            })
        );
        assert_eq!(
            changes.recv().unwrap(),
            (json!({"paths": ["ideas/a.md"]}), true)
        );
        let notes = invoke(&window, "list_notes", json!({"filters": {}})).unwrap();
        assert_eq!(notes.as_array().unwrap().len(), 1);
        assert_eq!(notes[0]["path"], "ideas/a.md");
        assert_eq!(notes[0]["title"], "first");

        invoke(
            &window,
            "save_note",
            json!({"path": "ideas/a.md", "content": "# second"}),
        )
        .unwrap();
        assert_eq!(
            changes.recv().unwrap(),
            (json!({"paths": ["ideas/a.md"]}), true)
        );
        let moved = invoke(
            &window,
            "move_note",
            json!({"path": "ideas/a.md", "folder": ""}),
        )
        .unwrap();
        assert_eq!(moved["path"], "a.md");
        assert_eq!(
            changes.recv().unwrap(),
            (json!({"paths": ["ideas/a.md", "a.md"]}), true)
        );
        assert!(!directory.path().join("ideas/a.md").exists());
        assert_eq!(
            fs::read_to_string(directory.path().join("a.md")).unwrap(),
            "# second"
        );
        let notes = invoke(&window, "list_notes", json!({"filters": {}})).unwrap();
        assert_eq!(notes.as_array().unwrap().len(), 1);
        assert_eq!(notes[0]["path"], "a.md");
        assert_eq!(notes[0]["title"], "second");
        assert_eq!(
            invoke(&window, "delete_note", json!({"path": "a.md"})).unwrap(),
            json!({"path": "a.md", "warnings": []})
        );
        assert_eq!(changes.recv().unwrap(), (json!({"paths": ["a.md"]}), true));
        assert!(!directory.path().join("a.md").exists());
        assert_eq!(
            invoke(&window, "list_notes", json!({"filters": {}})).unwrap(),
            json!([])
        );
        app.unlisten(listener);
    }

    #[test]
    fn should_report_committed_capture_warnings_after_unlocking_and_recover_reads() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        let conn = rusqlite::Connection::open(directory.path().join(".notras/index.db")).unwrap();
        conn.execute_batch("CREATE TRIGGER refuse_insert BEFORE INSERT ON note BEGIN SELECT RAISE(FAIL, 'index unavailable'); END;").unwrap();
        let contract = builder::<tauri::test::MockRuntime>();
        let app = tauri::test::mock_builder()
            .manage(AppState {
                library: Mutex::new(library),
                watcher: Mutex::new(None),
                pending_open: Mutex::new(vec![]),
                quitting: AtomicBool::new(false),
            })
            .invoke_handler(contract.invoke_handler())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        contract.mount_events(&app);
        let capture = tauri::WebviewWindowBuilder::new(&app, "capture", Default::default())
            .build()
            .unwrap();
        let (sender, warnings) = mpsc::channel();
        let handle = app.handle().clone();
        app.listen("mutation-warnings", move |event| {
            sender
                .send((
                    serde_json::from_str::<Value>(event.payload()).unwrap(),
                    handle.state::<AppState>().library.try_lock().is_ok(),
                ))
                .unwrap();
        });
        let receipt = invoke(
            &capture,
            "create_note",
            json!({"options": {"folder": "inbox", "content": "a captured thought"}}),
        )
        .unwrap();
        let (event, unlocked) = warnings.recv().unwrap();
        assert!(unlocked);
        assert_eq!(event["warnings"], receipt["warnings"]);
        assert_eq!(receipt["warnings"][0]["kind"], "index");
        assert_eq!(receipt["path"], "inbox/untitled.md");
        assert_eq!(
            invoke(&capture, "read_note", json!({"path": receipt["path"]})).unwrap()["content"],
            "a captured thought"
        );
        assert!(invoke(&capture, "list_notes", json!({"filters": {}})).is_err());
        conn.execute_batch("DROP TRIGGER refuse_insert").unwrap();
        let notes = invoke(&capture, "list_notes", json!({"filters": {}})).unwrap();
        assert_eq!(notes.as_array().unwrap().len(), 1);
        assert_eq!(notes[0]["path"], "inbox/untitled.md");
    }

    #[test]
    fn should_reject_invalid_arguments_and_preserve_existing_files_on_expected_failures() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        fs::write(directory.path().join("kept.md"), "original").unwrap();
        let contract = builder::<tauri::test::MockRuntime>();
        let app = tauri::test::mock_builder()
            .manage(AppState {
                library: Mutex::new(Library::open(directory.path().to_owned()).unwrap()),
                watcher: Mutex::new(None),
                pending_open: Mutex::new(vec![]),
                quitting: AtomicBool::new(false),
            })
            .invoke_handler(contract.invoke_handler())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        contract.mount_events(&app);
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let (sender, changes) = mpsc::channel();
        app.listen("notes-changed", move |event| {
            sender.send(event.payload().to_owned()).unwrap();
        });

        assert_eq!(
            invoke(&window, "read_note", json!({"path": "missing.md"})).unwrap_err(),
            json!({
                "kind": "not-found", "message": "no such file"
            })
        );
        assert_eq!(
            invoke(&window, "read_note", json!({"path": "../outside.md"})).unwrap_err(),
            json!({
                "kind": "failed", "message": "invalid note path: ../outside.md"
            })
        );
        let failure = invoke(
            &window,
            "save_note",
            json!({"path": "new.md", "create": true}),
        )
        .unwrap_err();
        assert!(failure.as_str().unwrap().contains("content"));
        assert!(!directory.path().join("new.md").exists());
        assert_eq!(
            fs::read_to_string(directory.path().join("kept.md")).unwrap(),
            "original"
        );
        assert!(changes.try_recv().is_err());
    }

    #[test]
    fn should_decode_camel_case_attachment_arguments() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let contract = builder::<tauri::test::MockRuntime>();
        let app = tauri::test::mock_builder()
            .manage(AppState {
                library: Mutex::new(Library::open(directory.path().to_owned()).unwrap()),
                watcher: Mutex::new(None),
                pending_open: Mutex::new(vec![]),
                quitting: AtomicBool::new(false),
            })
            .invoke_handler(contract.invoke_handler())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        contract.mount_events(&app);
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();

        let attachment =
            invoke(&window, "attach_image", json!({"base64Data": "aGVsbG8="})).unwrap();
        assert_eq!(
            fs::read(directory.path().join(attachment.as_str().unwrap())).unwrap(),
            b"hello"
        );
    }

    #[test]
    fn should_keep_concurrent_library_switches_and_the_watcher_on_the_same_directory() {
        let directory = tempfile::tempdir().unwrap();
        // macOS reports canonical paths in FSEvents; the temporary root may
        // otherwise use the /var symlink while events arrive under /private/var.
        let root = directory.path().canonicalize().unwrap();
        let initial = root.join("initial");
        let first = root.join("first");
        let second = root.join("second");
        fs::create_dir_all(initial.join(".notras")).unwrap();
        let contract = builder::<tauri::test::MockRuntime>();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        // The mock context has no bundle validation. An absolute identifier keeps
        // the store plugin's app-data resolution inside this test's directory.
        context.config_mut().identifier =
            directory.path().join("settings").to_string_lossy().into();
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_store::Builder::new().build())
            .manage(AppState {
                library: Mutex::new(Library::open(initial.clone()).unwrap()),
                watcher: Mutex::new(None),
                pending_open: Mutex::new(vec![]),
                quitting: AtomicBool::new(false),
            })
            .invoke_handler(contract.invoke_handler())
            .build(context)
            .unwrap();
        contract.mount_events(&app);
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let other_window = window.clone();
        let other_path = second.clone();
        let pending = std::thread::spawn(move || {
            invoke(&other_window, "set_notes_dir", json!({"path": other_path})).unwrap();
        });
        invoke(&window, "set_notes_dir", json!({"path": first})).unwrap();
        pending.join().unwrap();

        let active = invoke(&window, "get_notes_dir", json!({})).unwrap();
        let settings: Value = serde_json::from_slice(
            &fs::read(directory.path().join("settings/settings.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(settings["notesDir"], active);
        assert!(active == json!(first) || active == json!(second));
        let (sender, changes) = mpsc::channel();
        app.listen("notes-changed", move |event| {
            sender
                .send(serde_json::from_str::<Value>(event.payload()).unwrap())
                .unwrap();
        });
        fs::write(
            std::path::Path::new(active.as_str().unwrap()).join("external.md"),
            "# watched",
        )
        .unwrap();
        assert_eq!(
            changes
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap(),
            json!({"paths": ["external.md"]})
        );
        let notes = invoke(&window, "list_notes", json!({"filters": {}})).unwrap();
        assert_eq!(notes.as_array().unwrap().len(), 1);
        assert_eq!(notes[0]["path"], "external.md");
        assert_eq!(notes[0]["title"], "watched");
        *app.state::<AppState>().watcher() = None;
    }

    #[test]
    fn should_serve_typed_saved_queries_through_the_production_registry() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        fs::write(directory.path().join("atlas.md"), "# Atlas\n[[Source]]").unwrap();
        fs::write(
            directory.path().join("source.md"),
            "---\ntags: [work]\n---\n# Source\nAtlas in prose",
        )
        .unwrap();
        let library = Library::open(directory.path().to_owned()).unwrap();
        library.scan_complete().unwrap();
        let contract = builder::<tauri::test::MockRuntime>();
        let app = tauri::test::mock_builder()
            .manage(AppState {
                library: Mutex::new(library),
                watcher: Mutex::new(None),
                pending_open: Mutex::new(vec![]),
                quitting: AtomicBool::new(false),
            })
            .invoke_handler(contract.invoke_handler())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let listed = invoke(&window, "list_notes", json!({"filters":{"tag":"work"}})).unwrap();
        assert_eq!(listed[0]["path"], "source.md");
        assert!(listed[0]["updatedAt"].as_i64().unwrap() > 0);
        assert_eq!(
            invoke(&window, "list_tags", json!({})).unwrap(),
            json!([{"tag":"work","count":1}])
        );
        let mentions = invoke(&window, "find_mentions", json!({"path":"atlas.md"})).unwrap();
        assert_eq!(mentions[0]["note"]["title"], "Source");
        assert_eq!(
            mentions[0]["lines"],
            json!([{"context":"Atlas in prose","line":5,"match":"Atlas"}])
        );
        let result = invoke(&window, "search_notes", json!({"search":{"query":"", "incomplete":false,"filters":[{"kind":"to","value":"atlas.md"}]}})).unwrap();
        assert_eq!(result[0]["path"], "source.md");
        let graph = invoke(
            &window,
            "read_graph",
            json!({"target":{"kind":"note","path":"atlas.md"}}),
        )
        .unwrap();
        assert_eq!(graph["picture"]["kind"], "note");
        assert_eq!(graph["picture"]["graph"]["incoming"], mentions);
        assert_eq!(
            graph["picture"]["graph"]["outgoing"][0]["note"]["path"],
            "source.md"
        );
        assert!(graph["mentionsError"].is_null());
        let hub = invoke(
            &window,
            "read_graph",
            json!({"target":{"kind":"hub","hub":{"kind":"tag","tag":"work"}}}),
        )
        .unwrap();
        assert_eq!(hub["picture"]["hub"]["count"], 1);
        assert_eq!(hub["picture"]["members"][0]["note"]["path"], "source.md");
        assert!(invoke(&window, "list_notes", json!({"filters":{"limit":-1}})).is_err());
        assert_eq!(
            fs::read_to_string(directory.path().join("atlas.md")).unwrap(),
            "# Atlas\n[[Source]]"
        );
    }

    #[test]
    fn should_export_the_native_contract() {
        let directory = tempfile::tempdir().unwrap();
        let path = std::env::var_os("NOTRAS_BINDINGS_PATH")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| directory.path().join("bindings.ts"));
        let contract = builder::<tauri::test::MockRuntime>();
        contract
            .export(specta_typescript::Typescript::default(), &path)
            .unwrap();
        assert!(!std::fs::read_to_string(path).unwrap().is_empty());
    }
}
