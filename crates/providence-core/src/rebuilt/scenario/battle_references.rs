use super::RebuiltV3ScenarioError;
use super::instructions::extra_code_index;
use super::random_rectangles::rebuilt_v3_random_rectangle_battle_ids;
use super::triggers::placed_trigger_is_defined;
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::encounters::simple_encounter_is_runtime_representable;
use std::collections::BTreeSet;

pub fn rebuilt_v3_referenced_battle_ids(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeSet<u32>, RebuiltV3ScenarioError> {
    let extra_codes = extra_code_index(&snapshot.extra_codes)?;
    let available_battle_ids = snapshot
        .battles
        .iter()
        .map(|battle| battle.native_id.0)
        .collect::<BTreeSet<_>>();
    let mut battle_ids = rebuilt_v3_random_rectangle_battle_ids(snapshot);
    for (owner, actions) in action_owners(snapshot) {
        for action in actions {
            if !matches!(action.opcode(), 2 | 48 | 56 | 107) {
                continue;
            }
            let values = battle_range_values(owner, action, &extra_codes)?;
            let low = i32::from(values[0]).unsigned_abs();
            let high = i32::from(values[1]).unsigned_abs();
            let referenced = if values[1] == 0 || high < low || high - low + 1 > 32_767 {
                low..=low
            } else {
                low..=high
            };
            for battle_id in referenced {
                if !available_battle_ids.contains(&battle_id) {
                    return Err(RebuiltV3ScenarioError::MissingReferencedBattle {
                        owner: owner.clone(),
                        opcode: action.opcode(),
                        battle_id,
                    });
                }
                battle_ids.insert(battle_id);
            }
        }
    }
    Ok(battle_ids)
}

fn action_owners(
    snapshot: &ProjectSnapshot,
) -> impl Iterator<Item = (&StableId, &[crate::model::ClassicAction])> {
    snapshot
        .world
        .action_points
        .iter()
        .filter(|row| placed_trigger_is_defined(row))
        .map(|row| (&row.identity, row.actions.as_slice()))
        .chain(
            snapshot
                .extra_action_points
                .iter()
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
        .chain(
            snapshot
                .simple_encounters
                .iter()
                .filter(|encounter| simple_encounter_is_runtime_representable(encounter))
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
        .chain(
            snapshot
                .complex_encounters
                .iter()
                .map(|row| (&row.identity, row.actions.as_slice())),
        )
}

fn battle_range_values<'a>(
    owner: &StableId,
    action: &crate::model::ClassicAction,
    extra_codes: &'a std::collections::BTreeMap<u32, [i16; 5]>,
) -> Result<&'a [i16; 5], RebuiltV3ScenarioError> {
    let native_id = u32::try_from(action.target_native_id).map_err(|_| {
        RebuiltV3ScenarioError::MissingBattleRangeExtraCodeRow {
            owner: owner.clone(),
            opcode: action.opcode(),
            native_id: action.target_native_id,
        }
    })?;
    let values = extra_codes.get(&native_id).ok_or_else(|| {
        RebuiltV3ScenarioError::MissingBattleRangeExtraCodeRow {
            owner: owner.clone(),
            opcode: action.opcode(),
            native_id: action.target_native_id,
        }
    })?;

    Ok(values)
}
