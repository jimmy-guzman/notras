use std::io;

use cap_fs_ext::DirExt;
use cap_std::fs::Dir;
use serde::Serialize;

use crate::application::CommandError;
use crate::relative_path::join;
use crate::Library;

const IMAGE_EXTENSIONS: [&str; 6] = ["gif", "jpeg", "jpg", "png", "svg", "webp"];

pub(crate) fn is_image_path(path: &str) -> bool {
    path.rsplit_once('.').is_some_and(|(_, extension)| {
        IMAGE_EXTENSIONS
            .iter()
            .any(|known| extension.eq_ignore_ascii_case(known))
    })
}

/// What a walk found, and the folders it could not list, whose images a miss
/// cannot rule out.
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Default, Serialize)]
pub struct ImageList {
    /// Relative paths, in no promised order.
    pub paths: Vec<String>,
    pub unreadable: Vec<String>,
}

/// A folder that cannot be listed leaves out its images and no others. A child
/// opens only when the walk reaches it, so open handles follow folder depth.
fn collect_images(dir: &Dir, relative: &str, found: &mut ImageList) -> io::Result<()> {
    for entry in dir.entries()? {
        let entry = entry?;
        let name = entry.file_name();
        // A wikilink is text, so no title can name a file whose name is not.
        let Some(name) = name.to_str() else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        let child = join(relative, name);
        let kind = entry.file_type()?;
        if kind.is_dir() {
            let listed = dir
                .open_dir_nofollow(name)
                .and_then(|folder| collect_images(&folder, &child, found));
            if let Err(error) = listed {
                log::warn!("could not list {child}: {error}");
                found.unreadable.push(child);
            }
        } else if kind.is_file() && is_image_path(name) {
            found.paths.push(child);
        }
    }
    Ok(())
}

/// A walk of one library's images, taken apart from the library so the host can
/// run it without holding its operation lock.
#[derive(Debug)]
pub struct ImageWalk {
    root: Dir,
}

impl ImageWalk {
    /// Every image in the library. Hidden and symlinked entries are skipped the
    /// way a scan skips them.
    pub fn list(self) -> Result<ImageList, CommandError> {
        let mut found = ImageList::default();
        collect_images(&self.root, "", &mut found)?;
        Ok(found)
    }
}

impl Library {
    /// Begin a walk bound to this library's handle, independent of index health.
    pub fn image_walk(&self) -> Result<ImageWalk, CommandError> {
        Ok(ImageWalk {
            root: self.root.try_clone()?,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::is_image_path;
    use crate::Library;

    fn listed(library: &Library) -> Vec<String> {
        let mut images = library.image_walk().unwrap().list().unwrap().paths;
        images.sort();
        images
    }

    #[test]
    fn should_list_images_in_every_folder_the_attachments_store_included() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir_all(directory.path().join("attachments")).unwrap();
        fs::create_dir_all(directory.path().join("trips/2026")).unwrap();
        fs::write(directory.path().join("cover.PNG"), [0]).unwrap();
        fs::write(directory.path().join("attachments/shot.png"), [0]).unwrap();
        fs::write(directory.path().join("trips/2026/map.svg"), [0]).unwrap();
        fs::write(directory.path().join("trips/plan.md"), "# Plan").unwrap();
        fs::write(directory.path().join("trips/ticket.pdf"), [0]).unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        assert_eq!(
            listed(&library),
            ["attachments/shot.png", "cover.PNG", "trips/2026/map.svg"]
        );
    }

    #[test]
    fn should_skip_hidden_entries() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".trash")).unwrap();
        fs::write(directory.path().join(".trash/old.png"), [0]).unwrap();
        fs::write(directory.path().join(".secret.png"), [0]).unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        assert!(listed(&library).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn should_skip_symlinked_files_and_folders() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("away.png"), [0]).unwrap();
        std::os::unix::fs::symlink(outside.path(), directory.path().join("linked")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("away.png"),
            directory.path().join("link.png"),
        )
        .unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();

        assert!(listed(&library).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn should_keep_the_images_it_can_reach_past_an_unreadable_folder() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().unwrap();
        let locked = directory.path().join("locked");
        fs::create_dir(&locked).unwrap();
        fs::write(locked.join("hidden-away.png"), [0]).unwrap();
        fs::write(directory.path().join("open.png"), [0]).unwrap();
        let library = Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

        let images = library.image_walk().unwrap().list().unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();

        assert_eq!(images.paths, ["open.png"]);
        assert_eq!(images.unreadable, ["locked"]);
    }

    #[test]
    fn should_recognize_the_image_names_the_editor_does() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/image-names.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            assert_eq!(
                is_image_path(name),
                case["image"].as_bool().unwrap(),
                "{name}"
            );
        }
    }
}
