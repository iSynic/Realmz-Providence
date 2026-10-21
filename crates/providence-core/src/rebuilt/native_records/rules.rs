use super::RebuiltV7ClassicRecords;
use crate::{
    codecs::*,
    model::{BlobId, ProjectSnapshot},
};
use std::collections::BTreeMap;

// Only Castle's first 30 logical slots are executable. Overflow and partial bytes stay in sources.
pub(super) fn project(path: &str, bytes: &[u8], records: &mut RebuiltV7ClassicRecords) {
    match path {
        "Data Race" => {
            records.races = decode_race_rules(bytes, None)
                .rules
                .into_iter()
                .take(30)
                .map(|row| row.definition)
                .collect()
        }
        "Data Caste" => {
            records.castes = decode_caste_rules(bytes, None)
                .rules
                .into_iter()
                .take(30)
                .map(|row| row.definition)
                .collect()
        }
        _ => unreachable!("native rule family"),
    }
}

pub(super) fn validate_model(
    snapshot: &ProjectSnapshot,
    sources: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    if sources.contains_key("Data Race") {
        validate_family(
            snapshot,
            "Data Race",
            RACE_RECORD_BYTES,
            snapshot
                .race_rules
                .iter()
                .map(|row| (row.definition.classic_id, row.source_blob.as_ref())),
        )?;
    }
    if sources.contains_key("Data Caste") {
        validate_family(
            snapshot,
            "Data Caste",
            CASTE_RECORD_BYTES,
            snapshot
                .caste_rules
                .iter()
                .map(|row| (row.definition.classic_id, row.source_blob.as_ref())),
        )?;
    }
    Ok(())
}

pub(in crate::rebuilt) fn validate_family<'a>(
    snapshot: &ProjectSnapshot,
    path: &str,
    stride: usize,
    rows: impl Iterator<Item = (u8, Option<&'a BlobId>)>,
) -> Result<(), String> {
    let rows = rows.collect::<Vec<_>>();
    let source = snapshot
        .classic_sources
        .iter()
        .find(|row| row.native_path == path);
    let complete = source.map_or(30, |source| {
        (source.byte_length / stride as u64).min(30) as u8
    });
    for id in 1..=complete {
        if !rows.iter().any(|(row, _)| *row == id) {
            return Err(format!(
                "{path} supplied complete native row {id} is absent from the model"
            ));
        }
    }
    if let Some(source) = source {
        let prefix = format!("Scenario {path} ");
        let authored = if path == "Data Race" {
            snapshot
                .race_rules
                .iter()
                .any(|row| row.source.starts_with(&prefix))
        } else {
            snapshot
                .caste_rules
                .iter()
                .any(|row| row.source.starts_with(&prefix))
        };
        if rows.iter().any(|(id, blob)| {
            blob.is_some_and(|blob| (blob != &source.blob || *id > complete) && !authored)
        }) {
            return Err(format!(
                "{path} model contains substituted or unsupported source rows; preserve this project and reimport the native family separately"
            ));
        }
    }
    // A writer may extend a native table, but must not invent intervening complete rows.
    let last = rows.iter().map(|(id, _)| *id).max().unwrap_or(0);
    if (1..=last).any(|id| !rows.iter().any(|(row, _)| *row == id)) {
        return Err(format!(
            "{path} model has missing rows before its last authored native slot"
        ));
    }
    Ok(())
}

pub(in crate::rebuilt) fn validate_selection(
    records: &RebuiltV7ClassicRecords,
    selection: &crate::rebuilt::ResolvedClassicRules,
) -> Result<(), String> {
    let snapshot = &selection.effective_snapshot;
    if selection.race_source == "scenario" {
        if records.races.len() != snapshot.race_rules.len() {
            return Err("selected Data Race extent does not match effective native facts".into());
        }
        for (raw, row) in records.races.iter().zip(&snapshot.race_rules) {
            let mut expected = row.definition.clone();
            expected.name.clone_from(&raw.name);
            expected.description.clone_from(&raw.description);
            if expected != *raw {
                return Err("selected Race mechanics differ from effective native facts".into());
            }
        }
    }
    if selection.caste_source == "scenario" {
        if records.castes.len() != snapshot.caste_rules.len() {
            return Err("selected Data Caste extent does not match effective native facts".into());
        }
        for (raw, row) in records.castes.iter().zip(&snapshot.caste_rules) {
            let mut expected = row.definition.clone();
            expected.name.clone_from(&raw.name);
            expected.description.clone_from(&raw.description);
            expected
                .eligible_race_ids
                .clone_from(&raw.eligible_race_ids);
            if expected != *raw {
                return Err("selected Caste mechanics differ from effective native facts".into());
            }
        }
    }
    Ok(())
}
