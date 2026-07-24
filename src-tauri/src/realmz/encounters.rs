use crate::error::{ProvidenceError, Result};
use crate::generated::native_manifest_policy::REALMZ_NATIVE_LAYOUT;
use crate::project::{
    ComplexEncounterRecord, EncounterActionRow, SimpleEncounterRecord, ThiefEncounterRecord,
    TimedEncounterLocationKind, TimedEncounterRecord,
};

use super::record_bytes::{
    decode_pascal_text, encode_pascal_text, i16_be, parse_fixed_records, provenance,
    read_i16_array, signed_bytes, write_fixed_records, write_i16_array, write_i16_be,
    write_i8_array,
};

pub const SIMPLE_ENCOUNTER_BYTES: usize = REALMZ_NATIVE_LAYOUT.simple_encounter_record_bytes;
pub const COMPLEX_ENCOUNTER_BYTES: usize = REALMZ_NATIVE_LAYOUT.complex_encounter_record_bytes;
pub const TIMED_ENCOUNTER_BYTES: usize = REALMZ_NATIVE_LAYOUT.timed_encounter_record_bytes;
pub const THIEF_ENCOUNTER_BYTES: usize = REALMZ_NATIVE_LAYOUT.thief_encounter_record_bytes;

pub fn parse_simple_encounter_records(buffer: &[u8]) -> Vec<SimpleEncounterRecord> {
    parse_fixed_records(buffer, SIMPLE_ENCOUNTER_BYTES)
        .map(|(id, start, record)| SimpleEncounterRecord {
            id,
            actions: parse_encounter_actions(record),
            choice_results: record[96..100].to_vec(),
            can_back_out: record[100] != 0,
            max_times: record[101] as i8,
            caste_success: record[102] as i8,
            prompt: i16_be(record, 104),
            texts: (0..4)
                .map(|slot| decode_pascal_text(&record[106 + slot * 80..106 + slot * 80 + 80]))
                .collect(),
            authored: false,
            provenance: provenance("Data ED", id, start, SIMPLE_ENCOUNTER_BYTES),
        })
        .collect()
}

pub fn write_simple_encounters(records: &[SimpleEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, SIMPLE_ENCOUNTER_BYTES, |record, buffer| {
        write_encounter_actions(buffer, &record.actions)?;
        for slot in 0..4 {
            buffer[96 + slot] = record.choice_results.get(slot).copied().unwrap_or(0);
            encode_pascal_text(
                &mut buffer[106 + slot * 80..106 + slot * 80 + 80],
                record.texts.get(slot).map(String::as_str).unwrap_or(""),
            )?;
        }
        buffer[100] = u8::from(record.can_back_out);
        buffer[101] = record.max_times as u8;
        buffer[102] = record.caste_success as u8;
        buffer[103] = 0;
        write_i16_be(buffer, 104, record.prompt);
        Ok(())
    })
}

pub fn parse_complex_encounter_records(buffer: &[u8]) -> Vec<ComplexEncounterRecord> {
    parse_fixed_records(buffer, COMPLEX_ENCOUNTER_BYTES)
        .map(|(id, start, record)| ComplexEncounterRecord {
            id,
            actions: parse_encounter_actions(record),
            choice_results: Vec::new(),
            word_results: Vec::new(),
            action_result: record[96] as i8,
            word_result: record[97] as i8,
            groups: signed_bytes(&record[98..106]),
            spell_ids: (0..10).map(|slot| i16_be(record, 106 + slot * 2)).collect(),
            spell_results: signed_bytes(&record[126..136]),
            item_ids: (0..5).map(|slot| i16_be(record, 136 + slot * 2)).collect(),
            item_results: signed_bytes(&record[146..151]),
            can_back_out: record[151] != 0,
            thief: record[152] != 0,
            max_times: record[153] as i8,
            caste_success: record[154] as i8,
            thief_success: record[155] as i8,
            thief_fail: record[156] as i8,
            prompt: i16_be(record, 158),
            texts: (0..9)
                .map(|slot| decode_pascal_text(&record[160 + slot * 40..160 + slot * 40 + 40]))
                .collect(),
            authored: false,
            provenance: provenance("Data ED2", id, start, COMPLEX_ENCOUNTER_BYTES),
        })
        .collect()
}

