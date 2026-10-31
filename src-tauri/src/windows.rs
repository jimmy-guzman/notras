use std::sync::{Mutex, PoisonError};

use notras_core::CommandError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::{Store, StoreExt};

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

/// Convert store failures once for both persisted settings, retaining their diagnostic cause.
pub(crate) fn settings_error(error: tauri_plugin_store::Error) -> CommandError {
    use tauri_plugin_store::Error;

    let reason = match &error {
        Error::Io(error) => CommandError::io_reason(error),
        Error::Serialize(source) | Error::Deserialize(source) => {
            if let Some(error) = source.downcast_ref::<std::io::Error>() {
                CommandError::io_reason(error)
            } else if source.is::<serde_json::Error>() {
                "The settings data is invalid".into()
            } else {
                log::error!("unexpected settings data failure: {source}");
                "An unexpected error".into()
            }
        }
        Error::Json(_) => "The settings data is invalid".into(),
        _ => {
            if let Error::Tauri(error) = error {
                return tauri_error(error);
            }
            log::error!("unexpected settings failure: {error}");
            "An unexpected error".into()
        }
    };
    CommandError::with_source(reason, error)
}

fn settings<R: Runtime>(app: &AppHandle<R>) -> Result<std::sync::Arc<Store<R>>, CommandError> {
    app.store("settings.json").map_err(settings_error)
}

/// Set `key` and save the store. A failed save puts the previous value back,
/// so the store never holds a value the next save of another key would write.
/// Every call takes one lock, so another call's save cannot land between this
/// set and its rollback.
pub(crate) fn save_setting<R: Runtime>(
    store: &Store<R>,
    key: &str,
    value: Value,
) -> Result<(), tauri_plugin_store::Error> {
    static SAVING: Mutex<()> = Mutex::new(());
    // The lock guards no data, so a panic in another save leaves nothing to distrust.
    let _saving = SAVING.lock().unwrap_or_else(PoisonError::into_inner);
    let saved = store.get(key);
    store.set(key, value);
    store.save().inspect_err(|_| match saved {
        Some(previous) => store.set(key, previous),
        None => {
            store.delete(key);
        }
    })
}

/// The saved appearance, `Auto` when none was chosen. A value that is not one
/// of the three fails rather than quietly painting the other scheme.
pub(crate) fn stored_appearance<R: Runtime>(store: &Store<R>) -> Result<Appearance, CommandError> {
    store
        .get("appearance")
        .map_or(Ok(Appearance::Auto), |value| {
            serde_json::from_value(value.clone()).map_err(|error| {
                CommandError::with_source(
                    format!("The saved appearance {value} is not auto, light or dark"),
                    error,
                )
            })
        })
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
    stored_appearance(&*settings(&app)?)
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn save_appearance<R: Runtime>(
    store: &Store<R>,
    appearance: Appearance,
) -> Result<(), CommandError> {
    save_setting(store, "appearance", serde_json::json!(appearance)).map_err(settings_error)
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
        use tauri::Manager;

        let store_app = app.clone();
        crate::notes::run_blocking(move || save_appearance(&*settings(&store_app)?, appearance))
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
    use std::{error::Error as _, fs, io};

    #[test]
    fn should_keep_a_missing_settings_file_distinct_from_a_missing_note() {
        let directory = tempfile::tempdir().unwrap();
        let source = fs::read(directory.path().join("settings.json")).unwrap_err();
        let error = settings_error(tauri_plugin_store::Error::Io(source));

        assert_eq!(error.kind, notras_core::ErrorKind::Failed);
        assert_eq!(error.message, "No such file");
        let source = error
            .source()
            .unwrap()
            .downcast_ref::<tauri_plugin_store::Error>()
            .unwrap();
        assert!(
            matches!(source, tauri_plugin_store::Error::Io(error) if error.kind() == io::ErrorKind::NotFound)
        );
    }

    #[test]
    fn should_report_invalid_settings_data_with_its_diagnostic_cause() {
        let source = serde_json::from_str::<Value>("{broken").unwrap_err();
        let error = settings_error(tauri_plugin_store::Error::Deserialize(Box::new(source)));

        assert_eq!(error.kind, notras_core::ErrorKind::Failed);
        assert_eq!(error.message, "The settings data is invalid");
        assert!(error.source().unwrap().is::<tauri_plugin_store::Error>());
    }

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
