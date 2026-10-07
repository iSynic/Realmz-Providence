mod contracts;
mod inputs;
mod records;

use crate::model::ProjectSnapshot;
pub use contracts::{RebuiltV3BattleDefinition, RebuiltV3BattleError, RebuiltV3BattleMonsterSlot};
use inputs::{BattleInputs, validate_selected_ids};
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_battles(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3BattleDefinition>, RebuiltV3BattleError> {
    project_rebuilt_v3_battles_filtered(snapshot, None)
}

pub fn project_rebuilt_v3_battles_by_classic_ids(
    snapshot: &ProjectSnapshot,
    classic_ids: &BTreeSet<u32>,
) -> Result<Vec<RebuiltV3BattleDefinition>, RebuiltV3BattleError> {
    project_rebuilt_v3_battles_filtered(snapshot, Some(classic_ids))
}

fn project_rebuilt_v3_battles_filtered(
    snapshot: &ProjectSnapshot,
    selected_classic_ids: Option<&BTreeSet<u32>>,
) -> Result<Vec<RebuiltV3BattleDefinition>, RebuiltV3BattleError> {
    let allow_deferred = selected_classic_ids.is_some()
        && matches!(
            snapshot.origin,
            crate::model::ProjectOrigin::Imported { .. }
        );
    // Missing requested battles precede catalog ambiguity and record defects.
    validate_selected_ids(snapshot, selected_classic_ids)?;
    let inputs = BattleInputs::new(snapshot, allow_deferred)?;

    let mut records = snapshot
        .battles
        .iter()
        .filter(|battle| {
            selected_classic_ids.is_none_or(|classic_ids| classic_ids.contains(&battle.native_id.0))
        })
        .collect::<Vec<_>>();
    records.sort_by_key(|battle| battle.native_id);
    let mut classic_ids = BTreeSet::new();
    let mut projected = Vec::with_capacity(records.len());
    for battle in records {
        if !classic_ids.insert(battle.native_id.0) {
            return Err(RebuiltV3BattleError::DuplicateClassicId(battle.native_id.0));
        }
        projected.push(inputs.project(battle)?);
    }
    Ok(projected)
}

#[cfg(test)]
mod tests;
