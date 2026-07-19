use crate::error::{ProvidenceError, Result};
use crate::project::{MonsterDescriptionRecord, MonsterRecord, MonsterSet};

use super::record_bytes::{
    decode_fixed_text, decode_pascal_text, encode_fixed_text, encode_pascal_text, i16_be,
    parse_fixed_records, provenance, read_i16_array, signed_bytes, write_fixed_records,
    write_i16_array, write_i16_be, write_i8_array,
};

pub const MONSTER_BYTES: usize = 210;
pub const MONSTER_DESCRIPTION_BYTES: usize = 256;

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
        validate_monster_storage(record)?;
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
        if !record.raw_bytes.is_empty() && record.raw_bytes.len() != MONSTER_DESCRIPTION_BYTES {
            return Err(ProvidenceError::message(format!(
                "Monster description {} has invalid compatibility byte storage",
                record.id
            )));
        }
        encode_pascal_text(buffer, &record.text)?;
        Ok(())
    })
}

fn validate_monster_storage(record: &MonsterRecord) -> Result<()> {
    if !record.raw_bytes.is_empty() && record.raw_bytes.len() != MONSTER_BYTES {
        return Err(ProvidenceError::message(format!(
            "Monster {} has invalid compatibility byte storage",
            record.id
        )));
    }
    for (name, actual, expected) in [
        ("trait flags", record.type_flags.len(), 8),
        ("attack rows", record.attacks.len(), 5),
        ("saves", record.saves.len(), 6),
        ("spell immunities", record.spell_immunities.len(), 6),
        ("money slots", record.money.len(), 3),
        ("spell slots", record.spells.len(), 10),
        ("item slots", record.items.len(), 6),
        ("underneath slots", record.underneath.len(), 4),
        ("condition fields", record.conditions.len(), 40),
    ] {
        if actual != expected {
            return Err(ProvidenceError::message(format!(
                "Monster {} must have exactly {} {}",
                record.id, expected, name
            )));
        }
    }
    if record.attacks.iter().any(|row| row.len() != 4) {
        return Err(ProvidenceError::message(format!(
            "Monster {} attack rows must have exactly 4 fields",
            record.id
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn semantic_monster() -> MonsterRecord {
        let mut record = parse_monsters(&vec![0; MONSTER_BYTES]).remove(0);
        record.raw_bytes.clear();
        record.authored = true;
        record.hit_dice = 9;
        record.stamina_bonus = 200;
        record.agility = 201;
        record.name_id = 6;
        record.movement_max = 202;
        record.armor = -4;
        record.magic_resistance = -3;
        record.distance = -2;
        record.traitor = -1;
        record.size = 4;
        record.type_flags = vec![1, -1, 2, -2, 3, -3, 4, -4];
        record.attack_count = 2;
        record.magic_attack_count = 1;
        record.attacks = vec![
            vec![1, 2, 3, 4],
            vec![-1, -2, -3, -4],
            vec![5, 6, 7, 8],
            vec![0, 0, 0, 0],
            vec![9, 10, 11, 12],
        ];
        record.damage_bonus = -5;
        record.cast_percent = 33;
        record.run_percent = 44;
        record.surrender_percent = 55;
        record.missile_percent = 66;
        record.can_summon = -6;
        record.saves = vec![1, 2, 3, 4, 5, 6];
        record.spell_immunities = vec![-1, -2, -3, -4, -5, -6];
        record.money = vec![100, 200, 300];
        record.spells = (10..20).collect();
        record.items = (20..26).collect();
        record.weapon = 26;
        record.icon_id = -27;
        record.spell_points = 28;
        record.exp = 29;
        record.stamina = 30;
        record.stamina_max = 31;
        record.underneath = vec![32, 33, 34, 35];
        record.target = -7;
        record.guarding = -8;
        record.not_on_menu = true;
        record.been_attacked = -9;
        record.movement = -10;
        record.magic_to_hit = -11;
        record.conditions = (0..40)
            .map(|index| {
                if index % 2 == 0 {
                    index as i8
                } else {
                    -(index as i8)
                }
            })
            .collect();
        record.lr = -12;
        record.up = -13;
        record.attack_num = -14;
        record.bonus_attack = -15;
        record.death_macro = -16;
        record.max_spell_points = 37;
        record.display_name = "Semantic Beast".to_string();
        record
    }

    #[test]
    fn monster_writer_compiles_every_semantic_field_without_raw_identity() {
        let record = semantic_monster();
        let expected = write_monsters(&[record.clone()]).unwrap();
        let mut poisoned = record;
        poisoned.raw_bytes = vec![0xa5; MONSTER_BYTES];
        let output = write_monsters(&[poisoned]).unwrap();

        assert_eq!(output, expected);
        assert_eq!(output.len(), MONSTER_BYTES);
        assert_eq!(
            &output[0..10],
            &[9, 200, 201, 6, 202, 252, 253, 254, 255, 4]
        );
        assert_eq!(&output[10..18], &[1, 255, 2, 254, 3, 253, 4, 252]);
        assert_eq!(&output[18..24], &[2, 1, 1, 2, 3, 4]);
        assert_eq!(i16_be(&output, 58), 100);
        assert_eq!(i16_be(&output, 62), 300);
        assert_eq!(i16_be(&output, 64), 10);
        assert_eq!(i16_be(&output, 82), 19);
        assert_eq!(i16_be(&output, 84), 20);
        assert_eq!(i16_be(&output, 94), 25);
        assert_eq!(i16_be(&output, 98), -27);
        assert_eq!(i16_be(&output, 108), 32);
        assert_eq!(i16_be(&output, 114), 35);
        assert_eq!(&output[116..122], &[249, 248, 1, 247, 246, 245]);
        assert_eq!(&output[162..166], &[244, 243, 242, 241]);
        assert_eq!(i16_be(&output, 166), -16);
        assert_eq!(i16_be(&output, 168), 37);
        assert_eq!(&output[170..184], b"Semantic Beast");
        assert!(output[184..210].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn monster_description_writer_compiles_pascal_text_without_raw_identity() {
        let mut description =
            parse_monster_descriptions(&vec![0; MONSTER_DESCRIPTION_BYTES]).remove(0);
        description.text = "Canonical description".to_string();
        description.authored = true;
        description.raw_bytes = vec![0xa5; MONSTER_DESCRIPTION_BYTES];

        let output = write_monster_descriptions(&[description]).unwrap();
        assert_eq!(output[0], 21);
        assert_eq!(&output[1..22], b"Canonical description");
        assert!(output[22..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn alternate_monster_sets_keep_source_provenance_and_compile_semantics() {
        let input = write_monsters(&[semantic_monster()]).unwrap();
        let monster_set = parse_monster_set(&input, "Data MD-1", -1);
        assert_eq!(monster_set.source_file, "Data MD-1");
        assert_eq!(monster_set.set_id, -1);
        assert_eq!(monster_set.monsters.len(), 1);
        assert_eq!(monster_set.monsters[0].provenance.source_file, "Data MD-1");
        assert_eq!(write_monster_set(&monster_set).unwrap(), input);
    }

    #[test]
    fn monster_writers_reject_malformed_compatibility_and_fixed_arrays() {
        let mut monster = semantic_monster();
        monster.raw_bytes = vec![1];
        assert!(write_monsters(&[monster]).is_err());

        let mut monster = semantic_monster();
        monster.attacks[0].pop();
        assert!(write_monsters(&[monster]).is_err());

        let mut description =
            parse_monster_descriptions(&vec![0; MONSTER_DESCRIPTION_BYTES]).remove(0);
        description.raw_bytes = vec![1];
        assert!(write_monster_descriptions(&[description]).is_err());
    }
}
