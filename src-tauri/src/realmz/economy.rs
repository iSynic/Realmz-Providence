use crate::error::{ProvidenceError, Result};
use crate::project::{ShopRecord, TreasureRecord};

use super::record_bytes::{
    copy_raw, i16_be, parse_fixed_records, preserve_raw, provenance, write_fixed_records,
    write_i16_be,
};

pub const SHOP_BYTES: usize = 3002;
pub const TREASURE_BYTES: usize = 48;
const SHOP_ITEM_SLOTS: usize = 1000;
const FOREIGN_RECORD_MIN_NONZERO_ITEMS: usize = 900;
const FOREIGN_RECORD_MIN_OUT_OF_RANGE_ITEMS: usize = 500;
const FOREIGN_RECORD_MIN_NONZERO_QUANTITIES: usize = 900;

pub fn parse_treasures(buffer: &[u8]) -> Vec<TreasureRecord> {
    parse_fixed_records(buffer, TREASURE_BYTES)
        .map(|(id, start, record)| TreasureRecord {
            id,
            item_ids: (0..20).map(|slot| i16_be(record, slot * 2)).collect(),
            exp: i16_be(record, 40),
            gold: i16_be(record, 42),
            gems: i16_be(record, 44),
            jewelry: i16_be(record, 46),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data TD", id, start, TREASURE_BYTES),
        })
        .collect()
}

pub fn write_treasures(records: &[TreasureRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, TREASURE_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, TREASURE_BYTES) {
            return Ok(());
        }
        if record.item_ids.len() > 20 {
            return Err(ProvidenceError::message(format!(
                "Treasure {} has more than 20 item slots",
                record.id
            )));
        }
        for slot in 0..20 {
            write_i16_be(
                buffer,
                slot * 2,
                record.item_ids.get(slot).copied().unwrap_or(0),
            );
        }
        write_i16_be(buffer, 40, record.exp);
        write_i16_be(buffer, 42, record.gold);
        write_i16_be(buffer, 44, record.gems);
        write_i16_be(buffer, 46, record.jewelry);
        Ok(())
    })
}

pub fn parse_shops(buffer: &[u8]) -> Vec<ShopRecord> {
    let prefix_bytes = shop_prefix_record_count(buffer) * SHOP_BYTES;
    parse_fixed_records(&buffer[..prefix_bytes], SHOP_BYTES)
        .map(|(id, start, record)| ShopRecord {
            id,
            item_ids: (0..1000).map(|slot| i16_be(record, slot * 2)).collect(),
            quantities: record[2000..3000].to_vec(),
            inflation: i16_be(record, 3000),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data SD", id, start, SHOP_BYTES),
        })
        .collect()
}

pub fn shop_prefix_record_count(buffer: &[u8]) -> usize {
    let mut count = buffer.len() / SHOP_BYTES;
    while count > 0
        && is_foreign_shop_tail_record(&buffer[(count - 1) * SHOP_BYTES..count * SHOP_BYTES])
    {
        count -= 1;
    }
    count
}

fn is_foreign_shop_tail_record(record: &[u8]) -> bool {
    if record.len() != SHOP_BYTES {
        return false;
    }
    let mut nonzero_items = 0;
    let mut out_of_range_items = 0;
    let mut nonzero_quantities = 0;
    for slot in 0..SHOP_ITEM_SLOTS {
        let item_id = i16_be(record, slot * 2);
        if item_id != 0 {
            nonzero_items += 1;
        }
        if item_id.unsigned_abs() > 999 {
            out_of_range_items += 1;
        }
        if record[2000 + slot] != 0 {
            nonzero_quantities += 1;
        }
    }
    nonzero_items >= FOREIGN_RECORD_MIN_NONZERO_ITEMS
        && out_of_range_items >= FOREIGN_RECORD_MIN_OUT_OF_RANGE_ITEMS
        && nonzero_quantities >= FOREIGN_RECORD_MIN_NONZERO_QUANTITIES
}

pub fn write_shops(records: &[ShopRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, SHOP_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, SHOP_BYTES) {
            return Ok(());
        }
        if record.item_ids.len() > 1000 || record.quantities.len() > 1000 {
            return Err(ProvidenceError::message(format!(
                "Shop {} exceeds Realmz shop slot capacity",
                record.id
            )));
        }
        for slot in 0..1000 {
            write_i16_be(
                buffer,
                slot * 2,
                record.item_ids.get(slot).copied().unwrap_or(0),
            );
            buffer[2000 + slot] = record.quantities.get(slot).copied().unwrap_or(0);
        }
        write_i16_be(buffer, 3000, record.inflation);
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
    fn shop_storage_mutates_only_owned_fields() {
        let input = vec![0u8; SHOP_BYTES * 2];
        let shop_start = SHOP_BYTES;

        let mut shops = parse_shops(&input);
        shops[1].authored = true;
        shops[1].item_ids[10] = 0x0304;
        shops[1].quantities[11] = 9;
        shops[1].inflation = 0x0506;

        let output = write_shops(&shops).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                shop_start + 20,
                shop_start + 21,
                shop_start + 2000 + 11,
                shop_start + 3000,
                shop_start + 3001,
            ]
        );
    }

    #[test]
    fn dense_foreign_shop_suffix_is_not_exposed() {
        let mut input = vec![0u8; SHOP_BYTES * 3];
        write_i16_be(&mut input, 0, 10);
        input[2000] = 2;
        write_i16_be(&mut input, 3000, 100);
        for record_index in 1..3 {
            let start = record_index * SHOP_BYTES;
            for slot in 0..SHOP_ITEM_SLOTS {
                write_i16_be(&mut input, start + slot * 2, 2000 + slot as i16);
                input[start + 2000 + slot] = 0xff;
            }
        }

        assert_eq!(shop_prefix_record_count(&input), 1);
        assert_eq!(parse_shops(&input).len(), 1);
    }

    #[test]
    fn sparse_malformed_shop_remains_visible() {
        let mut input = vec![0u8; SHOP_BYTES];
        write_i16_be(&mut input, 0, 32000);
        input[2000] = 1;
        write_i16_be(&mut input, 3000, -25);

        assert_eq!(shop_prefix_record_count(&input), 1);
        assert_eq!(parse_shops(&input).len(), 1);
    }

    #[test]
    fn dense_record_before_later_shop_is_not_hidden() {
        let mut input = vec![0u8; SHOP_BYTES * 3];
        for slot in 0..SHOP_ITEM_SLOTS {
            write_i16_be(&mut input, SHOP_BYTES + slot * 2, 2000 + slot as i16);
            input[SHOP_BYTES + 2000 + slot] = 0xff;
        }
        write_i16_be(&mut input, SHOP_BYTES * 2, 42);
        input[SHOP_BYTES * 2 + 2000] = 3;

        assert_eq!(shop_prefix_record_count(&input), 3);
        assert_eq!(parse_shops(&input).len(), 3);
    }
}
