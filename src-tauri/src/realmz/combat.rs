use crate::error::{ProvidenceError, Result};
use crate::project::{BattleRecord, MonsterDescriptionRecord, MonsterRecord, MonsterSet};

use super::record_bytes::{
    copy_raw, decode_fixed_text, decode_pascal_text, encode_fixed_text, encode_pascal_text, i16_be,
    parse_fixed_records, preserve_raw, provenance, read_i16_array, signed_bytes,
    write_fixed_records, write_i16_array, write_i16_be, write_i8_array,
};

pub const BATTLE_BYTES: usize = 346;
pub const MONSTER_BYTES: usize = 210;
pub const MONSTER_DESCRIPTION_BYTES: usize = 256;
const BATTLE_RUNTIME_MONSTER_LIMIT: usize = 100;

pub fn parse_battles(buffer: &[u8]) -> Vec<BattleRecord> {
    parse_fixed_records(buffer, BATTLE_BYTES)
        .map(|(id, start, record)| {
            let grid = (0..13 * 13).map(|slot| i16_be(record, slot * 2)).collect();
            BattleRecord {
                id,
                grid,
                dist: record[338] as i8,
                message_before: i16_be(record, 340),
                message_after: i16_be(record, 342),
                battle_macro: i16_be(record, 344),
                raw_bytes: record.to_vec(),
                authored: false,
                provenance: provenance("Data BD", id, start, BATTLE_BYTES),
            }
        })
        .collect()
}

pub fn write_battles(records: &[BattleRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, BATTLE_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, BATTLE_BYTES) {
            return Ok(());
        }
        if record.grid.len() != 13 * 13 {
            return Err(ProvidenceError::message(format!(
                "Battle {} must have a 13 x 13 monster grid",
                record.id
            )));
        }
        let placed_monsters = record.grid.iter().filter(|value| **value != 0).count();
        if placed_monsters > BATTLE_RUNTIME_MONSTER_LIMIT {
            return Err(ProvidenceError::message(format!(
                "Battle {} places {} monsters; Realmz runtime supports at most {} loaded monsters",
                record.id, placed_monsters, BATTLE_RUNTIME_MONSTER_LIMIT
            )));
        }
        for (slot, value) in record.grid.iter().enumerate() {
            write_i16_be(buffer, slot * 2, *value);
        }
        buffer[338] = record.dist as u8;
        write_i16_be(buffer, 340, record.message_before);
        write_i16_be(buffer, 342, record.message_after);
        write_i16_be(buffer, 344, record.battle_macro);
        Ok(())
    })
}

pub fn parse_monsters(buffer: &[u8]) -> Vec<MonsterRecord> {
    parse_monsters_from_source(buffer, "Data MD")
}

pub fn parse_monster_set(buffer: &[u8], source_file: &str, set_id: i16) -> MonsterSet {
    MonsterSet {
        source_file: source_file.to_string(),
        set_id,
        monsters: parse_monsters_from_source(buffer, source_file),
    }
}

fn parse_monsters_from_source(buffer: &[u8], source_file: &str) -> Vec<MonsterRecord> {
    parse_fixed_records(buffer, MONSTER_BYTES)
        .map(|(id, start, record)| MonsterRecord {
            id,
            hit_dice: record[0],
            stamina_bonus: record[1],
            agility: record[2],
            name_id: record[3],
            movement_max: record[4],
            armor: record[5] as i8,
            magic_resistance: record[6] as i8,
            distance: record[7] as i8,
            traitor: record[8] as i8,
            size: record[9] as i8,
            type_flags: signed_bytes(&record[10..18]),
            attack_count: record[18] as i8,
            magic_attack_count: record[19] as i8,
            attacks: (0..5)
                .map(|row| signed_bytes(&record[20 + row * 4..24 + row * 4]))
                .collect(),
            damage_bonus: record[40] as i8,
            cast_percent: record[41] as i8,
            run_percent: record[42] as i8,
            surrender_percent: record[43] as i8,
            missile_percent: record[44] as i8,
            can_summon: record[45] as i8,
            saves: signed_bytes(&record[46..52]),
            spell_immunities: signed_bytes(&record[52..58]),
            money: read_i16_array(record, 58, 3),
            spells: read_i16_array(record, 64, 10),
            items: read_i16_array(record, 84, 6),
            weapon: i16_be(record, 96),
            icon_id: i16_be(record, 98),
            spell_points: i16_be(record, 100),
            exp: i16_be(record, 102),
            stamina: i16_be(record, 104),
            stamina_max: i16_be(record, 106),
            underneath: read_i16_array(record, 108, 4),
            target: record[116] as i8,
            guarding: record[117] as i8,
            not_on_menu: record[118] != 0,
            been_attacked: record[119] as i8,
            movement: record[120] as i8,
            magic_to_hit: record[121] as i8,
            conditions: signed_bytes(&record[122..162]),
            lr: record[162] as i8,
            up: record[163] as i8,
            attack_num: record[164] as i8,
            bonus_attack: record[165] as i8,
            death_macro: i16_be(record, 166),
            max_spell_points: i16_be(record, 168),
            display_name: {
                let decoded = decode_fixed_text(&record[170..210]);
                if decoded.is_empty() {
                    format!("Monster {}", id)
                } else {
                    decoded
                }
            },
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance(source_file, id, start, MONSTER_BYTES),
        })
        .collect()
}

