use providence_core::model::BlobId;
use serde::Serialize;
use sha2::{Digest, Sha256};

pub(super) fn canonical(value: &impl Serialize) -> Result<Vec<u8>, String> {
    let value = serde_json::to_value(value).map_err(|error| error.to_string())?;
    serde_json::to_vec(&value).map_err(|error| error.to_string())
}

pub(super) fn pretty(value: &impl Serialize) -> Result<Vec<u8>, String> {
    let mut payload = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    payload.push(b'\n');
    Ok(payload)
}

pub(super) fn blob_id(bytes: &[u8]) -> BlobId {
    BlobId(format!("sha256:{}", sha256(bytes)))
}

pub(super) fn sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
