use super::classic_world::certified_shop_extent;
use crate::model::{NativeRecordId, ShopRecord, StableId};

pub const SHOP_ITEM_SLOTS: usize = 1000;
pub const SHOP_CATEGORY_SIZE: usize = 200;
pub const SHOP_RECORD_BYTES: usize = 3002;
#[path = "classic_shop_classification.rs"]
mod classification;
pub use classification::QuarantinedShopRecord;
#[cfg(test)]
#[path = "classic_shop_classification_tests.rs"]
mod classification_tests;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedShopFile {
    pub records: Vec<ShopRecord>,
    pub trailing_bytes: Vec<u8>,
    pub quarantined_records: Vec<QuarantinedShopRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShopCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    InvalidItemSlotCount {
        native_id: NativeRecordId,
        actual: usize,
    },
    InvalidQuantitySlotCount {
        native_id: NativeRecordId,
        actual: usize,
    },
}

impl std::fmt::Display for ShopCodecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(id) => write!(f, "duplicate shop record id {}", id.0),
            Self::MissingCompatibilitySource(id) => write!(
                f,
                "imported shop record {} requires its Data SD compatibility source",
                id.0
            ),
            Self::InvalidItemSlotCount { native_id, actual } => write!(
                f,
                "shop {} has {actual} item slots; expected {SHOP_ITEM_SLOTS}",
                native_id.0
            ),
            Self::InvalidQuantitySlotCount { native_id, actual } => write!(
                f,
                "shop {} has {actual} quantity slots; expected {SHOP_ITEM_SLOTS}",
                native_id.0
            ),
        }
    }
}
impl std::error::Error for ShopCodecError {}

pub fn shop_prefix_record_count(bytes: &[u8]) -> usize {
    classification::classify(bytes)
        .first()
        .map_or(bytes.len() / SHOP_RECORD_BYTES, |row| {
            row.native_id.0 as usize
        })
}

pub fn decode_shops(bytes: &[u8]) -> DecodedShopFile {
    let complete_bytes = bytes.len() / SHOP_RECORD_BYTES * SHOP_RECORD_BYTES;
    let quarantined_records = classification::classify(bytes);
    let excluded = quarantined_records
        .iter()
        .map(|row| row.native_id.0)
        .collect::<std::collections::BTreeSet<_>>();
    let records = bytes[..complete_bytes]
        .chunks_exact(SHOP_RECORD_BYTES)
        .enumerate()
        .filter(|(index, _)| !excluded.contains(&(*index as u32)))
        .map(|(index, row)| decode_row(row, index as u32))
        .collect();
    DecodedShopFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
        quarantined_records,
    }
}

pub(crate) fn source_shop_record(bytes: &[u8], native_id: NativeRecordId) -> Option<ShopRecord> {
    let start = native_id.0 as usize * SHOP_RECORD_BYTES;
    bytes
        .get(start..start + SHOP_RECORD_BYTES)
        .map(|row| decode_row(row, native_id.0))
}