pub fn write_complex_encounters(records: &[ComplexEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, COMPLEX_ENCOUNTER_BYTES, |record, buffer| {
        write_encounter_actions(buffer, &record.actions)?;
        buffer[96] = record.action_result as u8;
        buffer[97] = record.word_result as u8;
        write_i8_array(buffer, 98, &record.groups, 8);
        for slot in 0..10 {
            write_i16_be(
                buffer,
                106 + slot * 2,
                record.spell_ids.get(slot).copied().unwrap_or(0),
            );
        }
        write_i8_array(buffer, 126, &record.spell_results, 10);
        for slot in 0..5 {
            write_i16_be(
                buffer,
                136 + slot * 2,
                record.item_ids.get(slot).copied().unwrap_or(0),
            );
        }
        write_i8_array(buffer, 146, &record.item_results, 5);
        buffer[151] = u8::from(record.can_back_out);
        buffer[152] = u8::from(record.thief);
        buffer[153] = record.max_times as u8;
        buffer[154] = record.caste_success as u8;
        buffer[155] = record.thief_success as u8;
        buffer[156] = record.thief_fail as u8;
        buffer[157] = 0;
        write_i16_be(buffer, 158, record.prompt);
        for slot in 0..9 {
            encode_pascal_text(
                &mut buffer[160 + slot * 40..160 + slot * 40 + 40],
                record.texts.get(slot).map(String::as_str).unwrap_or(""),
            )?;
        }
        Ok(())
    })
}

pub fn parse_timed_encounters(buffer: &[u8]) -> Vec<TimedEncounterRecord> {
    parse_fixed_records(buffer, TIMED_ENCOUNTER_BYTES)
        .map(|(id, start, record)| TimedEncounterRecord {
            id,
            day: i16_be(record, 0),
            increment: i16_be(record, 2),
            percent: i16_be(record, 4),
            door: i16_be(record, 6),
            required_level: i16_be(record, 8),
            required_random_rect: i16_be(record, 10),
            required_x: i16_be(record, 12),
            required_y: i16_be(record, 14),
            required_item: i16_be(record, 16),
            required_quest: i16_be(record, 18),
            location_kind: timed_location_kind(i16_be(record, 20)),
            authored: false,
            provenance: provenance("Data TD3", id, start, TIMED_ENCOUNTER_BYTES),
        })
        .collect()
}

pub fn write_timed_encounters(records: &[TimedEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, TIMED_ENCOUNTER_BYTES, |record, buffer| {
        write_i16_be(buffer, 0, record.day);
        write_i16_be(buffer, 2, record.increment);
        write_i16_be(buffer, 4, record.percent);
        write_i16_be(buffer, 6, record.door);
        write_i16_be(buffer, 8, record.required_level);
        write_i16_be(buffer, 10, record.required_random_rect);
        write_i16_be(buffer, 12, record.required_x);
        write_i16_be(buffer, 14, record.required_y);
        write_i16_be(buffer, 16, record.required_item);
        write_i16_be(buffer, 18, record.required_quest);
        write_i16_be(buffer, 20, timed_location_kind_value(record.location_kind));
        Ok(())
    })
}

pub fn parse_thief_encounters(buffer: &[u8]) -> Vec<ThiefEncounterRecord> {
    parse_fixed_records(buffer, THIEF_ENCOUNTER_BYTES)
        .map(|(id, start, record)| ThiefEncounterRecord {
            id,
            type_flags: record[0..10].iter().map(|value| *value != 0).collect(),
            modifiers: signed_bytes(&record[10..18]),
            success_codes: signed_bytes(&record[18..26]),
            failure_codes: signed_bytes(&record[26..34]),
            success_text: read_i16_array(record, 34, 8),
            failure_text: read_i16_array(record, 50, 8),
            success_sounds: read_i16_array(record, 66, 8),
            failure_sounds: read_i16_array(record, 82, 8),
            spell: i16_be(record, 98),
            low_damage: i16_be(record, 100),
            high_damage: i16_be(record, 102),
            tumblers: i16_be(record, 104),
            prompts: read_i16_array(record, 106, 3),
            prompt_sounds: read_i16_array(record, 112, 3),
            authored: false,
            provenance: provenance("Data TD2", id, start, THIEF_ENCOUNTER_BYTES),
        })
        .collect()
}

