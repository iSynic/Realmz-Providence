use crate::error::{ProvidenceError, Result};
use crate::project::{
    Action, ActionCategory, Confidence, ExtraCodeRow, LevelType, MapCoordinate, Provenance,
    TriggerRecord, MAP_SIZE,
};

use super::record_bytes::{i16_be, i32_be, write_i16_be, write_i32_be};

pub const DOOR_BYTES: usize = 40;
pub const DOORS_PER_LEVEL: usize = 100;
pub const DOOR_LEVEL_BYTES: usize = DOOR_BYTES * DOORS_PER_LEVEL;
pub const EXTRACODE_BYTES: usize = 10;

pub fn parse_door_file(buffer: &[u8], level_type: LevelType, source: &str) -> Vec<TriggerRecord> {
    let levels = buffer.len() / DOOR_LEVEL_BYTES;
    let mut doors = Vec::new();
    for level_index in 0..levels {
        for record_index in 0..DOORS_PER_LEVEL {
            let start = level_index * DOOR_LEVEL_BYTES + record_index * DOOR_BYTES;
            doors.push(parse_door(
                &buffer[start..start + DOOR_BYTES],
                source,
                Some(level_type),
                Some(level_index),
                record_index,
                start,
            ));
        }
    }
    doors
}

pub fn parse_macro_file(buffer: &[u8]) -> Vec<TriggerRecord> {
    let count = buffer.len() / DOOR_BYTES;
    (0..count)
        .map(|record_index| {
            let start = record_index * DOOR_BYTES;
            parse_door(
                &buffer[start..start + DOOR_BYTES],
                "Data ED3",
                None,
                None,
                record_index,
                start,
            )
        })
        .collect()
}

fn parse_door(
    buffer: &[u8],
    source: &str,
    level_type: Option<LevelType>,
    level_index: Option<usize>,
    record_index: usize,
    byte_offset: usize,
) -> TriggerRecord {
    let doorid = i32_be(buffer, 0);
    let coordinate = if source == "Data ED3" {
        None
    } else {
        decode_door_coordinate(doorid).filter(|coord| {
            level_index
                .map(|index| packed_level(doorid) == Some(index))
                .unwrap_or(true)
                && coord.x < MAP_SIZE
                && coord.y < MAP_SIZE
        })
    };

    let mut actions = Vec::new();
    for slot in 0..8 {
        let raw_code = i16_be(buffer, 8 + slot * 2);
        let id = i16_be(buffer, 24 + slot * 2);
        if raw_code != 0 || id != 0 {
            actions.push(describe_action(slot, raw_code, id));
        }
    }
    let percent = buffer[7] as i8;
    let active = if source == "Data ED3" {
        !actions.is_empty()
    } else {
        coordinate.is_some() && percent >= 1 && (!actions.is_empty() || doorid != 0)
    };
    TriggerRecord {
        id: format!(
            "{}:{}:{}",
            source,
            level_index.map_or("macro".to_string(), |i| i.to_string()),
            record_index
        ),
        source: source.to_string(),
        level_type,
        level_index,
        record_index,
        active,
        doorid,
        landid: buffer[4],
        target_x: buffer[5],
        target_y: buffer[6],
        percent,
        coordinate,
        actions,
        provenance: Provenance {
            source_file: source.to_string(),
            record_index,
            byte_offset,
            byte_length: DOOR_BYTES,
            confidence: Confidence::SourceBacked,
        },
    }
}

pub fn write_door_file(triggers: &[TriggerRecord], level_type: LevelType) -> Result<Vec<u8>> {
    write_door_file_for_levels(triggers, level_type, 0)
}

