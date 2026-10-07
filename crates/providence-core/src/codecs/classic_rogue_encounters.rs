use crate::model::{NativeRecordId, RogueEncounter, StableId};

pub const ROGUE_ENCOUNTER_RECORD_BYTES: usize = 118;
pub const ROGUE_ENCOUNTER_ACTION_SLOTS: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedRogueEncounterFile {
    pub records: Vec<RogueEncounter>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RogueEncounterCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    InvalidIdentity {
        native_id: NativeRecordId,
        identity: StableId,
    },
}

impl std::fmt::Display for RogueEncounterCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(id) => {
                write!(formatter, "duplicate Rogue encounter id {}", id.0)
            }
            Self::MissingCompatibilitySource(id) => write!(
                formatter,
                "imported Rogue encounter {} requires its Data TD2 compatibility source",
                id.0
            ),
            Self::InvalidIdentity {
                native_id,
                identity,
            } => write!(
                formatter,
                "Rogue encounter {} has invalid identity {}",
                native_id.0, identity.0
            ),
        }
    }
}

impl std::error::Error for RogueEncounterCodecError {}

pub fn decode_rogue_encounters(bytes: &[u8]) -> DecodedRogueEncounterFile {
    let complete_bytes = bytes.len() / ROGUE_ENCOUNTER_RECORD_BYTES * ROGUE_ENCOUNTER_RECORD_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(ROGUE_ENCOUNTER_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| decode_row(row, index as u32))
        .collect();
    DecodedRogueEncounterFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_rogue_encounters(
    encounters: &[RogueEncounter],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, RogueEncounterCodecError> {
    let mut selected = encounters.iter().collect::<Vec<_>>();
    selected.sort_by_key(|encounter| encounter.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(RogueEncounterCodecError::DuplicateNativeId(
                pair[0].native_id,
            ));
        }
    }

    let source_body = compatibility_source
        .map(|source| source.len() / ROGUE_ENCOUNTER_RECORD_BYTES * ROGUE_ENCOUNTER_RECORD_BYTES)
        .unwrap_or(0);
    let required = selected
        .last()
        .map(|encounter| (encounter.native_id.0 as usize + 1) * ROGUE_ENCOUNTER_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required), 0);

    for encounter in selected {
        validate_rogue_encounter_shape(encounter)?;
        let start = encounter.native_id.0 as usize * ROGUE_ENCOUNTER_RECORD_BYTES;
        let end = start + ROGUE_ENCOUNTER_RECORD_BYTES;
        if !encounter.authored {
            if end <= source_body {
                continue;
            }
            return Err(RogueEncounterCodecError::MissingCompatibilitySource(
                encounter.native_id,
            ));
        }
        let flags = (end <= source_body)
            .then(|| std::array::from_fn::<u8, 10, _>(|slot| output[start + slot]));
        encode_row(encounter, &mut output[start..end]);
        if let Some(flags) = flags {
            for (slot, original) in flags.into_iter().enumerate() {
                if (original != 0) == encounter.type_flags[slot] {
                    output[start + slot] = original;
                }
            }
        }
    }

    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body..]);
    }
    Ok(output)
}

pub fn validate_rogue_encounter_shape(
    encounter: &RogueEncounter,
) -> Result<(), RogueEncounterCodecError> {
    if encounter.identity.0 != format!("rogue-encounter:{}", encounter.native_id.0) {
        return Err(RogueEncounterCodecError::InvalidIdentity {
            native_id: encounter.native_id,
            identity: encounter.identity.clone(),
        });
    }
    Ok(())
}

fn decode_row(row: &[u8], native_id: u32) -> RogueEncounter {
    let native_id = NativeRecordId(native_id);
    RogueEncounter {
        identity: StableId(format!("rogue-encounter:{}", native_id.0)),
        native_id,
        type_flags: std::array::from_fn(|slot| row[slot] != 0),
        modifiers: std::array::from_fn(|slot| row[10 + slot] as i8),
        success_codes: std::array::from_fn(|slot| row[18 + slot] as i8),
        failure_codes: std::array::from_fn(|slot| row[26 + slot] as i8),
        success_text: read_i16_array(row, 34),
        failure_text: read_i16_array(row, 50),
        success_sounds: read_i16_array(row, 66),
        failure_sounds: read_i16_array(row, 82),
        spell: read_i16(row, 98),
        low_damage: read_i16(row, 100),
        high_damage: read_i16(row, 102),
        tumblers: read_i16(row, 104),
        prompts: read_i16_array(row, 106),
        prompt_sounds: read_i16_array(row, 112),
        authored: false,
    }
}

