use std::collections::BTreeSet;

use crate::model::{ClassicAction, ComplexEncounter, NativeRecordId, StableId};

pub const COMPLEX_ENCOUNTER_RECORD_BYTES: usize = 520;
pub const COMPLEX_ENCOUNTER_ACTION_SLOTS: usize = 32;
pub const COMPLEX_ENCOUNTER_TEXT_SLOTS: usize = 9;
pub const COMPLEX_ENCOUNTER_TEXT_BYTES: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedComplexEncounterFile {
    pub records: Vec<ComplexEncounter>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComplexEncounterCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    InvalidIdentity {
        native_id: NativeRecordId,
        identity: StableId,
    },
    ActionSlotOutOfRange {
        native_id: NativeRecordId,
        slot: u8,
    },
    DuplicateActionSlot {
        native_id: NativeRecordId,
        slot: u8,
    },
    ActionOpcodeOutOfByteRange {
        native_id: NativeRecordId,
        raw_opcode: i16,
    },
    TextNotAscii {
        native_id: NativeRecordId,
        slot: usize,
    },
    TextTooLong {
        native_id: NativeRecordId,
        slot: usize,
        bytes: usize,
    },
}

impl std::fmt::Display for ComplexEncounterCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(id) => {
                write!(formatter, "duplicate complex encounter id {}", id.0)
            }
            Self::MissingCompatibilitySource(id) => write!(
                formatter,
                "imported complex encounter {} requires its Data ED2 compatibility source",
                id.0
            ),
            Self::InvalidIdentity {
                native_id,
                identity,
            } => write!(
                formatter,
                "complex encounter {} has invalid identity {}",
                native_id.0, identity.0
            ),
            Self::ActionSlotOutOfRange { native_id, slot } => write!(
                formatter,
                "complex encounter {} action slot {slot} is outside 0 through 31",
                native_id.0
            ),
            Self::DuplicateActionSlot { native_id, slot } => write!(
                formatter,
                "complex encounter {} duplicates action slot {slot}",
                native_id.0
            ),
            Self::ActionOpcodeOutOfByteRange {
                native_id,
                raw_opcode,
            } => write!(
                formatter,
                "complex encounter {} opcode {raw_opcode} is outside signed-byte storage",
                native_id.0
            ),
            Self::TextNotAscii { native_id, slot } => write!(
                formatter,
                "complex encounter {} text {slot} is outside the certified ASCII subset",
                native_id.0
            ),
            Self::TextTooLong {
                native_id,
                slot,
                bytes,
            } => write!(
                formatter,
                "complex encounter {} text {slot} encodes to {bytes} bytes; Classic maximum is 39",
                native_id.0
            ),
        }
    }
}

impl std::error::Error for ComplexEncounterCodecError {}

pub fn decode_complex_encounters(bytes: &[u8]) -> DecodedComplexEncounterFile {
    let complete_bytes =
        bytes.len() / COMPLEX_ENCOUNTER_RECORD_BYTES * COMPLEX_ENCOUNTER_RECORD_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(COMPLEX_ENCOUNTER_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| decode_row(row, index as u32))
        .collect();
    DecodedComplexEncounterFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_complex_encounters(
    encounters: &[ComplexEncounter],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ComplexEncounterCodecError> {
    let mut selected = encounters.iter().collect::<Vec<_>>();
    selected.sort_by_key(|encounter| encounter.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(ComplexEncounterCodecError::DuplicateNativeId(
                pair[0].native_id,
            ));
        }
    }

    let source_body = compatibility_source
        .map(|source| {
            source.len() / COMPLEX_ENCOUNTER_RECORD_BYTES * COMPLEX_ENCOUNTER_RECORD_BYTES
        })
        .unwrap_or(0);
    let required = selected
        .last()
        .map(|encounter| (encounter.native_id.0 as usize + 1) * COMPLEX_ENCOUNTER_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required), 0);

    for encounter in selected {
        validate_complex_encounter_shape(encounter)?;
        let start = encounter.native_id.0 as usize * COMPLEX_ENCOUNTER_RECORD_BYTES;
        let end = start + COMPLEX_ENCOUNTER_RECORD_BYTES;
        if !encounter.authored {
            if end <= source_body {
                continue;
            }
            return Err(ComplexEncounterCodecError::MissingCompatibilitySource(
                encounter.native_id,
            ));
        }
        if end <= source_body {
            encode_row_preserving_source(encounter, &mut output[start..end]);
        } else {
            encode_row(encounter, &mut output[start..end]);
        }
    }

    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body..]);
    }
    Ok(output)
}

