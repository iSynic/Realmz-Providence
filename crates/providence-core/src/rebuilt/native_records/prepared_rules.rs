use crate::{
    codecs::{CASTE_RULE_CODEC, RACE_RULE_CODEC},
    model::{BlobId, ProjectSnapshot},
};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn validate(
    snapshot: &ProjectSnapshot,
    originals: &BTreeMap<String, Vec<u8>>,
    prepared: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    for path in prepared.keys() {
        if !matches!(path.as_str(), "Data Race" | "Data Caste") {
            return Err(format!("unexpected prepared native rule source {path}"));
        }
    }
    for (codec, blobs) in [
        (
            RACE_RULE_CODEC,
            snapshot
                .race_rules
                .iter()
                .filter_map(|row| row.source_blob.as_ref())
                .collect::<BTreeSet<_>>(),
        ),
        (
            CASTE_RULE_CODEC,
            snapshot
                .caste_rules
                .iter()
                .filter_map(|row| row.source_blob.as_ref())
                .collect(),
        ),
    ] {
        let path = codec.native_path;
        let Some(original) = originals.get(path) else {
            if prepared.contains_key(path) {
                return Err(format!(
                    "{path} has no original scenario source; first-family native v7 creation requires an explicit source transition"
                ));
            }
            continue;
        };
        let original_blob = BlobId(format!("sha256:{:x}", Sha256::digest(original)));
        let current = prepared.get(path);
        if blobs.iter().any(|blob| **blob != original_blob) && current.is_none() {
            return Err(format!(
                "{path} requires its verified prepared native authoring bytes"
            ));
        }
        if let Some(current) = current {
            validate_current(codec, &blobs, original, current)?;
        }
    }
    Ok(())
}

fn validate_current(
    codec: crate::codecs::CodecDescriptor,
    blobs: &BTreeSet<&BlobId>,
    original: &[u8],
    current: &[u8],
) -> Result<(), String> {
    let path = codec.native_path;
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest(current)));
    if blobs.len() != 1 || !blobs.contains(&blob) {
        return Err(format!(
            "{path} prepared bytes do not match the model's canonical source blob"
        ));
    }
    if current.len() != original.len() {
        return Err(format!(
            "{path} prepared authoring bytes must preserve native source extent"
        ));
    }
    for (offset, (before, after)) in original.iter().zip(current).enumerate() {
        let local = offset % codec.record_bytes;
        let owned = offset / codec.record_bytes < (original.len() / codec.record_bytes).min(30)
            && codec
                .owned_byte_ranges
                .iter()
                .any(|range| range.start <= local && local < range.end);
        if before != after && !owned {
            return Err(format!(
                "{path} prepared authoring changed unowned byte {offset}"
            ));
        }
    }
    Ok(())
}
