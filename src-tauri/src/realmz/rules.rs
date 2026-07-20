use super::record_bytes::{
    copy_fixed_bytes, i16_be, i32_be, provenance, read_i16_vec, read_i32_vec, write_i16_be,
    write_i16_vec, write_i32_be, write_i32_vec,
};
use crate::error::Result;
use crate::generated::native_manifest_policy::REALMZ_NATIVE_LAYOUT;
use crate::project::{ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride};
#[path = "rules_validation.rs"]
mod validation;
use validation::{validate_caste_storage, validate_race_storage};

pub const SPELL_BYTES: usize = REALMZ_NATIVE_LAYOUT.spell_record_bytes;
pub const SPELL_OVERRIDE_RECORDS: usize = REALMZ_NATIVE_LAYOUT.spell_override_records;
pub const RACE_BYTES: usize = REALMZ_NATIVE_LAYOUT.race_record_bytes;
pub const CASTE_BYTES: usize = REALMZ_NATIVE_LAYOUT.caste_record_bytes;
pub const RACE_OVERRIDE_RECORDS: usize = REALMZ_NATIVE_LAYOUT.race_override_records;
pub const CASTE_OVERRIDE_RECORDS: usize = REALMZ_NATIVE_LAYOUT.caste_override_records;

pub fn parse_spell_overrides(buffer: &[u8]) -> Vec<ScenarioSpellOverride> {
    let count = (buffer.len() / SPELL_BYTES).min(SPELL_OVERRIDE_RECORDS);
    (0..count)
        .map(|id| {
            let start = id * SPELL_BYTES;
            let record = &buffer[start..start + SPELL_BYTES];
            ScenarioSpellOverride {
                id,
                range1: record[0],
                range2: record[1],
                queue_icon: record[2],
                to_hit_bonus: record[3] as i8,
                save_bonus: record[4] as i8,
                fixed_target_num: record[5],
                can_rotate: record[6],
                save_adjust: record[7] as i8,
                cannot: record[8],
                resist_adjust: record[9] as i8,
                cost: record[10],
                damage1: record[11],
                damage2: record[12],
                power_damage1: record[13],
                power_damage2: record[14],
                duration1: record[15],
                duration2: record[16],
                power_duration1: record[17],
                power_duration2: record[18],
                spell_look1: record[19],
                spell_look2: record[20],
                sound1: record[21],
                sound2: record[22],
                target_type: record[23],
                size: record[24],
                special: record[25],
                damage_type: record[26],
                spell_class: record[27],
                in_combat: record[28] != 0,
                in_camp: record[29] != 0,
                display_name: format!("Custom Spell {}", id),
                description: String::new(),
                authored: false,
                provenance: provenance("Data Spell", id, start, SPELL_BYTES),
            }
        })
        .collect()
}

pub fn write_spell_overrides(records: &[ScenarioSpellOverride]) -> Result<Vec<u8>> {
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let max_id = records.iter().map(|record| record.id).max().unwrap_or(0);
    let mut output = vec![0u8; (max_id + 1) * SPELL_BYTES];
    for record in records {
        let start = record.id * SPELL_BYTES;
        output[start] = record.range1;
        output[start + 1] = record.range2;
        output[start + 2] = record.queue_icon;
        output[start + 3] = record.to_hit_bonus as u8;
        output[start + 4] = record.save_bonus as u8;
        output[start + 5] = record.fixed_target_num;
        output[start + 6] = record.can_rotate;
        output[start + 7] = record.save_adjust as u8;
        output[start + 8] = record.cannot;
        output[start + 9] = record.resist_adjust as u8;
        output[start + 10] = record.cost;
        output[start + 11] = record.damage1;
        output[start + 12] = record.damage2;
        output[start + 13] = record.power_damage1;
        output[start + 14] = record.power_damage2;
        output[start + 15] = record.duration1;
        output[start + 16] = record.duration2;
        output[start + 17] = record.power_duration1;
        output[start + 18] = record.power_duration2;
        output[start + 19] = record.spell_look1;
        output[start + 20] = record.spell_look2;
        output[start + 21] = record.sound1;
        output[start + 22] = record.sound2;
        output[start + 23] = record.target_type;
        output[start + 24] = record.size;
        output[start + 25] = record.special;
        output[start + 26] = record.damage_type;
        output[start + 27] = record.spell_class;
        output[start + 28] = u8::from(record.in_combat);
        output[start + 29] = u8::from(record.in_camp);
    }
    Ok(output)
}

