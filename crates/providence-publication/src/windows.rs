//! The sole FFI boundary; callers retain safe, type-checked exclusive moves.
use std::{io, os::windows::ffi::OsStrExt, path::Path};

pub(super) fn rename_exclusive(staging: &Path, destination: &Path) -> io::Result<()> {
    let source = wide_path(&staging.canonicalize()?)?;
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()?;
    let name = destination.file_name().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "Publication requires a destination name.",
        )
    })?;
    let target = wide_path(&parent.join(name))?;
    // SAFETY: Both owned buffers are NUL-terminated UTF-16 with no embedded NUL.
    // MoveFileExW consumes their pointers synchronously. Zero flags forbid
    // replacement and cross-volume copy; no handles or pointers escape.
    let moved = unsafe {
        windows_sys::Win32::Storage::FileSystem::MoveFileExW(source.as_ptr(), target.as_ptr(), 0)
    };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn wide_path(path: &Path) -> io::Result<Vec<u16>> {
    let mut value: Vec<_> = path.as_os_str().encode_wide().collect();
    if value.contains(&0) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "A publication path contains NUL.",
        ));
    }
    value.push(0);
    Ok(value)
}
