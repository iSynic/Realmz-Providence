use super::classic_world::certified_treasure_extent;
use crate::model::{NativeRecordId, StableId, TreasureRecord};

pub const TREASURE_ITEM_SLOTS: usize = 20;
pub const TREASURE_RECORD_BYTES: usize = 48;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedTreasureFile {
    pub records: Vec<TreasureRecord>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TreasureCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    InvalidItemSlotCount {
        native_id: NativeRecordId,
        actual: usize,
    },
}

impl std::fmt::Display for TreasureCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(id) => {
                write!(formatter, "duplicate treasure record id {}", id.0)
            }
            Self::MissingCompatibilitySource(id) => write!(
                formatter,
                "imported treasure record {} requires its Data TD compatibility source",
                id.0
            ),
            Self::InvalidItemSlotCount { native_id, actual } => write!(
                formatter,
                "treasure {} has {actual} item slots; expected {TREASURE_ITEM_SLOTS}",
                native_id.0
            ),
        }
    }
}

impl std::error::Error for TreasureCodecError {}

pub fn decode_treasures(bytes: &[u8]) -> DecodedTreasureFile {
    let complete_bytes = certified_treasure_extent(bytes)
        .map(|extent| extent.authored_records * TREASURE_RECORD_BYTES)
        .unwrap_or(bytes.len() / TREASURE_RECORD_BYTES * TREASURE_RECORD_BYTES);
    let records = bytes[..complete_bytes]
        .chunks_exact(TREASURE_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| decode_row(row, index as u32))
        .collect();
    DecodedTreasureFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_treasures(
    records: &[TreasureRecord],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, TreasureCodecError> {
    let mut selected = records.iter().collect::<Vec<_>>();
    selected.sort_by_key(|record| record.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(TreasureCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }
    let source_body_bytes = compatibility_source
        .map(|source| {
            certified_treasure_extent(source)
                .map(|extent| extent.authored_records * TREASURE_RECORD_BYTES)
                .unwrap_or(source.len() / TREASURE_RECORD_BYTES * TREASURE_RECORD_BYTES)
        })
        .unwrap_or(0);
    let required_bytes = selected
        .last()
        .map(|record| (record.native_id.0 as usize + 1) * TREASURE_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);

    for record in selected {
        validate_treasure_record_shape(record)?;
        let start = record.native_id.0 as usize * TREASURE_RECORD_BYTES;
        let end = start + TREASURE_RECORD_BYTES;
        if !record.authored {
            if end <= source_body_bytes {
                continue;
            }
            return Err(TreasureCodecError::MissingCompatibilitySource(
                record.native_id,
            ));
        }
        encode_row(record, &mut output[start..end]);
    }
    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

pub fn validate_treasure_record_shape(record: &TreasureRecord) -> Result<(), TreasureCodecError> {
    if record.item_ids.len() != TREASURE_ITEM_SLOTS {
        return Err(TreasureCodecError::InvalidItemSlotCount {
            native_id: record.native_id,
            actual: record.item_ids.len(),
        });
    }
    Ok(())
}

fn decode_row(row: &[u8], native_id: u32) -> TreasureRecord {
    TreasureRecord {
        identity: StableId(format!("treasure:{native_id}")),
        native_id: NativeRecordId(native_id),
        item_ids: (0..TREASURE_ITEM_SLOTS)
            .map(|slot| read_i16(row, slot * 2))
            .collect(),
        experience: read_i16(row, 40),
        gold: read_i16(row, 42),
        gems: read_i16(row, 44),
        jewelry: read_i16(row, 46),
        authored: false,
    }
}

fn encode_row(record: &TreasureRecord, row: &mut [u8]) {
    for (slot, item_id) in record.item_ids.iter().copied().enumerate() {
        write_i16(row, slot * 2, item_id);
    }
    write_i16(row, 40, record.experience);
    write_i16(row, 42, record.gold);
    write_i16(row, 44, record.gems);
    write_i16(row, 46, record.jewelry);
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

    fn authored(native_id: u32) -> TreasureRecord {
        let mut item_ids = vec![0; TREASURE_ITEM_SLOTS];
        item_ids[0] = 7;
        item_ids[19] = -9;
        TreasureRecord {
            identity: StableId(format!("treasure:{native_id}")),
            native_id: NativeRecordId(native_id),
            item_ids,
            experience: -100,
            gold: 200,
            gems: -3,
            jewelry: 4,
            authored: true,
        }
    }

    #[test]
    fn semantic_round_trip_covers_all_48_owned_bytes() {
        let expected = authored(0);
        let encoded = encode_treasures(std::slice::from_ref(&expected), None).unwrap();
        assert_eq!(encoded.len(), TREASURE_RECORD_BYTES);
        let mut decoded = decode_treasures(&encoded).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_preserves_complete_rows_and_malformed_tail() {
        let mut source = encode_treasures(&[authored(0)], None).unwrap();
        source.extend_from_slice(&[0xde, 0xad]);
        let decoded = decode_treasures(&source);
        assert_eq!(
            encode_treasures(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn edit_regenerates_only_the_selected_row() {
        let mut source = encode_treasures(&[authored(0), authored(1)], None).unwrap();
        source.extend_from_slice(&[0xef]);
        let mut records = decode_treasures(&source).records;
        records[1].authored = true;
        records[1].gold = 1234;
        let output = encode_treasures(&records, Some(&source)).unwrap();
        assert_eq!(
            &output[..TREASURE_RECORD_BYTES],
            &source[..TREASURE_RECORD_BYTES]
        );
        assert_eq!(&output[2 * TREASURE_RECORD_BYTES..], &[0xef]);
        assert_eq!(decode_treasures(&output).records[1].gold, 1234);
    }

    #[test]
    fn malformed_item_slot_count_is_rejected() {
        let mut record = authored(0);
        record.item_ids.pop();
        assert!(matches!(
            encode_treasures(&[record], None),
            Err(TreasureCodecError::InvalidItemSlotCount { actual: 19, .. })
        ));
    }
}
