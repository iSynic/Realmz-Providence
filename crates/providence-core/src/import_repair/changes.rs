use super::{INTERPRETATION_VERSION, RepairChange, RepairCommand, items, shops, spells};
use crate::model::{ProjectOrigin, ProjectSnapshot, StableId, classic_source_set_sha256};

pub fn apply(
    snapshot: &mut ProjectSnapshot,
    command: RepairCommand,
) -> Result<Vec<StableId>, String> {
    if command
        .changes
        .iter()
        .any(|entry| matches!(entry.change, RepairChange::ShopQuarantine { .. }))
    {
        return Err(shops::PRESERVATION_GUIDANCE.into());
    }
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. })
        || command.expected_previous_version >= INTERPRETATION_VERSION
        || classic_source_set_sha256(snapshot)? != command.expected_source_identity
        || snapshot.import_interpretation_version != command.expected_previous_version
    {
        return Err("Imported-content repair is stale; review the retained sources again.".into());
    }
    let mut candidate = snapshot.clone();
    let mut changed = Vec::new();
    let mut keys = std::collections::BTreeSet::new();
    for entry in command.changes {
        if !keys.insert(entry.key) {
            return Err("Repair contains duplicate selections.".into());
        }
        apply_change(&mut candidate, entry.change)?;
        changed.push(entry.entity);
    }
    candidate.import_interpretation_version = INTERPRETATION_VERSION;
    changed.push(candidate.project_id.clone());
    candidate.normalize();
    *snapshot = candidate;
    Ok(changed)
}
fn apply_change(candidate: &mut ProjectSnapshot, change: RepairChange) -> Result<(), String> {
    match change {
        RepairChange::NativeText {
            native_path,
            native_id,
            slot,
            expected,
            recovered,
        } => {
            super::native_text::apply(
                candidate,
                &native_path,
                native_id,
                slot,
                &expected,
                recovered,
            )?;
        }
        RepairChange::ShopQuarantine { expected, .. } => {
            shops::apply(candidate, &expected)?;
        }
        RepairChange::Spell { record } => spells::apply(candidate, *record)?,
        RepairChange::ItemText {
            record_index,
            field,
            expected,
            recovered,
        } => {
            items::apply_text(candidate, record_index, &field, &expected, recovered)?;
        }
        RepairChange::ItemTextSource {
            record_index,
            expected,
            recovered,
        } => {
            let record = candidate
                .scenario_item_rules
                .iter_mut()
                .find(|r| r.record_index == record_index)
                .ok_or("Item destination is unavailable.")?;
            if record.text_source_blob != expected {
                return Err("Item text source changed; review the repair again.".into());
            }
            record.text_source_blob = recovered;
        }
    }
    Ok(())
}
