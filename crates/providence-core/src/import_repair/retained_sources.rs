use super::RepairAssessment;
use crate::model::{BlobId, ProjectSnapshot};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub(super) fn blob(snapshot: &ProjectSnapshot, path: &str) -> Option<BlobId> {
    snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == path)
        .map(|source| source.blob.clone())
}

pub(super) fn verify(
    snapshot: &ProjectSnapshot,
    files: &BTreeMap<String, Vec<u8>>,
    assessment: &mut RepairAssessment,
) -> Result<(), String> {
    for source in &snapshot.classic_sources {
        if let Some(bytes) = files.get(&source.native_path) {
            if bytes.len() as u64 != source.byte_length
                || format!("sha256:{:x}", Sha256::digest(bytes)) != source.blob.0
            {
                return Err(format!(
                    "Retained {} bytes do not match the captured source.",
                    source.native_path
                ));
            }
        } else {
            assessment.source_requirements.push(format!(
                "{}: retained source {} is required",
                source.native_path, source.blob.0
            ));
        }
    }
    Ok(())
}
