use crate::error::{ProvidenceError, Result};
use crate::project::{
    ComplexEncounterRecord, EncounterActionRow, SimpleEncounterRecord, ThiefEncounterRecord,
    TimedEncounterRecord,
};

use super::record_bytes::{
    copy_raw, decode_pascal_text, encode_pascal_text, fallback_i8, i16_be, parse_fixed_records,
    preserve_raw, provenance, read_i16_array, signed_bytes, write_fixed_records, write_i16_array,
    write_i16_be, write_i8_array,
};

pub const SIMPLE_ENCOUNTER_BYTES: usize = 426;
pub const COMPLEX_ENCOUNTER_BYTES: usize = 520;
pub const TIMED_ENCOUNTER_BYTES: usize = 40;
pub const THIEF_ENCOUNTER_BYTES: usize = 118;

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
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data ED", id, start, SIMPLE_ENCOUNTER_BYTES),
        })
        .collect()
}

pub fn write_simple_encounters(records: &[SimpleEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, SIMPLE_ENCOUNTER_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, SIMPLE_ENCOUNTER_BYTES) {
            return Ok(());
        }
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
        write_i16_be(buffer, 104, record.prompt);
        Ok(())
    })
}

pub fn parse_complex_encounter_records(buffer: &[u8]) -> Vec<ComplexEncounterRecord> {
    parse_fixed_records(buffer, COMPLEX_ENCOUNTER_BYTES)
        .map(|(id, start, record)| ComplexEncounterRecord {
            id,
            actions: parse_encounter_actions(record),
            choice_results: vec![record[96], 0, 0, 0],
            word_results: vec![record[97], 0, 0, 0],
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
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data ED2", id, start, COMPLEX_ENCOUNTER_BYTES),
        })
        .collect()
}

pub fn write_complex_encounters(records: &[ComplexEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, COMPLEX_ENCOUNTER_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, COMPLEX_ENCOUNTER_BYTES) {
            return Ok(());
        }
        write_encounter_actions(buffer, &record.actions)?;
        buffer[96] = fallback_i8(record.action_result, &record.choice_results, 0) as u8;
        buffer[97] = fallback_i8(record.word_result, &record.word_results, 0) as u8;
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
        .map(|(id, start, record)| {
            let stuff: Vec<i16> = (0..10).map(|slot| i16_be(record, 20 + slot * 2)).collect();
            TimedEncounterRecord {
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
                location_kind: timed_location_kind(stuff.first().copied().unwrap_or_default())
                    .to_string(),
                stuff,
                raw_bytes: record.to_vec(),
                authored: false,
                provenance: provenance("Data TD3", id, start, TIMED_ENCOUNTER_BYTES),
            }
        })
        .collect()
}

pub fn write_timed_encounters(records: &[TimedEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, TIMED_ENCOUNTER_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, TIMED_ENCOUNTER_BYTES) {
            return Ok(());
        }
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
        let mut stuff = record.stuff.clone();
        stuff.resize(10, 0);
        for slot in 0..10 {
            write_i16_be(buffer, 20 + slot * 2, stuff[slot]);
        }
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
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data TD2", id, start, THIEF_ENCOUNTER_BYTES),
        })
        .collect()
}

pub fn write_thief_encounters(records: &[ThiefEncounterRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, THIEF_ENCOUNTER_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, THIEF_ENCOUNTER_BYTES) {
            return Ok(());
        }
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

fn timed_location_kind(value: i16) -> &'static str {
    match value {
        1 => "land",
        2 => "dungeon",
        _ => "any",
    }
}

