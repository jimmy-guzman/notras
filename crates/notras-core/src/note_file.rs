use std::fs::{File, Metadata};
use std::io::{self, Read};
use std::process;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use cap_std::fs::{Dir, OpenOptions};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(unix)]
fn rename(dir: &Dir, from: &str, _file: &File, to: &str, replace: bool) -> io::Result<bool> {
    if replace {
        dir.rename(from, dir, to)?;
        return Ok(true);
    }
    rename_noclobber(dir, from, to)
}

#[cfg(any(target_os = "linux", target_vendor = "apple"))]
fn rename_noclobber(dir: &Dir, from: &str, to: &str) -> io::Result<bool> {
    use rustix::fs::RenameFlags;
    use rustix::io::Errno;

    match rustix::fs::renameat_with(dir, from, dir, to, RenameFlags::NOREPLACE) {
        Ok(()) => Ok(true),
        Err(Errno::INVAL | Errno::NOSYS | Errno::NOTSUP) => link_then_unlink(dir, from, to),
        Err(error) => Err(error.into()),
    }
}

#[cfg(all(unix, not(any(target_os = "linux", target_vendor = "apple"))))]
fn rename_noclobber(dir: &Dir, from: &str, to: &str) -> io::Result<bool> {
    link_then_unlink(dir, from, to)
}

#[cfg(unix)]
fn link_then_unlink(dir: &Dir, from: &str, to: &str) -> io::Result<bool> {
    dir.hard_link(from, dir, to)?;
    match dir.remove_file(from) {
        Ok(()) => Ok(true),
        Err(error) => {
            log::warn!("published {to}, but could not remove its sibling {from}: {error}");
            Ok(false)
        }
    }
}

#[cfg(windows)]
fn rename(dir: &Dir, _from: &str, file: &File, to: &str, replace: bool) -> io::Result<bool> {
    use std::os::windows::io::AsRawHandle;

    use windows_sys::Wdk::Storage::FileSystem::{
        FileRenameInformation, FileRenameInformationEx, NtSetInformationFile,
        FILE_RENAME_INFORMATION, FILE_RENAME_POSIX_SEMANTICS, FILE_RENAME_REPLACE_IF_EXISTS,
    };
    use windows_sys::Win32::Foundation::{
        RtlNtStatusToDosError, STATUS_INVALID_INFO_CLASS, STATUS_INVALID_PARAMETER,
        STATUS_NOT_SUPPORTED, STATUS_SUCCESS,
    };
    use windows_sys::Win32::System::IO::IO_STATUS_BLOCK;

    let name: Vec<u16> = to.encode_utf16().collect();
    let size =
        std::mem::size_of::<FILE_RENAME_INFORMATION>() + name.len() * std::mem::size_of::<u16>();
    let mut buffer = vec![0u64; size.div_ceil(std::mem::size_of::<u64>())];
    let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFORMATION>();
    let flags = if replace {
        FILE_RENAME_POSIX_SEMANTICS | FILE_RENAME_REPLACE_IF_EXISTS
    } else {
        FILE_RENAME_POSIX_SEMANTICS
    };
    // SAFETY: `buffer` is u64-aligned and at least `size` bytes, which covers the
    // header and the whole name; the API defines FileName as a one-element array
    // that the caller extends past the end of the struct.
    unsafe {
        (*info).Anonymous.Flags = flags;
        (*info).RootDirectory = dir.as_raw_handle();
        (*info).FileNameLength = (name.len() * std::mem::size_of::<u16>()) as u32;
        std::ptr::copy_nonoverlapping(
            name.as_ptr(),
            (&raw mut (*info).FileName).cast::<u16>(),
            name.len(),
        );
    }
    let attempt = move |class| {
        let mut status_block = IO_STATUS_BLOCK::default();
        // SAFETY: `info` points at `size` initialized bytes laid out as the class expects,
        // and both handles stay open for the duration of the call.
        unsafe {
            NtSetInformationFile(
                file.as_raw_handle(),
                &mut status_block,
                info.cast(),
                size as u32,
                class,
            )
        }
    };
    let mut status = attempt(FileRenameInformationEx);
    if [
        STATUS_INVALID_INFO_CLASS,
        STATUS_INVALID_PARAMETER,
        STATUS_NOT_SUPPORTED,
    ]
    .contains(&status)
    {
        // SAFETY: same buffer as above; the union member switches to the older class's field.
        unsafe {
            (*info).Anonymous.ReplaceIfExists = replace;
        }
        status = attempt(FileRenameInformation);
    }
    if status == STATUS_SUCCESS {
        return Ok(true);
    }
    // SAFETY: a status-code translation that reads no memory.
    let code = unsafe { RtlNtStatusToDosError(status) };
    Err(io::Error::from_raw_os_error(code as i32))
}

