use crate::error::{ProvidenceError, Result};
use crate::project::ShopRecord;

use super::record_bytes::{
    i16_be, parse_fixed_records, provenance, write_fixed_records, write_i16_be,
};

pub const SHOP_BYTES: usize = 3002;
const SHOP_ITEM_SLOTS: usize = 1000;
const FOREIGN_RECORD_MIN_NONZERO_ITEMS: usize = 900;
const FOREIGN_RECORD_MIN_OUT_OF_RANGE_ITEMS: usize = 500;
const FOREIGN_RECORD_MIN_NONZERO_QUANTITIES: usize = 900;

pub fn parse_shops(buffer: &[u8]) -> Vec<ShopRecord> {
    let prefix_bytes = shop_prefix_record_count(buffer) * SHOP_BYTES;
    parse_fixed_records(&buffer[..prefix_bytes], SHOP_BYTES)
        .map(|(id, start, record)| ShopRecord {
            id,
            item_ids: (0..SHOP_ITEM_SLOTS)
                .map(|slot| i16_be(record, slot * 2))
                .collect(),
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
        if !record.raw_bytes.is_empty() && record.raw_bytes.len() != SHOP_BYTES {
            return Err(ProvidenceError::message(format!(
                "Shop {} has invalid compatibility byte storage",
                record.id
            )));
        }
        if record.item_ids.len() != SHOP_ITEM_SLOTS || record.quantities.len() != SHOP_ITEM_SLOTS {
            return Err(ProvidenceError::message(format!(
                "Shop {} must define 1000 item and quantity slots",
                record.id
            )));
        }
        for slot in 0..SHOP_ITEM_SLOTS {
            write_i16_be(buffer, slot * 2, record.item_ids[slot]);
            buffer[2000 + slot] = record.quantities[slot];
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
    fn fresh_shop_compiles_all_semantic_fields() {
        let mut shop = parse_shops(&vec![0; SHOP_BYTES])
            .into_iter()
            .next()
            .expect("shop");
        shop.raw_bytes.clear();
        shop.item_ids = (0..SHOP_ITEM_SLOTS)
            .map(|slot| (slot % 1999) as i16 - 999)
            .collect();
        shop.quantities = (0..SHOP_ITEM_SLOTS).map(|slot| slot as u8).collect();
        shop.inflation = -12;

        let output = write_shops(&[shop]).unwrap();
        assert_eq!(output.len(), SHOP_BYTES);
        assert_eq!(i16_be(&output, 0), -999);
        assert_eq!(i16_be(&output, 1998), 0);
        assert_eq!(output[2000], 0);
        assert_eq!(output[2999], 231);
        assert_eq!(i16_be(&output, 3000), -12);
    }

    #[test]
    fn imported_shop_recompiles_without_record_byte_identity() {
        let mut input = vec![0; SHOP_BYTES];
        for slot in 0..SHOP_ITEM_SLOTS {
            write_i16_be(&mut input, slot * 2, (slot % 1999) as i16 - 999);
            input[2000 + slot] = slot as u8;
        }
        write_i16_be(&mut input, 3000, -12);
        let mut shops = parse_shops(&input);
        shops[0].raw_bytes = vec![0xA5; SHOP_BYTES];

        assert_eq!(write_shops(&shops).unwrap(), input);
    }

    #[test]
    fn shop_writer_rejects_malformed_canonical_storage() {
        let mut shop = parse_shops(&vec![0; SHOP_BYTES])
            .into_iter()
            .next()
            .expect("shop");
        shop.raw_bytes = vec![1];
        assert!(write_shops(&[shop.clone()])
            .unwrap_err()
            .to_string()
            .contains("invalid compatibility byte storage"));

        shop.raw_bytes.clear();
        shop.item_ids.clear();
        assert!(write_shops(&[shop])
            .unwrap_err()
            .to_string()
            .contains("must define 1000 item and quantity slots"));
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
