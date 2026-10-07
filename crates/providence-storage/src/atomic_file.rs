use crate::errors::StoreError;
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

pub(super) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), StoreError> {
    let parent = path
        .parent()
        .expect("portable snapshot path always has a parent");
    fs::create_dir_all(parent)?;
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(path)
        .map_err(|error| StoreError::Io(error.error))?;
    Ok(())
}
