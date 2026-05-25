use crate::error::{ProvidenceError, Result};
use crate::project::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const FIELD_BYTES: usize = MAP_SIZE * MAP_SIZE * 2;
pub const DOOR_BYTES: usize = 40;
pub const DOORS_PER_LEVEL: usize = 100;
pub const DOOR_LEVEL_BYTES: usize = DOOR_BYTES * DOORS_PER_LEVEL;
pub const RANDLEVEL_BYTES: usize = 644;
pub const EXTRACODE_BYTES: usize = 10;
pub const SIMPLE_ENCOUNTER_BYTES: usize = 426;
pub const COMPLEX_ENCOUNTER_BYTES: usize = 520;
pub const BATTLE_BYTES: usize = 346;
pub const SHOP_BYTES: usize = 3002;
pub const MESSAGE_BYTES: usize = 256;
pub const TREASURE_BYTES: usize = 48;

pub const SUPPORTED_WRITE_FILES: &[&str] = &[
    "Data LD",
    "Data DL",
    "Data DD",
    "Data DDD",
    "Data RD",
    "Data RDD",
    "Data ED3",
    "Data EDCD",
    "Data ED",
    "Data ED2",
    "Data BD",
    "Data SD",
    "Data SD2",
    "Data TD",
];

pub const TRACKED_FILES: &[&str] = &[
    "Scenario",
    "Global",
    "Data LD",
    "Data DL",
    "Data DD",
    "Data DDD",
    "Data RD",
    "Data RDD",
    "Data ED",
    "Data ED2",
    "Data ED3",
    "Data EDCD",
    "Data MD",
    "Data BD",
    "Data SD",
    "Data SD2",
    "Data MD2",
    "Data TD",
    "Data TD2",
    "Data TD3",
    "Data CI",
    "Data MENU",
    "Data Solids",
    "Data Custom 1 BD",
    "Data Custom 2 BD",
    "Data Custom 3 BD",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedScenario {
    pub maps: Vec<MapEntity>,
    pub triggers: Vec<TriggerRecord>,
    pub random_levels: Vec<RandomLevel>,
    pub extracodes: Vec<ExtraCodeRow>,
    pub messages: Vec<MessageRecord>,
    pub battles: Vec<BattleRecord>,
    pub treasures: Vec<TreasureRecord>,
    pub shops: Vec<ShopRecord>,
    pub simple_encounters: Vec<SimpleEncounterRecord>,
    pub complex_encounters: Vec<ComplexEncounterRecord>,
    pub records: RecordCatalog,
    pub diagnostics: Vec<Diagnostic>,
    pub asset_catalog: AssetCatalog,
}

pub fn parse_scenario_buffers(buffers: &BTreeMap<String, Vec<u8>>) -> ParsedScenario {
    let mut diagnostics = Vec::new();
    let mut records = RecordCatalog::default();
    let mut maps = Vec::new();
    let mut random_levels = Vec::new();
    let mut triggers = Vec::new();
    let mut extracodes = Vec::new();
    let mut messages = Vec::new();
    let mut battles = Vec::new();
    let mut treasures = Vec::new();
    let mut shops = Vec::new();
    let mut simple_encounters = Vec::new();
    let mut complex_encounters = Vec::new();

    for (name, record_bytes) in [
        ("Data LD", FIELD_BYTES),
        ("Data DL", FIELD_BYTES),
        ("Data DD", DOOR_LEVEL_BYTES),
        ("Data DDD", DOOR_LEVEL_BYTES),
        ("Data RD", RANDLEVEL_BYTES),
        ("Data RDD", RANDLEVEL_BYTES),
        ("Data ED", SIMPLE_ENCOUNTER_BYTES),
        ("Data ED2", COMPLEX_ENCOUNTER_BYTES),
        ("Data ED3", DOOR_BYTES),
        ("Data EDCD", EXTRACODE_BYTES),
        ("Data MD", 210),
        ("Data BD", BATTLE_BYTES),
        ("Data SD", SHOP_BYTES),
        ("Data SD2", MESSAGE_BYTES),
        ("Data MD2", 340),
        ("Data TD", TREASURE_BYTES),
        ("Data TD2", 118),
        ("Data TD3", 40),
        ("Data CI", 4608),
        ("Data MENU", 502),
        ("Data Solids", 1024),
    ] {
        let alignment = alignment_for(name, buffers.get(name), record_bytes);
        records.counts.insert(name.to_string(), alignment.count);
        if matches!(alignment.status, AlignmentStatus::HasTrailingBytes) {
            diagnostics.push(Diagnostic {
                severity: DiagnosticSeverity::Warning,
                code: "trailing-bytes".to_string(),
                message: format!(
                    "{} has {} trailing bytes after full records",
                    name, alignment.trailing_bytes
                ),
                source: Some(name.to_string()),
            });
        }
        records.alignments.push(alignment);
    }

    if let Some(buffer) = buffers.get("Data LD") {
        maps.extend(parse_fields(buffer, LevelType::Land, "Data LD"));
    }
    if let Some(buffer) = buffers.get("Data DL") {
        maps.extend(parse_fields(buffer, LevelType::Dungeon, "Data DL"));
    }
    if let Some(buffer) = buffers.get("Data RD") {
        random_levels.extend(parse_random_levels(buffer, LevelType::Land, "Data RD"));
    }
    if let Some(buffer) = buffers.get("Data RDD") {
        random_levels.extend(parse_random_levels(buffer, LevelType::Dungeon, "Data RDD"));
    }
    attach_render_info(&mut maps, &random_levels);

    if let Some(buffer) = buffers.get("Data DD") {
        triggers.extend(parse_door_file(buffer, LevelType::Land, "Data DD"));
    }
    if let Some(buffer) = buffers.get("Data DDD") {
        triggers.extend(parse_door_file(buffer, LevelType::Dungeon, "Data DDD"));
    }
    if let Some(buffer) = buffers.get("Data ED3") {
        triggers.extend(parse_macro_file(buffer));
    }
    if let Some(buffer) = buffers.get("Data EDCD") {
        extracodes.extend(parse_extracodes(buffer));
    }
    if let Some(buffer) = buffers.get("Data SD2") {
        messages.extend(parse_messages(buffer));
    }
    if let Some(buffer) = buffers.get("Data BD") {
        battles.extend(parse_battles(buffer));
    }
    if let Some(buffer) = buffers.get("Data TD") {
        treasures.extend(parse_treasures(buffer));
    }
    if let Some(buffer) = buffers.get("Data SD") {
        shops.extend(parse_shops(buffer));
    }
    if let Some(buffer) = buffers.get("Data ED") {
        simple_encounters.extend(parse_simple_encounter_records(buffer));
    }
    if let Some(buffer) = buffers.get("Data ED2") {
        complex_encounters.extend(parse_complex_encounter_records(buffer));
    }

    let asset_catalog = build_asset_catalog(&maps, &random_levels);
    ParsedScenario {
        maps,
        triggers,
        random_levels,
        extracodes,
        messages,
        battles,
        treasures,
        shops,
        simple_encounters,
        complex_encounters,
        records,
        diagnostics,
        asset_catalog,
    }
}

fn alignment_for(name: &str, buffer: Option<&Vec<u8>>, record_bytes: usize) -> RecordAlignment {
    let Some(buffer) = buffer else {
        return RecordAlignment {
            source: name.to_string(),
            record_bytes,
            count: 0,
            trailing_bytes: 0,
            status: AlignmentStatus::Missing,
        };
    };
    let count = buffer.len() / record_bytes;
    let trailing_bytes = buffer.len() % record_bytes;
    RecordAlignment {
        source: name.to_string(),
        record_bytes,
        count,
        trailing_bytes,
        status: if trailing_bytes == 0 {
            AlignmentStatus::Aligned
        } else {
            AlignmentStatus::HasTrailingBytes
        },
    }
}

pub fn parse_fields(buffer: &[u8], level_type: LevelType, source: &str) -> Vec<MapEntity> {
    let count = buffer.len() / FIELD_BYTES;
    (0..count)
        .map(|level_index| {
            let start = level_index * FIELD_BYTES;
            let mut tiles = Vec::with_capacity(MAP_SIZE * MAP_SIZE);
            for index in 0..MAP_SIZE * MAP_SIZE {
                tiles.push(i16_be(buffer, start + index * 2));
            }
            MapEntity {
                id: format!("{}:{}", level_type.as_str(), level_index),
                level_type,
                source: source.to_string(),
                index: level_index,
                name: format!("{} level {}", title(level_type.as_str()), level_index),
                width: MAP_SIZE,
                height: MAP_SIZE,
                tiles,
                render: MapRender {
                    tileset_id: "abstract-fallback".to_string(),
                    landlook: None,
                    mode: RenderMode::AbstractFallback,
                },
                provenance: Provenance {
                    source_file: source.to_string(),
                    record_index: level_index,
                    byte_offset: start,
                    byte_length: FIELD_BYTES,
                    confidence: Confidence::Confirmed,
                },
            }
        })
        .collect()
}

pub fn write_fields(maps: &[MapEntity], level_type: LevelType) -> Result<Vec<u8>> {
    let mut selected: Vec<&MapEntity> = maps
        .iter()
        .filter(|map| map.level_type == level_type)
        .collect();
    selected.sort_by_key(|map| map.index);
    ensure_dense_indices(&selected, level_type.as_str())?;

    let mut output = vec![0u8; selected.len() * FIELD_BYTES];
    for map in selected {
        if map.width != MAP_SIZE || map.height != MAP_SIZE || map.tiles.len() != MAP_SIZE * MAP_SIZE
        {
            return Err(ProvidenceError::message(format!(
                "{} must be a 90 x 90 map with 8100 tiles",
                map.id
            )));
        }
        let start = map.index * FIELD_BYTES;
        for (index, value) in map.tiles.iter().enumerate() {
            write_i16_be(&mut output, start + index * 2, *value);
        }
    }
    Ok(output)
}

fn ensure_dense_indices(maps: &[&MapEntity], label: &str) -> Result<()> {
    for (expected, map) in maps.iter().enumerate() {
        if map.index != expected {
            return Err(ProvidenceError::message(format!(
                "{} maps must have dense indices; expected {}, found {}",
                label, expected, map.index
            )));
        }
    }
    Ok(())
}

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
                let sound = i16_be(buffer, start + 563 + rect_index * 2);
                let text = i16_be(buffer, start + 603 + rect_index * 2);
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
            let mut raw_values = Vec::with_capacity(RANDLEVEL_BYTES / 2);
            for offset in (0..RANDLEVEL_BYTES).step_by(2) {
                raw_values.push(i16_be(buffer, start + offset));
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
                raw_values,
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
        if level.raw_values.len() != RANDLEVEL_BYTES / 2 {
            return Err(ProvidenceError::message(format!(
                "{} has invalid random-level raw value count",
                level.id
            )));
        }
    }
    let mut output = vec![0u8; selected.len() * RANDLEVEL_BYTES];
    for level in selected {
        let start = level.level_index * RANDLEVEL_BYTES;
        for (index, value) in level.raw_values.iter().enumerate() {
            write_i16_be(&mut output, start + index * 2, *value);
        }
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
            let r = rect.rect_index;
            write_i16_be(&mut output, start + r * 8, rect.top);
            write_i16_be(&mut output, start + r * 8 + 2, rect.left);
            write_i16_be(&mut output, start + r * 8 + 4, rect.bottom);
            write_i16_be(&mut output, start + r * 8 + 6, rect.right);
            write_i16_be(&mut output, start + 160 + r * 2, rect.percent);
            write_i16_be(&mut output, start + 200 + r * 4, rect.battle_range[0]);
            write_i16_be(&mut output, start + 202 + r * 4, rect.battle_range[1]);
            for slot in 0..3 {
                write_i16_be(
                    &mut output,
                    start + 280 + r * 6 + slot * 2,
                    rect.random_doors[slot],
                );
                write_i16_be(
                    &mut output,
                    start + 400 + r * 6 + slot * 2,
                    rect.random_door_percent[slot],
                );
            }
            output[start + 523 + r] = u8::from(rect.only);
            output[start + 543 + r] = rect.option as u8;
            write_i16_be(&mut output, start + 563 + r * 2, rect.sound);
            write_i16_be(&mut output, start + 603 + r * 2, rect.text);
        }
    }
    Ok(output)
}

