use super::rows::*;
use super::*;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

/// Native writers declare changes separately from the immutable import source.
pub fn project_rebuilt_v7_effective_records(
    snapshot: &crate::model::ProjectSnapshot,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
) -> Result<RebuiltV7ClassicRecords, String> {
    project_rebuilt_v7_effective_records_with_rule_sources(
        snapshot,
        retained_bytes,
        &BTreeMap::new(),
    )
}

/// Prepared rule blobs retain authoring controls that are absent from operational definitions.
pub fn project_rebuilt_v7_effective_records_with_rule_sources(
    snapshot: &crate::model::ProjectSnapshot,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
    prepared_rules: &BTreeMap<String, Vec<u8>>,
) -> Result<RebuiltV7ClassicRecords, String> {
    let mut records = project_rebuilt_v7_classic_records(snapshot, retained_bytes)?;
    super::player_maps::validate_model(
        snapshot,
        retained_bytes.get("Data MD2").map(Vec::as_slice),
    )?;
    super::rules::validate_model(snapshot, retained_bytes)?;
    super::prepared_rules::validate(snapshot, retained_bytes, prepared_rules)?;
    for path in [
        "Data DD",
        "Data DDD",
        "Data ED3",
        "Data ED2",
        "Data EDCD",
        "Data ED",
        "Data TD3",
        "Data SD",
        "Data MD2",
        "Data OD",
        "Data Race",
        "Data Caste",
    ] {
        let Some(original) = retained_bytes.get(path) else {
            continue;
        };
        let base = prepared_rules.get(path).unwrap_or(original);
        let effective = encode_effective(snapshot, path, base)?;
        if effective != *original {
            record_edit(&mut records, path, original, &effective);
        }
    }
    Ok(records)
}

fn encode_effective(
    snapshot: &crate::model::ProjectSnapshot,
    path: &str,
    original: &[u8],
) -> Result<Vec<u8>, String> {
    Ok(match path {
        "Data DD" => crate::codecs::encode_land_action_points(
            &snapshot.world.action_points,
            0,
            Some(original),
        )
        .map_err(|error| error.to_string())?,
        "Data DDD" => crate::codecs::encode_dungeon_action_points(
            &snapshot.world.action_points,
            0,
            Some(original),
        )
        .map_err(|error| error.to_string())?,
        "Data ED3" => {
            crate::codecs::encode_extra_action_points(&snapshot.extra_action_points, Some(original))
                .map_err(|error| error.to_string())?
        }
        "Data EDCD" => crate::codecs::encode_extra_codes(&snapshot.extra_codes, Some(original))
            .map_err(|error| error.to_string())?,
        "Data ED2" => {
            crate::codecs::encode_complex_encounters(&snapshot.complex_encounters, Some(original))
                .map_err(|error| error.to_string())?
        }
        "Data ED" => {
            crate::codecs::encode_simple_encounters(&snapshot.simple_encounters, Some(original))
                .map_err(|error| error.to_string())?
        }
        "Data TD3" => {
            crate::codecs::encode_timed_encounters(&snapshot.timed_encounters, Some(original))
                .map_err(|error| error.to_string())?
        }
        "Data MD2" => {
            crate::codecs::encode_player_maps(&snapshot.world.player_maps, Some(original))
                .map_err(|error| error.to_string())?
        }
        "Data OD" => crate::codecs::encode_option_labels(&snapshot.option_labels, Some(original))
            .map_err(|error| error.to_string())?,
        "Data Race" => crate::codecs::encode_race_rules(&snapshot.race_rules, Some(original))
            .map_err(|error| error.to_string())?,
        "Data Caste" => crate::codecs::encode_caste_rules(&snapshot.caste_rules, Some(original))
            .map_err(|error| error.to_string())?,
        _ => crate::codecs::encode_shops(&snapshot.shops, Some(original))
            .map_err(|error| error.to_string())?,
    })
}

fn record_edit(
    records: &mut RebuiltV7ClassicRecords,
    path: &str,
    original: &[u8],
    effective: &[u8],
) {
    let source = records
        .sources
        .iter_mut()
        .find(|source| source.native_path == path)
        .expect("declared retained source");
    let prefix = original
        .iter()
        .zip(effective)
        .take_while(|(a, b)| a == b)
        .count();
    let suffix = original[prefix..]
        .iter()
        .rev()
        .zip(effective[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    source.edits.push(NativeSourceEdit {
        offset: prefix,
        before: original[prefix..original.len() - suffix].to_vec(),
        after: effective[prefix..effective.len() - suffix].to_vec(),
    });
    source.effective_sha256 = format!("{:x}", Sha256::digest(effective));
    source.effective_byte_length = effective.len() as u64;
    for layout in &mut source.layouts {
        layout.complete_records = effective.len() / layout.record_bytes;
        layout.trailing_bytes = effective.len() % layout.record_bytes;
    }
    refresh_rows(records, path, effective);
}

fn refresh_rows(records: &mut RebuiltV7ClassicRecords, path: &str, effective: &[u8]) {
    match path {
        // OD captions have no parallel typed row fact; their source edit remains authoritative.
        "Data OD" => {}
        "Data Race" | "Data Caste" => super::rules::project(path, effective, records),
        "Data ED" => {
            records.simple.clear();
            project_simple(effective, &mut records.simple);
        }
        "Data TD3" => {
            records.timed.clear();
            project_timed(effective, &mut records.timed);
        }
        "Data DD" | "Data DDD" | "Data ED3" | "Data ED2" => {
            records
                .programs
                .retain(|program| program.native_path != path);
            project_programs(path, effective, &mut records.programs);
        }
        "Data EDCD" => {
            records.extra_codes.clear();
            project_extra_codes(effective, &mut records.extra_codes);
        }
        "Data MD2" => {
            records.player_maps.clear();
            super::player_maps::project(effective, &mut records.player_maps);
        }
        _ => {
            records.shops.clear();
            project_shops(effective, &mut records.shops);
        }
    }
}