pub fn write_door_file_for_levels(
    triggers: &[TriggerRecord],
    level_type: LevelType,
    minimum_level_count: usize,
) -> Result<Vec<u8>> {
    let selected: Vec<&TriggerRecord> = triggers
        .iter()
        .filter(|trigger| trigger.level_type == Some(level_type))
        .collect();
    let level_count = selected
        .iter()
        .filter_map(|trigger| trigger.level_index)
        .max()
        .map(|index| index + 1)
        .unwrap_or(0)
        .max(minimum_level_count);
    let mut output = vec![0u8; level_count * DOOR_LEVEL_BYTES];
    for trigger in selected {
        let level_index = trigger.level_index.ok_or_else(|| {
            ProvidenceError::message(format!("{} is missing a level index", trigger.id))
        })?;
        if trigger.record_index >= DOORS_PER_LEVEL {
            return Err(ProvidenceError::message(format!(
                "{} door record index is out of range",
                trigger.id
            )));
        }
        let start = level_index * DOOR_LEVEL_BYTES + trigger.record_index * DOOR_BYTES;
        write_door(&mut output[start..start + DOOR_BYTES], trigger)?;
    }
    Ok(output)
}

pub fn write_macro_file(triggers: &[TriggerRecord]) -> Result<Vec<u8>> {
    let mut selected: Vec<&TriggerRecord> = triggers
        .iter()
        .filter(|trigger| trigger.source == "Data ED3")
        .collect();
    selected.sort_by_key(|trigger| trigger.record_index);
    let count = selected
        .last()
        .map(|trigger| trigger.record_index + 1)
        .unwrap_or(0);
    let mut output = vec![0u8; count * DOOR_BYTES];
    for trigger in selected {
        let start = trigger.record_index * DOOR_BYTES;
        write_door(&mut output[start..start + DOOR_BYTES], trigger)?;
    }
    Ok(output)
}

fn write_door(buffer: &mut [u8], trigger: &TriggerRecord) -> Result<()> {
    if trigger.actions.len() > 8 {
        return Err(ProvidenceError::message(format!(
            "{} has more than 8 actions",
            trigger.id
        )));
    }
    write_i32_be(buffer, 0, trigger.doorid);
    buffer[4] = trigger.landid;
    buffer[5] = trigger.target_x;
    buffer[6] = trigger.target_y;
    buffer[7] = trigger.percent as u8;
    for action in &trigger.actions {
        if action.slot >= 8 {
            return Err(ProvidenceError::message(format!(
                "{} action slot {} is out of range",
                trigger.id, action.slot
            )));
        }
        write_i16_be(buffer, 8 + action.slot * 2, action.raw_code);
        write_i16_be(buffer, 24 + action.slot * 2, action.id);
    }
    Ok(())
}

pub fn parse_extracodes(buffer: &[u8]) -> Vec<ExtraCodeRow> {
    let count = buffer.len() / EXTRACODE_BYTES;
    (0..count)
        .map(|id| {
            let start = id * EXTRACODE_BYTES;
            ExtraCodeRow {
                id,
                values: [
                    i16_be(buffer, start),
                    i16_be(buffer, start + 2),
                    i16_be(buffer, start + 4),
                    i16_be(buffer, start + 6),
                    i16_be(buffer, start + 8),
                ],
                provenance: Provenance {
                    source_file: "Data EDCD".to_string(),
                    record_index: id,
                    byte_offset: start,
                    byte_length: EXTRACODE_BYTES,
                    confidence: Confidence::SourceBacked,
                },
            }
        })
        .collect()
}

pub fn write_extracodes(rows: &[ExtraCodeRow]) -> Result<Vec<u8>> {
    let mut selected: Vec<&ExtraCodeRow> = rows.iter().collect();
    selected.sort_by_key(|row| row.id);
    let count = selected.last().map(|row| row.id + 1).unwrap_or(0);
    let mut output = vec![0u8; count * EXTRACODE_BYTES];
    for row in selected {
        let start = row.id * EXTRACODE_BYTES;
        for (slot, value) in row.values.iter().enumerate() {
            write_i16_be(&mut output, start + slot * 2, *value);
        }
    }
    Ok(output)
}