pub fn parse_race_overrides(buffer: &[u8]) -> Vec<ScenarioRaceOverride> {
    let count = buffer.len() / RACE_BYTES;
    (0..count)
        .map(|id| {
            let start = id * RACE_BYTES;
            let record = &buffer[start..start + RACE_BYTES];
            ScenarioRaceOverride {
                id,
                display_name: format!("Race {}", id + 1),
                plus_minus_to_hit: read_i16_vec(record, 0, 8),
                special_ability: read_i16_vec(record, 16, 14),
                drv_bonus: read_i16_vec(record, 44, 8),
                att_bonus: read_i16_vec(record, 60, 6),
                min_max: read_i16_vec(record, 72, 12),
                conditions: read_i16_vec(record, 112, 40),
                max_age: i16_be(record, 192),
                does_not_die: i16_be(record, 194),
                base_move: i16_be(record, 196),
                mag_res: i16_be(record, 198),
                two_hand: i16_be(record, 200),
                missile: i16_be(record, 202),
                num_of_attacks: read_i16_vec(record, 204, 2),
                can_caste: record[208..238].to_vec(),
                age_range: (0..5)
                    .map(|band| read_i16_vec(record, 238 + band * 4, 2))
                    .collect(),
                age_change: (0..5)
                    .map(|band| {
                        record[258 + band * 15..258 + (band + 1) * 15]
                            .iter()
                            .map(|value| *value as i8)
                            .collect()
                    })
                    .collect(),
                can_regenerate: record[333],
                default_icon_set: i16_be(record, 334),
                item_types: vec![i32_be(record, 336), i32_be(record, 340)],
                descriptors: i16_be(record, 344),
                authored: false,
                provenance: provenance("Data Race", id, start, RACE_BYTES),
            }
        })
        .collect()
}

pub fn write_race_overrides(records: &[ScenarioRaceOverride]) -> Result<Vec<u8>> {
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let max_id = records.iter().map(|record| record.id).max().unwrap_or(0);
    let mut output = vec![0u8; (max_id + 1) * RACE_BYTES];
    for record in records {
        validate_race_storage(record)?;
        let start = record.id * RACE_BYTES;
        let target = &mut output[start..start + RACE_BYTES];
        write_i16_vec(target, 0, &record.plus_minus_to_hit, 8);
        write_i16_vec(target, 16, &record.special_ability, 14);
        write_i16_vec(target, 44, &record.drv_bonus, 8);
        write_i16_vec(target, 60, &record.att_bonus, 6);
        write_i16_vec(target, 72, &record.min_max, 12);
        write_i16_vec(target, 112, &record.conditions, 40);
        write_i16_be(target, 192, record.max_age);
        write_i16_be(target, 194, record.does_not_die);
        write_i16_be(target, 196, record.base_move);
        write_i16_be(target, 198, record.mag_res);
        write_i16_be(target, 200, record.two_hand);
        write_i16_be(target, 202, record.missile);
        write_i16_vec(target, 204, &record.num_of_attacks, 2);
        copy_fixed_bytes(&mut target[208..238], &record.can_caste);
        for band in 0..5 {
            write_i16_vec(
                target,
                238 + band * 4,
                record.age_range.get(band).map(Vec::as_slice).unwrap_or(&[]),
                2,
            );
            for index in 0..15 {
                target[258 + band * 15 + index] = record
                    .age_change
                    .get(band)
                    .and_then(|values| values.get(index))
                    .copied()
                    .unwrap_or(0) as u8;
            }
        }
        target[333] = record.can_regenerate;
        write_i16_be(target, 334, record.default_icon_set);
        write_i32_be(target, 336, *record.item_types.first().unwrap_or(&0));
        write_i32_be(target, 340, *record.item_types.get(1).unwrap_or(&0));
        write_i16_be(target, 344, record.descriptors);
    }
    Ok(output)
}

