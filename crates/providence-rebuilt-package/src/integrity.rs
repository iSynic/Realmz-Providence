use crate::RebuiltV3ArchiveError;
use providence_core::rebuilt::REBUILT_V3_REQUIRED_DOCUMENTS;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub(crate) fn parse_canonical_json<T: serde::de::DeserializeOwned>(
    path: &str,
    bytes: &[u8],
) -> Result<(Value, T), RebuiltV3ArchiveError> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|error| RebuiltV3ArchiveError::InvalidJson {
            path: path.into(),
            reason: error.to_string(),
        })?;
    let canonical =
        serde_json::to_vec(&value).map_err(|error| RebuiltV3ArchiveError::InvalidJson {
            path: path.into(),
            reason: error.to_string(),
        })?;
    if canonical != bytes {
        return Err(RebuiltV3ArchiveError::NonCanonicalJson(path.into()));
    }
    let typed = serde_json::from_value(value.clone()).map_err(|error| {
        RebuiltV3ArchiveError::InvalidJson {
            path: path.into(),
            reason: error.to_string(),
        }
    })?;
    Ok((value, typed))
}

pub(crate) fn content_id_from_documents(documents: &BTreeMap<String, Vec<u8>>) -> String {
    let mut hasher = Sha256::new();
    for path in REBUILT_V3_REQUIRED_DOCUMENTS {
        let bytes = &documents[path];
        hasher.update((path.len() as u64).to_be_bytes());
        hasher.update(path.as_bytes());
        hasher.update((bytes.len() as u64).to_be_bytes());
        hasher.update(bytes);
    }
    format!("{:x}", hasher.finalize())
}

pub(crate) fn package_hash_from_manifest_value(
    mut manifest: Value,
) -> Result<String, RebuiltV3ArchiveError> {
    manifest
        .as_object_mut()
        .and_then(|object| object.remove("packageHash"))
        .ok_or_else(|| RebuiltV3ArchiveError::InvalidManifest("packageHash is absent".into()))?;
    let bytes =
        serde_json::to_vec(&manifest).map_err(|error| RebuiltV3ArchiveError::InvalidJson {
            path: "manifest.json".into(),
            reason: error.to_string(),
        })?;
    Ok(sha256_hex(&bytes))
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