fn encode_row(encounter: &RogueEncounter, row: &mut [u8]) {
    row.fill(0);
    for (slot, value) in encounter.type_flags.iter().copied().enumerate() {
        row[slot] = u8::from(value);
    }
    for (slot, value) in encounter.modifiers.iter().copied().enumerate() {
        row[10 + slot] = value as u8;
    }
    for (slot, value) in encounter.success_codes.iter().copied().enumerate() {
        row[18 + slot] = value as u8;
    }
    for (slot, value) in encounter.failure_codes.iter().copied().enumerate() {
        row[26 + slot] = value as u8;
    }
    write_i16_array(row, 34, &encounter.success_text);
    write_i16_array(row, 50, &encounter.failure_text);
    write_i16_array(row, 66, &encounter.success_sounds);
    write_i16_array(row, 82, &encounter.failure_sounds);
    write_i16(row, 98, encounter.spell);
    write_i16(row, 100, encounter.low_damage);
    write_i16(row, 102, encounter.high_damage);
    write_i16(row, 104, encounter.tumblers);
    write_i16_array(row, 106, &encounter.prompts);
    write_i16_array(row, 112, &encounter.prompt_sounds);
}

fn read_i16_array<const N: usize>(row: &[u8], offset: usize) -> [i16; N] {
    std::array::from_fn(|slot| read_i16(row, offset + slot * 2))
}

fn write_i16_array(row: &mut [u8], offset: usize, values: &[i16]) {
    for (slot, value) in values.iter().copied().enumerate() {
        write_i16(row, offset + slot * 2, value);
    }
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

    fn authored_encounter(native_id: u32) -> RogueEncounter {
        RogueEncounter {
            identity: StableId(format!("rogue-encounter:{native_id}")),
            native_id: NativeRecordId(native_id),
            type_flags: [
                true, false, true, false, true, false, true, false, true, true,
            ],
            modifiers: [-1, 2, -3, 4, -5, 6, -7, 8],
            success_codes: [1, 2, 3, 4, -1, -2, -3, -4],
            failure_codes: [4, 3, 2, 1, -4, -3, -2, -1],
            success_text: [0x101, 0x102, 0x103, 0x104, 0x105, 0x106, 0x107, 0x108],
            failure_text: [0x201, 0x202, 0x203, 0x204, 0x205, 0x206, 0x207, 0x208],
            success_sounds: [0x301, 0x302, 0x303, 0x304, 0x305, 0x306, 0x307, 0x308],
            failure_sounds: [0x401, 0x402, 0x403, 0x404, 0x405, 0x406, 0x407, 0x408],
            spell: 0x501,
            low_damage: 0x502,
            high_damage: 0x503,
            tumblers: 0x504,
            prompts: [0x601, 0x602, 0x603],
            prompt_sounds: [0x701, 0x702, 0x703],
            authored: true,
        }
    }

    #[test]
    fn semantic_round_trip_covers_every_owned_field() {
        let expected = authored_encounter(0);
        let encoded = encode_rogue_encounters(std::slice::from_ref(&expected), None).unwrap();
        assert_eq!(encoded.len(), ROGUE_ENCOUNTER_RECORD_BYTES);
        let mut decoded = decode_rogue_encounters(&encoded).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_round_trip_preserves_noncanonical_booleans_and_tail() {
        let mut source = encode_rogue_encounters(&[authored_encounter(0)], None).unwrap();
        source[5] = 72;
        source[6] = 191;
        source.extend_from_slice(&[0xde, 0xad]);
        let decoded = decode_rogue_encounters(&source);
        assert_eq!(
            encode_rogue_encounters(&decoded.records, Some(&source)).unwrap(),
            source
        );
        assert_eq!(decoded.trailing_bytes, [0xde, 0xad]);
    }

    #[test]
    fn editing_one_row_retains_unchanged_flag_bytes_and_normalizes_only_a_changed_flag() {
        let mut source =
            encode_rogue_encounters(&[authored_encounter(0), authored_encounter(1)], None).unwrap();
        source[5] = 72;
        source[ROGUE_ENCOUNTER_RECORD_BYTES + 6] = 191;
        let mut decoded = decode_rogue_encounters(&source).records;
        decoded[1].authored = true;
        decoded[1].tumblers = 9;
        let output = encode_rogue_encounters(&decoded, Some(&source)).unwrap();
        assert_eq!(
            &output[..ROGUE_ENCOUNTER_RECORD_BYTES],
            &source[..ROGUE_ENCOUNTER_RECORD_BYTES]
        );
        assert_eq!(output[ROGUE_ENCOUNTER_RECORD_BYTES + 6], 191);
        decoded[1].type_flags[6] = false;
        let disabled = encode_rogue_encounters(&decoded, Some(&source)).unwrap();
        assert_eq!(disabled[ROGUE_ENCOUNTER_RECORD_BYTES + 6], 0);
        assert_eq!(read_i16(&output, ROGUE_ENCOUNTER_RECORD_BYTES + 104), 9);
    }
}
