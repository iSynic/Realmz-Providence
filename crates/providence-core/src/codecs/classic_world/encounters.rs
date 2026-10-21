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
            start + SIMPLE_ENCOUNTER_RECORD_BYTES <= source_body,
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
    imported: bool,
) -> Result<(), ClassicWorldCodecError> {
    let original = imported.then(|| decode_simple_encounters(record).records.remove(0));
    let mut encoded = [0; SIMPLE_ENCOUNTER_RECORD_BYTES];
    encode_encounter_action_words(&mut encoded, encounter)?;
    record[..100].copy_from_slice(&encoded[..100]);
    for (slot, result) in encounter.choice_results.iter().enumerate() {
        record[96 + slot] = *result as u8;
    }
    if original
        .as_ref()
        .is_none_or(|before| before.can_back_out != encounter.can_back_out)
    {
        record[100] = u8::from(encounter.can_back_out);
    }
    record[101] = encounter.max_times as u8;
    record[102] = encounter.caste_success as u8;
    record[104..106].copy_from_slice(&encounter.prompt_message_native_id.to_be_bytes());
    for (slot, text) in encounter.texts.iter().enumerate() {
        if original
            .as_ref()
            .is_some_and(|before| before.texts[slot] == *text)
        {
            continue;
        }
        let bytes = crate::codecs::encode_classic_text_payload(text).map_err(|error| {
            ClassicWorldCodecError::EncounterTextUnrepresentable {
                native_id: encounter.native_id,
                slot,
                reason: error.to_string(),
            }
        })?;
        if bytes.len() > 79 {
            return Err(ClassicWorldCodecError::EncounterTextTooLong {
                native_id: encounter.native_id,
                slot,
                bytes: bytes.len(),
            });
        }
        let start = 106 + slot * 80;
        record[start..start + 80].fill(0);
        record[start] = bytes.len() as u8;
        record[start + 1..start + 1 + bytes.len()].copy_from_slice(&bytes);
    }
    Ok(())
}

fn decode_pascal(bytes: &[u8]) -> String {
    let length = bytes[0] as usize;
    super::super::classic_text_resources::decode_mac_roman_text(
        &bytes[1..1 + length.min(bytes.len() - 1)],
    )
}

pub fn decode_simple_choice_display(bytes: &[u8]) -> Option<String> {
    if bytes.len() != 80 {
        return None;
    }
    let payload = &bytes[1..1 + usize::from(bytes[0]).min(79)];
    let end = payload
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(payload.len());
    Some(
        crate::codecs::classic_text_resources::decode_mac_roman_text(&payload[..end])
            .trim_end_matches(' ')
            .to_owned(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_choice_display_clamps_prefix_and_stops_at_nul_without_editing_source() {
        let mut raw = [b' '; 80];
        raw[0] = 255;
        raw[1..7].copy_from_slice(&[b'A', 0x80, 13, b'B', 0, b'X']);
        assert_eq!(
            decode_simple_choice_display(&raw).as_deref(),
            Some("A\u{c4}\nB")
        );
        assert_eq!(raw[0], 255);
        raw[0] = 0;
        assert_eq!(decode_simple_choice_display(&raw).as_deref(), Some(""));
        raw.fill(b'X');
        raw[0] = 255;
        assert_eq!(decode_simple_choice_display(&raw).unwrap().len(), 79);
        assert!(decode_simple_choice_display(&raw[..79]).is_none());
        let mut source = vec![0; SIMPLE_ENCOUNTER_RECORD_BYTES];
        source[106..186].copy_from_slice(&raw);
        let decoded = decode_simple_encounters(&source);
        assert_eq!(
            encode_simple_encounters(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }
}
