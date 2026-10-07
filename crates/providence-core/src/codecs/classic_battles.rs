use super::classic_world::certified_battle_extent;
use crate::model::{BattleRecord, NativeRecordId, StableId};

pub const BATTLE_GRID_WIDTH: usize = 13;
pub const BATTLE_GRID_SLOTS: usize = BATTLE_GRID_WIDTH * BATTLE_GRID_WIDTH;
pub const BATTLE_RECORD_BYTES: usize = 346;
pub const BATTLE_RUNTIME_MONSTER_LIMIT: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedBattleFile {
    pub records: Vec<BattleRecord>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BattleCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource(NativeRecordId),
    InvalidGridShape {
        native_id: NativeRecordId,
        actual: usize,
    },
    RuntimeMonsterLimit {
        native_id: NativeRecordId,
        placed: usize,
    },
}

impl std::fmt::Display for BattleCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(native_id) => {
                write!(formatter, "duplicate battle record id {}", native_id.0)
            }
            Self::MissingCompatibilitySource(native_id) => write!(
                formatter,
                "imported battle record {} requires its Data BD compatibility source",
                native_id.0
            ),
            Self::InvalidGridShape { native_id, actual } => write!(
                formatter,
                "battle {} has {actual} grid cells; expected {BATTLE_GRID_SLOTS}",
                native_id.0
            ),
            Self::RuntimeMonsterLimit { native_id, placed } => write!(
                formatter,
                "battle {} places {placed} monsters; Realmz runtime supports at most {BATTLE_RUNTIME_MONSTER_LIMIT}",
                native_id.0
            ),
        }
    }
}

impl std::error::Error for BattleCodecError {}

pub fn decode_battles(bytes: &[u8]) -> DecodedBattleFile {
    let complete_bytes = certified_battle_extent(bytes)
        .map(|extent| extent.authored_records * BATTLE_RECORD_BYTES)
        .unwrap_or(bytes.len() / BATTLE_RECORD_BYTES * BATTLE_RECORD_BYTES);
    let records = bytes[..complete_bytes]
        .chunks_exact(BATTLE_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| decode_battle_row(row, index as u32))
        .collect();
    DecodedBattleFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_battles(
    records: &[BattleRecord],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, BattleCodecError> {
    let mut selected = records.iter().collect::<Vec<_>>();
    selected.sort_by_key(|record| record.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(BattleCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }

    let source_body_bytes = compatibility_source
        .map(|source| {
            certified_battle_extent(source)
                .map(|extent| extent.authored_records * BATTLE_RECORD_BYTES)
                .unwrap_or(source.len() / BATTLE_RECORD_BYTES * BATTLE_RECORD_BYTES)
        })
        .unwrap_or(0);
    let required_bytes = selected
        .last()
        .map(|record| (record.native_id.0 as usize + 1) * BATTLE_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);

    for record in selected {
        validate_battle_record_shape(record)?;
        let start = record.native_id.0 as usize * BATTLE_RECORD_BYTES;
        let end = start + BATTLE_RECORD_BYTES;
        if !record.authored {
            if end <= source_body_bytes {
                continue;
            }
            return Err(BattleCodecError::MissingCompatibilitySource(
                record.native_id,
            ));
        }
        encode_battle_row(record, &mut output[start..end]);
    }

    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

pub fn validate_battle_record_shape(record: &BattleRecord) -> Result<(), BattleCodecError> {
    if record.grid.len() != BATTLE_GRID_SLOTS {
        return Err(BattleCodecError::InvalidGridShape {
            native_id: record.native_id,
            actual: record.grid.len(),
        });
    }
    let placed = record.grid.iter().filter(|value| **value != 0).count();
    if record.authored && placed > BATTLE_RUNTIME_MONSTER_LIMIT {
        return Err(BattleCodecError::RuntimeMonsterLimit {
            native_id: record.native_id,
            placed,
        });
    }
    Ok(())
}

fn decode_battle_row(row: &[u8], native_id: u32) -> BattleRecord {
    let native_id = NativeRecordId(native_id);
    BattleRecord {
        identity: StableId(format!("battle:{}", native_id.0)),
        native_id,
        grid: (0..BATTLE_GRID_SLOTS)
            .map(|slot| read_i16(row, slot * 2))
            .collect(),
        distance: row[338] as i8,
        message_before: read_i16(row, 340),
        message_after: read_i16(row, 342),
        battle_macro: read_i16(row, 344),
        authored: false,
    }
}

fn encode_battle_row(record: &BattleRecord, row: &mut [u8]) {
    row.fill(0);
    for (slot, value) in record.grid.iter().copied().enumerate() {
        write_i16(row, slot * 2, value);
    }
    row[338] = record.distance as u8;
    // Byte 339 is compiler-owned alignment padding. Fresh and edited rows use zero.
    row[339] = 0;
    write_i16(row, 340, record.message_before);
    write_i16(row, 342, record.message_after);
    write_i16(row, 344, record.battle_macro);
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

    fn authored_battle(native_id: u32) -> BattleRecord {
        let mut grid = vec![0; BATTLE_GRID_SLOTS];
        grid[84] = -7;
        BattleRecord {
            identity: StableId(format!("battle:{native_id}")),
            native_id: NativeRecordId(native_id),
            grid,
            distance: 3,
            message_before: 4,
            message_after: 5,
            battle_macro: -6,
            authored: true,
        }
    }

    #[test]
    fn semantic_record_round_trip_covers_every_owned_field() {
        let expected = authored_battle(0);
        let encoded = encode_battles(std::slice::from_ref(&expected), None).unwrap();
        assert_eq!(encoded.len(), BATTLE_RECORD_BYTES);
        assert_eq!(encoded[339], 0);
        let mut decoded = decode_battles(&encoded).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_round_trip_preserves_alignment_byte_and_malformed_tail() {
        let mut source = encode_battles(&[authored_battle(0)], None).unwrap();
        source[339] = 0xa5;
        source.extend_from_slice(&[0xde, 0xad]);
        let decoded = decode_battles(&source);
        assert_eq!(
            encode_battles(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn edited_record_regenerates_only_its_fully_owned_row() {
        let first = authored_battle(0);
        let second = authored_battle(1);
        let mut source = encode_battles(&[first, second], None).unwrap();
        source[339] = 0x91;
        source[BATTLE_RECORD_BYTES + 339] = 0x92;
        let mut decoded = decode_battles(&source).records;
        decoded[1].authored = true;
        decoded[1].distance = 9;
        let output = encode_battles(&decoded, Some(&source)).unwrap();
        assert_eq!(
            &output[..BATTLE_RECORD_BYTES],
            &source[..BATTLE_RECORD_BYTES]
        );
        assert_eq!(output[BATTLE_RECORD_BYTES + 338], 9);
        assert_eq!(output[BATTLE_RECORD_BYTES + 339], 0);
    }

    #[test]
    fn authored_battle_cannot_exceed_runtime_monster_limit() {
        let mut battle = authored_battle(0);
        battle.grid[..101].fill(1);
        assert!(matches!(
            encode_battles(&[battle], None),
            Err(BattleCodecError::RuntimeMonsterLimit { placed: 101, .. })
        ));
    }
}