pub fn validate_complex_encounter_shape(
    encounter: &ComplexEncounter,
) -> Result<(), ComplexEncounterCodecError> {
    if encounter.identity.0 != format!("complex-encounter:{}", encounter.native_id.0) {
        return Err(ComplexEncounterCodecError::InvalidIdentity {
            native_id: encounter.native_id,
            identity: encounter.identity.clone(),
        });
    }
    let mut slots = BTreeSet::new();
    for action in &encounter.actions {
        if action.slot as usize >= COMPLEX_ENCOUNTER_ACTION_SLOTS {
            return Err(ComplexEncounterCodecError::ActionSlotOutOfRange {
                native_id: encounter.native_id,
                slot: action.slot,
            });
        }
        if !slots.insert(action.slot) {
            return Err(ComplexEncounterCodecError::DuplicateActionSlot {
                native_id: encounter.native_id,
                slot: action.slot,
            });
        }
        if !(i8::MIN as i16..=i8::MAX as i16).contains(&action.raw_opcode) {
            return Err(ComplexEncounterCodecError::ActionOpcodeOutOfByteRange {
                native_id: encounter.native_id,
                raw_opcode: action.raw_opcode,
            });
        }
    }
    for (slot, text) in encounter.texts.iter().enumerate() {
        if !encounter.authored {
            continue;
        }
        if !text.is_ascii() {
            return Err(ComplexEncounterCodecError::TextNotAscii {
                native_id: encounter.native_id,
                slot,
            });
        }
        if text.len() > COMPLEX_ENCOUNTER_TEXT_BYTES - 1 {
            return Err(ComplexEncounterCodecError::TextTooLong {
                native_id: encounter.native_id,
                slot,
                bytes: text.len(),
            });
        }
    }
    Ok(())
}

fn decode_row(row: &[u8], native_id: u32) -> ComplexEncounter {
    let native_id = NativeRecordId(native_id);
    ComplexEncounter {
        identity: StableId(format!("complex-encounter:{}", native_id.0)),
        native_id,
        actions: (0..COMPLEX_ENCOUNTER_ACTION_SLOTS)
            .filter_map(|slot| {
                let raw_opcode = row[slot] as i8 as i16;
                let target_native_id = read_i16(row, 32 + slot * 2);
                (raw_opcode != 0 || target_native_id != 0).then_some(ClassicAction {
                    slot: slot as u8,
                    raw_opcode,
                    target_native_id,
                })
            })
            .collect(),
        action_result: row[96] as i8,
        word_result: row[97] as i8,
        groups: std::array::from_fn(|index| row[98 + index] as i8),
        spell_ids: std::array::from_fn(|index| read_i16(row, 106 + index * 2)),
        spell_results: std::array::from_fn(|index| row[126 + index] as i8),
        item_ids: std::array::from_fn(|index| read_i16(row, 136 + index * 2)),
        item_results: std::array::from_fn(|index| row[146 + index] as i8),
        can_back_out: row[151] != 0,
        thief: row[152] != 0,
        max_times: row[153] as i8,
        caste_success: row[154] as i8,
        thief_success: row[155] as i8,
        thief_fail: row[156] as i8,
        prompt_message_native_id: read_i16(row, 158),
        texts: std::array::from_fn(|slot| {
            decode_pascal(&row[160 + slot * 40..160 + (slot + 1) * 40])
        }),
        authored: false,
    }
}

fn encode_row(encounter: &ComplexEncounter, row: &mut [u8]) {
    row.fill(0);
    for action in &encounter.actions {
        let slot = action.slot as usize;
        row[slot] = action.raw_opcode as i8 as u8;
        write_i16(row, 32 + slot * 2, action.target_native_id);
    }
    row[96] = encounter.action_result as u8;
    row[97] = encounter.word_result as u8;
    for (slot, value) in encounter.groups.iter().copied().enumerate() {
        row[98 + slot] = value as u8;
    }
    for (slot, value) in encounter.spell_ids.iter().copied().enumerate() {
        write_i16(row, 106 + slot * 2, value);
    }
    for (slot, value) in encounter.spell_results.iter().copied().enumerate() {
        row[126 + slot] = value as u8;
    }
    for (slot, value) in encounter.item_ids.iter().copied().enumerate() {
        write_i16(row, 136 + slot * 2, value);
    }
    for (slot, value) in encounter.item_results.iter().copied().enumerate() {
        row[146 + slot] = value as u8;
    }
    row[151] = u8::from(encounter.can_back_out);
    row[152] = u8::from(encounter.thief);
    row[153] = encounter.max_times as u8;
    row[154] = encounter.caste_success as u8;
    row[155] = encounter.thief_success as u8;
    row[156] = encounter.thief_fail as u8;
    // Byte 157 is compiler-owned ABI alignment padding.
    row[157] = 0;
    write_i16(row, 158, encounter.prompt_message_native_id);
    for (slot, text) in encounter.texts.iter().enumerate() {
        let start = 160 + slot * COMPLEX_ENCOUNTER_TEXT_BYTES;
        row[start] = text.len() as u8;
        row[start + 1..start + 1 + text.len()].copy_from_slice(text.as_bytes());
    }
}

