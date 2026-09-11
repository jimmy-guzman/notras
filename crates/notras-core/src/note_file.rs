use std::fs::{self, File, Metadata};
use std::io::{self, Read};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Publish a prepared replacement, retaining cleanup until the rename succeeds.
pub(crate) fn persist_replacement(temp: tempfile::NamedTempFile, path: &Path) -> io::Result<()> {
    let mut cleanup = tempfile::TempPath::try_from_path(temp.path())?;
    // keep clears Windows temporary attributes; std's rename also supports
    // replacing an open destination, unlike tempfile's MoveFileEx-only path.
    let (_file, _) = temp.keep().map_err(|error| error.error)?;
    fs::rename(&cleanup, path)?;
    cleanup.disable_cleanup(true);
    Ok(())
}

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
    fn should_clean_up_the_temporary_file_when_publication_fails() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("occupied");
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("note.md"), "original").unwrap();
        let replacement = tempfile::NamedTempFile::new_in(directory.path()).unwrap();
        let temporary = replacement.path().to_owned();
        fs::write(&temporary, "replacement").unwrap();

        assert!(persist_replacement(replacement, &destination).is_err());
        assert_eq!(
            fs::read_to_string(destination.join("note.md")).unwrap(),
            "original"
        );
        assert!(!temporary.exists());
    }

    #[cfg(windows)]
    #[test]
    fn should_publish_without_the_windows_temporary_attribute() {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_TEMPORARY: u32 = 0x100;
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("note.md");
        fs::write(&destination, "original").unwrap();
        let replacement = tempfile::NamedTempFile::new_in(directory.path()).unwrap();
        fs::write(replacement.path(), "replacement").unwrap();

        persist_replacement(replacement, &destination).unwrap();

        assert_eq!(fs::read_to_string(&destination).unwrap(), "replacement");
        assert_eq!(
            fs::metadata(destination).unwrap().file_attributes() & FILE_ATTRIBUTE_TEMPORARY,
            0
        );
    }

    #[cfg(windows)]
    #[test]
    fn should_preserve_the_destination_when_a_reader_denies_delete_sharing() {
        use std::os::windows::fs::OpenOptionsExt;

        const FILE_SHARE_READ: u32 = 1;
        const FILE_SHARE_WRITE: u32 = 2;
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("note.md");
        fs::write(&destination, "original").unwrap();
        let _reader = File::options()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&destination)
            .unwrap();
        let replacement = tempfile::NamedTempFile::new_in(directory.path()).unwrap();
        let temporary = replacement.path().to_owned();
        fs::write(&temporary, "replacement").unwrap();

        assert!(persist_replacement(replacement, &destination).is_err());
        assert_eq!(fs::read_to_string(&destination).unwrap(), "original");
        assert!(!temporary.exists());
    }

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
        persist_replacement(replacement, &path).unwrap();

        assert_eq!(
            opened.metadata().unwrap().modified().unwrap(),
            original_time
        );
        assert_eq!(opened.read().unwrap(), "original");
        assert_eq!(fs::read_to_string(path).unwrap(), "replacement");
    }
}
