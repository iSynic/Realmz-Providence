use std::{
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
};

pub(super) fn check_destination(path: &Path) -> Result<(), String> {
    if !path
        .extension()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("sit"))
    {
        return Err("StuffIt output path must end in .sit".into());
    }
    if path.try_exists().map_err(|error| error.to_string())? {
        return Err(format!(
            "Refusing to overwrite existing StuffIt archive {}",
            path.display()
        ));
    }
    if !path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."))
        .is_dir()
    {
        return Err("StuffIt output parent directory does not exist".into());
    }
    Ok(())
}

pub(super) fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    check_destination(path)?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temporary = tempfile::Builder::new()
        .prefix(".providence-stuffit-")
        .tempfile_in(parent)
        .map_err(|error| error.to_string())?;
    temporary
        .write_all(bytes)
        .map_err(|error| format!("Could not stage StuffIt archive: {error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("Could not sync StuffIt archive: {error}"))?;
    temporary
        .seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    let mut restored = Vec::with_capacity(bytes.len());
    temporary
        .read_to_end(&mut restored)
        .map_err(|error| error.to_string())?;
    if restored != bytes {
        return Err("Staged StuffIt archive did not match its verified bytes".into());
    }
    drop(restored);
    temporary
        .persist_noclobber(path)
        .map_err(|error| format!("Could not publish StuffIt archive: {}", error.error))?;
    #[cfg(unix)]
    std::fs::File::open(parent).and_then(|directory| directory.sync_all()).map_err(|error| format!("Publication outcome unknown: StuffIt archive exists, but directory durability could not be confirmed: {error}"))?;
    Ok(())
}
