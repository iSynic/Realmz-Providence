use crate::error::{ProvidenceError, Result};
use crate::project::{ScenarioItemRecord, ShopRecord, TreasureRecord};

use super::record_bytes::{
    copy_raw, i16_be, i32_be, parse_fixed_records, preserve_raw, provenance, write_fixed_records,
    write_i16_array, write_i16_be, write_i32_be,
};

pub const SHOP_BYTES: usize = 3002;
pub const TREASURE_BYTES: usize = 48;
pub const ITEM_BYTES: usize = 100;

const SHOP_ITEM_SLOTS: usize = 1000;
const FOREIGN_RECORD_MIN_NONZERO_ITEMS: usize = 900;
const FOREIGN_RECORD_MIN_OUT_OF_RANGE_ITEMS: usize = 500;
const FOREIGN_RECORD_MIN_NONZERO_QUANTITIES: usize = 900;

pub fn parse_scenario_items(buffer: &[u8]) -> Vec<ScenarioItemRecord> {
    parse_fixed_records(buffer, ITEM_BYTES)
        .map(|(id, start, record)| {
            let stored_item_id = i16_be(record, 2);
            ScenarioItemRecord {
                id,
                item_id: if stored_item_id != 0 {
                    stored_item_id
                } else {
                    800 + id as i16
                },
                icon_id: i16_be(record, 4),
                item_type: i16_be(record, 6),
                st: i16_be(record, 0),
                blunt: i16_be(record, 8),
                hands: i16_be(record, 10),
                lu: i16_be(record, 12),
                movement: i16_be(record, 14),
                ac: i16_be(record, 16),
                magic_resistance: i16_be(record, 18),
                damage: i16_be(record, 20),
                spell_points: i16_be(record, 22),
                sound: i16_be(record, 24),
                weight: i16_be(record, 26),
                cost: i16_be(record, 28),
                charge: i16_be(record, 30),
                cursed_item_id: i16_be(record, 32),
                magical: i16_be(record, 34),
                item_cat0: i32_be(record, 36),
                item_cat1: i32_be(record, 40),
                race_restrictions: i16_be(record, 44),
                caste_restrictions: i16_be(record, 46),
                specific_race: i16_be(record, 48),
                specific_caste: i16_be(record, 50),
                race_class_only: i16_be(record, 52),
                caste_class_only: i16_be(record, 54),
                spare2: (0..7).map(|index| i16_be(record, 56 + index * 2)).collect(),
                v_small: i16_be(record, 70),
                v_large: i16_be(record, 72),
                heat: i16_be(record, 74),
                cold: i16_be(record, 76),
                electric: i16_be(record, 78),
                vs_undead: i16_be(record, 80),
                vs_demon_devil: i16_be(record, 82),
                vs_evil: i16_be(record, 84),
                special1: i16_be(record, 86),
                special2: i16_be(record, 88),
                special3: i16_be(record, 90),
                special4: i16_be(record, 92),
                special5: i16_be(record, 94),
                weight_per_charge: i16_be(record, 96),
                drop_on_empty: i16_be(record, 98),
                raw_bytes: record.to_vec(),
                authored: false,
                provenance: provenance("Data NI", id, start, ITEM_BYTES),
            }
        })
        .collect()
}

pub fn write_scenario_items(records: &[ScenarioItemRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, ITEM_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, ITEM_BYTES) {
            return Ok(());
        }
        write_i16_be(buffer, 0, record.st);
        write_i16_be(buffer, 2, record.item_id);
        write_i16_be(buffer, 4, record.icon_id);
        write_i16_be(buffer, 6, record.item_type);
        write_i16_be(buffer, 8, record.blunt);
        write_i16_be(buffer, 10, record.hands);
        write_i16_be(buffer, 12, record.lu);
        write_i16_be(buffer, 14, record.movement);
        write_i16_be(buffer, 16, record.ac);
        write_i16_be(buffer, 18, record.magic_resistance);
        write_i16_be(buffer, 20, record.damage);
        write_i16_be(buffer, 22, record.spell_points);
        write_i16_be(buffer, 24, record.sound);
        write_i16_be(buffer, 26, record.weight);
        write_i16_be(buffer, 28, record.cost);
        write_i16_be(buffer, 30, record.charge);
        write_i16_be(buffer, 32, record.cursed_item_id);
        write_i16_be(buffer, 34, record.magical);
        write_i32_be(buffer, 36, record.item_cat0);
        write_i32_be(buffer, 40, record.item_cat1);
        write_i16_be(buffer, 44, record.race_restrictions);
        write_i16_be(buffer, 46, record.caste_restrictions);
        write_i16_be(buffer, 48, record.specific_race);
        write_i16_be(buffer, 50, record.specific_caste);
        write_i16_be(buffer, 52, record.race_class_only);
        write_i16_be(buffer, 54, record.caste_class_only);
        write_i16_array(buffer, 56, &record.spare2, 7);
        write_i16_be(buffer, 70, record.v_small);
        write_i16_be(buffer, 72, record.v_large);
        write_i16_be(buffer, 74, record.heat);
        write_i16_be(buffer, 76, record.cold);
        write_i16_be(buffer, 78, record.electric);
        write_i16_be(buffer, 80, record.vs_undead);
        write_i16_be(buffer, 82, record.vs_demon_devil);
        write_i16_be(buffer, 84, record.vs_evil);
        write_i16_be(buffer, 86, record.special1);
        write_i16_be(buffer, 88, record.special2);
        write_i16_be(buffer, 90, record.special3);
        write_i16_be(buffer, 92, record.special4);
        write_i16_be(buffer, 94, record.special5);
        write_i16_be(buffer, 96, record.weight_per_charge);
        write_i16_be(buffer, 98, record.drop_on_empty);
        Ok(())
    })
}

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
    fn scenario_item_storage_mutates_only_modeled_fields_and_preserves_gap() {
        let mut input = vec![0u8; ITEM_BYTES * 2];
        let item_start = ITEM_BYTES;
        write_i16_be(&mut input, item_start + 2, 0x0102);
        for offset in 56..70 {
            input[item_start + offset] = 0xA5;
        }

        let mut items = parse_scenario_items(&input);
        assert_eq!(items[1].spare2, vec![-23131; 7]);
        items[1].authored = true;
        items[1].item_id = 0x0304;
        items[1].damage = 0x0506;
        items[1].item_cat0 = 0x01020304;
        items[1].v_small = 0x0708;

        let output = write_scenario_items(&items).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            &output[item_start + 56..item_start + 70],
            &input[item_start + 56..item_start + 70]
        );
        assert_eq!(i16_be(&output, item_start + 2), 0x0304);
        assert_eq!(i16_be(&output, item_start + 20), 0x0506);
        assert_eq!(i32_be(&output, item_start + 36), 0x01020304);
        assert_eq!(i16_be(&output, item_start + 70), 0x0708);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                item_start + 2,
                item_start + 3,
                item_start + 20,
                item_start + 21,
                item_start + 36,
                item_start + 37,
                item_start + 38,
                item_start + 39,
                item_start + 70,
                item_start + 71,
            ]
        );
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
