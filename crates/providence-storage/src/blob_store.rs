use crate::BLOB_ALGORITHM;
use crate::ProjectStore;
use crate::errors::StoreError;
use providence_core::model::BlobId;
use providence_core::model::ProjectSnapshot;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use tempfile::NamedTempFile;

impl ProjectStore {
    /// Adopt a verified, already durable staging blob without rewriting its bytes.
    /// Both stores treat CAS payloads as immutable; the checkpoint rechecks them.
    pub fn adopt_blob(&self, source: &ProjectStore, id: &BlobId) -> Result<(), StoreError> {
        let bytes = source.read_blob(id)?;
        let destination = self.blob_path(id)?;
        let parent = destination.parent().expect("blob parent");
        fs::create_dir_all(parent)?;
        match fs::hard_link(source.blob_path(id)?, &destination) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                self.read_blob(id).map(|_| ())
            }
            Err(_) => self.put_blob(&bytes).map(|_| ()),
        }
    }

    pub fn put_blob(&self, bytes: &[u8]) -> Result<BlobId, StoreError> {
        let digest = sha256(bytes);
        let id = BlobId(format!("{BLOB_ALGORITHM}:{digest}"));
        let path = self.blob_path(&id)?;
        if path.is_file() {
            let existing = fs::read(&path)?;
            if sha256(&existing) != digest {
                return Err(StoreError::BlobDigestMismatch(id));
            }
            return Ok(id);
        }
        let parent = path.parent().expect("blob path has a parent");
        fs::create_dir_all(parent)?;
        let mut temporary = NamedTempFile::new_in(parent)?;
        temporary.write_all(bytes)?;
        temporary.as_file().sync_all()?;
        match temporary.persist_noclobber(&path) {
            Ok(_) => {}
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                let existing = fs::read(&path)?;
                if sha256(&existing) != digest {
                    return Err(StoreError::BlobDigestMismatch(id));
                }
            }
            Err(error) => return Err(StoreError::Io(error.error)),
        }
        Ok(id)
    }

    pub fn read_blob(&self, id: &BlobId) -> Result<Vec<u8>, StoreError> {
        let path = self.blob_path(id)?;
        let bytes = fs::read(path)?;
        if format!("{BLOB_ALGORITHM}:{}", sha256(&bytes)) != id.0 {
            return Err(StoreError::BlobDigestMismatch(id.clone()));
        }
        Ok(bytes)
    }

    pub fn validate_asset_blobs(&self, snapshot: &ProjectSnapshot) -> Result<(), StoreError> {
        self.validate_asset_blobs_cached(snapshot, &mut std::collections::BTreeMap::new())
    }

    pub(super) fn validate_asset_blobs_cached(
        &self,
        snapshot: &ProjectSnapshot,
        lengths: &mut std::collections::BTreeMap<BlobId, u64>,
    ) -> Result<(), StoreError> {
        for asset in &snapshot.assets {
            let actual = self.verified_blob_length(&asset.blob, lengths)?;
            if actual != asset.byte_length {
                return Err(StoreError::AssetBlobLengthMismatch {
                    asset: asset.identity.0.clone(),
                    expected: asset.byte_length,
                    actual,
                });
            }
            if let Some(blob) = &asset.classic_payload_blob {
                let actual = self.verified_blob_length(blob, lengths)?;
                let expected = asset.classic_payload_byte_length.unwrap_or(actual);
                if actual != expected {
                    return Err(StoreError::AssetClassicPayloadLengthMismatch {
                        asset: asset.identity.0.clone(),
                        expected,
                        actual,
                    });
                }
            } else if let Some(expected) = asset.classic_payload_byte_length {
                return Err(StoreError::AssetClassicPayloadLengthMismatch {
                    asset: asset.identity.0.clone(),
                    expected,
                    actual: 0,
                });
            }
        }
        Ok(())
    }

    fn verified_blob_length(
        &self,
        id: &BlobId,
        lengths: &mut std::collections::BTreeMap<BlobId, u64>,
    ) -> Result<u64, StoreError> {
        if let Some(length) = lengths.get(id) {
            return Ok(*length);
        }
        let length = self.read_blob(id)?.len() as u64;
        lengths.insert(id.clone(), length);
        Ok(length)
    }

    pub(super) fn blob_path(&self, id: &BlobId) -> Result<PathBuf, StoreError> {
        let digest =
            id.0.strip_prefix("sha256:")
                .filter(|digest| {
                    digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
                })
                .ok_or_else(|| StoreError::InvalidBlobId(id.0.clone()))?;
        Ok(self.root.join("blobs").join(BLOB_ALGORITHM).join(digest))
    }
}

pub(super) fn put_content_addressed_blob(root: &Path, bytes: &[u8]) -> Result<BlobId, StoreError> {
    let digest = sha256(bytes);
    let id = BlobId(format!("{BLOB_ALGORITHM}:{digest}"));
    let path = content_addressed_blob_path(root, &id)?;
    if path.is_file() {
        let existing = fs::read(&path)?;
        if sha256(&existing) != digest {
            return Err(StoreError::BlobDigestMismatch(id));
        }
        return Ok(id);
    }
    let parent = path.parent().expect("blob path has a parent");
    fs::create_dir_all(parent)?;
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    match temporary.persist_noclobber(&path) {
        Ok(_) => {}
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            let existing = fs::read(&path)?;
            if sha256(&existing) != digest {
                return Err(StoreError::BlobDigestMismatch(id));
            }
        }
        Err(error) => return Err(StoreError::Io(error.error)),
    }
    Ok(id)
}

pub(super) fn read_content_addressed_blob(root: &Path, id: &BlobId) -> Result<Vec<u8>, StoreError> {
    let bytes = fs::read(content_addressed_blob_path(root, id)?)?;
    if format!("{BLOB_ALGORITHM}:{}", sha256(&bytes)) != id.0 {
        return Err(StoreError::BlobDigestMismatch(id.clone()));
    }
    Ok(bytes)
}

pub(super) fn content_addressed_blob_path(root: &Path, id: &BlobId) -> Result<PathBuf, StoreError> {
    let digest = id
        .0
        .strip_prefix("sha256:")
        .filter(|digest| digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| StoreError::InvalidBlobId(id.0.clone()))?;
    Ok(root.join("blobs").join(BLOB_ALGORITHM).join(digest))
}

pub(super) fn sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
