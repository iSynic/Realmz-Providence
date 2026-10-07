use super::{RepairAssessment, RepairChange, RepairEntry, retained_sources};
use crate::codecs::decode_scenario_spells;
use crate::model::{ProjectSnapshot, SourcedSpellDefinition};
use std::collections::BTreeMap;

pub(super) fn assess(
    snapshot: &ProjectSnapshot,
    files: &BTreeMap<String, Vec<u8>>,
    assessment: &mut RepairAssessment,
) -> Result<(), String> {
    let Some(bytes) = files.get("Data Spell") else {
        return Ok(());
    };
    // The old full importer skipped the numeric table only when its names fork
    // was absent. Clear in the editor keeps the record, so absence here is provable.
    if files.contains_key("Data Spell.rsrc") || !snapshot.scenario_spells.is_empty() {
        return Ok(());
    }
    let decoded = decode_scenario_spells(bytes, retained_sources::blob(snapshot, "Data Spell"));
    for record in decoded.spells {
        let id = record.definition.id.clone();
        assessment.entries.push(RepairEntry {
            key: format!("spell:{}", record.definition.record_index),
            family: "Spells".into(),
            entity: id,
            field: "record".into(),
            conflict: false,
            change: RepairChange::Spell {
                record: Box::new(record),
            },
        });
    }
    Ok(())
}

pub(super) fn apply(
    snapshot: &mut ProjectSnapshot,
    record: SourcedSpellDefinition,
) -> Result<(), String> {
    if snapshot
        .scenario_spells
        .iter()
        .any(|s| s.definition.record_index == record.definition.record_index)
    {
        return Err("Spell destination changed; review the repair again.".into());
    }
    snapshot.scenario_spells.push(record);
    Ok(())
}