pub fn write_thief_encounters(records: &[ThiefEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, THIEF_ENCOUNTER_BYTES, |record, buffer| {
        for slot in 0..10 {
            buffer[slot] = u8::from(*record.type_flags.get(slot).unwrap_or(&false));
        }
        write_i8_array(buffer, 10, &record.modifiers, 8);
        write_i8_array(buffer, 18, &record.success_codes, 8);
        write_i8_array(buffer, 26, &record.failure_codes, 8);
        write_i16_array(buffer, 34, &record.success_text, 8);
        write_i16_array(buffer, 50, &record.failure_text, 8);
        write_i16_array(buffer, 66, &record.success_sounds, 8);
        write_i16_array(buffer, 82, &record.failure_sounds, 8);
        write_i16_be(buffer, 98, record.spell);
        write_i16_be(buffer, 100, record.low_damage);
        write_i16_be(buffer, 102, record.high_damage);
        write_i16_be(buffer, 104, record.tumblers);
        write_i16_array(buffer, 106, &record.prompts, 3);
        write_i16_array(buffer, 112, &record.prompt_sounds, 3);
        Ok(())
    })
}

fn timed_location_kind(value: i16) -> TimedEncounterLocationKind {
    match value {
        1 => TimedEncounterLocationKind::Land,
        2 => TimedEncounterLocationKind::Dungeon,
        _ => TimedEncounterLocationKind::Any,
    }
}

fn timed_location_kind_value(value: TimedEncounterLocationKind) -> i16 {
    match value {
        TimedEncounterLocationKind::Any => -1,
        TimedEncounterLocationKind::Land => 1,
        TimedEncounterLocationKind::Dungeon => 2,
    }
}

fn parse_encounter_actions(record: &[u8]) -> Vec<EncounterActionRow> {
    let mut actions = Vec::new();
    for slot in 0..32 {
        let raw_code = record[slot] as i8 as i16;
        let id = i16_be(record, 32 + slot * 2);
        if raw_code != 0 || id != 0 {
            actions.push(EncounterActionRow {
                slot,
                raw_code,
                id,
                media_required_for_progression: None,
            });
        }
    }
    actions
}