pub fn parse_caste_overrides(buffer: &[u8]) -> Vec<ScenarioCasteOverride> {
    let count = buffer.len() / CASTE_BYTES;
    (0..count)
        .map(|id| {
            let start = id * CASTE_BYTES;
            let record = &buffer[start..start + CASTE_BYTES];
            ScenarioCasteOverride {
                id,
                display_name: format!("Caste {}", id + 1),
                special_ability: vec![read_i16_vec(record, 0, 14), read_i16_vec(record, 28, 14)],
                drv_bonus: read_i16_vec(record, 56, 8),
                att_bonus: read_i16_vec(record, 72, 6),
                spellcasters: (0..4)
                    .map(|row| read_i16_vec(record, 84 + row * 6, 3))
                    .collect(),
                min_max: read_i16_vec(record, 108, 12),
                conditions: read_i16_vec(record, 132, 40),
                can_use_missile: i16_be(record, 212),
                gets_missile_bonus: i16_be(record, 214),
                stamina: read_i16_vec(record, 216, 2),
                strength: read_i16_vec(record, 220, 2),
                dodge: read_i16_vec(record, 224, 2),
                to_hit: read_i16_vec(record, 228, 2),
                missile: read_i16_vec(record, 232, 2),
                hand2_hand: read_i16_vec(record, 236, 2),
                caste_class: i16_be(record, 248),
                minimum_age_group: i16_be(record, 250),
                move_bonus: i16_be(record, 252),
                mag_res: i16_be(record, 254),
                two_hand: i16_be(record, 256),
                max_stamina_bonus: i16_be(record, 258),
                bonus_attacks: i16_be(record, 260),
                max_attacks: i16_be(record, 262),
                victory: read_i32_vec(record, 264, 30),
                start_money: i16_be(record, 384),
                start_items: read_i16_vec(record, 386, 20),
                attacks: record[426..436].to_vec(),
                item_types: vec![i32_be(record, 436), i32_be(record, 440)],
                default_icon: i16_be(record, 444),
                max_spells_attacks: i16_be(record, 446),
                spells_so_far: i16_be(record, 448),
                authored: false,
                provenance: provenance("Data Caste", id, start, CASTE_BYTES),
            }
        })
        .collect()
}

