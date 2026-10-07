use super::opcodes::{EXECUTABLE_CLASSIC_OPCODES, source_resolved_runtime_noop_opcode};
use super::{RebuiltV3ClassicInstruction, RebuiltV3InstructionKind, RebuiltV3ScenarioError};
use crate::model::{ClassicAction, ExtraCodeRow, StableId};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) fn instructions_projection(
    owner: &StableId,
    action_rows: &[ClassicAction],
    extra_codes: &BTreeMap<u32, [i16; 5]>,
) -> Result<Vec<RebuiltV3ClassicInstruction>, RebuiltV3ScenarioError> {
    instructions_projection_with_policy(owner, action_rows, extra_codes, false)
}

pub(crate) fn instructions_projection_with_policy(
    owner: &StableId,
    action_rows: &[ClassicAction],
    extra_codes: &BTreeMap<u32, [i16; 5]>,
    allow_deferred: bool,
) -> Result<Vec<RebuiltV3ClassicInstruction>, RebuiltV3ScenarioError> {
    let mut actions = action_rows.iter().collect::<Vec<_>>();
    actions.sort_by_key(|action| action.slot);
    if let Some(action) = actions.iter().find(|action| action.slot >= 8) {
        return Err(RebuiltV3ScenarioError::ActionSlotOutOfRange {
            trigger: owner.clone(),
            slot: action.slot,
        });
    }
    for pair in actions.windows(2) {
        if pair[0].slot == pair[1].slot {
            return Err(RebuiltV3ScenarioError::DuplicateActionSlot {
                trigger: owner.clone(),
                slot: pair[0].slot,
            });
        }
    }
    actions
        .into_iter()
        .filter(|action| allow_deferred || !source_resolved_runtime_noop_opcode(action.opcode()))
        .map(|action| instruction_projection(owner, action, extra_codes, allow_deferred))
        .collect()
}

fn instruction_projection(
    owner: &StableId,
    action: &ClassicAction,
    extra_codes: &BTreeMap<u32, [i16; 5]>,
    allow_deferred: bool,
) -> Result<RebuiltV3ClassicInstruction, RebuiltV3ScenarioError> {
    let opcode = action.opcode();
    if !allow_deferred && EXECUTABLE_CLASSIC_OPCODES.binary_search(&opcode).is_err() {
        return Err(RebuiltV3ScenarioError::UnsupportedClassicOpcode {
            trigger: owner.clone(),
            raw_opcode: action.raw_opcode,
        });
    }
    let native_id = u32::try_from(action.target_native_id).ok();
    let mut extra_code = native_id
        .and_then(|id| extra_codes.get(&id))
        .map(|values| values.to_vec());
    if opcode == 92 {
        attach_rectangle_companion(
            owner,
            action,
            native_id,
            &mut extra_code,
            extra_codes,
            allow_deferred,
        )?;
    }

    Ok(RebuiltV3ClassicInstruction {
        kind: RebuiltV3InstructionKind::ClassicAction,
        slot: action.slot,
        raw_opcode: action.raw_opcode,
        opcode,
        id: action.target_native_id,
        gosub: action.gosub(),
        extra_code,
    })
}

pub(crate) fn extra_code_index(
    rows: &[ExtraCodeRow],
) -> Result<BTreeMap<u32, [i16; 5]>, RebuiltV3ScenarioError> {
    let mut result = BTreeMap::new();
    if let Some(maximum) = rows.iter().map(|row| row.native_id.0).max() {
        result.extend((0..=maximum).map(|native_id| (native_id, [0; 5])));
    }
    let mut seen = BTreeSet::new();
    for row in rows {
        if !seen.insert(row.native_id) {
            return Err(RebuiltV3ScenarioError::DuplicateExtraCodeRow(
                row.native_id.0,
            ));
        }
        result.insert(row.native_id.0, row.values);
    }
    Ok(result)
}

fn attach_rectangle_companion(
    owner: &StableId,
    action: &ClassicAction,
    native_id: Option<u32>,
    extra_code: &mut Option<Vec<i16>>,
    extra_codes: &BTreeMap<u32, [i16; 5]>,
    allow_deferred: bool,
) -> Result<(), RebuiltV3ScenarioError> {
    let Some(primary) = native_id else {
        if !allow_deferred {
            return Err(RebuiltV3ScenarioError::MissingExtraCodeRow {
                trigger: owner.clone(),
                native_id: action.target_native_id,
            });
        }
        return Ok(());
    };
    match extra_code.as_mut() {
        Some(values) => match primary.checked_add(1).and_then(|id| extra_codes.get(&id)) {
            Some(secondary) => values.extend_from_slice(secondary),
            None if !allow_deferred => {
                return Err(RebuiltV3ScenarioError::MissingConsecutiveExtraCodeRow {
                    trigger: owner.clone(),
                    native_id: action.target_native_id.saturating_add(1),
                });
            }
            None => {}
        },
        None if !allow_deferred => {
            return Err(RebuiltV3ScenarioError::MissingExtraCodeRow {
                trigger: owner.clone(),
                native_id: action.target_native_id,
            });
        }
        None => {}
    }
    Ok(())
}