fn parse_encounter_actions(record: &[u8]) -> Vec<EncounterActionRow> {
    let mut actions = Vec::new();
    for slot in 0..32 {
        let raw_code = record[slot] as i8 as i16;
        let id = i16_be(record, 32 + slot * 2);
        if raw_code != 0 || id != 0 {
            actions.push(EncounterActionRow { slot, raw_code, id });
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

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after)
            .enumerate()
            .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
            .collect()
    }

    #[test]
    fn encounter_records_round_trip_full_records() {
        let cases: [(usize, fn(&[u8]) -> Vec<u8>); 4] = [
            (SIMPLE_ENCOUNTER_BYTES, |bytes| {
                write_simple_encounters(&parse_simple_encounter_records(bytes)).unwrap()
            }),
            (COMPLEX_ENCOUNTER_BYTES, |bytes| {
                write_complex_encounters(&parse_complex_encounter_records(bytes)).unwrap()
            }),
            (THIEF_ENCOUNTER_BYTES, |bytes| {
                write_thief_encounters(&parse_thief_encounters(bytes)).unwrap()
            }),
            (TIMED_ENCOUNTER_BYTES, |bytes| {
                write_timed_encounters(&parse_timed_encounters(bytes)).unwrap()
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
    fn timed_encounter_writer_mutates_only_owned_fields() {
        let mut input = vec![0u8; TIMED_ENCOUNTER_BYTES * 2];
        let timed_start = TIMED_ENCOUNTER_BYTES;
        write_i16_be(&mut input, timed_start + 16, 0x0102);
        let mut encounters = parse_timed_encounters(&input);
        encounters[1].authored = true;
        encounters[1].required_item = 0x0304;
        let output = write_timed_encounters(&encounters).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![timed_start + 16, timed_start + 17]
        );
    }

    #[test]
    fn encounter_storage_simple_mutates_only_owned_fields_and_preserves_gap() {
        let mut input = vec![0u8; SIMPLE_ENCOUNTER_BYTES * 2];
        let encounter_start = SIMPLE_ENCOUNTER_BYTES;
        input[encounter_start + 103] = 0xA5;

        let mut encounters = parse_simple_encounter_records(&input);
        encounters[1].authored = true;
        encounters[1].actions.push(EncounterActionRow {
            slot: 3,
            raw_code: -2,
            id: 0x0304,
        });
        encounters[1].choice_results[2] = 7;
        encounters[1].can_back_out = true;
        encounters[1].max_times = -3;
        encounters[1].caste_success = 4;
        encounters[1].prompt = 0x0506;
        encounters[1].texts[0] = "Go".to_string();

        let output = write_simple_encounters(&encounters).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(output[encounter_start + 103], 0xA5);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                encounter_start + 3,
                encounter_start + 38,
                encounter_start + 39,
                encounter_start + 98,
                encounter_start + 100,
                encounter_start + 101,
                encounter_start + 102,
                encounter_start + 104,
                encounter_start + 105,
                encounter_start + 106,
                encounter_start + 107,
                encounter_start + 108,
            ]
        );
    }

    #[test]
    fn encounter_storage_complex_mutates_only_owned_fields_and_preserves_gaps() {
        let mut input = vec![0u8; COMPLEX_ENCOUNTER_BYTES * 2];
        let encounter_start = COMPLEX_ENCOUNTER_BYTES;
        for offset in 104..151 {
            input[encounter_start + offset] = 0xA5;
        }
        input[encounter_start + 157] = 0x5A;

        let mut encounters = parse_complex_encounter_records(&input);
        encounters[1].authored = true;
        encounters[1].actions.push(EncounterActionRow {
            slot: 4,
            raw_code: -2,
            id: 0x0304,
        });
        encounters[1].action_result = 6;
        encounters[1].word_result = 7;
        encounters[1].groups[4] = -8;
        encounters[1].spell_ids[0] = 0x1112;
        encounters[1].spell_results[1] = -9;
        encounters[1].item_ids[2] = 0x1314;
        encounters[1].item_results[3] = -10;
        encounters[1].can_back_out = true;
        encounters[1].thief = true;
        encounters[1].max_times = -3;
        encounters[1].caste_success = 4;
        encounters[1].thief_success = -5;
        encounters[1].thief_fail = 8;
        encounters[1].prompt = 0x0506;
        encounters[1].texts[0] = "Hi".to_string();

        let output = write_complex_encounters(&encounters).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(output[encounter_start + 104], 0xA5);
        assert_eq!(output[encounter_start + 105], 0xA5);
        assert_eq!(output[encounter_start + 157], 0x5A);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                encounter_start + 4,
                encounter_start + 40,
                encounter_start + 41,
                encounter_start + 96,
                encounter_start + 97,
                encounter_start + 102,
                encounter_start + 106,
                encounter_start + 107,
                encounter_start + 127,
                encounter_start + 140,
                encounter_start + 141,
                encounter_start + 149,
                encounter_start + 151,
                encounter_start + 152,
                encounter_start + 153,
                encounter_start + 154,
                encounter_start + 155,
                encounter_start + 156,
                encounter_start + 158,
                encounter_start + 159,
                encounter_start + 160,
                encounter_start + 161,
                encounter_start + 162,
            ]
        );
    }

    #[test]
    fn thief_encounter_storage_mutates_only_owned_fields() {
        let input = vec![0u8; THIEF_ENCOUNTER_BYTES * 2];
        let encounter_start = THIEF_ENCOUNTER_BYTES;

        let mut encounters = parse_thief_encounters(&input);
        encounters[1].authored = true;
        encounters[1].type_flags[3] = true;
        encounters[1].modifiers[4] = -8;
        encounters[1].success_codes[5] = 9;
        encounters[1].failure_codes[6] = -7;
        encounters[1].success_text[2] = 0x0102;
        encounters[1].failure_text[3] = 0x0304;
        encounters[1].success_sounds[4] = 0x0506;
        encounters[1].failure_sounds[5] = 0x0708;
        encounters[1].spell = 0x090A;
        encounters[1].low_damage = 0x0B0C;
        encounters[1].high_damage = 0x0D0E;
        encounters[1].tumblers = 0x0F10;
        encounters[1].prompts[1] = 0x1112;
        encounters[1].prompt_sounds[2] = 0x1314;

        let output = write_thief_encounters(&encounters).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                encounter_start + 3,
                encounter_start + 14,
                encounter_start + 23,
                encounter_start + 32,
                encounter_start + 38,
                encounter_start + 39,
                encounter_start + 56,
                encounter_start + 57,
                encounter_start + 74,
                encounter_start + 75,
                encounter_start + 92,
                encounter_start + 93,
                encounter_start + 98,
                encounter_start + 99,
                encounter_start + 100,
                encounter_start + 101,
                encounter_start + 102,
                encounter_start + 103,
                encounter_start + 104,
                encounter_start + 105,
                encounter_start + 108,
                encounter_start + 109,
                encounter_start + 116,
                encounter_start + 117,
            ]
        );
    }
}
