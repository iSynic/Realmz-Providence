use crate::error::{ProvidenceError, Result};
use crate::project::ScenarioItemRecord;

use super::record_bytes::{
    copy_raw, i16_be, i32_be, parse_fixed_records, provenance, write_fixed_records,
    write_i16_array, write_i16_be, write_i32_be,
};

pub const ITEM_BYTES: usize = 100;

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
        if !record.raw_bytes.is_empty() && record.raw_bytes.len() != ITEM_BYTES {
            return Err(ProvidenceError::message(format!(
                "Scenario item {} has invalid compatibility byte storage",
                record.id
            )));
        }
        if record.spare2.len() != 7 {
            return Err(ProvidenceError::message(format!(
                "Scenario item {} must define 7 spare words",
                record.id
            )));
        }
        copy_raw(buffer, &record.raw_bytes);
        let preserve_zero_item_id = record.raw_bytes.len() == ITEM_BYTES
            && i16_be(buffer, 2) == 0
            && record.item_id as i32 == 800 + record.id as i32;
        write_i16_be(buffer, 0, record.st);
        if !preserve_zero_item_id {
            write_i16_be(buffer, 2, record.item_id);
        }
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
    fn fresh_scenario_item_compiles_all_semantic_fields() {
        let mut item = parse_scenario_items(&vec![0; ITEM_BYTES])
            .into_iter()
            .next()
            .expect("scenario item");
        item.raw_bytes.clear();
        item.item_id = 901;
        item.icon_id = 321;
        item.item_cat0 = 0x01020304;
        item.spare2 = vec![1, 2, 3, 4, 5, 6, 7];
        item.special5 = -123;

        let output = write_scenario_items(&[item]).unwrap();

        assert_eq!(output.len(), ITEM_BYTES);
        assert_eq!(i16_be(&output, 2), 901);
        assert_eq!(i16_be(&output, 4), 321);
        assert_eq!(i32_be(&output, 36), 0x01020304);
        assert_eq!(i16_be(&output, 56), 1);
        assert_eq!(i16_be(&output, 68), 7);
        assert_eq!(i16_be(&output, 94), -123);
    }

    #[test]
    fn imported_scenario_item_preserves_zero_id_alias_until_semantics_change() {
        let mut input = vec![0xA5; ITEM_BYTES];
        write_i16_be(&mut input, 2, 0);
        let mut items = parse_scenario_items(&input);

        assert_eq!(items[0].item_id, 800);
        assert_eq!(write_scenario_items(&items).unwrap(), input);

        items[0].item_id = 901;
        let output = write_scenario_items(&items).unwrap();
        assert_eq!(i16_be(&output, 2), 901);
        assert_eq!(&output[56..70], &input[56..70]);
    }

    #[test]
    fn scenario_item_storage_mutates_only_semantic_fields() {
        let mut input = vec![0u8; ITEM_BYTES * 2];
        let item_start = ITEM_BYTES;
        write_i16_be(&mut input, item_start + 2, 0x0102);
        for offset in 56..70 {
            input[item_start + offset] = 0xA5;
        }

        let mut items = parse_scenario_items(&input);
        assert_eq!(items[1].spare2, vec![-23131; 7]);
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
}
