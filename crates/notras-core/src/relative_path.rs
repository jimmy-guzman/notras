use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

pub(crate) fn reject_symlink(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_symlink() => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "the path passes through a symlink",
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
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

    /// Resolve a direct operation, rejecting existing symlinked components.
    pub(crate) fn resolve(&self, root: &Path) -> io::Result<PathBuf> {
        self.resolve_for_scan(root)?.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "the path passes through a symlink",
            )
        })
    }

    /// Resolve a scan candidate, returning `None` for a symlinked component.
    /// Missing descendants remain paths so callers can reconcile deleted notes.
    pub(crate) fn resolve_for_scan(&self, root: &Path) -> io::Result<Option<PathBuf>> {
        let mut path = root.to_owned();
        for part in self.0.split('/') {
            path.push(part);
            match fs::symlink_metadata(&path) {
                Ok(metadata) if metadata.is_symlink() => return Ok(None),
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => break,
                Err(error) => return Err(error),
            }
        }
        Ok(Some(root.join(&self.0)))
    }
}
