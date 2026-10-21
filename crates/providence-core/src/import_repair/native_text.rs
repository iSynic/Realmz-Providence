//! Recovery is a reviewed source reinterpretation, never a blind snapshot rewrite.
use super::{RepairAssessment, RepairChange, RepairEntry};
use crate::{
    codecs,
    model::{ProjectSnapshot, StableId},
};
use std::collections::BTreeMap;

pub(super) fn assess(
    snapshot: &ProjectSnapshot,
    files: &BTreeMap<String, Vec<u8>>,
    result: &mut RepairAssessment,
) {
    for (path, stride, offset, slots, width) in [
        ("Data ED", 426, 106, 4, 80),
        ("Data ED2", 520, 160, 9, 40),
        ("Data MD", 210, 170, 1, 40),
        ("Data MD-1", 210, 170, 1, 40),
        ("Data MD1", 210, 170, 1, 40),
        ("Data DES", 256, 0, 1, 256),
    ] {
        let Some(bytes) = files.get(path) else {
            continue;
        };
        for (id, row) in bytes.chunks_exact(stride).enumerate() {
            for slot in 0..slots {
                let field = &row[offset + slot * width..offset + (slot + 1) * width];
                let fixed = path.starts_with("Data MD");
                let payload = if fixed {
                    &field[..field.iter().position(|b| *b == 0).unwrap_or(width)]
                } else {
                    &field[1..1 + usize::from(field[0]).min(width - 1)]
                };
                let Ok((current, authored, entity)) = current(snapshot, path, id as u32, slot)
                else {
                    continue;
                };
                let recovered = corrected(path, row, slot);
                let legacy = legacy_text(path, payload);
                if current == recovered || recovered == legacy {
                    continue;
                }
                result.entries.push(RepairEntry {
                    key: format!("native-text:{path}:{id}:{slot}"),
                    family: format!("{path} text"),
                    entity,
                    field: format!("text:{slot}"),
                    conflict: authored || current != legacy,
                    change: RepairChange::NativeText {
                        native_path: path.into(),
                        native_id: id as u32,
                        slot,
                        expected: current.into(),
                        recovered,
                    },
                });
            }
        }
    }
}

fn corrected(path: &str, row: &[u8], slot: usize) -> String {
    match path {
        "Data ED" => codecs::decode_simple_encounters(row).records[0].texts[slot].clone(),
        "Data ED2" => codecs::decode_complex_encounters(row).records[0].texts[slot].clone(),
        "Data DES" => codecs::decode_monster_descriptions(row).records[0]
            .text
            .clone(),
        _ => codecs::decode_monsters(row, path, 0).records[0]
            .display_name
            .clone(),
    }
}

fn legacy_text(path: &str, bytes: &[u8]) -> String {
    if path == "Data ED2" {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    let bytes = if path == "Data DES" {
        &bytes[..bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len())]
    } else {
        bytes
    };
    bytes
        .iter()
        .map(|byte| {
            if path == "Data ED" && byte.is_ascii()
                || path != "Data ED" && (32..=126).contains(byte)
            {
                char::from(*byte)
            } else {
                ' '
            }
        })
        .collect::<String>()
        .trim_end()
        .into()
}

fn current<'a>(
    snapshot: &'a ProjectSnapshot,
    path: &str,
    id: u32,
    slot: usize,
) -> Result<(&'a str, bool, StableId), String> {
    match path {
        "Data ED" => snapshot
            .simple_encounters
            .iter()
            .find(|r| r.native_id.0 == id)
            .and_then(|r| {
                r.texts
                    .get(slot)
                    .map(|text| (text.as_str(), r.authored, r.identity.clone()))
            }),
        "Data ED2" => snapshot
            .complex_encounters
            .iter()
            .find(|r| r.native_id.0 == id)
            .and_then(|r| {
                r.texts
                    .get(slot)
                    .map(|text| (text.as_str(), r.authored, r.identity.clone()))
            }),
        "Data DES" => snapshot
            .monster_descriptions
            .iter()
            .find(|r| r.native_id.0 == id)
            .map(|r| (r.text.as_str(), r.authored, r.identity.clone())),
        _ => snapshot
            .monster_sets
            .iter()
            .find(|s| s.native_path == path)
            .and_then(|s| s.monsters.iter().find(|r| r.native_id.0 == id))
            .map(|r| (r.display_name.as_str(), r.authored, r.identity.clone())),
    }
    .ok_or_else(|| "Native text destination is unavailable.".into())
}

pub(super) fn apply(
    snapshot: &mut ProjectSnapshot,
    path: &str,
    id: u32,
    slot: usize,
    expected: &str,
    recovered: String,
) -> Result<(), String> {
    if current(snapshot, path, id, slot)?.0 != expected {
        return Err("Native text changed; review the repair again.".into());
    }
    match path {
        "Data ED" => {
            snapshot
                .simple_encounters
                .iter_mut()
                .find(|r| r.native_id.0 == id)
                .unwrap()
                .texts[slot] = recovered
        }
        "Data ED2" => {
            snapshot
                .complex_encounters
                .iter_mut()
                .find(|r| r.native_id.0 == id)
                .unwrap()
                .texts[slot] = recovered
        }
        "Data DES" => {
            snapshot
                .monster_descriptions
                .iter_mut()
                .find(|r| r.native_id.0 == id)
                .unwrap()
                .text = recovered
        }
        _ => {
            snapshot
                .monster_sets
                .iter_mut()
                .find(|s| s.native_path == path)
                .unwrap()
                .monsters
                .iter_mut()
                .find(|r| r.native_id.0 == id)
                .unwrap()
                .display_name = recovered
        }
    }
    Ok(())
}
