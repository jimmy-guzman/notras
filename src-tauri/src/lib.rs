mod frontmatter;
mod index;
mod notes;
mod state;
mod watcher;
mod windows;

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
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_store::StoreExt;

use crate::state::{AppState, Core};

/// `--background` from `src/styles.css`, restated because the window layer is
/// painted by the OS before any stylesheet exists. `src/styles.spec.ts` fails if
/// these drift from the tokens.
const BG_DARK: Color = Color(0x19, 0x1b, 0x1d, 255);
const BG_LIGHT: Color = Color(0xf7, 0xf8, 0xfa, 255);

/// Centres the buttons in the 36px band `Titlebar` draws; `D29` derives `y` and
/// `tauri.conf.json` carries the same pair for the `main` window.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHTS: tauri::LogicalPosition<f64> = tauri::LogicalPosition::new(16.0, 20.0);

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

pub(crate) fn open_capture(app: &AppHandle) {
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
        log::error!(
            "could not grant asset access to {}: {error}",
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

/// Everything a launch needs. A failure here reaches the user as a dialog,
/// since no window exists yet to say it in.
fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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

    let conn = index::open(&notes_dir)?;

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
        let core = state.core();
        match index::scan_all(&core.conn, &core.notes_dir) {
            Ok(changed) => {
                drop(core);
                if !changed.is_empty() {
                    if let Err(error) = scan_app.emit("notes-changed", NotesChanged { paths: changed }) {
                        log::error!("could not emit {}: {error}", "notes-changed");
                    }
                }
            }
            Err(error) => log::error!("startup scan failed: {error}"),
        }
    });

    let state = app.state::<AppState>();
    *state.watcher() = match watcher::start(app.handle().clone(), notes_dir) {
        Ok(watcher) => Some(watcher),
        Err(error) => {
            log::error!("could not watch the notes dir: {error}");
            None
        }
    };

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
                if let Err(error) = app.emit("menu-new-note", ()) {
                    log::error!("could not emit {}: {error}", "menu-new-note");
                }
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

fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let Err(error) = init(app) else {
        return Ok(());
    };

    log::error!("could not start: {error}");
    // Blocking, so the reason is on screen before the process goes.
    app.dialog()
        .message(error.to_string())
        .title("notras could not start")
        .kind(MessageDialogKind::Error)
        .blocking_show();

    Err(error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // First, so what the other plugins log is caught too.
    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("notras".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    let built = builder
        .invoke_handler(tauri::generate_handler![
            notes::attach_file,
            notes::attach_image,
            notes::cancel_quit,
            notes::classify_open_paths,
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
            windows::show_capture,
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
        .build(tauri::generate_context!());
    let app = match built {
        Ok(app) => app,
        Err(error) => {
            log::error!("could not build the app: {error}");
            std::process::exit(1);
        }
    };

    app.run(|app, event| match event {
        // macOS only: the variant does not exist on the other targets, and an
        // ungated arm is a Linux compile error the macOS gate cannot see.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main(app),
        // Every quit (⌘Q, tray, `quit_app`) funnels through here. The first one
        // is held back so the webview can flush unsaved buffers; the frontend
        // answers by calling `quit_app`, and a timer covers the case where it
        // never does.
        RunEvent::ExitRequested { api, code, .. } => {
            // An update restart arrives here too, and Tauri ignores
            // `prevent_exit` for it, so the handshake below would be a promise
            // this process cannot keep. `installUpdate` flushes before it calls
            // `relaunch` instead.
            if code == Some(tauri::RESTART_EXIT_CODE) {
                return;
            }

            if app.state::<AppState>().quitting.swap(true, Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            if let Err(error) = app.emit("app-quit", ()) {
                log::error!("could not emit {}: {error}", "app-quit");
            }

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
            app.state::<AppState>().pending_open().extend(paths);
            if let Err(error) = app.emit("open-file", ()) {
                log::error!("could not emit {}: {error}", "open-file");
            }
        }
        _ => {}
    });
}
