use crate::model::{NativeRecordId, StableId, TimedEncounter, TimedEncounterLocationKind};

pub const TIMED_ENCOUNTER_RECORD_BYTES: usize = 40;
pub const TIMED_ENCOUNTER_OWNED_BYTES: usize = 22;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedTimedEncounterFile {
    pub records: Vec<TimedEncounter>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimedEncounterCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    InvalidIdentity {
        native_id: NativeRecordId,
        identity: StableId,
    },
}

impl std::fmt::Display for TimedEncounterCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(id) => {
                write!(formatter, "duplicate timed encounter id {}", id.0)
            }
            Self::MissingCompatibilitySource(id) => write!(
                formatter,
                "imported timed encounter {} requires its Data TD3 compatibility source",
                id.0
            ),
            Self::InvalidIdentity {
                native_id,
                identity,
            } => write!(
                formatter,
                "timed encounter {} has invalid identity {}",
                native_id.0, identity.0
            ),
        }
    }
}

impl std::error::Error for TimedEncounterCodecError {}

pub fn decode_timed_encounters(bytes: &[u8]) -> DecodedTimedEncounterFile {
    let complete = bytes.len() / TIMED_ENCOUNTER_RECORD_BYTES * TIMED_ENCOUNTER_RECORD_BYTES;
    let records = bytes[..complete]
        .chunks_exact(TIMED_ENCOUNTER_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| decode_row(row, index as u32))
        .collect();
    DecodedTimedEncounterFile {
        records,
        trailing_bytes: bytes[complete..].to_vec(),
    }
}

pub fn encode_timed_encounters(
    encounters: &[TimedEncounter],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, TimedEncounterCodecError> {
    let mut selected = encounters.iter().collect::<Vec<_>>();
    selected.sort_by_key(|encounter| encounter.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(TimedEncounterCodecError::DuplicateNativeId(
                pair[0].native_id,
            ));
        }
    }
    let source_body = compatibility_source
        .map(|source| source.len() / TIMED_ENCOUNTER_RECORD_BYTES * TIMED_ENCOUNTER_RECORD_BYTES)
        .unwrap_or(0);
    let required = selected
        .last()
        .map(|encounter| (encounter.native_id.0 as usize + 1) * TIMED_ENCOUNTER_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required), 0);
    for encounter in selected {
        validate_timed_encounter_shape(encounter)?;
        let start = encounter.native_id.0 as usize * TIMED_ENCOUNTER_RECORD_BYTES;
        let end = start + TIMED_ENCOUNTER_RECORD_BYTES;
        if !encounter.authored {
            if end <= source_body {
                continue;
            }
            return Err(TimedEncounterCodecError::MissingCompatibilitySource(
                encounter.native_id,
            ));
        }
        let unchanged_location = end <= source_body
            && decode_row(&output[start..end], encounter.native_id.0).location_kind
                == encounter.location_kind;
        let original_location = [output[start + 20], output[start + 21]];
        encode_owned_fields(encounter, &mut output[start..end]);
        if unchanged_location {
            output[start + 20..start + 22].copy_from_slice(&original_location);
        }
    }
    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body..]);
    }
    Ok(output)
}

pub fn validate_timed_encounter_shape(
    encounter: &TimedEncounter,
) -> Result<(), TimedEncounterCodecError> {
    if encounter.identity.0 != format!("timed-encounter:{}", encounter.native_id.0) {
        return Err(TimedEncounterCodecError::InvalidIdentity {
            native_id: encounter.native_id,
            identity: encounter.identity.clone(),
        });
    }
    Ok(())
}

