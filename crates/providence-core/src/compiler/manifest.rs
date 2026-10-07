use crate::codecs::NativeFileFamily;
use crate::model::BlobId;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ManifestSource {
    Generated { family: NativeFileFamily },
    CompatibilityAnnex { blob: BlobId },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub bytes: Vec<u8>,
    pub source: ManifestSource,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct NativeManifest {
    files: BTreeMap<String, ManifestEntry>,
}

impl NativeManifest {
    pub fn insert_preserved(&mut self, path: impl Into<String>, blob: BlobId, bytes: Vec<u8>) {
        self.files.entry(path.into()).or_insert(ManifestEntry {
            bytes,
            source: ManifestSource::CompatibilityAnnex { blob },
        });
    }

    pub fn insert_generated(
        &mut self,
        path: impl Into<String>,
        family: NativeFileFamily,
        bytes: Vec<u8>,
    ) {
        self.files.insert(
            path.into(),
            ManifestEntry {
                bytes,
                source: ManifestSource::Generated { family },
            },
        );
    }

    pub fn files(&self) -> impl ExactSizeIterator<Item = (&str, &ManifestEntry)> {
        self.files
            .iter()
            .map(|(path, entry)| (path.as_str(), entry))
    }

    pub fn get(&self, path: &str) -> Option<&ManifestEntry> {
        self.files.get(path)
    }

    pub fn deterministic_sha256(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(b"providence-native-manifest-v1\0");
        for (path, entry) in &self.files {
            update_length_prefixed(&mut hasher, path.as_bytes());
            update_length_prefixed(&mut hasher, &entry.bytes);
        }
        format!("{:x}", hasher.finalize())
    }
}

fn update_length_prefixed(hasher: &mut Sha256, bytes: &[u8]) {
    hasher.update((bytes.len() as u64).to_be_bytes());
    hasher.update(bytes);
}
