use std::fs::{self, File, Metadata};
use std::io;
use std::path::{Path, PathBuf};

/// An opened note, retained while its content and metadata are read.
pub(crate) struct OpenedNote {
    file: File,
    path: PathBuf,
}

impl OpenedNote {
    pub(crate) fn open(path: &Path) -> io::Result<Self> {
        Ok(Self {
            file: File::open(path)?,
            path: path.to_owned(),
        })
    }

    pub(crate) fn metadata(&self) -> io::Result<Metadata> {
        self.file.metadata()
    }

    pub(crate) fn read(self) -> io::Result<String> {
        fs::read_to_string(self.path)
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, UNIX_EPOCH};

    use super::*;

    #[test]
    fn should_read_the_opened_file_after_its_path_is_atomically_replaced() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("note.md");
        fs::write(&path, "original").unwrap();
        let original_time = UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(original_time))
            .unwrap();
        let opened = OpenedNote::open(&path).unwrap();
        let replacement = tempfile::NamedTempFile::new_in(directory.path()).unwrap();
        fs::write(replacement.path(), "replacement").unwrap();
        replacement
            .as_file()
            .set_times(fs::FileTimes::new().set_modified(original_time + Duration::from_secs(60)))
            .unwrap();
        replacement.persist(&path).unwrap();

        assert_eq!(
            opened.metadata().unwrap().modified().unwrap(),
            original_time
        );
        assert_eq!(opened.read().unwrap(), "original");
        assert_eq!(fs::read_to_string(path).unwrap(), "replacement");
    }
}