fn decode_row(row: &[u8], native_id: u32) -> TimedEncounter {
    let native_id = NativeRecordId(native_id);
    TimedEncounter {
        identity: StableId(format!("timed-encounter:{}", native_id.0)),
        native_id,
        day: read_i16(row, 0),
        increment: read_i16(row, 2),
        percent: read_i16(row, 4),
        door: read_i16(row, 6),
        required_level: read_i16(row, 8),
        required_random_rect: read_i16(row, 10),
        required_x: read_i16(row, 12),
        required_y: read_i16(row, 14),
        required_item: read_i16(row, 16),
        required_quest: read_i16(row, 18),
        location_kind: match read_i16(row, 20) {
            1 => TimedEncounterLocationKind::Land,
            2 => TimedEncounterLocationKind::Dungeon,
            _ => TimedEncounterLocationKind::Any,
        },
        authored: false,
    }
}

fn encode_owned_fields(encounter: &TimedEncounter, row: &mut [u8]) {
    for (offset, value) in [
        (0, encounter.day),
        (2, encounter.increment),
        (4, encounter.percent),
        (6, encounter.door),
        (8, encounter.required_level),
        (10, encounter.required_random_rect),
        (12, encounter.required_x),
        (14, encounter.required_y),
        (16, encounter.required_item),
        (18, encounter.required_quest),
    ] {
        write_i16(row, offset, value);
    }
    write_i16(
        row,
        20,
        match encounter.location_kind {
            TimedEncounterLocationKind::Any => -1,
            TimedEncounterLocationKind::Land => 1,
            TimedEncounterLocationKind::Dungeon => 2,
        },
    );
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
    #[test]
    fn chance_edit_retains_unknown_location_word_unowned_tail_and_other_rows() {
        let mut source = vec![0u8; 82];
        source[20..22].copy_from_slice(&47i16.to_be_bytes());
        source[22..40].fill(0xcd);
        source[40..82].fill(0xab);
        let mut rows = decode_timed_encounters(&source).records;
        rows[0].authored = true;
        rows[0].percent = 75;
        let bytes = encode_timed_encounters(&rows, Some(&source)).unwrap();
        assert_eq!(&bytes[20..], &source[20..]);
        assert_eq!(&bytes[..4], &source[..4]);
        assert_eq!(&bytes[4..6], &75i16.to_be_bytes());
        rows[0].location_kind = TimedEncounterLocationKind::Land;
        let bytes = encode_timed_encounters(&rows, Some(&source)).unwrap();
        assert_eq!(&bytes[20..22], &1i16.to_be_bytes());
    }
    fn authored(id: u32) -> TimedEncounter {
        TimedEncounter {
            identity: StableId(format!("timed-encounter:{id}")),
            native_id: NativeRecordId(id),
            day: 12,
            increment: 3,
            percent: 75,
            door: 4,
            required_level: 2,
            required_random_rect: -1,
            required_x: 17,
            required_y: 18,
            required_item: 801,
            required_quest: 9,
            location_kind: TimedEncounterLocationKind::Land,
            authored: true,
        }
    }

    #[test]
    fn semantic_round_trip_covers_every_owned_field() {
        let expected = authored(0);
        let encoded = encode_timed_encounters(std::slice::from_ref(&expected), None).unwrap();
        assert_eq!(encoded.len(), 40);
        assert_eq!(&encoded[22..40], &[0; 18]);
        let mut decoded = decode_timed_encounters(&encoded).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_and_owned_overlay_preserve_reserved_words_and_tail() {
        let mut source = encode_timed_encounters(&[authored(0), authored(1)], None).unwrap();
        source[22..40].fill(0xa5);
        source[62..80].fill(0x5a);
        source.extend_from_slice(&[0xde, 0xad]);
        let mut decoded = decode_timed_encounters(&source).records;
        assert_eq!(
            encode_timed_encounters(&decoded, Some(&source)).unwrap(),
            source
        );
        decoded[1].authored = true;
        decoded[1].percent = 41;
        let output = encode_timed_encounters(&decoded, Some(&source)).unwrap();
        assert_eq!(&output[..40], &source[..40]);
        assert_eq!(read_i16(&output, 44), 41);
        assert_eq!(&output[62..80], &source[62..80]);
        assert_eq!(&output[80..], &[0xde, 0xad]);
    }
}