pub fn write_caste_overrides(records: &[ScenarioCasteOverride]) -> Result<Vec<u8>> {
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let max_id = records.iter().map(|record| record.id).max().unwrap_or(0);
    let mut output = vec![0u8; (max_id + 1) * CASTE_BYTES];
    for record in records {
        validate_caste_storage(record)?;
        let start = record.id * CASTE_BYTES;
        let target = &mut output[start..start + CASTE_BYTES];
        write_i16_vec(
            target,
            0,
            record
                .special_ability
                .first()
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            14,
        );
        write_i16_vec(
            target,
            28,
            record
                .special_ability
                .get(1)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            14,
        );
        write_i16_vec(target, 56, &record.drv_bonus, 8);
        write_i16_vec(target, 72, &record.att_bonus, 6);
        for row in 0..4 {
            write_i16_vec(
                target,
                84 + row * 6,
                record
                    .spellcasters
                    .get(row)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
                3,
            );
        }
        write_i16_vec(target, 108, &record.min_max, 12);
        write_i16_vec(target, 132, &record.conditions, 40);
        write_i16_be(target, 212, record.can_use_missile);
        write_i16_be(target, 214, record.gets_missile_bonus);
        write_i16_vec(target, 216, &record.stamina, 2);
        write_i16_vec(target, 220, &record.strength, 2);
        write_i16_vec(target, 224, &record.dodge, 2);
        write_i16_vec(target, 228, &record.to_hit, 2);
        write_i16_vec(target, 232, &record.missile, 2);
        write_i16_vec(target, 236, &record.hand2_hand, 2);
        write_i16_be(target, 248, record.caste_class);
        write_i16_be(target, 250, record.minimum_age_group);
        write_i16_be(target, 252, record.move_bonus);
        write_i16_be(target, 254, record.mag_res);
        write_i16_be(target, 256, record.two_hand);
        write_i16_be(target, 258, record.max_stamina_bonus);
        write_i16_be(target, 260, record.bonus_attacks);
        write_i16_be(target, 262, record.max_attacks);
        write_i32_vec(target, 264, &record.victory, 30);
        write_i16_be(target, 384, record.start_money);
        write_i16_vec(target, 386, &record.start_items, 20);
        copy_fixed_bytes(&mut target[426..436], &record.attacks);
        write_i32_be(target, 436, *record.item_types.first().unwrap_or(&0));
        write_i32_be(target, 440, *record.item_types.get(1).unwrap_or(&0));
        write_i16_be(target, 444, record.default_icon);
        write_i16_be(target, 446, record.max_spells_attacks);
        write_i16_be(target, 448, record.spells_so_far);
    }
    Ok(output)
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
    fn rules_records_round_trip_full_records() {
        let cases: [(usize, usize, fn(&[u8]) -> Vec<u8>); 3] = [
            (SPELL_BYTES, 29, |bytes| {
                write_spell_overrides(&parse_spell_overrides(bytes)).unwrap()
            }),
            (RACE_BYTES, 333, |bytes| {
                write_race_overrides(&parse_race_overrides(bytes)).unwrap()
            }),
            (CASTE_BYTES, 449, |bytes| {
                write_caste_overrides(&parse_caste_overrides(bytes)).unwrap()
            }),
        ];
        for (record_bytes, semantic_offset, parse_write) in cases {
            let mut input = vec![0u8; record_bytes * 2];
            input[0] = 1;
            input[record_bytes + 3] = 42;
            input[record_bytes + semantic_offset] = 1;
            assert_eq!(input, parse_write(&input));
        }
    }

    #[test]
    fn rules_overrides_round_trip_source_backed_fields() {
        let mut spell_input = vec![0u8; SPELL_BYTES * 2 + 16];
        spell_input[0] = 3;
        spell_input[10] = 7;
        spell_input[29] = 1;
        let mut spells = parse_spell_overrides(&spell_input);
        assert_eq!(spells.len(), 2);
        assert_eq!(spells[0].range1, 3);
        assert!(spells[0].in_camp);
        spells[0].authored = true;
        spells[0].cost = 11;
        let spell_output = write_spell_overrides(&spells).unwrap();
        assert_eq!(spell_output.len(), SPELL_BYTES * 2);
        assert_eq!(spell_output[10], 11);
        assert_eq!(
            changed_offsets(&spell_input[..SPELL_BYTES * 2], &spell_output),
            vec![10]
        );

        let mut race_input = vec![0u8; RACE_BYTES];
        write_i16_be(&mut race_input, 192, 88);
        write_i16_be(&mut race_input, 196, 14);
        race_input[208] = 1;
        let mut races = parse_race_overrides(&race_input);
        assert_eq!(races[0].max_age, 88);
        assert_eq!(races[0].base_move, 14);
        assert_eq!(races[0].can_caste[0], 1);
        races[0].authored = true;
        races[0].base_move = 16;
        races[0].can_caste[1] = 1;
        let race_output = write_race_overrides(&races).unwrap();
        assert_eq!(i16_be(&race_output, 196), 16);
        assert_eq!(race_output[209], 1);
        assert_eq!(changed_offsets(&race_input, &race_output), vec![197, 209]);

        let mut caste_input = vec![0u8; CASTE_BYTES];
        write_i16_be(&mut caste_input, 252, 2);
        write_i32_be(&mut caste_input, 264, 3000);
        write_i32_be(&mut caste_input, 268, 999999);
        write_i16_be(&mut caste_input, 384, 500);
        let mut castes = parse_caste_overrides(&caste_input);
        assert_eq!(castes[0].move_bonus, 2);
        assert_eq!(castes[0].victory[0], 3000);
        assert_eq!(castes[0].victory[1], 999999);
        assert_eq!(castes[0].start_money, 500);
        castes[0].authored = true;
        castes[0].victory[2] = 125000;
        castes[0].start_money = 750;
        castes[0].start_items[0] = 42;
        let caste_output = write_caste_overrides(&castes).unwrap();
        assert_eq!(i32_be(&caste_output, 272), 125000);
        assert_eq!(i16_be(&caste_output, 384), 750);
        assert_eq!(i16_be(&caste_output, 386), 42);
        assert_eq!(
            changed_offsets(&caste_input, &caste_output),
            vec![273, 274, 275, 384, 385, 387]
        );
    }
}
