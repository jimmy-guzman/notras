use tauri::{AppHandle, Runtime};

/// Open quick capture, or focus its existing window.
#[tauri::command]
#[specta::specta]
pub fn show_capture<R: Runtime>(app: AppHandle<R>) {
    crate::open_capture(&app);
}
