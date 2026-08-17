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

/// Centres the buttons in the 44px band `Titlebar` draws. The pair comes from
/// erictli/scratch, which ships these values against the same overlay titlebar;
/// `y` is the button's centre offset from the window top, not a margin above it.
/// Changing the band height means rechecking this.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHTS: tauri::LogicalPosition<f64> = tauri::LogicalPosition::new(16.0, 24.0);

fn background_for(theme: Theme) -> Color {
    match theme {
        Theme::Light => BG_LIGHT,
        _ => BG_DARK,
    }
}

/// macOS 26 raised standard control metrics, so a window built against its SDK
/// gets 16x16 buttons where every older app has 12x14. The property is
/// documented to cover a view's descendants, and the buttons live in the frame
/// view rather than under `contentView`, so it is set on both.
#[cfg(target_os = "macos")]
fn use_compact_window_controls(window: &tauri::WebviewWindow) {
    use objc2::available;
    use objc2_app_kit::{NSWindow, NSWindowButton};

    if !available!(macos = 26.0) {
        return;
    }

    let Ok(pointer) = window.ns_window() else {
        return;
    };

    // Tauri hands back the NSWindow backing this webview window.
    let ns_window: &NSWindow = unsafe { &*pointer.cast::<NSWindow>() };

    if let Some(view) = ns_window.contentView() {
        view.setPrefersCompactControlSizeMetrics(true);
    }

    for kind in [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ] {
        if let Some(button) = ns_window.standardWindowButton(kind) {
            button.setPrefersCompactControlSizeMetrics(true);
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn use_compact_window_controls(_window: &tauri::WebviewWindow) {}

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
        .hidden_title(true)
        .traffic_light_position(TRAFFIC_LIGHTS);

    if let Ok(window) = builder.build() {
        use_compact_window_controls(&window);
    }
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

/// The menu bar wants a template image: the alpha carries the shape and macOS
/// picks the colour, so one asset serves both appearances. `tray-icon` scales
/// whatever it is handed to 18pt, which makes 36px the 2x size. Bundled with
/// `include_bytes!` so the tray does not depend on a resource path at runtime.
fn tray_icon() -> tauri::Result<tauri::image::Image<'static>> {
    tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))
}

fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // The config paints the window dark at creation, which is earlier than this
    // runs. Correcting it here is what keeps a light-mode launch from flashing
    // dark instead of white.
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(theme) = window.theme() {
            let _ = window.set_background_color(Some(background_for(theme)));
        }
        use_compact_window_controls(&window);
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

    TrayIconBuilder::with_id("tray")
        .icon(tray_icon()?)
        .icon_as_template(true)
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
