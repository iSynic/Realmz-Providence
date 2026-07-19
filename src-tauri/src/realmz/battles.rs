use crate::error::{ProvidenceError, Result};
use crate::project::BattleRecord;

use super::record_bytes::{
    i16_be, parse_fixed_records, provenance, write_fixed_records, write_i16_be,
};

pub const BATTLE_BYTES: usize = 346;
const BATTLE_GRID_SLOTS: usize = 13 * 13;
const BATTLE_RUNTIME_MONSTER_LIMIT: usize = 100;

pub fn parse_battles(buffer: &[u8]) -> Vec<BattleRecord> {
    parse_fixed_records(buffer, BATTLE_BYTES)
        .map(|(id, start, record)| BattleRecord {
            id,
            grid: (0..BATTLE_GRID_SLOTS)
                .map(|slot| i16_be(record, slot * 2))
                .collect(),
            dist: record[338] as i8,
            message_before: i16_be(record, 340),
            message_after: i16_be(record, 342),
            battle_macro: i16_be(record, 344),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data BD", id, start, BATTLE_BYTES),
        })
        .collect()
}

pub fn write_battles(records: &[BattleRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, BATTLE_BYTES, |record, buffer| {
        if !record.raw_bytes.is_empty() && record.raw_bytes.len() != BATTLE_BYTES {
            return Err(ProvidenceError::message(format!(
                "Battle {} has invalid compatibility byte storage",
                record.id
            )));
        }
        if record.grid.len() != BATTLE_GRID_SLOTS {
            return Err(ProvidenceError::message(format!(
                "Battle {} must have a 13 x 13 monster grid",
                record.id
            )));
        }
        if record.authored {
            let placed_monsters = record.grid.iter().filter(|value| **value != 0).count();
            if placed_monsters > BATTLE_RUNTIME_MONSTER_LIMIT {
                return Err(ProvidenceError::message(format!(
                    "Battle {} places {} monsters; Realmz runtime supports at most {} loaded monsters",
                    record.id, placed_monsters, BATTLE_RUNTIME_MONSTER_LIMIT
                )));
            }
        }
        for (slot, value) in record.grid.iter().enumerate() {
            write_i16_be(buffer, slot * 2, *value);
        }
        buffer[338] = record.dist as u8;
        buffer[339] = 0;
        write_i16_be(buffer, 340, record.message_before);
        write_i16_be(buffer, 342, record.message_after);
        write_i16_be(buffer, 344, record.battle_macro);
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_battle_compiles_complete_semantic_row() {
        let record = BattleRecord {
            id: 0,
            grid: (0..BATTLE_GRID_SLOTS)
                .map(|slot| if slot == 84 { -7 } else { 0 })
                .collect(),
            dist: 3,
            message_before: 4,
            message_after: 5,
            battle_macro: -6,
            raw_bytes: Vec::new(),
            authored: true,
            provenance: provenance("Data BD", 0, 0, BATTLE_BYTES),
        };

        let output = write_battles(&[record]).unwrap();

        assert_eq!(output.len(), BATTLE_BYTES);
        assert_eq!(i16_be(&output, 84 * 2), -7);
        assert_eq!(output[338], 3);
        assert_eq!(output[339], 0);
        assert_eq!(i16_be(&output, 340), 4);
        assert_eq!(i16_be(&output, 342), 5);
        assert_eq!(i16_be(&output, 344), -6);
    }

    #[test]
    fn imported_battle_compiles_without_record_byte_identity() {
        let mut input = vec![0; BATTLE_BYTES];
        write_i16_be(&mut input, 12 * 2, 9);
        input[338] = 2;
        input[339] = 0xa5;
        write_i16_be(&mut input, 340, 10);
        write_i16_be(&mut input, 342, 11);
        write_i16_be(&mut input, 344, -12);
        let mut records = parse_battles(&input);
        records[0].raw_bytes.fill(0x5a);

        let output = write_battles(&records).unwrap();

        assert_ne!(output, input);
        assert_eq!(i16_be(&output, 12 * 2), 9);
        assert_eq!(output[338], 2);
        assert_eq!(output[339], 0);
        assert_eq!(i16_be(&output, 340), 10);
        assert_eq!(i16_be(&output, 342), 11);
        assert_eq!(i16_be(&output, 344), -12);
    }

    #[test]
    fn imported_over_cap_battle_remains_compilable_for_annex_overlay() {
        let mut input = vec![0; BATTLE_BYTES];
        for slot in 0..101 {
            write_i16_be(&mut input, slot * 2, 1);
        }

        let records = parse_battles(&input);
        let output = write_battles(&records).unwrap();

        assert_eq!(output, input);
    }

    #[test]
    fn battle_writer_rejects_malformed_compatibility_storage() {
        let mut record = parse_battles(&vec![0; BATTLE_BYTES]).remove(0);
        record.raw_bytes = vec![1];

        assert!(write_battles(&[record])
            .unwrap_err()
            .to_string()
            .contains("invalid compatibility byte storage"));
    }
}