fn attach_render_info(maps: &mut [MapEntity], random_levels: &[RandomLevel]) {
    let lookup: BTreeMap<(LevelType, usize), &RandomLevel> = random_levels
        .iter()
        .map(|level| ((level.level_type, level.level_index), level))
        .collect();
    for map in maps {
        if map.level_type == LevelType::Dungeon {
            map.render = MapRender {
                tileset_id: "dungeon-top-down-302".to_string(),
                landlook: lookup
                    .get(&(map.level_type, map.index))
                    .map(|level| level.landlook),
                mode: RenderMode::DungeonTopDown,
            };
        } else if let Some(level) = lookup.get(&(map.level_type, map.index)) {
            map.render = MapRender {
                tileset_id: format!("landlook-{}", level.landlook),
                landlook: Some(level.landlook),
                mode: RenderMode::OutdoorLandlook,
            };
        }
    }
}

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
    let active = if source == "Data ED3" {
        !actions.is_empty()
    } else {
        coordinate.is_some() && (buffer[7] != 0 || !actions.is_empty() || doorid != 0)
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
        percent: buffer[7],
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
    let selected: Vec<&TriggerRecord> = triggers
        .iter()
        .filter(|trigger| trigger.level_type == Some(level_type))
        .collect();
    let level_count = selected
        .iter()
        .filter_map(|trigger| trigger.level_index)
        .max()
        .map(|index| index + 1)
        .unwrap_or(0);
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
    buffer[7] = trigger.percent;
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

pub fn parse_messages(buffer: &[u8]) -> Vec<MessageRecord> {
    parse_fixed_records(buffer, MESSAGE_BYTES)
        .map(|(id, start, record)| MessageRecord {
            id,
            text: decode_pascal_text(record),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data SD2", id, start, MESSAGE_BYTES),
        })
        .collect()
}

pub fn write_messages(records: &[MessageRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, MESSAGE_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, MESSAGE_BYTES) {
            return Ok(());
        }
        encode_pascal_text(buffer, &record.text)?;
        Ok(())
    })
}

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
    parse_fixed_records(buffer, SHOP_BYTES)
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
            choice_results: record[96..100].to_vec(),
            word_results: record[100..104].to_vec(),
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
        for slot in 0..4 {
            buffer[96 + slot] = record.choice_results.get(slot).copied().unwrap_or(0);
            buffer[100 + slot] = record.word_results.get(slot).copied().unwrap_or(0);
        }
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