fn encode_row_preserving_source(encounter: &ComplexEncounter, row: &mut [u8]) {
    let original = decode_row(row, encounter.native_id.0);
    encode_actions_preserving_source(&original, encounter, row);
    encode_response_fields_preserving_source(&original, encounter, row);
    encode_texts_preserving_source(&original, encounter, row);
}

fn encode_actions_preserving_source(
    original: &ComplexEncounter,
    encounter: &ComplexEncounter,
    row: &mut [u8],
) {
    for slot in 0..COMPLEX_ENCOUNTER_ACTION_SLOTS {
        let before = original
            .actions
            .iter()
            .find(|action| action.slot as usize == slot);
        let after = encounter
            .actions
            .iter()
            .find(|action| action.slot as usize == slot);
        if before != after {
            row[slot] = after.map_or(0, |action| action.raw_opcode as i8 as u8);
            write_i16(
                row,
                32 + slot * 2,
                after.map_or(0, |action| action.target_native_id),
            );
        }
    }
}

fn encode_response_fields_preserving_source(
    original: &ComplexEncounter,
    encounter: &ComplexEncounter,
    row: &mut [u8],
) {
    write_i8_if_changed(row, 96, original.action_result, encounter.action_result);
    write_i8_if_changed(row, 97, original.word_result, encounter.word_result);
    for slot in 0..8 {
        write_i8_if_changed(
            row,
            98 + slot,
            original.groups[slot],
            encounter.groups[slot],
        );
    }
    for slot in 0..10 {
        write_i16_if_changed(
            row,
            106 + slot * 2,
            original.spell_ids[slot],
            encounter.spell_ids[slot],
        );
        write_i8_if_changed(
            row,
            126 + slot,
            original.spell_results[slot],
            encounter.spell_results[slot],
        );
    }
    for slot in 0..5 {
        write_i16_if_changed(
            row,
            136 + slot * 2,
            original.item_ids[slot],
            encounter.item_ids[slot],
        );
        write_i8_if_changed(
            row,
            146 + slot,
            original.item_results[slot],
            encounter.item_results[slot],
        );
    }
    if original.can_back_out != encounter.can_back_out {
        row[151] = u8::from(encounter.can_back_out);
    }
    if original.thief != encounter.thief {
        row[152] = u8::from(encounter.thief);
    }
    write_i8_if_changed(row, 153, original.max_times, encounter.max_times);
    write_i8_if_changed(row, 154, original.caste_success, encounter.caste_success);
    write_i8_if_changed(row, 155, original.thief_success, encounter.thief_success);
    write_i8_if_changed(row, 156, original.thief_fail, encounter.thief_fail);
    if original.prompt_message_native_id != encounter.prompt_message_native_id {
        write_i16(row, 158, encounter.prompt_message_native_id);
    }
}

fn encode_texts_preserving_source(
    original: &ComplexEncounter,
    encounter: &ComplexEncounter,
    row: &mut [u8],
) {
    for slot in 0..COMPLEX_ENCOUNTER_TEXT_SLOTS {
        if original.texts[slot] != encounter.texts[slot] {
            let start = 160 + slot * COMPLEX_ENCOUNTER_TEXT_BYTES;
            let field = &mut row[start..start + COMPLEX_ENCOUNTER_TEXT_BYTES];
            field.fill(0);
            let text = encounter.texts[slot].as_bytes();
            field[0] = text.len() as u8;
            field[1..1 + text.len()].copy_from_slice(text);
        }
    }
}

fn write_i8_if_changed(row: &mut [u8], offset: usize, before: i8, after: i8) {
    if before != after {
        row[offset] = after as u8;
    }
}

fn write_i16_if_changed(row: &mut [u8], offset: usize, before: i16, after: i16) {
    if before != after {
        write_i16(row, offset, after);
    }
}

fn decode_pascal(field: &[u8]) -> String {
    let length = usize::from(field[0]).min(field.len().saturating_sub(1));
    String::from_utf8_lossy(&field[1..1 + length]).into_owned()
}

fn read_i16(row: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([row[offset], row[offset + 1]])
}

