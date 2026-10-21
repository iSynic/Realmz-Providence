use super::model::Format;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const BYTE_LIMIT: u64 = 1024 * 1024 * 1024;

pub(super) fn digest(path: &Path, format: Format) -> Result<(String, u64), String> {
    let kind = fs::symlink_metadata(path)
        .map_err(|error| error.to_string())?
        .file_type();
    if (format == Format::Rebuilt && !kind.is_file())
        || (format == Format::Classic && !kind.is_dir())
    {
        return Err("export-output-invalid: output must have its declared native type, without symbolic links".into());
    }
    if format == Format::Rebuilt {
        let mut hash = Sha256::new();
        let size = feed_file(path, &mut hash, 0)?;
        return Ok((format!("{:x}", hash.finalize()), size));
    }
    let mut files = Vec::new();
    inventory(path, path, 0, &mut files, &mut 0)?;
    files.sort();
    let mut hash = Sha256::new();
    hash.update(b"providence.directory-sha256.v1\0");
    hash.update((files.len() as u64).to_be_bytes());
    let mut size = 0;
    for relative in files {
        let name = relative
            .to_str()
            .ok_or("Export names must be representable as UTF-8")?
            .replace('\\', "/");
        hash.update((name.len() as u64).to_be_bytes());
        hash.update(name.as_bytes());
        let file = path.join(relative);
        hash.update(
            fs::metadata(&file)
                .map_err(|error| error.to_string())?
                .len()
                .to_be_bytes(),
        );
        size += feed_file(&file, &mut hash, size)?;
    }
    Ok((format!("{:x}", hash.finalize()), size))
}

fn inventory(
    root: &Path,
    current: &Path,
    depth: usize,
    files: &mut Vec<PathBuf>,
    entries: &mut usize,
) -> Result<(), String> {
    if depth > 8 {
        return Err("export-output-limit: output nesting exceeds eight directories".into());
    }
    for entry in fs::read_dir(current).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        *entries += 1;
        if *entries > 8192 {
            return Err("export-output-limit: output exceeds 8192 directory entries".into());
        }
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        if kind.is_dir() {
            inventory(root, &entry.path(), depth + 1, files, entries)?;
        } else if kind.is_file() {
            files.push(
                entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|error| error.to_string())?
                    .to_path_buf(),
            );
            if files.len() > 4096 {
                return Err("export-output-limit: output exceeds 4096 files".into());
            }
        } else {
            return Err(
                "export-output-invalid: symbolic links and special files cannot be published"
                    .into(),
            );
        }
    }
    Ok(())
}

fn feed_file(path: &Path, hash: &mut Sha256, prior: u64) -> Result<u64, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut buffer = [0u8; 65536];
    let mut size = 0;
    loop {
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        size += count as u64;
        if size + prior > BYTE_LIMIT {
            return Err("export-output-limit: output exceeds 1 GiB".into());
        }
        hash.update(&buffer[..count]);
    }
    Ok(size)
}

pub(super) fn publish(candidate: &Path, destination: &Path, format: Format) -> Result<(), String> {
    if format == Format::Classic {
        providence_publication::publish_directory_noclobber(candidate, destination)
            .map_err(|error| error.to_string())
    } else {
        tempfile::TempPath::try_from_path(candidate.to_path_buf())
            .map_err(|error| error.to_string())?
            .persist_noclobber(destination)
            .map_err(|error| error.error.to_string())
    }
}
