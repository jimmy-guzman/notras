mod frontmatter;
mod index;
mod notes;
mod state;
mod watcher;

use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, Manager, RunEvent, Theme, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_store::StoreExt;

use crate::state::{AppState, Core};

/// `--background` from `src/styles.css`, restated because the window layer is
/// painted by the OS before any stylesheet exists. `src/styles.spec.ts` fails if
/// these drift from the tokens.
const BG_DARK: Color = Color(0x19, 0x1b, 0x1d, 255);
const BG_LIGHT: Color = Color(0xf7, 0xf8, 0xfa, 255);

fn background_for(theme: Theme) -> Color {
    match theme {
        Theme::Light => BG_LIGHT,
        _ => BG_DARK,
    }
}

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
    .background_color(background_for(
        app.get_webview_window("main")
            .and_then(|window| window.theme().ok())
            .unwrap_or(Theme::Dark),
    ))
    .center();

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    let _ = builder.build();
}

/// Grant the asset protocol read access to a notes dir. Images inside notes are
/// rendered through `convertFileSrc`, so the scope has to follow the folder the
/// user picked -- the config ships with an empty static scope.
pub fn allow_assets(app: &AppHandle, notes_dir: &std::path::Path) {
    if let Err(error) = app.asset_protocol_scope().allow_directory(notes_dir, true) {
        eprintln!(
            "notras: could not grant asset access to {}: {error}",
            notes_dir.display()
        );
    }
}

fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // The config paints the window dark at creation, which is earlier than this
    // runs. Correcting it here is what keeps a light-mode launch from flashing
    // dark instead of white.
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(theme) = window.theme() {
            let _ = window.set_background_color(Some(background_for(theme)));
        }
    }

    // Resolve the notes directory: saved setting, else ~/notras.
    let store = app.store("settings.json")?;
    let notes_dir = match store
        .get("notesDir")
        .and_then(|value| value.as_str().map(std::path::PathBuf::from))
    {
        Some(dir) => dir,
        None => app.path().home_dir()?.join("notras"),
    };
    fs::create_dir_all(notes_dir.join(".notras"))?;

    // Images are rendered through the asset protocol; the scope follows the
    // notes dir at runtime rather than blanketing $HOME in the config.
    allow_assets(app.handle(), &notes_dir);

    let conn = rusqlite::Connection::open(notes_dir.join(".notras/index.db"))?;
    index::ensure_schema(&conn)?;

    app.manage(AppState {
        core: Mutex::new(Core {
            notes_dir: notes_dir.clone(),
            conn,
        }),
        watcher: Mutex::new(None),
        pending_open: Mutex::new(Vec::new()),
        quitting: AtomicBool::new(false),
    });

    // Initial scan off the main thread so startup stays instant.
    let scan_app = app.handle().clone();
    std::thread::spawn(move || {
        let state = scan_app.state::<AppState>();
        let core = state.core.lock().unwrap();
        match index::scan_all(&core.conn, &core.notes_dir) {
            Ok(changed) => {
                drop(core);
                if !changed.is_empty() {
                    let _ = scan_app.emit("notes-changed", NotesChanged { paths: changed });
                }
            }
            Err(error) => eprintln!("notras: startup scan failed: {error}"),
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

    let icon = app.default_window_icon().ok_or("no app icon")?.clone();

    TrayIconBuilder::with_id("tray")
        .icon(icon)
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
            notes::attach_image,
            notes::cancel_quit,
            notes::db_select,
            notes::delete_note,
            notes::get_notes_dir,
            notes::note_exists,
            notes::pending_open_files,
            notes::quit_app,
            notes::read_external,
            notes::read_note,
            notes::reindex_all,
            notes::rename_note,
            notes::set_notes_dir,
            notes::write_external,
            notes::write_note,
        ])
        .on_window_event(|window, event| match event {
            // Close-to-tray for the main window; capture window just hides.
            WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            // Switching appearance while notras runs would otherwise leave the
            // window layer painted for the scheme the app started in.
            WindowEvent::ThemeChanged(theme) => {
                let _ = window.set_background_color(Some(background_for(*theme)));
            }
            _ => {}
        })
        .setup(|app| setup(app))
        .build(tauri::generate_context!())
        .expect("error while building notras");

    app.run(|app, event| match event {
        RunEvent::Reopen { .. } => show_main(app),
        // Every quit (⌘Q, tray, `quit_app`) funnels through here. The first one
        // is held back so the webview can flush unsaved buffers; the frontend
        // answers by calling `quit_app`, and a timer covers the case where it
        // never does.
        RunEvent::ExitRequested { api, .. } => {
            if app.state::<AppState>().quitting.swap(true, Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            let _ = app.emit("app-quit", ());

            // Backstop for a webview that never answers. It re-checks the flag
            // so a quit the frontend called off (a write failed, and exiting
            // would lose the buffer) is not killed a moment later anyway.
            let fallback = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(5));
                if fallback.state::<AppState>().quitting.load(Ordering::SeqCst) {
                    fallback.exit(0);
                }
            });
        }
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
            // The queue is the only delivery mechanism -- the event just tells
            // the frontend to drain it, so a path can never open twice.
            app.state::<AppState>()
                .pending_open
                .lock()
                .unwrap()
                .extend(paths);
            let _ = app.emit("open-file", ());
        }
        _ => {}
    });
}
