use std::fs::{File, Metadata};
use std::io::{self, Read};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn timestamp_millis(time: io::Result<SystemTime>) -> io::Result<i64> {
    let duration = time?.duration_since(UNIX_EPOCH).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "the file timestamp precedes the epoch",
        )
    })?;
    i64::try_from(duration.as_millis()).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "the file timestamp is too large",
        )
    })
}

/// An opened note, retained while its content and metadata are read.
pub(crate) struct OpenedNote {
    file: File,
}

impl OpenedNote {
    pub(crate) fn open(path: &Path) -> io::Result<Self> {
        Ok(Self {
            file: File::open(path)?,
        })
    }

    pub(crate) fn metadata(&self) -> io::Result<Metadata> {
        self.file.metadata()
    }

    pub(crate) fn read(mut self) -> io::Result<String> {
        let mut content = String::new();
        self.file.read_to_string(&mut content)?;
        Ok(content)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
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
