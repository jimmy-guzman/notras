use std::fs::File;
use std::io;
use std::path::{Component, Path};

use cap_fs_ext::{DirExt, FollowSymlinks, MetadataExt as _, OpenOptionsFollowExt};
use cap_std::fs::{Dir, Metadata, OpenOptions};

fn symlink_error() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        "the path passes through a symlink",
    )
}

fn open_child(dir: &Dir, name: &str) -> io::Result<Option<Dir>> {
    if dir.symlink_metadata(name)?.is_symlink() {
        return Ok(None);
    }
    dir.open_dir_nofollow(name).map(Some)
}

pub(crate) fn ensure_folder(root: &Dir, folder: &str) -> io::Result<Dir> {
    let mut dir = root.try_clone()?;
    for part in folder.split('/').filter(|part| !part.is_empty()) {
        dir = match open_child(&dir, part) {
            Ok(Some(child)) => child,
            Ok(None) => return Err(symlink_error()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                match dir.create_dir(part) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                    Err(error) => return Err(error),
                }
                open_child(&dir, part)?.ok_or_else(symlink_error)?
            }
            Err(error) => return Err(error),
        };
    }
    Ok(dir)
}

#[derive(Debug)]
pub(crate) struct Located {
    pub(crate) dir: Dir,
    pub(crate) name: String,
}

impl Located {
    fn open(&self, options: &mut OpenOptions) -> io::Result<File> {
        options.follow(FollowSymlinks::No);
        Ok(self.dir.open_with(&self.name, options)?.into_std())
    }

    pub(crate) fn open_read(&self) -> io::Result<File> {
        self.open(OpenOptions::new().read(true))
    }

    pub(crate) fn open_write(&self) -> io::Result<File> {
        self.open(OpenOptions::new().read(true).write(true))
    }

    pub(crate) fn create_new(&self) -> io::Result<File> {
        self.open(OpenOptions::new().write(true).create_new(true))
    }

    pub(crate) fn symlink_metadata(&self) -> io::Result<Metadata> {
        self.dir.symlink_metadata(&self.name)
    }

    pub(crate) fn identity(&self) -> io::Result<(u64, u64)> {
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No);
        let metadata = self.dir.open_with(&self.name, &options)?.metadata()?;
        Ok((metadata.dev(), metadata.ino()))
    }

    pub(crate) fn remove_file(&self) -> io::Result<()> {
        self.dir.remove_file(&self.name)
    }

    pub(crate) fn sibling(&self, name: &str) -> io::Result<Self> {
        Ok(Self {
            dir: self.dir.try_clone()?,
            name: name.to_owned(),
        })
    }
}

/// A nonempty, slash-separated library path with validated components.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct RelativePath(String);

impl RelativePath {
    pub(crate) fn parse(value: &str) -> io::Result<Self> {
        if value.split('/').any(|part| {
            part.trim().is_empty() || part.starts_with('.') || part.contains(['\\', ':', '\0'])
        }) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("invalid note path: {value}"),
            ));
        }
        Ok(Self(value.to_owned()))
    }

    pub(crate) fn from_host(root: &Path, path: &Path) -> io::Result<Self> {
        let relative = path.strip_prefix(root).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "the path is outside the library",
            )
        })?;
        let parts = relative
            .components()
            .map(|component| match component {
                Component::Normal(part) => part.to_str().ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidData, "the path is not valid unicode")
                }),
                _ => Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "invalid note path",
                )),
            })
            .collect::<io::Result<Vec<_>>>()?;
        Self::parse(&parts.join("/"))
    }

    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }

    pub(crate) fn into_string(self) -> String {
        self.0
    }

    pub(crate) fn split(&self) -> (&str, &str) {
        self.0.rsplit_once('/').unwrap_or(("", &self.0))
    }

    pub(crate) fn locate(&self, root: &Dir) -> io::Result<Option<Located>> {
        let (folder, name) = self.split();
        let mut dir = root.try_clone()?;
        for part in folder.split('/').filter(|part| !part.is_empty()) {
            let Some(child) = open_child(&dir, part)? else {
                return Ok(None);
            };
            dir = child;
        }
        match dir.symlink_metadata(name) {
            Ok(metadata) if metadata.is_symlink() => return Ok(None),
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        Ok(Some(Located {
            dir,
            name: name.to_owned(),
        }))
    }

    pub(crate) fn resolve(&self, root: &Dir) -> io::Result<Located> {
        self.locate(root)?.ok_or_else(symlink_error)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use cap_std::ambient_authority;

    use super::*;

    fn root(directory: &Path) -> Dir {
        Dir::open_ambient_dir(directory, ambient_authority()).unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_a_symlinked_parent_when_locating() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "# Outside").unwrap();
        std::os::unix::fs::symlink(outside.path(), directory.path().join("folder")).unwrap();

        let located = RelativePath::parse("folder/note.md")
            .unwrap()
            .locate(&root(directory.path()))
            .unwrap();

        assert!(located.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn should_reject_a_symlinked_final_component_when_opening() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "# Outside").unwrap();
        fs::write(directory.path().join("real.md"), "# Real").unwrap();
        let root = root(directory.path());
        let located = RelativePath::parse("real.md")
            .unwrap()
            .resolve(&root)
            .unwrap();
        fs::remove_file(directory.path().join("real.md")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("note.md"),
            directory.path().join("real.md"),
        )
        .unwrap();

        assert!(located.open_read().is_err());
        assert_eq!(
            fs::read_to_string(outside.path().join("note.md")).unwrap(),
            "# Outside"
        );
    }

    #[test]
    fn should_report_a_missing_parent_as_not_found() {
        let directory = tempfile::tempdir().unwrap();

        let error = RelativePath::parse("missing/note.md")
            .unwrap()
            .locate(&root(directory.path()))
            .unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn should_create_missing_folders_and_reuse_existing_ones() {
        let directory = tempfile::tempdir().unwrap();
        let root = root(directory.path());

        let created = ensure_folder(&root, "projects/atlas").unwrap();
        fs::write(directory.path().join("projects/atlas/note.md"), "# Atlas").unwrap();
        let reused = ensure_folder(&root, "projects/atlas").unwrap();

        assert!(created.symlink_metadata("note.md").unwrap().is_file());
        assert!(reused.symlink_metadata("note.md").unwrap().is_file());
        assert!(ensure_folder(&root, "")
            .unwrap()
            .symlink_metadata("projects")
            .unwrap()
            .is_dir());
    }
}
