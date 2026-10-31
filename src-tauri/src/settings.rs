use std::fs::{self, File};
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use notras_core::CommandError;
use serde_json::{Map, Value};
use tempfile::NamedTempFile;

use crate::windows::Appearance;

fn io_error(error: io::Error) -> CommandError {
    CommandError::with_source(CommandError::io_reason(&error), error)
}

fn appearance(values: &Map<String, Value>) -> Result<Appearance, CommandError> {
    values
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

fn notes_dir(values: &Map<String, Value>) -> Result<Option<PathBuf>, CommandError> {
    values
        .get("notesDir")
        .map(|value| {
            let path: String = serde_json::from_value(value.clone()).map_err(|error| {
                CommandError::with_source("The saved notes folder is not a path", error)
            })?;
            if path.is_empty() || path.contains('\0') {
                return Err(CommandError::with_source(
                    "The saved notes folder is not a path",
                    io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "the notes folder is empty or contains a null byte",
                    ),
                ));
            }
            Ok(PathBuf::from(path))
        })
        .transpose()
}

/// Owns the settings snapshot. A failed publication leaves the snapshot and destination intact.
pub(crate) struct Settings {
    path: PathBuf,
    values: Mutex<Map<String, Value>>,
}

impl Settings {
    fn values(&self) -> MutexGuard<'_, Map<String, Value>> {
        self.values.lock().expect("settings state was poisoned")
    }

    fn save_with(
        &self,
        key: &str,
        value: Value,
        write: impl FnOnce(&mut File, &[u8]) -> io::Result<()>,
    ) -> Result<(), CommandError> {
        let mut values = self.values();
        let mut proposed = values.clone();
        proposed.insert(key.into(), value);
        appearance(&proposed)?;
        notes_dir(&proposed)?;
        let bytes = serde_json::to_vec_pretty(&proposed)
            .map_err(|error| CommandError::with_source("The settings data is invalid", error))?;
        let parent = self.path.parent().ok_or_else(|| {
            CommandError::with_source(
                "The settings path has no parent folder",
                io::Error::from(io::ErrorKind::InvalidInput),
            )
        })?;
        fs::create_dir_all(parent).map_err(io_error)?;
        let mut staged = NamedTempFile::new_in(parent).map_err(io_error)?;
        write(staged.as_file_mut(), &bytes).map_err(io_error)?;
        staged.as_file().sync_all().map_err(io_error)?;
        staged
            .persist(&self.path)
            .map_err(|error| io_error(error.error))?;
        *values = proposed;
        Ok(())
    }

    fn save(&self, key: &str, value: Value) -> Result<(), CommandError> {
        self.save_with(key, value, |file, bytes| file.write_all(bytes))
    }

    /// Read and validate existing settings without writing. Only an absent file permits defaults.
    pub(crate) fn load(path: PathBuf) -> Result<Self, CommandError> {
        let values = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| {
                CommandError::with_source("The settings data is invalid", error)
            })?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                // A dangling symlink is an existing, unreadable setting, not a first launch.
                match fs::symlink_metadata(&path) {
                    Err(missing) if missing.kind() == io::ErrorKind::NotFound => Map::new(),
                    Ok(_) => return Err(io_error(error)),
                    Err(error) => return Err(io_error(error)),
                }
            }
            Err(error) => return Err(io_error(error)),
        };
        appearance(&values)?;
        notes_dir(&values)?;
        Ok(Self {
            path,
            values: Mutex::new(values),
        })
    }

    pub(crate) fn appearance(&self) -> Result<Appearance, CommandError> {
        appearance(&self.values())
    }

    pub(crate) fn notes_dir(&self) -> Result<Option<PathBuf>, CommandError> {
        notes_dir(&self.values())
    }

    #[cfg(any(target_os = "macos", test))]
    pub(crate) fn save_appearance(&self, value: Appearance) -> Result<(), CommandError> {
        self.save("appearance", serde_json::json!(value))
    }

    pub(crate) fn save_notes_dir(&self, path: &str) -> Result<(), CommandError> {
        self.save("notesDir", Value::String(path.into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error as _;
    use std::sync::Barrier;

    use notras_core::ErrorKind;
    use serde_json::json;

    #[test]
    fn should_use_first_launch_defaults_without_creating_settings() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("absent/settings.json");
        let settings = Settings::load(path.clone()).unwrap();
        assert_eq!(settings.appearance().unwrap(), Appearance::Auto);
        assert_eq!(settings.notes_dir().unwrap(), None);
        drop(settings);
        assert!(!path.parent().unwrap().exists());
    }

    #[test]
    fn should_save_and_reload_both_settings_without_losing_unknown_keys() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let original = br#"{ "future": {"nested": [true, null, 42]}, "appearance": "auto" }"#;
        fs::write(&path, original).unwrap();
        let settings = Settings::load(path.clone()).unwrap();
        assert_eq!(fs::read(&path).unwrap(), original);
        settings.save_appearance(Appearance::Dark).unwrap();
        settings.save_notes_dir("/notes/chosen").unwrap();
        drop(settings);
        let loaded = Settings::load(path.clone()).unwrap();
        assert_eq!(loaded.appearance().unwrap(), Appearance::Dark);
        assert_eq!(
            loaded.notes_dir().unwrap(),
            Some(PathBuf::from("/notes/chosen"))
        );
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(path).unwrap()).unwrap(),
            json!({
                "appearance": "dark", "future": {"nested": [true, null, 42]}, "notesDir": "/notes/chosen"
            })
        );
    }

    #[test]
    fn should_preserve_the_file_and_snapshot_after_a_partial_write_fails() {
        for (key, value) in [
            ("appearance", json!("dark")),
            ("notesDir", json!("/notes/new")),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("settings.json");
            let original =
                br#"{ "appearance": "light", "notesDir": "/notes/old", "future": [1, 2] }"#;
            fs::write(&path, original).unwrap();
            let settings = Settings::load(path.clone()).unwrap();
            let error = settings
                .save_with(key, value, |file, bytes| {
                    file.write_all(&bytes[..bytes.len() / 2])?;
                    assert!(file.metadata()?.len() > 0);
                    Err(io::Error::from(io::ErrorKind::StorageFull))
                })
                .unwrap_err();
            assert_eq!(error.kind, ErrorKind::Failed);
            assert_eq!(error.message, "The disk is full");
            assert!(error.source().unwrap().is::<io::Error>());
            assert_eq!(fs::read(&path).unwrap(), original);
            assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
            assert_eq!(settings.appearance().unwrap(), Appearance::Light);
            assert_eq!(
                settings.notes_dir().unwrap(),
                Some(PathBuf::from("/notes/old"))
            );
            let loaded = Settings::load(path.clone()).unwrap();
            assert_eq!(loaded.appearance().unwrap(), Appearance::Light);
            assert_eq!(
                loaded.notes_dir().unwrap(),
                Some(PathBuf::from("/notes/old"))
            );

            if key == "appearance" {
                settings.save_notes_dir("/notes/success").unwrap();
            } else {
                settings.save_appearance(Appearance::Auto).unwrap();
            }
            drop(settings);
            let loaded = Settings::load(path.clone()).unwrap();
            if key == "appearance" {
                assert_eq!(loaded.appearance().unwrap(), Appearance::Light);
                assert_eq!(
                    loaded.notes_dir().unwrap(),
                    Some(PathBuf::from("/notes/success"))
                );
            } else {
                assert_eq!(loaded.appearance().unwrap(), Appearance::Auto);
                assert_eq!(
                    loaded.notes_dir().unwrap(),
                    Some(PathBuf::from("/notes/old"))
                );
            }
            assert_eq!(
                serde_json::from_slice::<Value>(&fs::read(path).unwrap()).unwrap()["future"],
                json!([1, 2])
            );
        }
    }

    #[test]
    fn should_preserve_the_destination_and_snapshot_when_replacement_fails() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let settings = Settings::load(path.clone()).unwrap();
        settings.save_appearance(Appearance::Light).unwrap();
        let original = directory.path().join("original.json");
        fs::rename(&path, &original).unwrap();
        fs::create_dir(&path).unwrap();
        fs::write(path.join("entry"), "keep").unwrap();

        let error = settings.save_appearance(Appearance::Dark).unwrap_err();
        assert_eq!(error.kind, ErrorKind::Failed);
        assert!(error.source().unwrap().is::<io::Error>());
        assert_eq!(fs::read_to_string(path.join("entry")).unwrap(), "keep");
        assert_eq!(settings.appearance().unwrap(), Appearance::Light);
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
        fs::remove_file(path.join("entry")).unwrap();
        fs::remove_dir(&path).unwrap();
        fs::rename(original, &path).unwrap();
        settings.save_notes_dir("/notes").unwrap();
        assert_eq!(
            Settings::load(path).unwrap().appearance().unwrap(),
            Appearance::Light
        );
    }

    #[test]
    fn should_reject_malformed_json_without_changing_the_file() {
        for original in ["{broken", "[]", "null", "42"] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("settings.json");
            fs::write(&path, original).unwrap();
            let error = Settings::load(path.clone()).err().unwrap();
            assert_eq!(error.kind, ErrorKind::Failed);
            assert_eq!(error.message, "The settings data is invalid");
            assert!(error.source().unwrap().is::<serde_json::Error>());
            assert_eq!(fs::read_to_string(path).unwrap(), original);
        }
    }

    #[test]
    fn should_reject_invalid_known_values_without_changing_the_file() {
        for original in [
            json!({"appearance": "sepia"}),
            json!({"appearance": null}),
            json!({"appearance": 1}),
            json!({"notesDir": null}),
            json!({"notesDir": []}),
            json!({"notesDir": ""}),
            json!({"notesDir": "a\0b"}),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("settings.json");
            let bytes = serde_json::to_vec(&original).unwrap();
            fs::write(&path, &bytes).unwrap();
            let error = Settings::load(path.clone()).err().unwrap();
            assert_eq!(error.kind, ErrorKind::Failed);
            assert!(error.source().is_some());
            assert_eq!(fs::read(path).unwrap(), bytes);
        }
    }

    #[test]
    fn should_reject_unreadable_settings_without_treating_them_as_first_launch() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        fs::create_dir(&path).unwrap();
        let error = Settings::load(path.clone()).err().unwrap();
        assert_eq!(error.kind, ErrorKind::Failed);
        assert!(error.source().unwrap().is::<io::Error>());
        assert!(path.is_dir());
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_a_dangling_settings_symlink_without_replacing_it() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let missing = directory.path().join("missing");
        std::os::unix::fs::symlink(&missing, &path).unwrap();
        let error = Settings::load(path.clone()).err().unwrap();
        assert_eq!(error.kind, ErrorKind::Failed);
        assert_eq!(error.message, "No such file");
        assert_eq!(
            error
                .source()
                .unwrap()
                .downcast_ref::<io::Error>()
                .unwrap()
                .kind(),
            io::ErrorKind::NotFound
        );
        assert_eq!(fs::read_link(path).unwrap(), missing);
    }

    #[test]
    fn should_keep_concurrent_updates_to_both_settings_after_reloading() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        let settings = Settings::load(path.clone()).unwrap();
        let barrier = Barrier::new(2);
        std::thread::scope(|scope| {
            scope.spawn(|| {
                barrier.wait();
                for _ in 0..20 {
                    settings.save_appearance(Appearance::Dark).unwrap();
                }
            });
            scope.spawn(|| {
                barrier.wait();
                for _ in 0..20 {
                    settings.save_notes_dir("/notes/concurrent").unwrap();
                }
            });
        });
        assert_eq!(settings.appearance().unwrap(), Appearance::Dark);
        assert_eq!(
            settings.notes_dir().unwrap(),
            Some(PathBuf::from("/notes/concurrent"))
        );
        let loaded = Settings::load(path).unwrap();
        assert_eq!(loaded.appearance().unwrap(), Appearance::Dark);
        assert_eq!(
            loaded.notes_dir().unwrap(),
            Some(PathBuf::from("/notes/concurrent"))
        );
    }
}
