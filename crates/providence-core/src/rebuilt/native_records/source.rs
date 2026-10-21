use super::rows::*;
use super::*;
use crate::{
    codecs::CODEC_REGISTRY,
    model::{ClassicSourceBlob, ProjectSnapshot},
};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub(in crate::rebuilt) fn source_codec_descriptors(
    snapshot: &crate::model::ProjectSnapshot,
    native_path: &str,
) -> Vec<&'static crate::codecs::CodecDescriptor> {
    let exact_startup_source = snapshot.campaign.is_some()
        && snapshot
            .startup_authoring
            .as_ref()
            .and_then(|startup| startup.original_source.as_ref())
            .filter(|original| original.native_path == native_path)
            .is_some_and(|original| {
                let mut declarations = snapshot
                    .classic_sources
                    .iter()
                    .filter(|source| source.native_path == native_path);
                declarations.next().is_some_and(|declaration| {
                    declaration == original && declarations.next().is_none()
                })
            });

    CODEC_REGISTRY
        .iter()
        .filter(|descriptor| {
            descriptor.native_path == native_path
                || (descriptor.family == crate::codecs::NativeFileFamily::CustomLandlookMetadata
                    && matches!(
                        native_path,
                        "Data Custom 1 BD" | "Data Custom 2 BD" | "Data Custom 3 BD"
                    ))
                || (exact_startup_source
                    && matches!(
                        descriptor.family,
                        crate::codecs::NativeFileFamily::ScenarioStartup
                            | crate::codecs::NativeFileFamily::ScenarioSecurityStartup
                    ))
        })
        .collect()
}

/// Byte identities are verified before any native field or resource is projected.
pub fn project_rebuilt_v7_classic_records(
    snapshot: &ProjectSnapshot,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
) -> Result<RebuiltV7ClassicRecords, String> {
    let declarations = declarations(snapshot, retained_bytes)?;
    let mut projected = RebuiltV7ClassicRecords {
        sources: Vec::with_capacity(declarations.len()),
        resources: Vec::new(),
        undecodable_resource_sources: Vec::new(),
        simple: Vec::new(),
        timed: Vec::new(),
        shops: Vec::new(),
        programs: Vec::new(),
        extra_codes: Vec::new(),
        player_maps: Vec::new(),
        races: Vec::new(),
        castes: Vec::new(),
        rule_selection: None,
    };
    for (path, source) in declarations {
        let bytes = retained_bytes
            .get(path)
            .ok_or_else(|| format!("declared Classic source '{}' has no retained bytes", path))?;
        let digest = verified_digest(source, bytes)?;
        let layouts = layouts(snapshot, path, bytes.len())?;
        match path {
            "Data ED" => project_simple(bytes, &mut projected.simple),
            "Data TD3" => project_timed(bytes, &mut projected.timed),
            "Data SD" => project_shops(bytes, &mut projected.shops),
            "Data DD" | "Data DDD" | "Data ED3" | "Data ED2" => {
                project_programs(path, bytes, &mut projected.programs)
            }
            "Data EDCD" => project_extra_codes(bytes, &mut projected.extra_codes),
            "Data MD2" => super::player_maps::project(bytes, &mut projected.player_maps),
            "Data Race" | "Data Caste" => super::rules::project(path, bytes, &mut projected),
            _ => {}
        }
        if crate::codecs::is_classic_resource_fork_path(path) {
            resources(path, bytes, &mut projected);
        }
        projected.sources.push(NativeSourceFacts {
            native_path: path.to_owned(),
            sha256: digest.clone(),
            byte_length: bytes.len() as u64,
            effective_sha256: digest,
            effective_byte_length: bytes.len() as u64,
            edits: Vec::new(),
            layouts,
        });
    }
    Ok(projected)
}

fn declarations<'a>(
    snapshot: &'a ProjectSnapshot,
    retained: &BTreeMap<String, Vec<u8>>,
) -> Result<BTreeMap<&'a str, &'a ClassicSourceBlob>, String> {
    let mut sources = BTreeMap::new();
    for source in &snapshot.classic_sources {
        if sources
            .insert(source.native_path.as_str(), source)
            .is_some()
        {
            return Err(format!(
                "duplicate Classic source path '{}'",
                source.native_path
            ));
        }
    }
    for path in retained.keys() {
        if !sources.contains_key(path.as_str()) {
            return Err(format!("retained bytes for undeclared source '{}'", path));
        }
    }
    Ok(sources)
}

fn verified_digest(source: &ClassicSourceBlob, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() as u64 != source.byte_length {
        return Err(format!(
            "Classic source '{}' declares {} bytes but retained bytes contain {}",
            source.native_path,
            source.byte_length,
            bytes.len()
        ));
    }
    let digest = format!("{:x}", Sha256::digest(bytes));
    let declared = source.blob.0.strip_prefix("sha256:").ok_or_else(|| {
        format!(
            "Classic source '{}' has an invalid retained blob identity",
            source.native_path
        )
    })?;
    if declared.len() != 64
        || !declared.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !declared.eq_ignore_ascii_case(&digest)
    {
        return Err(format!(
            "Classic source '{}' hash mismatch: declared {}, retained sha256:{}",
            source.native_path, source.blob.0, digest
        ));
    }
    Ok(digest)
}

fn layouts(
    snapshot: &ProjectSnapshot,
    path: &str,
    length: usize,
) -> Result<Vec<NativeRecordLayout>, String> {
    source_codec_descriptors(snapshot, path)
        .into_iter()
        .map(|codec| {
            if codec.record_bytes == 0 {
                return Err(format!(
                    "Classic source '{}' has a zero-byte codec stride",
                    path
                ));
            }
            Ok(NativeRecordLayout {
                family: serde_json::to_value(codec.family)
                    .expect("NativeFileFamily serialization is infallible")
                    .as_str()
                    .expect("NativeFileFamily serializes as a string")
                    .to_owned(),
                record_bytes: codec.record_bytes,
                complete_records: length / codec.record_bytes,
                trailing_bytes: length % codec.record_bytes,
                owned_byte_ranges: codec
                    .owned_byte_ranges
                    .iter()
                    .map(|range| NativeByteRange {
                        start: range.start,
                        end: range.end,
                    })
                    .collect(),
            })
        })
        .collect()
}

fn resources(path: &str, bytes: &[u8], projected: &mut RebuiltV7ClassicRecords) {
    match crate::codecs::parse_resource_entries_preserving_duplicates(bytes) {
        Ok(entries) => {
            let mut occurrences = BTreeMap::new();
            for entry in entries {
                let ordinal = occurrences
                    .entry((entry.resource_type, entry.id))
                    .or_insert(0);
                let occurrence = *ordinal;
                *ordinal += 1;
                projected.resources.push(NativeResourceFacts {
                    native_path: path.to_owned(),
                    resource_type_bytes: entry.resource_type,
                    resource_id: entry.id,
                    occurrence,
                    sha256: format!("{:x}", Sha256::digest(&entry.data)),
                    byte_length: entry.data.len(),
                });
            }
        }
        Err(_) => projected.undecodable_resource_sources.push(path.to_owned()),
    }
}
