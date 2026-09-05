use tauri::AppHandle;

/// The palette's door onto quick capture. The tray and the global shortcut call
/// `open_capture` directly; the webview needs a command.
///
/// It lives here rather than beside `open_capture` because `generate_handler!`
/// re-imports a command's generated macros into its own module, which collides
/// with the definition when both sit in `lib.rs`.
#[tauri::command]
pub fn show_capture(app: AppHandle) {
    crate::open_capture(&app);
}