pub(crate) struct TempSibling {
    dir: Dir,
    name: String,
    file: File,
    armed: bool,
}

impl TempSibling {
    pub(crate) fn create(dir: &Dir) -> io::Result<Self> {
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(true);
        #[cfg(windows)]
        {
            use cap_std::fs::OpenOptionsExt as _;
            use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
            use windows_sys::Win32::Storage::FileSystem::DELETE;

            options.access_mode(GENERIC_READ | GENERIC_WRITE | DELETE);
        }
        loop {
            let name = format!(
                ".tmp-{}-{}",
                process::id(),
                TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
            );
            match dir.open_with(&name, &options) {
                Ok(file) => {
                    return Ok(Self {
                        dir: dir.try_clone()?,
                        name,
                        file: file.into_std(),
                        armed: true,
                    })
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
    }

    pub(crate) fn file(&self) -> &File {
        &self.file
    }

    pub(crate) fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    pub(crate) fn replace(&mut self, target: &str) -> io::Result<()> {
        self.armed = !rename(&self.dir, &self.name, &self.file, target, true)?;
        Ok(())
    }

    pub(crate) fn publish(&mut self, target: &str) -> io::Result<()> {
        self.armed = !rename(&self.dir, &self.name, &self.file, target, false)?;
        Ok(())
    }
}

impl Drop for TempSibling {
    fn drop(&mut self) {
        if self.armed {
            let _ = self.dir.remove_file(&self.name);
        }
    }
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
    pub(crate) fn new(file: File) -> Self {
        Self { file }
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
    use std::io::Write;
    use std::path::Path;
    use std::time::Duration;

    use cap_std::ambient_authority;

    use super::*;

    fn root(directory: &Path) -> Dir {
        Dir::open_ambient_dir(directory, ambient_authority()).unwrap()
    }

    fn sibling(dir: &Dir, content: &str) -> (TempSibling, String) {
        let mut temp = TempSibling::create(dir).unwrap();
        temp.file_mut().write_all(content.as_bytes()).unwrap();
        let name = temp.name.clone();
        (temp, name)
    }

    #[test]
    fn should_clean_up_the_temporary_file_when_publication_fails() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("occupied")).unwrap();
        fs::write(directory.path().join("occupied/note.md"), "original").unwrap();
        let (mut temp, name) = sibling(&root(directory.path()), "replacement");

        assert!(temp.replace("occupied").is_err());
        drop(temp);

        assert_eq!(
            fs::read_to_string(directory.path().join("occupied/note.md")).unwrap(),
            "original"
        );
        assert!(!directory.path().join(name).exists());
    }

    #[test]
    fn should_refuse_to_publish_over_an_existing_file_and_keep_the_sibling() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "original").unwrap();
        let (mut temp, name) = sibling(&root(directory.path()), "replacement");

        let error = temp.publish("note.md").unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert!(directory.path().join(&name).exists());
        temp.publish("other.md").unwrap();
        assert_eq!(
            fs::read_to_string(directory.path().join("note.md")).unwrap(),
            "original"
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("other.md")).unwrap(),
            "replacement"
        );
        assert!(!directory.path().join(name).exists());
    }

    #[cfg(windows)]
    #[test]
    fn should_publish_without_the_windows_temporary_attribute() {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_TEMPORARY: u32 = 0x100;
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("note.md"), "original").unwrap();
        let (mut temp, _) = sibling(&root(directory.path()), "replacement");

        temp.replace("note.md").unwrap();

        let destination = directory.path().join("note.md");
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
        let (mut temp, name) = sibling(&root(directory.path()), "replacement");

        assert!(temp.replace("note.md").is_err());
        drop(temp);

        assert_eq!(fs::read_to_string(&destination).unwrap(), "original");
        assert!(!directory.path().join(name).exists());
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
        let opened = OpenedNote::new(File::open(&path).unwrap());
        let (mut temp, _) = sibling(&root(directory.path()), "replacement");
        temp.file()
            .set_times(fs::FileTimes::new().set_modified(original_time + Duration::from_secs(60)))
            .unwrap();
        temp.replace("note.md").unwrap();

        assert_eq!(
            opened.metadata().unwrap().modified().unwrap(),
            original_time
        );
        assert_eq!(opened.read().unwrap(), "original");
        assert_eq!(fs::read_to_string(path).unwrap(), "replacement");
    }
}
