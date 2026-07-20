use crate::error::{ProvidenceError, Result};
use crate::generated::native_manifest_policy::REALMZ_NATIVE_LAYOUT;
use crate::project::TreasureRecord;

use super::record_bytes::{
    i16_be, parse_fixed_records, provenance, write_fixed_records, write_i16_be,
};
pub use super::shops::{parse_shops, shop_prefix_record_count, write_shops, SHOP_BYTES};

pub const TREASURE_BYTES: usize = REALMZ_NATIVE_LAYOUT.treasure_record_bytes;

pub fn parse_treasures(buffer: &[u8]) -> Vec<TreasureRecord> {
    parse_fixed_records(buffer, TREASURE_BYTES)
        .map(|(id, start, record)| TreasureRecord {
            id,
            item_ids: (0..20).map(|slot| i16_be(record, slot * 2)).collect(),
            exp: i16_be(record, 40),
            gold: i16_be(record, 42),
            gems: i16_be(record, 44),
            jewelry: i16_be(record, 46),
            authored: false,
            provenance: provenance("Data TD", id, start, TREASURE_BYTES),
        })
        .collect()
}

pub fn write_treasures(records: &[TreasureRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, TREASURE_BYTES, |record, buffer| {
        if record.item_ids.len() != 20 {
            return Err(ProvidenceError::message(format!(
                "Treasure {} must define 20 item slots",
                record.id
            )));
        }
        for (slot, item_id) in record.item_ids.iter().enumerate() {
            write_i16_be(buffer, slot * 2, *item_id);
        }
        write_i16_be(buffer, 40, record.exp);
        write_i16_be(buffer, 42, record.gold);
        write_i16_be(buffer, 44, record.gems);
        write_i16_be(buffer, 46, record.jewelry);
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after)
            .enumerate()
            .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
            .collect()
    }

    #[test]
    fn treasure_storage_mutates_only_owned_fields() {
        let mut input = vec![0u8; TREASURE_BYTES * 2];
        let treasure_start = TREASURE_BYTES;
        write_i16_be(&mut input, treasure_start + 40, 0x0102);

        let mut treasures = parse_treasures(&input);
        treasures[1].authored = true;
        treasures[1].exp = 0x0304;

        let output = write_treasures(&treasures).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![treasure_start + 40, treasure_start + 41]
        );
    }

    #[test]
    fn fresh_treasure_compiles_all_semantic_fields() {
        let mut treasure = parse_treasures(&vec![0; TREASURE_BYTES])
            .into_iter()
            .next()
            .expect("treasure");
        treasure.item_ids = (0..20).map(|slot| 900 + slot).collect();
        treasure.exp = -10;
        treasure.gold = 20;
        treasure.gems = 30;
        treasure.jewelry = 40;

        let output = write_treasures(&[treasure]).unwrap();

        assert_eq!(output.len(), TREASURE_BYTES);
        assert_eq!(i16_be(&output, 0), 900);
        assert_eq!(i16_be(&output, 38), 919);
        assert_eq!(i16_be(&output, 40), -10);
        assert_eq!(i16_be(&output, 42), 20);
        assert_eq!(i16_be(&output, 44), 30);
        assert_eq!(i16_be(&output, 46), 40);
    }

    #[test]
    fn imported_treasure_recompiles_without_record_byte_identity() {
        let input: Vec<u8> = (0..TREASURE_BYTES)
            .map(|offset| (offset * 5) as u8)
            .collect();
        let treasures = parse_treasures(&input);

        assert_eq!(write_treasures(&treasures).unwrap(), input);
    }

    #[test]
    fn treasure_writer_rejects_malformed_item_slots() {
        let mut treasure = parse_treasures(&vec![0; TREASURE_BYTES])
            .into_iter()
            .next()
            .expect("treasure");
        treasure.item_ids.clear();
        assert!(write_treasures(&[treasure])
            .unwrap_err()
            .to_string()
            .contains("must define 20 item slots"));
    }
}