fn write_i16(row: &mut [u8], offset: usize, value: i16) {
    row[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn authored_encounter(native_id: u32) -> ComplexEncounter {
        ComplexEncounter {
            identity: StableId(format!("complex-encounter:{native_id}")),
            native_id: NativeRecordId(native_id),
            actions: vec![ClassicAction {
                slot: 9,
                raw_opcode: -2,
                target_native_id: 0x0304,
            }],
            action_result: 1,
            word_result: 2,
            groups: [1, 0, -1, 0, 0, 0, 0, 0],
            spell_ids: [1, 0x1112, 0, 0, 0, 0, 0, 0, 0, 0],
            spell_results: [2, 3, 0, 0, 0, 0, 0, 0, 0, 0],
            item_ids: [0x1314, 0, 0, 0, 0],
            item_results: [3, 0, 0, 0, 0],
            can_back_out: true,
            thief: true,
            max_times: -3,
            caste_success: 4,
            thief_success: 5,
            thief_fail: 6,
            prompt_message_native_id: 0x0506,
            texts: std::array::from_fn(|slot| {
                if slot == 8 {
                    "dragon".into()
                } else {
                    format!("Choice {slot}")
                }
            }),
            authored: true,
        }
    }

    #[test]
    fn semantic_round_trip_covers_every_owned_field() {
        let expected = authored_encounter(0);
        let encoded = encode_complex_encounters(std::slice::from_ref(&expected), None).unwrap();
        assert_eq!(encoded.len(), COMPLEX_ENCOUNTER_RECORD_BYTES);
        assert_eq!(encoded[157], 0);
        let mut decoded = decode_complex_encounters(&encoded).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_round_trip_preserves_padding_pascal_slack_and_tail() {
        let mut source = encode_complex_encounters(&[authored_encounter(0)], None).unwrap();
        source[157] = 0xa5;
        source[160 + 10] = 0xcc;
        source.extend_from_slice(&[0xde, 0xad]);
        let decoded = decode_complex_encounters(&source);
        assert_eq!(
            encode_complex_encounters(&decoded.records, Some(&source)).unwrap(),
            source
        );
        assert_eq!(decoded.trailing_bytes, [0xde, 0xad]);
    }

    #[test]
    fn editing_one_field_preserves_every_other_source_byte() {
        let mut source =
            encode_complex_encounters(&[authored_encounter(0), authored_encounter(1)], None)
                .unwrap();
        source[157] = 0x91;
        source[COMPLEX_ENCOUNTER_RECORD_BYTES + 157] = 0x92;
        let mut decoded = decode_complex_encounters(&source).records;
        decoded[1].authored = true;
        decoded[1].word_result = 4;
        let output = encode_complex_encounters(&decoded, Some(&source)).unwrap();
        assert_eq!(
            &output[..COMPLEX_ENCOUNTER_RECORD_BYTES],
            &source[..COMPLEX_ENCOUNTER_RECORD_BYTES]
        );
        assert_eq!(output[COMPLEX_ENCOUNTER_RECORD_BYTES + 97], 4);
        assert_eq!(output[COMPLEX_ENCOUNTER_RECORD_BYTES + 157], 0x92);
        let changed = output
            .iter()
            .zip(source.iter())
            .enumerate()
            .filter_map(|(offset, (after, before))| (after != before).then_some(offset))
            .collect::<Vec<_>>();
        assert_eq!(changed, [COMPLEX_ENCOUNTER_RECORD_BYTES + 97]);
    }

    #[test]
    fn editing_text_rewrites_only_its_pascal_field_and_preserves_alignment() {
        let mut source = encode_complex_encounters(&[authored_encounter(0)], None).unwrap();
        source[157] = 0x7d;
        source[160 + 25] = 0xcc;
        let mut encounter = decode_complex_encounters(&source).records.remove(0);
        encounter.authored = true;
        encounter.texts[0] = "New response".into();
        let output = encode_complex_encounters(&[encounter], Some(&source)).unwrap();
        assert_eq!(output[157], 0x7d);
        assert_eq!(&output[..160], &source[..160]);
        assert_eq!(&output[200..], &source[200..]);
        assert_eq!(
            decode_complex_encounters(&output).records[0].texts[0],
            "New response"
        );
    }

    #[test]
    fn authored_text_is_bounded_to_pascal_payload() {
        let mut encounter = authored_encounter(0);
        encounter.texts[0] = "x".repeat(40);
        assert!(matches!(
            encode_complex_encounters(&[encounter], None),
            Err(ComplexEncounterCodecError::TextTooLong { bytes: 40, .. })
        ));
    }
}
