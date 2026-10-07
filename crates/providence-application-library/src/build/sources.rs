use super::encoding;

#[cfg(test)]
mod tests;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

const SOURCE_FILES: [&str; 8] = [
    "Data ID",
    "Data ID.rsrc",
    "Data S",
    "Data Race",
    "Data Caste",
    "Custom Names.rsrc",
    "The Family Jewels.rsrc",
    "Portraits.rsrc",
];
const TACTICALS: &str = "Tacticals.rsrc";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SourceManifest {
    pub(super) source_repository: String,
    pub(super) source_commit: String,
    pub(super) donor_repository: String,
    pub(super) donor_commit: String,
    pub(super) files: Vec<SourceManifestFile>,
}

#[derive(Debug, Deserialize, Serialize)]
pub(super) struct SourceManifestFile {
    pub(super) name: String,
    pub(super) bytes: u64,
    pub(super) sha256: String,
}

// Construction verifies every required source before decoding or writing outputs.
pub(super) struct VerifiedSources {
    pub manifest: SourceManifest,
    pub manifest_bytes: Vec<u8>,
    payloads: BTreeMap<String, Vec<u8>>,
}

impl VerifiedSources {
    pub(super) fn load(root: &Path) -> Result<Self, String> {
        let path = root.join("manifest.json");
        let manifest_bytes = read(&path)?;
        let manifest: SourceManifest = serde_json::from_slice(&manifest_bytes)
            .map_err(|error| format!("{} is invalid: {error}", path.display()))?;
        let payloads = verify_and_read_sources(root, &manifest)?;
        Ok(Self {
            manifest,
            manifest_bytes,
            payloads,
        })
    }

    pub(super) fn bytes(&self, name: &str) -> Result<&[u8], String> {
        self.payloads
            .get(name)
            .map(Vec::as_slice)
            .ok_or_else(|| format!("source bytes for {name} are absent"))
    }
}

fn verify_and_read_sources(
    root: &Path,
    manifest: &SourceManifest,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let required = SOURCE_FILES
        .into_iter()
        .chain([TACTICALS])
        .collect::<BTreeSet<_>>();
    let declared = manifest
        .files
        .iter()
        .map(|file| (file.name.as_str(), file))
        .collect::<BTreeMap<_, _>>();
    let mut output = BTreeMap::new();
    for name in required {
        let declaration = declared
            .get(name)
            .ok_or_else(|| format!("source manifest does not declare {name}"))?;
        let payload = read(&root.join(name))?;
        if payload.len() as u64 != declaration.bytes
            || encoding::sha256(&payload) != declaration.sha256
        {
            return Err(format!(
                "source file {name} does not match its pinned manifest"
            ));
        }
        output.insert(name.into(), payload);
    }
    Ok(output)
}

fn read(path: &Path) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|error| format!("could not read {}: {error}", path.display()))
}
