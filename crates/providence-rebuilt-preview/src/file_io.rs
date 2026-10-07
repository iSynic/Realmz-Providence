use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::Path};
use tempfile::NamedTempFile;

pub(super) fn require_absolute_file(path: &Path, label: &str) -> Result<(), String> {
    if !path.is_absolute() || !path.is_file() {
        return Err(format!("{label} must be an existing absolute file path"));
    }
    Ok(())
}

pub(super) fn require_new_absolute_file(path: &Path, label: &str) -> Result<(), String> {
    if !path.is_absolute() {
        return Err(format!("{label} path must be absolute"));
    }
    if path.exists() {
        return Err(format!("{label} path already exists"));
    }
    if !path.parent().is_some_and(Path::is_dir) {
        return Err(format!("{label} parent directory does not exist"));
    }
    Ok(())
}

pub(super) fn write_json_noclobber(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().expect("absolute file has a parent");
    let mut bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    std::io::Write::write_all(&mut temporary, &bytes).map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist_noclobber(path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

pub(super) fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub(super) fn is_lower_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}
