//! Verified in-place writes with explicit confirmation of other affected actions.
use super::{ActionSettingsCallerConfirmation, ActionSettingsWriteScope};
use crate::model::{ExtraCodeRow, ProjectSnapshot, StableId};
use std::collections::BTreeSet;

pub(crate) const LEGACY_SHARED_WRITE_UNSUPPORTED: &str = "This legacy shared-write request is unsupported; review the changed-word impact and confirm every affected action.";

pub(crate) fn check_scope(shared: bool) -> Result<(), String> {
    if shared {
        Err(LEGACY_SHARED_WRITE_UNSUPPORTED.into())
    } else {
        Ok(())
    }
}

pub(crate) fn validate_scope(scope: &ActionSettingsWriteScope) -> Result<(), String> {
    check_scope(matches!(
        scope,
        ActionSettingsWriteScope::UpdateAllCompatible { .. }
    ))
}

/// The caller supplies the final reference graph with baseline settings bytes.
/// Confirmation is exact, including multiplicity, and the command checks revision.
pub(crate) fn confirm(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
    rows: &[ExtraCodeRow],
    transaction_writes: &[ExtraCodeRow],
    scope: &ActionSettingsWriteScope,
) -> Result<Vec<ActionSettingsCallerConfirmation>, String> {
    validate_scope(scope)?;
    let selected = BTreeSet::from([ActionSettingsCallerConfirmation {
        source: source.clone(),
        slot,
    }]);
    let impact = crate::action_settings_effects::impacted_callers_in_transaction(
        snapshot,
        rows,
        transaction_writes,
        &selected,
    )?;
    if !impact.is_empty()
        && rows.iter().any(|row| {
            !snapshot
                .extra_codes
                .iter()
                .any(|existing| existing.native_id == row.native_id)
        })
    {
        return Err("Shared creation of missing settings is unsupported; create independent settings for this action.".into());
    }
    if let ActionSettingsWriteScope::UpdateAffected { confirmed_callers } = scope {
        let confirmed = confirmed_callers.iter().cloned().collect::<BTreeSet<_>>();
        if confirmed.len() != confirmed_callers.len()
            || confirmed != impact.iter().cloned().collect()
        {
            return Err("The affected actions changed or the confirmation is incomplete; review the settings impact again.".into());
        }
    } else if !impact.is_empty() {
        return Err("These settings changes affect other actions; review and confirm every affected action before applying.".into());
    }
    Ok(impact)
}

pub(crate) fn available_id(snapshot: &ProjectSnapshot, paired: bool) -> Result<u32, String> {
    SettingsAllocator::new(snapshot).allocate(paired)
}

pub(crate) struct SettingsAllocator {
    occupied: BTreeSet<u32>,
}

impl SettingsAllocator {
    pub(crate) fn new(snapshot: &ProjectSnapshot) -> Self {
        let mut occupied = BTreeSet::new();
        let mut seen = BTreeSet::new();
        for row in &snapshot.extra_codes {
            if !seen.insert(row.native_id.0) || row.values != [0; 5] {
                occupied.insert(row.native_id.0);
            }
        }
        // Protect stored references even in non-semantic encounter padding.
        let actions = snapshot
            .world
            .action_points
            .iter()
            .flat_map(|row| &row.actions)
            .chain(
                snapshot
                    .extra_action_points
                    .iter()
                    .flat_map(|row| &row.actions),
            )
            .chain(
                snapshot
                    .simple_encounters
                    .iter()
                    .flat_map(|row| &row.actions),
            )
            .chain(
                snapshot
                    .complex_encounters
                    .iter()
                    .flat_map(|row| &row.actions),
            );
        for action in actions {
            if crate::classic_action_settings::primary_words(action.opcode()).is_none() {
                continue;
            }
            if let Ok(id) = u32::try_from(action.target_native_id) {
                occupied.insert(id);
                if action.opcode() == 92 {
                    occupied.insert(id + 1);
                }
            }
        }
        Self { occupied }
    }

    pub(crate) fn allocate(&mut self, paired: bool) -> Result<u32, String> {
        let id = (0..=i16::MAX as u32)
            .find(|id| {
                !self.occupied.contains(id) && (!paired || !self.occupied.contains(&(id + 1)))
            })
            .ok_or_else(|| {
                if paired {
                    "no contiguous pair of Classic settings rows is available".to_owned()
                } else {
                    "no Classic settings row is available".to_owned()
                }
            })?;
        self.occupied.insert(id);
        if paired {
            self.occupied.insert(id + 1);
        }
        Ok(id)
    }

    pub(crate) fn contains(&self, id: u32) -> bool {
        self.occupied.contains(&id)
    }
}

pub(crate) fn changes_other_action(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
    rows: &[ExtraCodeRow],
) -> Result<bool, String> {
    let selected = std::collections::BTreeSet::from([super::ActionSettingsCallerConfirmation {
        source: source.clone(),
        slot,
    }]);
    crate::action_settings_effects::impacted_callers(snapshot, rows, &selected)
        .map(|callers| !callers.is_empty())
}

pub(crate) fn isolate_rows(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
    rows: &mut [ExtraCodeRow],
) -> Result<(), String> {
    if changes_other_action(snapshot, source, slot, rows)? {
        let base = available_id(snapshot, rows.len() == 2)?;
        for (offset, row) in rows.iter_mut().enumerate() {
            row.native_id.0 = base + offset as u32;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
