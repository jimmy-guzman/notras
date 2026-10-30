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

fn settings<R: Runtime>(app: &AppHandle<R>) -> Result<std::sync::Arc<Store<R>>, CommandError> {
    app.store("settings.json").map_err(|error| {
        CommandError::with_source(format!("The settings could not be opened: {error}"), error)
    })
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
    save_setting(store, "appearance", serde_json::json!(appearance)).map_err(|error| {
        CommandError::with_source(format!("The appearance could not be saved: {error}"), error)
    })
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
        .map_err(|error| {
            CommandError::with_source(
                format!("The appearance could not be painted: {error}"),
                error,
            )
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, appearance);
        Err("Changing the appearance is only available on macOS".into())
    }
}
