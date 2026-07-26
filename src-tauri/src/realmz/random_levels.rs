use crate::error::{ProvidenceError, Result};
use crate::project::{Confidence, LevelType, Provenance, RandomLevel, RandomRect};

use super::record_bytes::{i16_be, write_i16_be};

pub const RANDLEVEL_BYTES: usize =
    crate::generated::native_manifest_policy::REALMZ_NATIVE_LAYOUT.random_level_record_bytes;
pub const RANDLEVEL_PADDING_OFFSET: usize = 563;
pub const RANDLEVEL_SOUND_OFFSET: usize = 564;
pub const RANDLEVEL_TEXT_OFFSET: usize = 604;

pub fn parse_random_levels(buffer: &[u8], level_type: LevelType, source: &str) -> Vec<RandomLevel> {
    let count = buffer.len() / RANDLEVEL_BYTES;
    (0..count)
        .map(|level_index| {
            let start = level_index * RANDLEVEL_BYTES;
            let mut rects = Vec::new();
            for rect_index in 0..20 {
                let rect_start = start + rect_index * 8;
                let top = i16_be(buffer, rect_start);
                let left = i16_be(buffer, rect_start + 2);
                let bottom = i16_be(buffer, rect_start + 4);
                let right = i16_be(buffer, rect_start + 6);
                let percent = i16_be(buffer, start + 160 + rect_index * 2);
                let battle_range = [
                    i16_be(buffer, start + 200 + rect_index * 4),
                    i16_be(buffer, start + 202 + rect_index * 4),
                ];
                let random_doors = [
                    i16_be(buffer, start + 280 + rect_index * 6),
                    i16_be(buffer, start + 282 + rect_index * 6),
                    i16_be(buffer, start + 284 + rect_index * 6),
                ];
                let random_door_percent = [
                    i16_be(buffer, start + 400 + rect_index * 6),
                    i16_be(buffer, start + 402 + rect_index * 6),
                    i16_be(buffer, start + 404 + rect_index * 6),
                ];
                let only = buffer[start + 523 + rect_index] != 0;
                let option = buffer[start + 543 + rect_index] as i8;
                let sound = i16_be(buffer, start + RANDLEVEL_SOUND_OFFSET + rect_index * 2);
                let text = i16_be(buffer, start + RANDLEVEL_TEXT_OFFSET + rect_index * 2);
                let active = percent != 0
                    || top != 0
                    || left != 0
                    || bottom != 0
                    || right != 0
                    || random_doors.iter().any(|value| *value != 0);
                if active {
                    rects.push(RandomRect {
                        rect_index,
                        top,
                        left,
                        bottom,
                        right,
                        percent,
                        battle_range,
                        random_doors,
                        random_door_percent,
                        only,
                        option,
                        sound,
                        text,
                    });
                }
            }
            RandomLevel {
                id: format!("{}:{}:randlevel", level_type.as_str(), level_index),
                source: source.to_string(),
                level_type,
                level_index,
                landlook: buffer[start + 520] as i8,
                is_dark: buffer[start + 521] != 0,
                use_los: buffer[start + 522] != 0,
                rects,
                provenance: Provenance {
                    source_file: source.to_string(),
                    record_index: level_index,
                    byte_offset: start,
                    byte_length: RANDLEVEL_BYTES,
                    confidence: Confidence::SourceBacked,
                },
            }
        })
        .collect()
}