pub fn write_monsters(records: &[MonsterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, MONSTER_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, MONSTER_BYTES) {
            return Ok(());
        }
        buffer[0] = record.hit_dice;
        buffer[1] = record.stamina_bonus;
        buffer[2] = record.agility;
        buffer[3] = record.name_id;
        buffer[4] = record.movement_max;
        buffer[5] = record.armor as u8;
        buffer[6] = record.magic_resistance as u8;
        buffer[7] = record.distance as u8;
        buffer[8] = record.traitor as u8;
        buffer[9] = record.size as u8;
        write_i8_array(buffer, 10, &record.type_flags, 8);
        buffer[18] = record.attack_count as u8;
        buffer[19] = record.magic_attack_count as u8;
        for row in 0..5 {
            let values = record
                .attacks
                .get(row)
                .cloned()
                .unwrap_or_else(|| vec![0, 0, 0, 0]);
            write_i8_array(buffer, 20 + row * 4, &values, 4);
        }
        buffer[40] = record.damage_bonus as u8;
        buffer[41] = record.cast_percent as u8;
        buffer[42] = record.run_percent as u8;
        buffer[43] = record.surrender_percent as u8;
        buffer[44] = record.missile_percent as u8;
        buffer[45] = record.can_summon as u8;
        write_i8_array(buffer, 46, &record.saves, 6);
        write_i8_array(buffer, 52, &record.spell_immunities, 6);
        write_i16_array(buffer, 58, &record.money, 3);
        write_i16_array(buffer, 64, &record.spells, 10);
        write_i16_array(buffer, 84, &record.items, 6);
        write_i16_be(buffer, 96, record.weapon);
        write_i16_be(buffer, 98, record.icon_id);
        write_i16_be(buffer, 100, record.spell_points);
        write_i16_be(buffer, 102, record.exp);
        write_i16_be(buffer, 104, record.stamina);
        write_i16_be(buffer, 106, record.stamina_max);
        write_i16_array(buffer, 108, &record.underneath, 4);
        buffer[116] = record.target as u8;
        buffer[117] = record.guarding as u8;
        buffer[118] = u8::from(record.not_on_menu);
        buffer[119] = record.been_attacked as u8;
        buffer[120] = record.movement as u8;
        buffer[121] = record.magic_to_hit as u8;
        write_i8_array(buffer, 122, &record.conditions, 40);
        buffer[162] = record.lr as u8;
        buffer[163] = record.up as u8;
        buffer[164] = record.attack_num as u8;
        buffer[165] = record.bonus_attack as u8;
        write_i16_be(buffer, 166, record.death_macro);
        write_i16_be(buffer, 168, record.max_spell_points);
        encode_fixed_text(&mut buffer[170..210], &record.display_name)?;
        Ok(())
    })
}

pub fn write_monster_set(monster_set: &MonsterSet) -> Result<Vec<u8>> {
    write_monsters(&monster_set.monsters)
}

pub fn parse_monster_descriptions(buffer: &[u8]) -> Vec<MonsterDescriptionRecord> {
    parse_fixed_records(buffer, MONSTER_DESCRIPTION_BYTES)
        .map(|(id, start, record)| MonsterDescriptionRecord {
            id,
            text: decode_pascal_text(record),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data DES", id, start, MONSTER_DESCRIPTION_BYTES),
        })
        .collect()
}