pub fn encode_shops(
    records: &[ShopRecord],
    source: Option<&[u8]>,
) -> Result<Vec<u8>, ShopCodecError> {
    let mut selected = records.iter().collect::<Vec<_>>();
    selected.sort_by_key(|record| record.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(ShopCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }
    let source_body = source
        .map(|bytes| bytes.len() / SHOP_RECORD_BYTES * SHOP_RECORD_BYTES)
        .unwrap_or(0);
    let required = selected
        .last()
        .map(|record| (record.native_id.0 as usize + 1) * SHOP_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = source
        .map(|bytes| bytes[..source_body].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required), 0);
    for record in selected {
        validate_shop_record_shape(record)?;
        let start = record.native_id.0 as usize * SHOP_RECORD_BYTES;
        let end = start + SHOP_RECORD_BYTES;
        if !record.authored {
            if end <= source_body {
                continue;
            }
            return Err(ShopCodecError::MissingCompatibilitySource(record.native_id));
        }
        encode_row(record, &mut output[start..end]);
    }
    if let Some(bytes) = source {
        output.extend_from_slice(&bytes[source_body..]);
    }
    Ok(output)
}

pub fn validate_shop_record_shape(record: &ShopRecord) -> Result<(), ShopCodecError> {
    if record.item_ids.len() != SHOP_ITEM_SLOTS {
        return Err(ShopCodecError::InvalidItemSlotCount {
            native_id: record.native_id,
            actual: record.item_ids.len(),
        });
    }
    if record.quantities.len() != SHOP_ITEM_SLOTS {
        return Err(ShopCodecError::InvalidQuantitySlotCount {
            native_id: record.native_id,
            actual: record.quantities.len(),
        });
    }
    Ok(())
}

fn decode_row(row: &[u8], native_id: u32) -> ShopRecord {
    ShopRecord {
        identity: StableId(format!("shop:{native_id}")),
        native_id: NativeRecordId(native_id),
        item_ids: (0..SHOP_ITEM_SLOTS)
            .map(|slot| read_i16(row, slot * 2))
            .collect(),
        quantities: row[2000..3000].to_vec(),
        inflation: read_i16(row, 3000),
        authored: false,
    }
}

fn encode_row(record: &ShopRecord, row: &mut [u8]) {
    for slot in 0..SHOP_ITEM_SLOTS {
        write_i16(row, slot * 2, record.item_ids[slot]);
        row[2000 + slot] = record.quantities[slot];
    }
    write_i16(row, 3000, record.inflation);
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

    fn authored(id: u32) -> ShopRecord {
        let mut item_ids = vec![-1; SHOP_ITEM_SLOTS];
        let mut quantities = vec![0; SHOP_ITEM_SLOTS];
        item_ids[0] = 7;
        quantities[0] = 3;
        ShopRecord {
            identity: StableId(format!("shop:{id}")),
            native_id: NativeRecordId(id),
            item_ids,
            quantities,
            inflation: 125,
            authored: true,
        }
    }

    #[test]
    fn semantic_round_trip_covers_all_3002_owned_bytes() {
        let expected = authored(0);
        let encoded = encode_shops(std::slice::from_ref(&expected), None).unwrap();
        let mut decoded = decode_shops(&encoded).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_and_one_row_edit_preserve_other_rows_and_tail() {
        let mut source = encode_shops(&[authored(0), authored(1)], None).unwrap();
        source.extend_from_slice(&[0xde, 0xad]);
        let mut records = decode_shops(&source).records;
        assert_eq!(encode_shops(&records, Some(&source)).unwrap(), source);
        records[1].authored = true;
        records[1].inflation = 90;
        let output = encode_shops(&records, Some(&source)).unwrap();
        assert_eq!(&output[..SHOP_RECORD_BYTES], &source[..SHOP_RECORD_BYTES]);
        assert_eq!(&output[2 * SHOP_RECORD_BYTES..], &[0xde, 0xad]);
    }

    #[test]
    fn dense_foreign_suffix_is_preserved_but_not_authored() {
        let mut source = encode_shops(&[authored(0)], None).unwrap();
        let mut foreign = vec![0xff; SHOP_RECORD_BYTES];
        for slot in 0..SHOP_ITEM_SLOTS {
            write_i16(&mut foreign, slot * 2, 2000 + slot as i16);
        }
        source.extend_from_slice(&foreign);
        let decoded = decode_shops(&source);
        assert_eq!(decoded.records.len(), 1);
        assert!(decoded.trailing_bytes.is_empty());
        assert_eq!(decoded.quarantined_records.len(), 1);
        assert_eq!(
            encode_shops(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn foreign_suffix_before_zero_terminal_row_is_preserved_but_not_imported() {
        let mut source = encode_shops(&[authored(0), authored(1)], None).unwrap();
        source.extend_from_slice(&[0; SHOP_RECORD_BYTES]);
        let mut foreign = vec![0xff; SHOP_RECORD_BYTES];
        for slot in 0..SHOP_ITEM_SLOTS {
            write_i16(&mut foreign, slot * 2, 2000 + slot as i16);
        }
        for slot in 0..100 {
            write_i16(&mut foreign, slot * 2, 0);
        }
        source.extend_from_slice(&foreign);
        source.extend_from_slice(&[0; SHOP_RECORD_BYTES]);

        let decoded = decode_shops(&source);
        assert_eq!(decoded.records.len(), 3);
        assert!(decoded.trailing_bytes.is_empty());
        assert_eq!(decoded.quarantined_records.len(), 2);
        assert_eq!(
            encode_shops(&decoded.records, Some(&source)).unwrap(),
            source
        );

        let mut clean = encode_shops(&[authored(0)], None).unwrap();
        clean.extend_from_slice(&[0; SHOP_RECORD_BYTES]);
        assert_eq!(decode_shops(&clean).records.len(), 2);
    }
}