fn parse_fixed_records(
    buffer: &[u8],
    record_bytes: usize,
) -> impl Iterator<Item = (usize, usize, &[u8])> {
    (0..buffer.len() / record_bytes).map(move |id| {
        let start = id * record_bytes;
        (id, start, &buffer[start..start + record_bytes])
    })
}

fn write_fixed_records<T>(
    records: &[T],
    record_bytes: usize,
    mut writer: impl FnMut(&T, &mut [u8]) -> Result<()>,
) -> Result<Vec<u8>>
where
    T: IndexedRecord,
{
    let mut selected: Vec<&T> = records.iter().collect();
    selected.sort_by_key(|record| record.record_id());
    let count = selected
        .last()
        .map(|record| record.record_id() + 1)
        .unwrap_or(0);
    let mut output = vec![0u8; count * record_bytes];
    for record in selected {
        let start = record.record_id() * record_bytes;
        writer(record, &mut output[start..start + record_bytes])?;
    }
    Ok(output)
}

trait IndexedRecord {
    fn record_id(&self) -> usize;
}

impl IndexedRecord for MessageRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for BattleRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for TreasureRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for ShopRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for SimpleEncounterRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for ComplexEncounterRecord {
    fn record_id(&self) -> usize {
        self.id
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

fn copy_raw(buffer: &mut [u8], raw: &[u8]) {
    let length = buffer.len().min(raw.len());
    buffer[..length].copy_from_slice(&raw[..length]);
}

fn preserve_raw(authored: bool, raw: &[u8], record_bytes: usize) -> bool {
    !authored && raw.len() == record_bytes
}

fn provenance(
    source_file: &str,
    record_index: usize,
    byte_offset: usize,
    byte_length: usize,
) -> Provenance {
    Provenance {
        source_file: source_file.to_string(),
        record_index,
        byte_offset,
        byte_length,
        confidence: Confidence::SourceBacked,
    }
}

fn decode_pascal_text(bytes: &[u8]) -> String {
    let length = bytes.first().copied().unwrap_or(0) as usize;
    let end = (1 + length).min(bytes.len());
    decode_fixed_text(&bytes[1..end])
}

fn decode_fixed_text(bytes: &[u8]) -> String {
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    bytes[..end]
        .iter()
        .map(|byte| {
            if (32..=126).contains(byte) {
                *byte as char
            } else {
                ' '
            }
        })
        .collect::<String>()
        .trim_end()
        .to_string()
}

fn encode_pascal_text(buffer: &mut [u8], text: &str) -> Result<()> {
    if buffer.is_empty() {
        return Ok(());
    }
    let bytes = classic_text_bytes(text);
    if bytes.len() > buffer.len() - 1 || bytes.len() > u8::MAX as usize {
        return Err(ProvidenceError::message(format!(
            "Classic Pascal text is {} byte(s); maximum is {}",
            bytes.len(),
            buffer.len() - 1
        )));
    }
    buffer.fill(0);
    buffer[0] = bytes.len() as u8;
    buffer[1..1 + bytes.len()].copy_from_slice(&bytes);
    Ok(())
}

fn classic_text_bytes(text: &str) -> Vec<u8> {
    text.chars()
        .map(|ch| if ch.is_ascii() { ch as u8 } else { b'?' })
        .collect()
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

fn build_asset_catalog(maps: &[MapEntity], random_levels: &[RandomLevel]) -> AssetCatalog {
    let mut landlooks = BTreeSet::new();
    for level in random_levels {
        if level.landlook >= 0 {
            landlooks.insert(level.landlook);
        }
    }
    let mut tilesets: Vec<TilesetAsset> = landlooks
        .into_iter()
        .map(|landlook| TilesetAsset {
            id: format!("landlook-{}", landlook),
            landlook,
            name: landlook_name(landlook).to_string(),
            source: if (6..=8).contains(&landlook) {
                "Scenario resource fork".to_string()
            } else {
                "Realmz reference resources".to_string()
            },
            available: true,
            image_path: None,
            pict_id: landlook_pict_id(landlook),
            tile_width: 32,
            tile_height: 32,
            columns: 20,
            rows: 10,
            custom: (6..=8).contains(&landlook),
            base_tile: landlook_base_tile(landlook),
        })
        .collect();
    if maps.iter().any(|map| map.level_type == LevelType::Dungeon) {
        tilesets.push(TilesetAsset {
            id: "dungeon-top-down-302".to_string(),
            landlook: 2,
            name: "Dungeon Top Down".to_string(),
            source: "Realmz reference resources".to_string(),
            available: true,
            image_path: None,
            pict_id: Some(302),
            tile_width: 16,
            tile_height: 16,
            columns: 4,
            rows: 4,
            custom: false,
            base_tile: None,
        });
    }
    AssetCatalog {
        tilesets,
        ..AssetCatalog::default()
    }
}

fn landlook_name(landlook: i8) -> &'static str {
    match landlook {
        0 => "Plains",
        3 => "Subterranean",
        4 => "Castle",
        5 => "Desert",
        6 => "Custom 6",
        7 => "Custom 7",
        8 => "Custom 8",
        9 => "Swamp",
        10 => "Snow",
        _ => "Unknown landlook",
    }
}

fn landlook_pict_id(landlook: i8) -> Option<i32> {
    match landlook {
        0 => Some(300),
        2 => Some(302),
        3 => Some(303),
        4 => Some(304),
        5 => Some(305),
        6 => Some(306),
        7 => Some(307),
        8 => Some(308),
        9 => Some(309),
        10 => Some(310),
        _ => None,
    }
}

fn landlook_base_tile(landlook: i8) -> Option<i16> {
    match landlook {
        0 => Some(156),
        3 => Some(155),
        4 => Some(111),
        5 => Some(191),
        9 | 10 => Some(155),
        _ => None,
    }
}

fn title(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

pub fn i16_be(buffer: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([buffer[offset], buffer[offset + 1]])
}

fn i32_be(buffer: &[u8], offset: usize) -> i32 {
    i32::from_be_bytes([
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3],
    ])
}

pub fn write_i16_be(buffer: &mut [u8], offset: usize, value: i16) {
    buffer[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

fn write_i32_be(buffer: &mut [u8], offset: usize, value: i32) {
    buffer[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fields_round_trip() {
        let mut input = vec![0u8; FIELD_BYTES * 2];
        write_i16_be(&mut input, 0, 42);
        write_i16_be(&mut input, FIELD_BYTES + 2, -7);
        let maps = parse_fields(&input, LevelType::Land, "Data LD");
        let output = write_fields(&maps, LevelType::Land).unwrap();
        assert_eq!(input, output);
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
    fn extracodes_round_trip() {
        let mut input = vec![0u8; EXTRACODE_BYTES * 3];
        write_i16_be(&mut input, 10, -4);
        write_i16_be(&mut input, 18, 999);
        let rows = parse_extracodes(&input);
        let output = write_extracodes(&rows).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn target_records_round_trip_full_records() {
        let cases: [(usize, fn(&[u8]) -> Vec<u8>); 6] = [
            (MESSAGE_BYTES, |bytes| {
                write_messages(&parse_messages(bytes)).unwrap()
            }),
            (BATTLE_BYTES, |bytes| {
                write_battles(&parse_battles(bytes)).unwrap()
            }),
            (TREASURE_BYTES, |bytes| {
                write_treasures(&parse_treasures(bytes)).unwrap()
            }),
            (SHOP_BYTES, |bytes| {
                write_shops(&parse_shops(bytes)).unwrap()
            }),
            (SIMPLE_ENCOUNTER_BYTES, |bytes| {
                write_simple_encounters(&parse_simple_encounter_records(bytes)).unwrap()
            }),
            (COMPLEX_ENCOUNTER_BYTES, |bytes| {
                write_complex_encounters(&parse_complex_encounter_records(bytes)).unwrap()
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
    fn authored_target_records_write_realmz_offsets() {
        let message = MessageRecord {
            id: 0,
            text: "Hello".to_string(),
            raw_bytes: vec![0; MESSAGE_BYTES],
            authored: true,
            provenance: provenance("Data SD2", 0, 0, MESSAGE_BYTES),
        };
        let message_bytes = write_messages(&[message]).unwrap();
        assert_eq!(message_bytes.len(), MESSAGE_BYTES);
        assert_eq!(&message_bytes[..6], &[5, b'H', b'e', b'l', b'l', b'o']);

        let mut grid = vec![0; 13 * 13];
        grid[12] = 77;
        let battle = BattleRecord {
            id: 0,
            grid,
            dist: -2,
            message_before: 3,
            message_after: 4,
            battle_macro: 5,
            raw_bytes: vec![0; BATTLE_BYTES],
            authored: true,
            provenance: provenance("Data BD", 0, 0, BATTLE_BYTES),
        };
        let battle_bytes = write_battles(&[battle]).unwrap();
        assert_eq!(i16_be(&battle_bytes, 24), 77);
        assert_eq!(battle_bytes[338] as i8, -2);
        assert_eq!(i16_be(&battle_bytes, 344), 5);

        let treasure = TreasureRecord {
            id: 0,
            item_ids: vec![11, 12],
            exp: 100,
            gold: 200,
            gems: 3,
            jewelry: 4,
            raw_bytes: vec![0; TREASURE_BYTES],
            authored: true,
            provenance: provenance("Data TD", 0, 0, TREASURE_BYTES),
        };
        let treasure_bytes = write_treasures(&[treasure]).unwrap();
        assert_eq!(i16_be(&treasure_bytes, 0), 11);
        assert_eq!(i16_be(&treasure_bytes, 40), 100);
        assert_eq!(i16_be(&treasure_bytes, 46), 4);

        let shop = ShopRecord {
            id: 0,
            item_ids: vec![21],
            quantities: vec![9],
            inflation: 125,
            raw_bytes: vec![0; SHOP_BYTES],
            authored: true,
            provenance: provenance("Data SD", 0, 0, SHOP_BYTES),
        };
        let shop_bytes = write_shops(&[shop]).unwrap();
        assert_eq!(i16_be(&shop_bytes, 0), 21);
        assert_eq!(shop_bytes[2000], 9);
        assert_eq!(i16_be(&shop_bytes, 3000), 125);

        let simple = SimpleEncounterRecord {
            id: 0,
            actions: vec![EncounterActionRow {
                slot: 2,
                raw_code: 4,
                id: 9,
            }],
            choice_results: vec![1, 2, 3, 4],
            can_back_out: true,
            max_times: 7,
            caste_success: -1,
            prompt: 55,
            texts: vec![
                "A".to_string(),
                "B".to_string(),
                String::new(),
                String::new(),
            ],
            raw_bytes: vec![0; SIMPLE_ENCOUNTER_BYTES],
            authored: true,
            provenance: provenance("Data ED", 0, 0, SIMPLE_ENCOUNTER_BYTES),
        };
        let simple_bytes = write_simple_encounters(&[simple]).unwrap();
        assert_eq!(simple_bytes[2], 4);
        assert_eq!(i16_be(&simple_bytes, 36), 9);
        assert_eq!(simple_bytes[100], 1);
        assert_eq!(i16_be(&simple_bytes, 104), 55);
        assert_eq!(simple_bytes[106], 1);
        assert_eq!(simple_bytes[107], b'A');

        let complex = ComplexEncounterRecord {
            id: 0,
            actions: vec![EncounterActionRow {
                slot: 1,
                raw_code: 5,
                id: 10,
            }],
            choice_results: vec![1, 0, 0, 0],
            word_results: vec![2, 0, 0, 0],
            can_back_out: true,
            thief: true,
            max_times: 2,
            caste_success: 3,
            thief_success: 4,
            thief_fail: 5,
            prompt: 66,
            texts: vec!["Nine".to_string(); 9],
            raw_bytes: vec![0; COMPLEX_ENCOUNTER_BYTES],
            authored: true,
            provenance: provenance("Data ED2", 0, 0, COMPLEX_ENCOUNTER_BYTES),
        };
        let complex_bytes = write_complex_encounters(&[complex]).unwrap();
        assert_eq!(complex_bytes[1], 5);
        assert_eq!(i16_be(&complex_bytes, 34), 10);
        assert_eq!(complex_bytes[100], 2);
        assert_eq!(complex_bytes[151], 1);
        assert_eq!(i16_be(&complex_bytes, 158), 66);
        assert_eq!(complex_bytes[160], 4);
        assert_eq!(&complex_bytes[161..165], b"Nine");
    }
}
