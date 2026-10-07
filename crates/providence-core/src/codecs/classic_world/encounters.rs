use super::actions::{decode_encounter_actions, encode_encounter_action_words};
use super::bytes::{append_trailing_bytes, read_i16};
use super::types::{ClassicWorldCodecError, DecodedRecordFile, SIMPLE_ENCOUNTER_RECORD_BYTES};
use crate::model::{NativeRecordId, SimpleEncounter, StableId};

pub fn decode_simple_encounters(bytes: &[u8]) -> DecodedRecordFile<SimpleEncounter> {
    let complete_bytes =
        bytes.len() / SIMPLE_ENCOUNTER_RECORD_BYTES * SIMPLE_ENCOUNTER_RECORD_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(SIMPLE_ENCOUNTER_RECORD_BYTES)
        .enumerate()
        .map(|(id, record)| SimpleEncounter {
            identity: StableId(format!("simple-encounter:{id}")),
            native_id: NativeRecordId(id as u32),
            actions: decode_encounter_actions(record),
            choice_results: std::array::from_fn(|slot| record[96 + slot] as i8),
            can_back_out: record[100] != 0,
            max_times: record[101] as i8,
            caste_success: record[102] as i8,
            prompt_message_native_id: read_i16(&record[104..106]),
            texts: std::array::from_fn(|slot| {
                decode_pascal(&record[106 + slot * 80..106 + (slot + 1) * 80])
            }),
            authored: false,
        })
        .collect();
    DecodedRecordFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_simple_encounters(
    encounters: &[SimpleEncounter],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ClassicWorldCodecError> {
    let mut selected = encounters.iter().collect::<Vec<_>>();
    selected.sort_by_key(|encounter| encounter.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(ClassicWorldCodecError::DuplicateEncounterId(
                pair[0].native_id,
            ));
        }
    }
    let source_body = compatibility_source
        .map(|source| source.len() / SIMPLE_ENCOUNTER_RECORD_BYTES * SIMPLE_ENCOUNTER_RECORD_BYTES)
        .unwrap_or(0);
    let required = selected
        .last()
        .map(|encounter| (encounter.native_id.0 as usize + 1) * SIMPLE_ENCOUNTER_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required), 0);
    for encounter in selected {
        let start = encounter.native_id.0 as usize * SIMPLE_ENCOUNTER_RECORD_BYTES;
        if !encounter.authored {
            if start + SIMPLE_ENCOUNTER_RECORD_BYTES <= source_body {
                continue;
            }
            return Err(ClassicWorldCodecError::MissingEncounterCompatibilitySource(
                encounter.native_id,
            ));
        }
        encode_simple_encounter_record(
            &mut output[start..start + SIMPLE_ENCOUNTER_RECORD_BYTES],
            encounter,
        )?;
    }
    append_trailing_bytes(
        &mut output,
        compatibility_source,
        SIMPLE_ENCOUNTER_RECORD_BYTES,
    );
    Ok(output)
}

fn encode_simple_encounter_record(
    record: &mut [u8],
    encounter: &SimpleEncounter,
) -> Result<(), ClassicWorldCodecError> {
    record.fill(0);
    encode_encounter_action_words(record, encounter)?;
    for (slot, result) in encounter.choice_results.iter().enumerate() {
        record[96 + slot] = *result as u8;
    }
    record[100] = u8::from(encounter.can_back_out);
    record[101] = encounter.max_times as u8;
    record[102] = encounter.caste_success as u8;
    record[104..106].copy_from_slice(&encounter.prompt_message_native_id.to_be_bytes());
    for (slot, text) in encounter.texts.iter().enumerate() {
        let bytes = encode_ascii(text);
        if bytes.len() > 79 {
            return Err(ClassicWorldCodecError::EncounterTextTooLong {
                native_id: encounter.native_id,
                slot,
                bytes: bytes.len(),
            });
        }
        let start = 106 + slot * 80;
        record[start] = bytes.len() as u8;
        record[start + 1..start + 1 + bytes.len()].copy_from_slice(&bytes);
    }
    Ok(())
}

fn decode_pascal(bytes: &[u8]) -> String {
    let length = bytes[0] as usize;
    bytes[1..1 + length.min(bytes.len() - 1)]
        .iter()
        .map(|byte| if byte.is_ascii() { *byte as char } else { ' ' })
        .collect::<String>()
        .trim_end()
        .to_owned()
}

fn encode_ascii(text: &str) -> Vec<u8> {
    text.chars()
        .map(|character| {
            if character.is_ascii() {
                character as u8
            } else {
                b'?'
            }
        })
        .collect()
}
