use super::bytes::read_i16;
use super::types::ClassicWorldCodecError;
use crate::model::{ClassicAction, SimpleEncounter, StableId};
use std::collections::BTreeSet;

pub(super) fn decode_action_words(record: &[u8]) -> Vec<ClassicAction> {
    (0..8)
        .filter_map(|slot| {
            let raw_opcode = read_i16(&record[8 + slot * 2..10 + slot * 2]);
            let target_native_id = read_i16(&record[24 + slot * 2..26 + slot * 2]);
            (raw_opcode != 0 || target_native_id != 0).then_some(ClassicAction {
                slot: slot as u8,
                raw_opcode,
                target_native_id,
            })
        })
        .collect()
}

pub(super) fn decode_encounter_actions(record: &[u8]) -> Vec<ClassicAction> {
    (0..32)
        .filter_map(|slot| {
            let raw_opcode = record[slot] as i8 as i16;
            let target_native_id = read_i16(&record[32 + slot * 2..34 + slot * 2]);
            (raw_opcode != 0 || target_native_id != 0).then_some(ClassicAction {
                slot: slot as u8,
                raw_opcode,
                target_native_id,
            })
        })
        .collect()
}

pub(super) fn encode_action_words(
    record: &mut [u8],
    identity: &StableId,
    actions: &[ClassicAction],
    slot_count: u8,
) -> Result<(), ClassicWorldCodecError> {
    let mut slots = BTreeSet::new();
    for action in actions {
        if action.slot >= slot_count {
            return Err(ClassicWorldCodecError::ActionSlotOutOfRange {
                identity: identity.clone(),
                slot: action.slot,
                maximum: slot_count - 1,
            });
        }
        if !slots.insert(action.slot) {
            return Err(ClassicWorldCodecError::DuplicateActionSlot {
                identity: identity.clone(),
                slot: action.slot,
            });
        }
        let slot = action.slot as usize;
        record[8 + slot * 2..10 + slot * 2].copy_from_slice(&action.raw_opcode.to_be_bytes());
        record[24 + slot * 2..26 + slot * 2]
            .copy_from_slice(&action.target_native_id.to_be_bytes());
    }
    Ok(())
}

pub(super) fn encode_encounter_action_words(
    record: &mut [u8],
    encounter: &SimpleEncounter,
) -> Result<(), ClassicWorldCodecError> {
    let mut slots = BTreeSet::new();
    for action in &encounter.actions {
        if action.slot >= 32 {
            return Err(ClassicWorldCodecError::ActionSlotOutOfRange {
                identity: encounter.identity.clone(),
                slot: action.slot,
                maximum: 31,
            });
        }
        if !(i8::MIN as i16..=i8::MAX as i16).contains(&action.raw_opcode) {
            return Err(ClassicWorldCodecError::ActionOpcodeOutOfByteRange {
                identity: encounter.identity.clone(),
                raw_opcode: action.raw_opcode,
            });
        }
        if !slots.insert(action.slot) {
            return Err(ClassicWorldCodecError::DuplicateActionSlot {
                identity: encounter.identity.clone(),
                slot: action.slot,
            });
        }
        let slot = action.slot as usize;
        record[slot] = action.raw_opcode as i8 as u8;
        record[32 + slot * 2..34 + slot * 2]
            .copy_from_slice(&action.target_native_id.to_be_bytes());
    }
    Ok(())
}