pub fn write_random_levels(levels: &[RandomLevel], level_type: LevelType) -> Result<Vec<u8>> {
    let mut selected: Vec<&RandomLevel> = levels
        .iter()
        .filter(|level| level.level_type == level_type)
        .collect();
    selected.sort_by_key(|level| level.level_index);
    for (expected, level) in selected.iter().enumerate() {
        if level.level_index != expected {
            return Err(ProvidenceError::message(format!(
                "{} random levels must have dense indices",
                level_type.as_str()
            )));
        }
    }
    let mut output = vec![0u8; selected.len() * RANDLEVEL_BYTES];
    for level in selected {
        let start = level.level_index * RANDLEVEL_BYTES;
        output[start + 520] = level.landlook as u8;
        output[start + 521] = u8::from(level.is_dark);
        output[start + 522] = u8::from(level.use_los);
        for rect in &level.rects {
            if rect.rect_index >= 20 {
                return Err(ProvidenceError::message(format!(
                    "{} random rect index {} is out of range",
                    level.id, rect.rect_index
                )));
            }
            let rect_start = start + rect.rect_index * 8;
            write_i16_be(&mut output, rect_start, rect.top);
            write_i16_be(&mut output, rect_start + 2, rect.left);
            write_i16_be(&mut output, rect_start + 4, rect.bottom);
            write_i16_be(&mut output, rect_start + 6, rect.right);
            write_i16_be(&mut output, start + 160 + rect.rect_index * 2, rect.percent);
            write_i16_be(
                &mut output,
                start + 200 + rect.rect_index * 4,
                rect.battle_range[0],
            );
            write_i16_be(
                &mut output,
                start + 202 + rect.rect_index * 4,
                rect.battle_range[1],
            );
            for slot in 0..3 {
                write_i16_be(
                    &mut output,
                    start + 280 + rect.rect_index * 6 + slot * 2,
                    rect.random_doors[slot],
                );
                write_i16_be(
                    &mut output,
                    start + 400 + rect.rect_index * 6 + slot * 2,
                    rect.random_door_percent[slot],
                );
            }
            output[start + 523 + rect.rect_index] = u8::from(rect.only);
            output[start + 543 + rect.rect_index] = rect.option as u8;
            write_i16_be(
                &mut output,
                start + RANDLEVEL_SOUND_OFFSET + rect.rect_index * 2,
                rect.sound,
            );
            write_i16_be(
                &mut output,
                start + RANDLEVEL_TEXT_OFFSET + rect.rect_index * 2,
                rect.text,
            );
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::realmz::record_bytes::provenance;

    #[test]
    fn random_levels_round_trip() {
        let mut input = vec![0u8; RANDLEVEL_BYTES];
        write_i16_be(&mut input, 0, 1);
        write_i16_be(&mut input, 2, 2);
        write_i16_be(&mut input, 4, 3);
        write_i16_be(&mut input, 6, 4);
        input[520] = 5;
        input[521] = 1;
        let levels = parse_random_levels(&input, LevelType::Land, "Data RD");
        let output = write_random_levels(&levels, LevelType::Land).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn fresh_random_level_compiles_from_semantic_fields() {
        let level = RandomLevel {
            id: "dungeon:0:randlevel".to_string(),
            source: "Data RDD".to_string(),
            level_type: LevelType::Dungeon,
            level_index: 0,
            landlook: -1,
            is_dark: true,
            use_los: true,
            rects: vec![RandomRect {
                rect_index: 2,
                top: 3,
                left: 4,
                bottom: 8,
                right: 9,
                percent: 75,
                battle_range: [10, 12],
                random_doors: [1, 2, 3],
                random_door_percent: [25, 50, 75],
                only: true,
                option: -2,
                sound: 17,
                text: 23,
            }],
            provenance: provenance("Data RDD", 0, 0, RANDLEVEL_BYTES),
        };

        let output = write_random_levels(&[level], LevelType::Dungeon).unwrap();

        assert_eq!(output.len(), RANDLEVEL_BYTES);
        assert_eq!(output[520], 0xff);
        assert_eq!(output[521], 1);
        assert_eq!(output[522], 1);
        assert_eq!(i16_be(&output, 16), 3);
        assert_eq!(i16_be(&output, 18), 4);
        assert_eq!(i16_be(&output, 20), 8);
        assert_eq!(i16_be(&output, 22), 9);
        assert_eq!(i16_be(&output, 164), 75);
        assert_eq!(i16_be(&output, 208), 10);
        assert_eq!(i16_be(&output, 210), 12);
        assert_eq!(i16_be(&output, 292), 1);
        assert_eq!(i16_be(&output, 412), 25);
        assert_eq!(output[525], 1);
        assert_eq!(output[545], 0xfe);
        assert_eq!(output[RANDLEVEL_PADDING_OFFSET], 0);
        assert_eq!(i16_be(&output, 568), 17);
        assert_eq!(i16_be(&output, 608), 23);
        assert_eq!(output[643], 0);
    }

    #[test]
    fn native_sound_text_offsets_do_not_splice_adjacent_bytes() {
        for (level_type, source) in [
            (LevelType::Land, "Data RD"),
            (LevelType::Dungeon, "Data RDD"),
        ] {
            let mut input = vec![0; RANDLEVEL_BYTES];
            write_i16_be(&mut input, 0, 1);
            write_i16_be(&mut input, 8, 2);
            write_i16_be(&mut input, 19 * 8, 19);
            input[RANDLEVEL_PADDING_OFFSET] = 0x5a;
            write_i16_be(&mut input, RANDLEVEL_SOUND_OFFSET, 0x1234);
            write_i16_be(&mut input, RANDLEVEL_SOUND_OFFSET + 2, -2345);
            write_i16_be(&mut input, RANDLEVEL_SOUND_OFFSET + 19 * 2, 30000);
            write_i16_be(&mut input, RANDLEVEL_TEXT_OFFSET, 0x2345);
            write_i16_be(&mut input, RANDLEVEL_TEXT_OFFSET + 2, -1234);
            write_i16_be(&mut input, RANDLEVEL_TEXT_OFFSET + 19 * 2, 1278);

            let levels = parse_random_levels(&input, level_type, source);
            let rect = |index| {
                levels[0]
                    .rects
                    .iter()
                    .find(|rect| rect.rect_index == index)
                    .unwrap()
            };
            assert_eq!((rect(0).sound, rect(0).text), (0x1234, 0x2345));
            assert_eq!((rect(1).sound, rect(1).text), (-2345, -1234));
            assert_eq!((rect(19).sound, rect(19).text), (30000, 1278));
            assert_ne!(i16_be(&input, 563), rect(0).sound);
            assert_ne!(i16_be(&input, 603), rect(0).text);

            let output = write_random_levels(&levels, level_type).unwrap();
            assert_eq!(output[RANDLEVEL_PADDING_OFFSET], 0);
            assert_eq!(i16_be(&output, RANDLEVEL_SOUND_OFFSET), 0x1234);
            assert_eq!(i16_be(&output, RANDLEVEL_TEXT_OFFSET), 0x2345);
            assert_eq!(i16_be(&output, RANDLEVEL_TEXT_OFFSET + 19 * 2), 1278);
            assert_eq!(output[643], (1278 & 0xff) as u8);
        }
    }

    #[test]
    fn imported_levels_recompile_from_semantics_without_hidden_storage() {
        for (level_type, source) in [
            (LevelType::Land, "Data RD"),
            (LevelType::Dungeon, "Data RDD"),
        ] {
            let mut input = vec![0; RANDLEVEL_BYTES];
            write_i16_be(&mut input, 0, 3);
            input[521] = 0xa5;
            input[522] = 0x80;
            input[523] = 0xfe;
            input[RANDLEVEL_PADDING_OFFSET] = 0x34;
            write_i16_be(&mut input, RANDLEVEL_SOUND_OFFSET, 17);
            write_i16_be(&mut input, RANDLEVEL_TEXT_OFFSET + 19 * 2, 0x1234);

            let levels = parse_random_levels(&input, level_type, source);
            let output = write_random_levels(&levels, level_type).unwrap();

            assert_eq!(output[521], 1);
            assert_eq!(output[522], 1);
            assert_eq!(output[523], 1);
            assert_eq!(output[RANDLEVEL_PADDING_OFFSET], 0);
            assert_eq!(i16_be(&output, RANDLEVEL_SOUND_OFFSET), 17);
            assert_eq!(i16_be(&output, RANDLEVEL_TEXT_OFFSET + 19 * 2), 0);
            assert_eq!(output[643], 0);
        }
    }
}
