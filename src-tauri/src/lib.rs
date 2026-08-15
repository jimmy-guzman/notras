mod frontmatter;
mod index;
mod notes;
mod state;
mod watcher;

use std::fs;
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_store::StoreExt;

use crate::state::{AppState, Core};

#[derive(Clone, Serialize)]
pub struct NotesChanged {
    pub paths: Vec<String>,
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let builder = WebviewWindowBuilder::new(
        app,
        "capture",
        WebviewUrl::App("index.html?window=capture".into()),
    )
    .title("quick capture")
    .inner_size(560.0, 320.0)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .center();

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    let _ = builder.build();
}

fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Resolve the notes directory: saved setting, else ~/notras.
    let store = app.store("settings.json")?;
    let notes_dir = store
        .get("notesDir")
        .and_then(|value| value.as_str().map(std::path::PathBuf::from))
        .unwrap_or_else(|| {
            app.path()
                .home_dir()
                .expect("no home directory")
                .join("notras")
        });
    fs::create_dir_all(notes_dir.join(".notras"))?;

    let conn = rusqlite::Connection::open(notes_dir.join(".notras/index.db"))?;
    index::ensure_schema(&conn)?;

    app.manage(AppState {
        core: Mutex::new(Core {
            notes_dir: notes_dir.clone(),
            conn,
        }),
        watcher: Mutex::new(None),
        pending_open: Mutex::new(Vec::new()),
    });

    // Initial scan off the main thread so startup stays instant.
    let scan_app = app.handle().clone();
    std::thread::spawn(move || {
        let state = scan_app.state::<AppState>();
        let core = state.core.lock().unwrap();
        if let Ok(changed) = index::scan_all(&core.conn, &core.notes_dir) {
            drop(core);
            if !changed.is_empty() {
                let _ = scan_app.emit("notes-changed", NotesChanged { paths: changed });
            }
        }
    });

    let state = app.state::<AppState>();
    *state.watcher.lock().unwrap() = watcher::start(app.handle().clone(), notes_dir);

    // Tray: open / new note / quick capture / quit.
    let open = MenuItem::with_id(app, "open", "open notras", true, None::<&str>)?;
    let new_note = MenuItem::with_id(app, "new-note", "new note", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "quick capture", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &new_note, &capture, &quit])?;

    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().expect("no app icon").clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "new-note" => {
                show_main(app);
                let _ = app.emit("menu-new-note", ());
            }
            "capture" => open_capture(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Global quick-capture shortcut.
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::ShortcutState;

        app.handle().plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["CmdOrCtrl+Shift+N"])?
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        open_capture(app);
                    }
                })
                .build(),
        )?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            notes::attach_file,
            notes::db_select,
            notes::delete_note,
            notes::get_notes_dir,
            notes::note_exists,
            notes::pending_open_files,
            notes::read_external,
            notes::read_note,
            notes::reindex_all,
            notes::rename_note,
            notes::set_notes_dir,
            notes::write_external,
            notes::write_note,
        ])
        .on_window_event(|window, event| {
            // Close-to-tray for the main window; capture window just hides.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| setup(app))
        .build(tauri::generate_context!())
        .expect("error while building notras");

    app.run(|app, event| match event {
        RunEvent::Reopen { .. } => show_main(app),
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let paths: Vec<String> = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().to_string())
                .collect();
            if paths.is_empty() {
                return;
            }
            show_main(app);
            let state = app.state::<AppState>();
            state.pending_open.lock().unwrap().extend(paths.clone());
            let _ = app.emit("open-file", paths);
        }
        _ => {}
    });
}
