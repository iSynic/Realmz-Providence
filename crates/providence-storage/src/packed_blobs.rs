//! Shipped application libraries keep their content-addressed blobs in one archive so a
//! release extracts a handful of files. Every read is still verified against its digest.
use crate::BLOB_ALGORITHM;
use crate::blob_store::{content_addressed_blob_path, sha256};
use crate::errors::StoreError;
use providence_core::model::BlobId;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tempfile::NamedTempFile;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const PACKED_BLOBS_FILE: &str = "blobs.zip";
const MAX_BLOB_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug)]
pub(crate) struct PackedBlobs {
    archive: Mutex<ZipArchive<File>>,
}

impl PackedBlobs {
    /// A library is either loose or packed; both at once would make reads ambiguous.
    pub(crate) fn open(root: &Path) -> Result<Option<Arc<Self>>, StoreError> {
        let path = root.join(PACKED_BLOBS_FILE);
        if !path.is_file() {
            return Ok(None);
        }
        if root.join("blobs").exists() {
            return Err(invalid("library has both loose blobs and blobs.zip"));
        }
        let mut archive = ZipArchive::new(File::open(&path)?).map_err(zip_error)?;
        for index in 0..archive.len() {
            let entry = archive.by_index_raw(index).map_err(zip_error)?;
            let name = entry.name().map_err(zip_error)?.into_owned();
            if entry_digest(&name).is_none()
                || entry.size() > MAX_BLOB_BYTES
                || !matches!(
                    entry.compression(),
                    CompressionMethod::Stored | CompressionMethod::Deflated
                )
            {
                return Err(invalid(&format!("unexpected entry '{name}'")));
            }
        }
        Ok(Some(Arc::new(Self {
            archive: Mutex::new(archive),
        })))
    }

    pub(crate) fn read(&self, root: &Path, id: &BlobId) -> Result<Vec<u8>, StoreError> {
        content_addressed_blob_path(root, id)?;
        let name = format!("{BLOB_ALGORITHM}/{}", &id.0[BLOB_ALGORITHM.len() + 1..]);
        let mut archive = self
            .archive
            .lock()
            .map_err(|_| invalid("archive lock was poisoned"))?;
        let mut entry = match archive.by_name(&name) {
            Ok(entry) => entry,
            Err(zip::result::ZipError::FileNotFound) => {
                return Err(StoreError::Io(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("packed blob {} is missing", id.0),
                )));
            }
            Err(error) => return Err(zip_error(error)),
        };
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .by_ref()
            .take(MAX_BLOB_BYTES)
            .read_to_end(&mut bytes)?;
        if format!("{BLOB_ALGORITHM}:{}", sha256(&bytes)) != id.0 {
            return Err(StoreError::BlobDigestMismatch(id.clone()));
        }
        Ok(bytes)
    }
}

/// Moves a validated loose library's blobs into `blobs.zip`. The archive is written beside
/// the library, the complete catalog is revalidated through it, and only then are the loose
/// blobs removed. Entries are stored in digest order with fixed metadata.
pub fn pack_reference_library(root: &Path) -> Result<usize, StoreError> {
    let (loose, _) = crate::ReferenceLibraryStore::open(root)?;
    if loose.is_packed() {
        return Err(invalid("library is already packed"));
    }
    let directory = root.join("blobs").join(BLOB_ALGORITHM);
    let mut names = Vec::new();
    for entry in fs::read_dir(&directory)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !entry.file_type()?.is_file() || entry_digest(&format!("sha256/{name}")).is_none() {
            return Err(invalid(&format!("unexpected loose blob '{name}'")));
        }
        names.push(name);
    }
    names.sort();
    let temporary = NamedTempFile::new_in(root)?;
    let mut writer = ZipWriter::new(temporary.reopen()?);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .last_modified_time(zip::DateTime::default())
        .unix_permissions(0o644);
    for name in &names {
        let bytes = loose.read_blob(&BlobId(format!("{BLOB_ALGORITHM}:{name}")))?;
        writer
            .start_file(format!("{BLOB_ALGORITHM}/{name}"), options)
            .map_err(zip_error)?;
        std::io::Write::write_all(&mut writer, &bytes)?;
    }
    writer.finish().map_err(zip_error)?.sync_all()?;
    let packed = root.join(PACKED_BLOBS_FILE);
    temporary
        .persist_noclobber(&packed)
        .map_err(|error| StoreError::Io(error.error))?;
    let staged = root.join("blobs.packing");
    fs::rename(root.join("blobs"), &staged)?;
    if let Err(error) = crate::ReferenceLibraryStore::open(root) {
        fs::remove_file(&packed)?;
        fs::rename(&staged, root.join("blobs"))?;
        return Err(error);
    }
    fs::remove_dir_all(staged)?;
    Ok(names.len())
}

fn entry_digest(name: &str) -> Option<&str> {
    name.strip_prefix("sha256/").filter(|digest| {
        digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn invalid(reason: &str) -> StoreError {
    StoreError::InvalidPackedBlobs(reason.into())
}

fn zip_error(error: zip::result::ZipError) -> StoreError {
    StoreError::InvalidPackedBlobs(error.to_string())
}
