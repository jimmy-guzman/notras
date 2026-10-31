use notras_core::CommandError;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::settings::Settings;

/// The scheme the app paints in. `Auto` follows the system.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    Auto,
    Light,
    Dark,
}

#[cfg(target_os = "macos")]
impl Appearance {
    /// The theme to force on the app, or `None` to follow the system.
    pub(crate) fn theme(self) -> Option<tauri::Theme> {
        match self {
            Self::Auto => None,
            Self::Light => Some(tauri::Theme::Light),
            Self::Dark => Some(tauri::Theme::Dark),
        }
    }
}

/// Convert shell failures without giving a missing resource the meaning of a deleted note.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn tauri_error(error: tauri::Error) -> CommandError {
    let reason = match &error {
        tauri::Error::Io(error) | tauri::Error::CurrentDir(error) => CommandError::io_reason(error),
        tauri::Error::UnknownPath => "The app data folder is unavailable".into(),
        tauri::Error::WindowNotFound => "The window is no longer available".into(),
        tauri::Error::WebviewNotFound => "The webview is no longer available".into(),
        // Both dispatch sites can fail when the runtime's event loop has closed.
        tauri::Error::Runtime(_) => "The app's event loop is unavailable".into(),
        _ => {
            log::error!("unexpected shell failure: {error}");
            "An unexpected error".into()
        }
    };
    CommandError::with_source(reason, error)
}

/// Open quick capture, or focus its existing window.
#[tauri::command]
#[specta::specta]
pub fn show_capture<R: Runtime>(app: AppHandle<R>) {
    crate::open_capture(&app);
}

#[tauri::command]
#[specta::specta]
pub fn get_appearance<R: Runtime>(app: AppHandle<R>) -> Result<Appearance, CommandError> {
    app.state::<Settings>().appearance()
}

/// Save the appearance, then paint it. A choice the next launch would forget
/// is not applied. macOS only: on Linux tao rewrites GTK's "prefer dark" for
/// the whole app on every window it creates and every desktop change, so a
/// forced appearance does not hold there.
#[tauri::command]
#[specta::specta]
pub async fn set_appearance<R: Runtime>(
    app: AppHandle<R>,
    appearance: Appearance,
) -> Result<(), CommandError> {
    #[cfg(target_os = "macos")]
    {
        let store_app = app.clone();
        crate::notes::run_blocking(move || {
            store_app.state::<Settings>().save_appearance(appearance)
        })
        .await?;
        // `NSApp.setAppearance` posts no theme change, so `ThemeChanged` never
        // repaints the window layers. On the main thread `set_theme` lands
        // before the windows are read.
        let handle = app.clone();
        app.run_on_main_thread(move || {
            handle.set_theme(appearance.theme());
            for window in handle.webview_windows().values() {
                let painted = window.theme().and_then(|theme| {
                    window.set_background_color(Some(crate::background_for(theme)))
                });
                if let Err(error) = painted {
                    log::error!("could not paint the {} window: {error}", window.label());
                }
            }
        })
        .map_err(tauri_error)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, appearance);
        Err("Changing the appearance is only available on macOS".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error as _;

    #[test]
    fn should_report_unavailable_native_resources_without_losing_the_cause() {
        for (source, reason) in [
            (
                tauri::Error::WindowNotFound,
                "The window is no longer available",
            ),
            (
                tauri::Error::WebviewNotFound,
                "The webview is no longer available",
            ),
            (
                tauri::Error::UnknownPath,
                "The app data folder is unavailable",
            ),
        ] {
            let error = tauri_error(source);
            assert_eq!(error.kind, notras_core::ErrorKind::Failed);
            assert_eq!(error.message, reason);
            assert!(error.source().unwrap().is::<tauri::Error>());
        }
    }
}