fn write_encounter_actions(buffer: &mut [u8], actions: &[EncounterActionRow]) -> Result<()> {
    for offset in 0..96 {
        buffer[offset] = 0;
    }
    for action in actions {
        if action.slot >= 32 {
            return Err(ProvidenceError::message(format!(
                "Encounter action slot {} is out of range",
                action.slot
            )));
        }
        if action.raw_code < i8::MIN as i16 || action.raw_code > i8::MAX as i16 {
            return Err(ProvidenceError::message(format!(
                "Encounter action slot {} CODE {} is outside byte range",
                action.slot, action.raw_code
            )));
        }
        buffer[action.slot] = action.raw_code as i8 as u8;
        write_i16_be(buffer, 32 + action.slot * 2, action.id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_timed_encounter_compiles_semantic_fields_and_zero_reserved_words() {
        let mut encounter = parse_timed_encounters(&vec![0; TIMED_ENCOUNTER_BYTES]).remove(0);
        encounter.authored = true;
        encounter.day = 35;
        encounter.increment = 5;
        encounter.percent = 50;
        encounter.door = 24;
        encounter.required_level = 8;
        encounter.required_random_rect = 17;
        encounter.required_x = 10;
        encounter.required_y = 11;
        encounter.required_item = 901;
        encounter.required_quest = 7;
        encounter.location_kind = TimedEncounterLocationKind::Dungeon;
        let output = write_timed_encounters(&[encounter]).unwrap();
        assert_eq!(output.len(), TIMED_ENCOUNTER_BYTES);
        assert_eq!(
            (0..11)
                .map(|slot| i16_be(&output, slot * 2))
                .collect::<Vec<_>>(),
            vec![35, 5, 50, 24, 8, 17, 10, 11, 901, 7, 2]
        );
        assert!(output[22..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn imported_timed_encounter_compiles_without_record_byte_identity() {
        let mut input = vec![0u8; TIMED_ENCOUNTER_BYTES];
        write_i16_be(&mut input, 0, 12);
        write_i16_be(&mut input, 20, 1);
        write_i16_be(&mut input, 22, 0x1234);
        let records = parse_timed_encounters(&input);
        let output = write_timed_encounters(&records).unwrap();
        assert_ne!(output, input);
        assert_eq!(i16_be(&output, 0), 12);
        assert_eq!(i16_be(&output, 20), 1);
        assert_eq!(i16_be(&output, 22), 0);
    }

    #[test]
    fn fresh_simple_encounter_compiles_complete_semantic_row() {
        let mut encounter =
            parse_simple_encounter_records(&vec![0; SIMPLE_ENCOUNTER_BYTES]).remove(0);
        encounter.authored = true;
        encounter.actions = vec![EncounterActionRow {
            slot: 3,
            raw_code: -2,
            id: 0x0304,
            media_required_for_progression: None,
        }];
        encounter.choice_results[2] = 7;
        encounter.can_back_out = true;
        encounter.max_times = -3;
        encounter.caste_success = 4;
        encounter.prompt = 0x0506;
        encounter.texts[0] = "Go".into();
        let output = write_simple_encounters(&[encounter]).unwrap();
        assert_eq!(output.len(), SIMPLE_ENCOUNTER_BYTES);
        assert_eq!(output[3] as i8, -2);
        assert_eq!(i16_be(&output, 38), 0x0304);
        assert_eq!(&output[98..104], &[7, 0, 1, 0xfd, 4, 0]);
        assert_eq!(i16_be(&output, 104), 0x0506);
        assert_eq!(&output[106..109], &[2, b'G', b'o']);
    }

    #[test]
    fn imported_simple_encounter_compiles_without_record_byte_identity() {
        let mut input = vec![0u8; SIMPLE_ENCOUNTER_BYTES];
        input[103] = 0xa5;
        input[106..110].copy_from_slice(&[2, b'G', b'o', 0xcc]);
        let records = parse_simple_encounter_records(&input);
        let output = write_simple_encounters(&records).unwrap();
        assert_ne!(output, input);
        assert_eq!(output[103], 0);
        assert_eq!(&output[106..110], &[2, b'G', b'o', 0]);
    }

    #[test]
    fn fresh_complex_encounter_compiles_complete_semantic_row() {
        let mut encounter =
            parse_complex_encounter_records(&vec![0; COMPLEX_ENCOUNTER_BYTES]).remove(0);
        encounter.authored = true;
        encounter.actions.push(EncounterActionRow {
            slot: 4,
            raw_code: -2,
            id: 0x0304,
            media_required_for_progression: None,
        });
        encounter.action_result = 6;
        encounter.word_result = 7;
        encounter.groups[4] = -8;
        encounter.spell_ids[0] = 0x1112;
        encounter.spell_results[1] = -9;
        encounter.item_ids[2] = 0x1314;
        encounter.item_results[3] = -10;
        encounter.can_back_out = true;
        encounter.thief = true;
        encounter.max_times = -3;
        encounter.caste_success = 4;
        encounter.thief_success = -5;
        encounter.thief_fail = 8;
        encounter.prompt = 0x0506;
        encounter.texts[0] = "Hi".to_string();

        let output = write_complex_encounters(&[encounter]).unwrap();
        assert_eq!(output.len(), COMPLEX_ENCOUNTER_BYTES);
        assert_eq!(output[4] as i8, -2);
        assert_eq!(i16_be(&output, 40), 0x0304);
        assert_eq!(&output[96..106], &[6, 7, 0, 0, 0, 0, 0xf8, 0, 0, 0]);
        assert_eq!(i16_be(&output, 106), 0x1112);
        assert_eq!(output[127] as i8, -9);
        assert_eq!(i16_be(&output, 140), 0x1314);
        assert_eq!(output[149] as i8, -10);
        assert_eq!(&output[151..158], &[1, 1, 0xfd, 4, 0xfb, 8, 0]);
        assert_eq!(i16_be(&output, 158), 0x0506);
        assert_eq!(&output[160..163], &[2, b'H', b'i']);
    }

    #[test]
    fn imported_complex_encounter_compiles_without_record_byte_identity() {
        let mut input = vec![0u8; COMPLEX_ENCOUNTER_BYTES];
        input[96] = 6;
        input[157] = 0x5a;
        input[160..164].copy_from_slice(&[2, b'H', b'i', 0xcc]);
        let records = parse_complex_encounter_records(&input);
        let output = write_complex_encounters(&records).unwrap();
        assert_ne!(output, input);
        assert_eq!(output[96], 6);
        assert_eq!(output[157], 0);
        assert_eq!(&output[160..164], &[2, b'H', b'i', 0]);
    }

    #[test]
    fn fresh_thief_encounter_compiles_complete_semantic_row() {
        let mut encounter = parse_thief_encounters(&vec![0; THIEF_ENCOUNTER_BYTES]).remove(0);
        encounter.authored = true;
        encounter.type_flags = vec![
            true, false, true, false, true, false, true, false, true, true,
        ];
        encounter.modifiers = vec![-1, 2, -3, 4, -5, 6, -7, 8];
        encounter.success_codes = vec![1, 2, 3, 4, -1, -2, -3, -4];
        encounter.failure_codes = vec![4, 3, 2, 1, -4, -3, -2, -1];
        encounter.success_text = (0x0101..=0x0108).collect();
        encounter.failure_text = (0x0201..=0x0208).collect();
        encounter.success_sounds = (0x0301..=0x0308).collect();
        encounter.failure_sounds = (0x0401..=0x0408).collect();
        encounter.spell = 0x0501;
        encounter.low_damage = 0x0502;
        encounter.high_damage = 0x0503;
        encounter.tumblers = 0x0504;
        encounter.prompts = vec![0x0601, 0x0602, 0x0603];
        encounter.prompt_sounds = vec![0x0701, 0x0702, 0x0703];

        let output = write_thief_encounters(&[encounter]).unwrap();
        assert_eq!(output.len(), THIEF_ENCOUNTER_BYTES);
        assert_eq!(&output[0..10], &[1, 0, 1, 0, 1, 0, 1, 0, 1, 1]);
        assert_eq!(&output[10..18], &[0xff, 2, 0xfd, 4, 0xfb, 6, 0xf9, 8]);
        assert_eq!(&output[18..26], &[1, 2, 3, 4, 0xff, 0xfe, 0xfd, 0xfc]);
        assert_eq!(&output[26..34], &[4, 3, 2, 1, 0xfc, 0xfd, 0xfe, 0xff]);
        assert_eq!(i16_be(&output, 34), 0x0101);
        assert_eq!(i16_be(&output, 64), 0x0208);
        assert_eq!(i16_be(&output, 66), 0x0301);
        assert_eq!(i16_be(&output, 96), 0x0408);
        assert_eq!(&output[98..106], &[5, 1, 5, 2, 5, 3, 5, 4]);
        assert_eq!(&output[106..118], &[6, 1, 6, 2, 6, 3, 7, 1, 7, 2, 7, 3]);
    }

    #[test]
    fn imported_thief_encounter_compiles_without_record_byte_identity() {
        let mut input = vec![0u8; THIEF_ENCOUNTER_BYTES];
        input[0] = 0x48;
        input[10] = 0xff;
        input[34..36].copy_from_slice(&[1, 2]);
        let records = parse_thief_encounters(&input);
        let output = write_thief_encounters(&records).unwrap();
        assert_ne!(output, input);
        assert_eq!(output[0], 1);
        assert_eq!(output[10], 0xff);
        assert_eq!(i16_be(&output, 34), 0x0102);
    }
}