pub fn write_monster_descriptions(records: &[MonsterDescriptionRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, MONSTER_DESCRIPTION_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(
            record.authored,
            &record.raw_bytes,
            MONSTER_DESCRIPTION_BYTES,
        ) {
            return Ok(());
        }
        encode_pascal_text(buffer, &record.text)?;
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
    fn combat_records_round_trip_full_records() {
        let cases: [(usize, fn(&[u8]) -> Vec<u8>); 3] = [
            (MONSTER_DESCRIPTION_BYTES, |bytes| {
                write_monster_descriptions(&parse_monster_descriptions(bytes)).unwrap()
            }),
            (BATTLE_BYTES, |bytes| {
                write_battles(&parse_battles(bytes)).unwrap()
            }),
            (MONSTER_BYTES, |bytes| {
                write_monsters(&parse_monsters(bytes)).unwrap()
            }),
        ];
        for (record_bytes, parse_write) in cases {
            let mut input = vec![0u8; record_bytes * 2];
            input[0] = 1;
            input[record_bytes + 3] = 42;
            input[record_bytes * 2 - 1] = 99;
            assert_eq!(input, parse_write(&input));
        }
    }

    #[test]
    fn monster_description_storage_mutates_only_owned_pascal_bytes() {
        let mut input = vec![0u8; MONSTER_DESCRIPTION_BYTES * 2];
        input[0] = 1;
        input[1] = b'X';
        let description_start = MONSTER_DESCRIPTION_BYTES;
        let mut descriptions = parse_monster_descriptions(&input);
        descriptions[1].authored = true;
        descriptions[1].text = "No".to_string();
        let output = write_monster_descriptions(&descriptions).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                description_start,
                description_start + 1,
                description_start + 2
            ]
        );
    }

    #[test]
    fn battle_storage_mutates_only_owned_fields() {
        let mut input = vec![0u8; BATTLE_BYTES * 2];
        let battle_start = BATTLE_BYTES;
        let battle_grid_slot = 12;
        write_i16_be(&mut input, battle_start + battle_grid_slot * 2, 0x0102);
        let mut battles = parse_battles(&input);
        battles[1].authored = true;
        battles[1].grid[battle_grid_slot] = 0x0304;
        let output = write_battles(&battles).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                battle_start + battle_grid_slot * 2,
                battle_start + battle_grid_slot * 2 + 1
            ]
        );
    }

    #[test]
    fn alternate_monster_sets_round_trip_with_source_filename() {
        let mut input = vec![0u8; MONSTER_BYTES * 2];
        input[0] = 12;
        input[170] = b'A';
        input[171] = b'l';
        input[MONSTER_BYTES + 98] = 0xff;
        input[MONSTER_BYTES + 99] = 0x22;

        let monster_set = parse_monster_set(&input, "Data MD-1", -1);
        assert_eq!(monster_set.source_file, "Data MD-1");
        assert_eq!(monster_set.set_id, -1);
        assert_eq!(monster_set.monsters.len(), 2);
        assert_eq!(monster_set.monsters[0].provenance.source_file, "Data MD-1");
        assert_eq!(write_monster_set(&monster_set).unwrap(), input);
    }

    #[test]
    fn monster_storage_mutates_only_owned_fields() {
        let mut input = vec![0u8; MONSTER_BYTES * 2];
        input[5] = 0xA5;
        input[170..175].copy_from_slice(b"Other");
        let monster_start = MONSTER_BYTES;
        input[monster_start + 170..monster_start + 176].copy_from_slice(b"Stable");

        let mut monsters = parse_monsters(&input);
        monsters[1].authored = true;
        monsters[1].hit_dice = 7;
        monsters[1].armor = -4;
        monsters[1].type_flags[3] = -1;
        monsters[1].attacks[2][1] = 6;
        monsters[1].money[2] = 0x0304;
        monsters[1].spells[1] = 0x0506;
        monsters[1].not_on_menu = true;
        monsters[1].conditions[4] = -7;
        monsters[1].death_macro = 0x0708;

        let output = write_monsters(&monsters).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(&output[..MONSTER_BYTES], &input[..MONSTER_BYTES]);
        assert_eq!(output[monster_start], 7);
        assert_eq!(output[monster_start + 5] as i8, -4);
        assert_eq!(i16_be(&output, monster_start + 62), 0x0304);
        assert_eq!(i16_be(&output, monster_start + 166), 0x0708);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                monster_start,
                monster_start + 5,
                monster_start + 13,
                monster_start + 29,
                monster_start + 62,
                monster_start + 63,
                monster_start + 66,
                monster_start + 67,
                monster_start + 118,
                monster_start + 126,
                monster_start + 166,
                monster_start + 167,
            ]
        );
    }

    #[test]
    fn alternate_monster_sets_mutate_only_owned_fields_and_preserve_source() {
        for (source_file, set_id) in [("Data MD1", 1), ("Data MD-1", -1)] {
            let mut input = vec![0u8; MONSTER_BYTES * 2];
            input[8] = 0xA5;
            input[170..173].copy_from_slice(b"One");
            let monster_start = MONSTER_BYTES;
            input[monster_start + 170..monster_start + 173].copy_from_slice(b"Two");

            let mut monster_set = parse_monster_set(&input, source_file, set_id);
            monster_set.monsters[1].authored = true;
            monster_set.monsters[1].icon_id = 0x1234;
            monster_set.monsters[1].max_spell_points = 0x0506;

            let output = write_monster_set(&monster_set).unwrap();

            assert_eq!(monster_set.source_file, source_file);
            assert_eq!(monster_set.set_id, set_id);
            assert_eq!(monster_set.monsters[1].provenance.source_file, source_file);
            assert_eq!(
                monster_set.monsters[1].provenance.byte_offset,
                monster_start
            );
            assert_eq!(output.len(), input.len());
            assert_eq!(&output[..MONSTER_BYTES], &input[..MONSTER_BYTES]);
            assert_eq!(i16_be(&output, monster_start + 98), 0x1234);
            assert_eq!(i16_be(&output, monster_start + 168), 0x0506);
            assert_eq!(
                changed_offsets(&input, &output),
                vec![
                    monster_start + 98,
                    monster_start + 99,
                    monster_start + 168,
                    monster_start + 169,
                ]
            );
        }
    }
}
