use super::{RepairAssessment, RepairChange, RepairEntry, retained_sources};
use crate::codecs::decode_scenario_item_rules;
use crate::model::{BlobId, ProjectSnapshot};
use std::collections::BTreeMap;

pub(super) fn assess(
    snapshot: &ProjectSnapshot,
    files: &BTreeMap<String, Vec<u8>>,
    assessment: &mut RepairAssessment,
) -> Result<(), String> {
    if snapshot
        .startup_authoring
        .as_ref()
        .and_then(|s| s.original_source.as_ref())
        .is_none()
    {
        return Ok(());
    }
    let Some(binary) = files.get("Data NI") else {
        return Ok(());
    };
    let Some(blob) = retained_sources::blob(snapshot, "Data NI") else {
        return Ok(());
    };
    let corrected = item_fork(files, "Scenario.rsrc")?;
    let legacy_item = item_fork(files, "Data NI.rsrc")?;
    let old = legacy_item.or(corrected);
    let old_blob = if legacy_item.is_some() {
        retained_sources::blob(snapshot, "Data NI.rsrc")
    } else {
        corrected.and_then(|_| retained_sources::blob(snapshot, "Scenario.rsrc"))
    };
    let new_blob = corrected.and_then(|_| retained_sources::blob(snapshot, "Scenario.rsrc"));
    let old = decode_scenario_item_rules(binary, old.map(Vec::as_slice), blob.clone(), old_blob)
        .map_err(|error| error.to_string())?;
    let new =
        decode_scenario_item_rules(binary, corrected.map(Vec::as_slice), blob, new_blob.clone())
            .map_err(|error| error.to_string())?;
    for current in &snapshot.scenario_item_rules {
        let Some(before) = old
            .rules
            .iter()
            .find(|r| r.record_index == current.record_index)
        else {
            continue;
        };
        let Some(after) = new
            .rules
            .iter()
            .find(|r| r.record_index == current.record_index)
        else {
            continue;
        };
        compare_record(current, before, after, &new_blob, assessment)?;
    }
    Ok(())
}

fn item_fork<'a>(
    files: &'a BTreeMap<String, Vec<u8>>,
    path: &str,
) -> Result<Option<&'a Vec<u8>>, String> {
    let Some(bytes) = files.get(path) else {
        return Ok(None);
    };
    let entries = crate::codecs::parse_resource_entries_preserving_duplicates(bytes)
        .map_err(|error| format!("{path}: {error}"))?;
    Ok(entries
        .iter()
        .any(|entry| entry.resource_type == *b"STR#" && (800..=802).contains(&entry.id))
        .then_some(bytes))
}

pub(super) fn text<'a>(
    definition: &'a crate::model::ItemRuleDefinition,
    field: &str,
) -> Result<&'a str, String> {
    match field {
        "name" => Ok(&definition.name),
        "unidentifiedName" => Ok(&definition.unidentified_name),
        "description" => Ok(&definition.description),
        _ => Err("unknown item text field".into()),
    }
}

fn compare_record(
    current: &crate::model::SourcedScenarioItemRule,
    before: &crate::model::SourcedScenarioItemRule,
    after: &crate::model::SourcedScenarioItemRule,
    new_blob: &Option<BlobId>,
    assessment: &mut RepairAssessment,
) -> Result<(), String> {
    if current.text_source_blob != *new_blob {
        assessment.entries.push(RepairEntry {
            key: format!("item:{}:source", current.record_index),
            family: "Item text".into(),
            entity: current.definition.id.clone(),
            field: "textSource".into(),
            conflict: current.text_source_blob != before.text_source_blob,
            change: RepairChange::ItemTextSource {
                record_index: current.record_index,
                expected: current.text_source_blob.clone(),
                recovered: new_blob.clone(),
            },
        });
    }
    let source_conflict = current.text_source_blob != before.text_source_blob;
    for field in ["name", "unidentifiedName", "description"] {
        let (value, before, after) = (
            text(&current.definition, field)?,
            text(&before.definition, field)?,
            text(&after.definition, field)?,
        );
        if value == after || before == after {
            continue;
        }
        assessment.entries.push(RepairEntry {
            key: format!("item:{}:{field}", current.record_index),
            family: "Item text".into(),
            entity: current.definition.id.clone(),
            field: field.into(),
            conflict: value != before || source_conflict,
            change: RepairChange::ItemText {
                record_index: current.record_index,
                field: field.into(),
                expected: value.into(),
                recovered: after.into(),
            },
        });
    }
    Ok(())
}
