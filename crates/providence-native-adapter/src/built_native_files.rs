//! Native family files an export built from authored records because the imported scenario
//! never shipped them. Both Classic and Rebuilt results report them.
use providence_core::{
    compiler::{NativeManifest, missing_native_family_paths},
    model::ProjectSnapshot,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BuiltNativeFile {
    pub(crate) native_path: String,
    pub(crate) byte_length: u64,
    pub(crate) sha256: String,
}

impl BuiltNativeFile {
    pub(crate) fn new(native_path: String, bytes: &[u8]) -> Self {
        Self {
            native_path,
            byte_length: bytes.len() as u64,
            sha256: format!("{:x}", Sha256::digest(bytes)),
        }
    }

    pub(crate) fn report(&self) -> Value {
        json!({
            "nativePath": self.native_path,
            "bytes": self.byte_length,
            "sha256": self.sha256,
            "message": format!(
                "Built {} from authored records; the original scenario had no {}.",
                self.native_path, self.native_path
            ),
        })
    }
}

pub(crate) fn in_classic_manifest(snapshot: &ProjectSnapshot, manifest: &NativeManifest) -> Value {
    missing_native_family_paths(snapshot)
        .into_iter()
        .filter_map(|path| {
            let entry = manifest.get(&path)?;
            Some(BuiltNativeFile::new(path, &entry.bytes).report())
        })
        .collect()
}