fn decode_door_coordinate(doorid: i32) -> Option<MapCoordinate> {
    if doorid <= 0 {
        return None;
    }
    let position = doorid % 10000;
    let x = (position % 100) as usize;
    let y = (position / 100) as usize;
    Some(MapCoordinate { x, y })
}

fn packed_level(doorid: i32) -> Option<usize> {
    if doorid <= 0 {
        None
    } else {
        Some((doorid / 10000) as usize)
    }
}

fn describe_action(slot: usize, raw_code: i16, id: i16) -> Action {
    let code = normalize_opcode(raw_code);
    let (label, category) = opcode_info(code);
    Action {
        slot,
        raw_code,
        code,
        id,
        label: label.to_string(),
        category,
        gosub: raw_code < 0 && raw_code != -14 && raw_code != -23,
    }
}

fn normalize_opcode(code: i16) -> i16 {
    if code < 0 && code != -14 && code != -23 {
        -code
    } else {
        code
    }
}

fn opcode_info(code: i16) -> (&'static str, ActionCategory) {
    use ActionCategory::*;
    match code {
        -23 => ("Alter dungeon random rectangle", Map),
        -14 => ("Pick inverse characters", State),
        1 => ("Text", UiText),
        2 => ("Battle", Combat),
        3 => ("Choice", Branch),
        4 => ("Simple encounter", Encounter),
        5 => ("Complex encounter", Encounter),
        6 => ("Load shop", ItemShop),
        7 => ("Action data patch", Map),
        8 => ("Same as other door", Branch),
        9 => ("Play sound", UiText),
        10 => ("Give treasure", ItemShop),
        11 => ("Give experience", Combat),
        12 => ("New land icon", Map),
        13 => ("Enable or disable door", Map),
        14 => ("Pick characters", State),
        15 => ("Damage or heal picked", State),
        16 => ("Damage or heal party", State),
        17 => ("Cast spell on picked", State),
        18 => ("Cast spell on party", State),
        19 => ("Display random string", UiText),
        20 => ("Teleport", Map),
        21 => ("Branch item possession", ItemShop),
        22 => ("Alter item status", ItemShop),
        23 => ("Alter land random rectangle", Map),
        24 => ("Keep codes", Branch),
        25 => ("Remove door x-y", Map),
        26 => ("Get click", UiText),
        27 => ("Show picture", UiText),
        28 => ("Center screen", Map),
        29 => ("Give or display map", Map),
        30 => ("Pick ability or attribute", State),
        31 => ("Branch ability", Branch),
        32 => ("Offer temple", ItemShop),
        33 => ("Take gold", ItemShop),
        34 => ("Break encounter loop", Branch),
        35 => ("Eliminate simple encounter option", Encounter),
        36 => ("Store or give equipment", ItemShop),
        37 => ("Dungeon move", Map),
        38 => ("Branch possession II", Branch),
        39 => ("Extend door codes", Branch),
        40 => ("Branch party condition", Branch),
        41 => ("Eliminate simple encounter option", Encounter),
        42 => ("Branch percent", Branch),
        43 => ("Give condition", State),
        44 => ("Break complex encounter option", Encounter),
        45 => ("Teleport only", Map),
        46 => ("Branch quest flag", Branch),
        47 => ("Set quest flag", State),
        48 => ("Selective combat", Combat),
        49 => ("Bank", ItemShop),
        50 => ("Pick race caste gender", State),
        51 => ("Alter shop", ItemShop),
        52 => ("Pick position movement item percent", State),
        53 => ("Pick caste", State),
        54 => ("Alter time encounter", Time),
        55 => ("Branch picked characters", Branch),
        56 => ("Branch battle outcome", Branch),
        57 => ("Change land look", Map),
        58 => ("Branch difficulty", Branch),
        59 => ("Branch tile id", Branch),
        60 => ("Alter money", State),
        61 => ("Shift position", Map),
        62 => ("Scrolling text", UiText),
        63 => ("Alter time", Time),
        64 => ("Branch time", Branch),
        65 => ("Award random items", ItemShop),
        66 => ("Camping", Time),
        67 => ("Branch item charges", Branch),
        68 => ("Fatigue", State),
        69 => ("Spell flags", State),
        70 => ("Save or restore position", Map),
        71 => ("Coordinate display", UiText),
        72 => ("Branch range flags", Branch),
        73 => ("Restricted shop", ItemShop),
        74 => ("Spell points", State),
        75 => ("Branch spell points", Branch),
        76 => ("Quest value write", State),
        77 => ("Branch quest value", Branch),
        78 => ("Branch tile parameters", Branch),
        81 => ("Branch PC condition", Branch),
        82 => ("Priest turning off", State),
        83 => ("Priest turning on", State),
        84 => ("Check registration", Registration),
        85 => ("Branch random door", Branch),
        86 => ("Branch misc", Branch),
        87 => ("Branch allies", Branch),
        88 => ("Drop allies", State),
        89 => ("Add allies", State),
        90 => ("Take victory", State),
        91 => ("Drop equipment", ItemShop),
        92 => ("Random rectangle size", Map),
        93 => ("Compass on", Map),
        94 => ("Compass off", Map),
        95 => ("Look direction", Map),
        96 => ("Require 3D map", Map),
        97 => ("Allow full map", Map),
        98 | 99 => ("Registration check", Registration),
        100 => ("End battle", Combat),
        101 => ("Back up party", Map),
        102 => ("Level up", State),
        103 => ("Boat or camp", State),
        104 => ("Set encounter status", Encounter),
        105 => ("Activate allies", State),
        106 => ("Set darkland", Map),
        107 => ("Improved selective battle", Combat),
        108 => ("Alter selected character", State),
        111 => ("Return from GOSUB", Branch),
        112 => ("Pop stack", Branch),
        119 => ("Revive", State),
        120 => ("Alter NPC or monster", Combat),
        121 => ("De-animate undead", Combat),
        122 => ("Fumble", Combat),
        123 => ("Rout", Combat),
        124 => ("Spawn", Combat),
        125 => ("Destroy related", Combat),
        126 => ("Battle macro", Combat),
        127 => ("Continue if monster present", Combat),
        0 => ("Empty", Unknown),
        _ => ("Unknown opcode", Unknown),
    }
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
    fn doors_round_trip() {
        let mut input = vec![0u8; DOOR_LEVEL_BYTES];
        write_i32_be(&mut input, 0, 10000 + 42);
        input[4] = 3;
        input[5] = 9;
        input[6] = 8;
        input[7] = 100;
        write_i16_be(&mut input, 8, 1);
        write_i16_be(&mut input, 24, 12);
        let doors = parse_door_file(&input, LevelType::Land, "Data DD");
        let output = write_door_file(&doors, LevelType::Land).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn map_storage_trigger_tables_mutate_only_owned_action_slot() {
        for (level_type, source) in [
            (LevelType::Land, "Data DD"),
            (LevelType::Dungeon, "Data DDD"),
        ] {
            let mut input = vec![0xA5; DOOR_LEVEL_BYTES * 2];
            let level_index = 1;
            let record_index = 7;
            let slot = 5;
            let record_start = level_index * DOOR_LEVEL_BYTES + record_index * DOOR_BYTES;
            let code_offset = record_start + 8 + slot * 2;
            let id_offset = record_start + 24 + slot * 2;
            write_i16_be(&mut input, code_offset, 0x0102);
            write_i16_be(&mut input, id_offset, 0x0506);

            let mut triggers = parse_door_file(&input, level_type, source);
            let action = triggers
                .iter_mut()
                .find(|trigger| {
                    trigger.level_index == Some(level_index) && trigger.record_index == record_index
                })
                .and_then(|trigger| {
                    trigger
                        .actions
                        .iter_mut()
                        .find(|action| action.slot == slot)
                })
                .expect("fixture action slot should parse");
            action.raw_code = 0x0304;
            action.code = action.raw_code;
            action.id = 0x0708;

            let output = write_door_file(&triggers, level_type).unwrap();

            assert_eq!(output.len(), input.len());
            assert_eq!(i16_be(&output, code_offset), 0x0304);
            assert_eq!(i16_be(&output, id_offset), 0x0708);
            assert_eq!(
                changed_offsets(&input, &output),
                vec![code_offset, code_offset + 1, id_offset, id_offset + 1]
            );
        }
    }

    #[test]
    fn extra_action_points_round_trip() {
        let mut input = vec![0u8; DOOR_BYTES * 2];
        write_i32_be(&mut input, 0, 0);
        input[4] = 0;
        input[5] = 2;
        input[6] = 3;
        input[7] = 100;
        write_i16_be(&mut input, 8, 1);
        write_i16_be(&mut input, 24, 55);
        write_i16_be(&mut input, DOOR_BYTES + 8, 24);
        let macros = parse_macro_file(&input);
        assert_eq!(macros.len(), 2);
        assert_eq!(macros[0].source, "Data ED3");
        assert!(macros[0].coordinate.is_none());
        assert_eq!(macros[0].actions[0].code, 1);
        assert_eq!(macros[0].actions[0].id, 55);
        let output = write_macro_file(&macros).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn extra_action_point_writer_mutates_only_owned_slot_words() {
        let mut input = vec![0u8; DOOR_BYTES * 2];
        write_i16_be(&mut input, 8, 24);
        write_i16_be(&mut input, 24, 111);
        let row_start = DOOR_BYTES;
        let slot = 3;
        write_i16_be(&mut input, row_start + 8 + slot * 2, 0x0102);
        write_i16_be(&mut input, row_start + 24 + slot * 2, 0x0506);

        let mut macros = parse_macro_file(&input);
        let action = macros[1]
            .actions
            .iter_mut()
            .find(|action| action.slot == slot)
            .expect("fixture action slot should parse");
        action.raw_code = 0x0304;
        action.code = action.raw_code;
        action.id = 0x0708;

        let output = write_macro_file(&macros).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                row_start + 8 + slot * 2,
                row_start + 8 + slot * 2 + 1,
                row_start + 24 + slot * 2,
                row_start + 24 + slot * 2 + 1
            ]
        );
    }

    #[test]
    fn extracodes_round_trip() {
        let mut input = vec![0u8; EXTRACODE_BYTES * 3];
        write_i16_be(&mut input, 10, -4);
        write_i16_be(&mut input, 18, 999);
        let rows = parse_extracodes(&input);
        let output = write_extracodes(&rows).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn extracode_writer_mutates_only_owned_signed_short() {
        let mut input = vec![0u8; EXTRACODE_BYTES * 3];
        let row = 1;
        let field = 3;
        write_i16_be(&mut input, row * EXTRACODE_BYTES + field * 2, 0x0102);

        let mut rows = parse_extracodes(&input);
        rows[row].values[field] = 0x0304;
        let output = write_extracodes(&rows).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                row * EXTRACODE_BYTES + field * 2,
                row * EXTRACODE_BYTES + field * 2 + 1
            ]
        );
    }

    #[test]
    fn opcode_92_secondary_extracode_row_is_independently_owned() {
        let primary_row = 7;
        let secondary_row = primary_row + 1;
        let mut input = vec![0u8; EXTRACODE_BYTES * (secondary_row + 1)];
        write_i16_be(&mut input, primary_row * EXTRACODE_BYTES, 0x0102);
        write_i16_be(&mut input, secondary_row * EXTRACODE_BYTES + 8, 0x0506);

        let mut rows = parse_extracodes(&input);
        rows[primary_row].values[0] = 0x0304;
        rows[secondary_row].values[4] = 0x0708;
        let output = write_extracodes(&rows).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                primary_row * EXTRACODE_BYTES,
                primary_row * EXTRACODE_BYTES + 1,
                secondary_row * EXTRACODE_BYTES + 8,
                secondary_row * EXTRACODE_BYTES + 9
            ]
        );
    }
}
