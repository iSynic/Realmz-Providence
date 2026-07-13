use crate::error::{ProvidenceError, Result};
use crate::project::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

mod combat;
mod economy;
mod encounters;
mod record_bytes;
mod rules;

pub use combat::{
    parse_battles, parse_monster_descriptions, parse_monster_set, parse_monsters, write_battles,
    write_monster_descriptions, write_monster_set, write_monsters, BATTLE_BYTES, MONSTER_BYTES,
    MONSTER_DESCRIPTION_BYTES,
};
pub use economy::{
    parse_scenario_items, parse_shops, parse_treasures, write_scenario_items, write_shops,
    write_treasures, ITEM_BYTES, SHOP_BYTES, TREASURE_BYTES,
};
pub use encounters::{
    parse_complex_encounter_records, parse_simple_encounter_records, parse_thief_encounters,
    parse_timed_encounters, write_complex_encounters, write_simple_encounters,
    write_thief_encounters, write_timed_encounters, COMPLEX_ENCOUNTER_BYTES,
    SIMPLE_ENCOUNTER_BYTES, THIEF_ENCOUNTER_BYTES, TIMED_ENCOUNTER_BYTES,
};
pub use rules::{
    parse_caste_overrides, parse_race_overrides, parse_spell_overrides, write_caste_overrides,
    write_race_overrides, write_spell_overrides, CASTE_BYTES, RACE_BYTES, SPELL_BYTES,
    SPELL_OVERRIDE_RECORDS,
};

use record_bytes::{
    copy_fixed_bytes, copy_raw, decode_pascal_text, encode_pascal_text, i32_be,
    parse_fixed_records, pascal_record_string, preserve_raw, provenance, write_fixed_records,
    write_i32_be,
};
pub use record_bytes::{i16_be, write_i16_be};

pub const FIELD_BYTES: usize = MAP_SIZE * MAP_SIZE * 2;
pub const DOOR_BYTES: usize = 40;
pub const DOORS_PER_LEVEL: usize = 100;
pub const DOOR_LEVEL_BYTES: usize = DOOR_BYTES * DOORS_PER_LEVEL;
pub const RANDLEVEL_BYTES: usize = 644;
pub const EXTRACODE_BYTES: usize = 10;
pub const LAND_LAYOUT_ROWS: usize = 8;
pub const LAND_LAYOUT_COLS: usize = 16;
pub const LAND_LAYOUT_BYTES: usize = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS * 2;
pub const MESSAGE_BYTES: usize = 256;
pub const OPTION_LABEL_BYTES: usize = 25;
pub const MAP_RECORD_BYTES: usize = 340;
pub const MAP_RECORD_MARKERS: usize = 10;
pub const MAP_RECORD_MARKER_BYTES: usize = 6;
pub const MAPSTATS_RECORD_BYTES: usize = 40;
pub const MAPSTATS_RECORDS: usize = 201;
pub const LANDLOOK_RANGE_TAIL_BYTES: usize = 60;
pub const LANDLOOK_RANGE_SLOT_BYTES: usize = 6;
pub const LANDLOOK_RANGE_SLOTS: usize = LANDLOOK_RANGE_TAIL_BYTES / LANDLOOK_RANGE_SLOT_BYTES;

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
    "Data TD2",
    "Data TD3",
    "Data MD",
    "Data MD1",
    "Data MD-1",
    "Data DES",
    "Data BD",
    "Data SD",
    "Data SD2",
    "Data OD",
    "Data MD2",
    "Data TD",
    "Global",
    "Data Spell",
    "Data Race",
    "Data Caste",
    "Data CS",
    "Data CI",
    "Data RI",
    "Data Solids",
    "Data NI",
    "Layout",
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
    "Data MD1",
    "Data MD-1",
    "Data DES",
    "Data BD",
    "Data SD",
    "Data SD2",
    "Data MD2",
    "Data TD",
    "Data TD2",
    "Data TD3",
    "Data CI",
    "Data RI",
    "Data CS",
    "Data OD",
    "Data MENU",
    "Data Solids",
    "Data NI",
    "Data Spell",
    "Data Race",
    "Data Caste",
    "Layout",
    "Data Custom 1 BD",
    "Data Custom 2 BD",
    "Data Custom 3 BD",
    "Custom 1",
    "Custom 2",
    "Custom 3",
    "Custom 4",
    "Custom 5",
    "Custom 6",
    "Custom 7",
    "Custom 8",
    "Custom 9",
    "Custom 1 Music",
    "Custom 2 Music",
    "Custom 3 Music",
    "Custom 4 Music",
    "Custom 5 Music",
    "Custom 6 Music",
    "Custom 7 Music",
    "Custom 8 Music",
    "Custom 9 Music",
    "Format",
    "Icon_",
    "Read Me (nice to know)",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedScenario {
    pub maps: Vec<MapEntity>,
    pub land_layout: Option<LandLayout>,
    pub map_records: Vec<MapRecord>,
    pub tile_attributes: Vec<TileAttributeProfile>,
    pub custom_landlooks: Vec<CustomLandlookMetadata>,
    pub triggers: Vec<TriggerRecord>,
    pub random_levels: Vec<RandomLevel>,
    pub extracodes: Vec<ExtraCodeRow>,
    pub messages: Vec<MessageRecord>,
    pub option_labels: Vec<OptionLabelRecord>,
    pub battles: Vec<BattleRecord>,
    pub monsters: Vec<MonsterRecord>,
    pub monster_sets: Vec<MonsterSet>,
    pub monster_descriptions: Vec<MonsterDescriptionRecord>,
    pub scenario_items: Vec<ScenarioItemRecord>,
    pub treasures: Vec<TreasureRecord>,
    pub shops: Vec<ShopRecord>,
    pub simple_encounters: Vec<SimpleEncounterRecord>,
    pub complex_encounters: Vec<ComplexEncounterRecord>,
    pub thief_encounters: Vec<ThiefEncounterRecord>,
    pub timed_encounters: Vec<TimedEncounterRecord>,
    pub spell_overrides: Vec<ScenarioSpellOverride>,
    pub race_overrides: Vec<ScenarioRaceOverride>,
    pub caste_overrides: Vec<ScenarioCasteOverride>,
    pub records: RecordCatalog,
    pub diagnostics: Vec<Diagnostic>,
    pub asset_catalog: AssetCatalog,
}

pub fn parse_scenario_buffers(buffers: &BTreeMap<String, Vec<u8>>) -> ParsedScenario {
    let mut diagnostics = Vec::new();
    let mut records = RecordCatalog::default();
    let mut maps = Vec::new();
    let mut map_records = Vec::new();
    let mut tile_attributes = Vec::new();
    let mut custom_landlooks = Vec::new();
    let mut random_levels = Vec::new();
    let mut triggers = Vec::new();
    let mut extracodes = Vec::new();
    let mut messages = Vec::new();
    let mut option_labels = Vec::new();
    let mut battles = Vec::new();
    let mut monsters = Vec::new();
    let mut monster_sets = Vec::new();
    let mut monster_descriptions = Vec::new();
    let mut scenario_items = Vec::new();
    let mut treasures = Vec::new();
    let mut shops = Vec::new();
    let mut simple_encounters = Vec::new();
    let mut complex_encounters = Vec::new();
    let mut thief_encounters = Vec::new();
    let mut timed_encounters = Vec::new();
    let mut spell_overrides = Vec::new();
    let mut race_overrides = Vec::new();
    let mut caste_overrides = Vec::new();

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
        ("Data MD", MONSTER_BYTES),
        ("Data MD1", MONSTER_BYTES),
        ("Data MD-1", MONSTER_BYTES),
        ("Data DES", MONSTER_DESCRIPTION_BYTES),
        ("Data BD", BATTLE_BYTES),
        ("Data SD", SHOP_BYTES),
        ("Data SD2", MESSAGE_BYTES),
        ("Data OD", OPTION_LABEL_BYTES),
        ("Data MD2", MAP_RECORD_BYTES),
        ("Data TD", TREASURE_BYTES),
        ("Data TD2", THIEF_ENCOUNTER_BYTES),
        ("Data TD3", TIMED_ENCOUNTER_BYTES),
        ("Data CI", 4608),
        ("Data RI", 320),
        ("Data CS", 316),
        ("Global", 60),
        ("Data MENU", 502),
        ("Data Solids", 1024),
        ("Data NI", ITEM_BYTES),
        ("Data Spell", SPELL_BYTES),
        ("Data Race", RACE_BYTES),
        ("Data Caste", CASTE_BYTES),
        ("Layout", LAND_LAYOUT_BYTES),
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
    let land_layout = buffers
        .get("Layout")
        .and_then(|buffer| parse_land_layout(buffer).ok());
    if let Some(buffer) = buffers.get("Data MD2") {
        map_records.extend(parse_map_records(buffer));
    }
    if let Some(buffer) = buffers.get("Data Solids") {
        tile_attributes.extend(parse_tile_attributes(buffer));
    }
    for (file_name, landlook) in [
        ("Data Custom 1 BD", 6),
        ("Data Custom 2 BD", 7),
        ("Data Custom 3 BD", 8),
    ] {
        if let Some(buffer) = buffers.get(file_name) {
            tile_attributes.extend(parse_landlook_mapstats_data(buffer, landlook, file_name));
            custom_landlooks.push(parse_custom_landlook_metadata(buffer, landlook, file_name));
        }
    }

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
    if let Some(buffer) = buffers.get("Data OD") {
        option_labels.extend(parse_option_labels(buffer));
    }
    if let Some(buffer) = buffers.get("Data BD") {
        battles.extend(parse_battles(buffer));
    }
    if let Some(buffer) = buffers.get("Data MD") {
        monsters.extend(parse_monsters(buffer));
    }
    if let Some(buffer) = buffers.get("Data MD1") {
        monster_sets.push(parse_monster_set(buffer, "Data MD1", 1));
    }
    if let Some(buffer) = buffers.get("Data MD-1") {
        monster_sets.push(parse_monster_set(buffer, "Data MD-1", -1));
    }
    if let Some(buffer) = buffers.get("Data DES") {
        monster_descriptions.extend(parse_monster_descriptions(buffer));
    }
    if let Some(buffer) = buffers.get("Data NI") {
        scenario_items.extend(parse_scenario_items(buffer));
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
    if let Some(buffer) = buffers.get("Data TD2") {
        thief_encounters.extend(parse_thief_encounters(buffer));
    }
    if let Some(buffer) = buffers.get("Data TD3") {
        timed_encounters.extend(parse_timed_encounters(buffer));
    }
    if let Some(buffer) = buffers.get("Data Spell") {
        spell_overrides.extend(parse_spell_overrides(buffer));
    }
    if let Some(buffer) = buffers.get("Data Race") {
        race_overrides.extend(parse_race_overrides(buffer));
    }
    if let Some(buffer) = buffers.get("Data Caste") {
        caste_overrides.extend(parse_caste_overrides(buffer));
    }

    let asset_catalog = build_asset_catalog(&maps, &random_levels);
    ParsedScenario {
        maps,
        land_layout,
        map_records,
        tile_attributes,
        custom_landlooks,
        triggers,
        random_levels,
        extracodes,
        messages,
        option_labels,
        battles,
        monsters,
        monster_sets,
        monster_descriptions,
        scenario_items,
        treasures,
        shops,
        simple_encounters,
        complex_encounters,
        thief_encounters,
        timed_encounters,
        spell_overrides,
        race_overrides,
        caste_overrides,
        records,
        diagnostics,
        asset_catalog,
    }
}

fn parse_tile_attributes(buffer: &[u8]) -> Vec<TileAttributeProfile> {
    buffer
        .iter()
        .take(1024)
        .enumerate()
        .map(|(tile, solid_type)| TileAttributeProfile {
            tile: tile as i16,
            landlook: None,
            solid_type: Some(*solid_type as i16),
            movement_sound_id: None,
            movement_cost: None,
            shore: None,
            boat_requirement: None,
            path_flag: None,
            blocks_los: None,
            fly_float_required: None,
            forest_type: None,
            spare: None,
            combat_build: Vec::new(),
            clear_land_id: None,
            base_tile: None,
            base_scale: None,
            editable_scope: "special-tile".to_string(),
            flags: if *solid_type == 0 {
                vec![TileAttributeFlag::Walkable]
            } else {
                vec![TileAttributeFlag::Solid]
            },
            confidence: TileAttributeConfidence::SourceBacked,
            source_kind: TileAttributeSourceKind::DataSolids,
            source: "Data Solids".to_string(),
            raw_byte: Some(*solid_type),
        })
        .collect()
}

pub fn write_tile_solids(attributes: &[TileAttributeProfile]) -> Result<Vec<u8>> {
    let mut output = vec![0u8; 1024];
    let mut saw_solids = false;
    for attribute in attributes
        .iter()
        .filter(|attribute| matches!(attribute.source_kind, TileAttributeSourceKind::DataSolids))
    {
        if !(0..1024).contains(&i32::from(attribute.tile)) {
            continue;
        }
        saw_solids = true;
        let value = attribute
            .raw_byte
            .or_else(|| {
                attribute
                    .solid_type
                    .and_then(|value| u8::try_from(value).ok())
            })
            .unwrap_or(0);
        output[attribute.tile as usize] = value;
    }
    if saw_solids {
        Ok(output)
    } else {
        Ok(Vec::new())
    }
}

pub fn parse_landlook_mapstats_data(
    buffer: &[u8],
    landlook: i8,
    source: &str,
) -> Vec<TileAttributeProfile> {
    let count = (buffer.len() / MAPSTATS_RECORD_BYTES).min(MAPSTATS_RECORDS);
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    let base_tile = if buffer.len() >= base_offset + 2 {
        Some(i16_be(buffer, base_offset))
    } else {
        None
    };
    let base_scale = if buffer.len() >= base_offset + 4 {
        Some(i16_be(buffer, base_offset + 2))
    } else {
        None
    };
    let editable_scope = if source.to_ascii_lowercase().contains("custom") {
        "scenario-custom"
    } else {
        "built-in-reference"
    };
    (0..count)
        .map(|tile| {
            let start = tile * MAPSTATS_RECORD_BYTES;
            let sound = i16_be(buffer, start);
            let time = i16_be(buffer, start + 2);
            let solid = i16_be(buffer, start + 4);
            let shore = i16_be(buffer, start + 6) != 0;
            let need_boat = i16_be(buffer, start + 8);
            let is_path = i16_be(buffer, start + 10) != 0;
            let los = i16_be(buffer, start + 12) != 0;
            let fly_float = i16_be(buffer, start + 14) != 0;
            let forest = i16_be(buffer, start + 16);
            let spare = i16_be(buffer, start + 18);
            let combat_build = vec![
                vec![
                    i16_be(buffer, start + 20),
                    i16_be(buffer, start + 22),
                    i16_be(buffer, start + 24),
                ],
                vec![
                    i16_be(buffer, start + 26),
                    i16_be(buffer, start + 28),
                    i16_be(buffer, start + 30),
                ],
                vec![
                    i16_be(buffer, start + 32),
                    i16_be(buffer, start + 34),
                    i16_be(buffer, start + 36),
                ],
            ];
            let clear_land_id = i16_be(buffer, start + 38);
            let mut flags = Vec::new();
            if solid == 0 && need_boat == 0 && !fly_float {
                flags.push(TileAttributeFlag::Walkable);
            } else {
                flags.push(TileAttributeFlag::Solid);
            }
            if shore {
                flags.push(TileAttributeFlag::Shore);
            }
            if need_boat != 0 {
                flags.push(TileAttributeFlag::BoatRequired);
            }
            if is_path {
                flags.push(TileAttributeFlag::Path);
            }
            if los {
                flags.push(TileAttributeFlag::BlocksLos);
            }
            if fly_float {
                flags.push(TileAttributeFlag::FlyFloatRequired);
            }
            if forest != 0 {
                flags.push(TileAttributeFlag::Forest);
            }
            if combat_build.iter().flatten().any(|value| *value != 0) {
                flags.push(TileAttributeFlag::CombatBuild);
            }
            TileAttributeProfile {
                tile: tile as i16,
                landlook: Some(landlook),
                solid_type: Some(solid),
                movement_sound_id: Some(sound),
                movement_cost: Some(time),
                shore: Some(shore),
                boat_requirement: Some(need_boat),
                path_flag: Some(is_path),
                blocks_los: Some(los),
                fly_float_required: Some(fly_float),
                forest_type: Some(forest),
                spare: Some(spare),
                combat_build,
                clear_land_id: Some(clear_land_id),
                base_tile,
                base_scale,
                editable_scope: editable_scope.to_string(),
                flags,
                confidence: TileAttributeConfidence::SourceBacked,
                source_kind: TileAttributeSourceKind::Mapstats,
                source: source.to_string(),
                raw_byte: None,
            }
        })
        .collect()
}

pub fn parse_custom_landlook_metadata(
    buffer: &[u8],
    landlook: i8,
    source_file: &str,
) -> CustomLandlookMetadata {
    let records = (0..MAPSTATS_RECORDS)
        .map(|tile| {
            if buffer.len() >= (tile + 1) * MAPSTATS_RECORD_BYTES {
                parse_mapstats_record(buffer, tile)
            } else {
                empty_mapstats_record(tile)
            }
        })
        .collect();
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    let base_tile = if buffer.len() >= base_offset + 2 {
        i16_be(buffer, base_offset)
    } else {
        0
    };
    let base_scale = if buffer.len() >= base_offset + 4 {
        i16_be(buffer, base_offset + 2)
    } else {
        0
    };
    let expected_len = base_offset + 4 + LANDLOOK_RANGE_TAIL_BYTES;
    CustomLandlookMetadata {
        landlook,
        source_file: source_file.to_string(),
        records,
        base_tile,
        base_scale,
        range_slots: parse_landlook_range_tail(buffer),
        trailing_bytes: if buffer.len() > expected_len {
            buffer[expected_len..].to_vec()
        } else {
            Vec::new()
        },
        raw_bytes: buffer.to_vec(),
        writer_gate: custom_landlook_writer_gate(),
        authored: false,
    }
}

fn parse_mapstats_record(buffer: &[u8], tile: usize) -> MapstatsRecord {
    let start = tile * MAPSTATS_RECORD_BYTES;
    MapstatsRecord {
        tile: tile as i16,
        sound: i16_be(buffer, start),
        time: i16_be(buffer, start + 2),
        solid: i16_be(buffer, start + 4),
        shore: i16_be(buffer, start + 6),
        need_boat: i16_be(buffer, start + 8),
        is_path: i16_be(buffer, start + 10),
        los: i16_be(buffer, start + 12),
        fly_float: i16_be(buffer, start + 14),
        forest: i16_be(buffer, start + 16),
        spare: i16_be(buffer, start + 18),
        combat_build: vec![
            vec![
                i16_be(buffer, start + 20),
                i16_be(buffer, start + 22),
                i16_be(buffer, start + 24),
            ],
            vec![
                i16_be(buffer, start + 26),
                i16_be(buffer, start + 28),
                i16_be(buffer, start + 30),
            ],
            vec![
                i16_be(buffer, start + 32),
                i16_be(buffer, start + 34),
                i16_be(buffer, start + 36),
            ],
        ],
        clear_land_id: i16_be(buffer, start + 38),
    }
}

fn empty_mapstats_record(tile: usize) -> MapstatsRecord {
    MapstatsRecord {
        tile: tile as i16,
        sound: 0,
        time: 0,
        solid: 0,
        shore: 0,
        need_boat: 0,
        is_path: 0,
        los: 0,
        fly_float: 0,
        forest: 0,
        spare: 0,
        combat_build: vec![vec![0; 3], vec![0; 3], vec![0; 3]],
        clear_land_id: 0,
    }
}

fn custom_landlook_writer_gate() -> LandlookWriterGate {
    LandlookWriterGate {
        metadata_writer_status: "writer-safe-fixture-gated".to_string(),
        atlas_writer_status: "writable-by-generated-pict-replacement".to_string(),
        writable_fields: vec![
            "sound",
            "time",
            "solid",
            "shore",
            "needBoat",
            "isPath",
            "los",
            "flyFloat",
            "forest",
            "clearLandId",
            "combatBuild",
            "baseTile",
            "baseScale",
            "rangeSlot.firstTile",
            "rangeSlot.lastTile",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        preserve_only_fields: vec!["spare", "rangeSlot.reserved"]
            .into_iter()
            .map(String::from)
            .collect(),
        evidence: vec![
            "docs/format-evidence-cards/custom-landlook-writers.md".to_string(),
            "docs/generated/custom-landlook-coverage.json".to_string(),
        ],
    }
}

pub fn write_custom_landlook_metadata(metadata: &CustomLandlookMetadata) -> Result<Vec<u8>> {
    let expected_len = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES;
    let mut output = if metadata.raw_bytes.len() >= expected_len {
        metadata.raw_bytes.clone()
    } else {
        vec![0u8; expected_len]
    };
    if output.len() < expected_len {
        output.resize(expected_len, 0);
    }
    for (tile, record) in metadata.records.iter().take(MAPSTATS_RECORDS).enumerate() {
        write_mapstats_record(&mut output, tile, record);
    }
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    write_i16_be(&mut output, base_offset, metadata.base_tile);
    write_i16_be(&mut output, base_offset + 2, metadata.base_scale);
    for slot in metadata.range_slots.iter().take(LANDLOOK_RANGE_SLOTS) {
        if slot.slot >= LANDLOOK_RANGE_SLOTS {
            continue;
        }
        let start = base_offset + 4 + slot.slot * LANDLOOK_RANGE_SLOT_BYTES;
        write_i16_be(&mut output, start, slot.first_tile);
        write_i16_be(&mut output, start + 2, slot.last_tile);
        write_i16_be(&mut output, start + 4, slot.reserved);
    }
    if metadata.raw_bytes.len() <= expected_len && !metadata.trailing_bytes.is_empty() {
        output.truncate(expected_len);
        output.extend(&metadata.trailing_bytes);
    }
    Ok(output)
}

fn write_mapstats_record(output: &mut [u8], tile: usize, record: &MapstatsRecord) {
    let start = tile * MAPSTATS_RECORD_BYTES;
    write_i16_be(output, start, record.sound);
    write_i16_be(output, start + 2, record.time);
    write_i16_be(output, start + 4, record.solid);
    write_i16_be(output, start + 6, record.shore);
    write_i16_be(output, start + 8, record.need_boat);
    write_i16_be(output, start + 10, record.is_path);
    write_i16_be(output, start + 12, record.los);
    write_i16_be(output, start + 14, record.fly_float);
    write_i16_be(output, start + 16, record.forest);
    write_i16_be(output, start + 18, record.spare);
    for row in 0..3 {
        for col in 0..3 {
            let value = record
                .combat_build
                .get(row)
                .and_then(|values| values.get(col))
                .copied()
                .unwrap_or(0);
            write_i16_be(output, start + 20 + (row * 3 + col) * 2, value);
        }
    }
    write_i16_be(output, start + 38, record.clear_land_id);
}

pub fn update_custom_land_tile_attributes(
    metadata: &CustomLandlookMetadata,
    tile: usize,
    patch: CustomLandTileAttributePatch,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if let Some(record) = next.records.get_mut(tile) {
        if let Some(value) = patch.sound {
            record.sound = value;
        }
        if let Some(value) = patch.time {
            record.time = value;
        }
        if let Some(value) = patch.solid {
            record.solid = value;
        }
        if let Some(value) = patch.shore {
            record.shore = value;
        }
        if let Some(value) = patch.need_boat {
            record.need_boat = value;
        }
        if let Some(value) = patch.is_path {
            record.is_path = value;
        }
        if let Some(value) = patch.los {
            record.los = value;
        }
        if let Some(value) = patch.fly_float {
            record.fly_float = value;
        }
        if let Some(value) = patch.forest {
            record.forest = value;
        }
        if let Some(value) = patch.clear_land_id {
            record.clear_land_id = value;
        }
        next.authored = true;
    }
    next
}

#[derive(Debug, Clone, Default)]
pub struct CustomLandTileAttributePatch {
    pub sound: Option<i16>,
    pub time: Option<i16>,
    pub solid: Option<i16>,
    pub shore: Option<i16>,
    pub need_boat: Option<i16>,
    pub is_path: Option<i16>,
    pub los: Option<i16>,
    pub fly_float: Option<i16>,
    pub forest: Option<i16>,
    pub clear_land_id: Option<i16>,
}

pub fn update_custom_land_tile_combat_build(
    metadata: &CustomLandlookMetadata,
    tile: usize,
    row: usize,
    col: usize,
    value: i16,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if row < 3 && col < 3 {
        if let Some(record) = next.records.get_mut(tile) {
            if record.combat_build.len() < 3 {
                record.combat_build.resize_with(3, || vec![0; 3]);
            }
            if record.combat_build[row].len() < 3 {
                record.combat_build[row].resize(3, 0);
            }
            record.combat_build[row][col] = value;
            next.authored = true;
        }
    }
    next
}

pub fn update_custom_landlook_base(
    metadata: &CustomLandlookMetadata,
    base_tile: Option<i16>,
    base_scale: Option<i16>,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if let Some(value) = base_tile {
        next.base_tile = value;
    }
    if let Some(value) = base_scale {
        next.base_scale = value;
    }
    next.authored = true;
    next
}

pub fn update_custom_landlook_range_slot(
    metadata: &CustomLandlookMetadata,
    slot: usize,
    first_tile: Option<i16>,
    last_tile: Option<i16>,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if let Some(range) = next.range_slots.iter_mut().find(|range| range.slot == slot) {
        if let Some(value) = first_tile {
            range.first_tile = value;
        }
        if let Some(value) = last_tile {
            range.last_tile = value;
        }
        next.authored = true;
    }
    next
}

pub fn parse_landlook_range_tail(buffer: &[u8]) -> Vec<LandlookRangeSlot> {
    let tail_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
    if buffer.len() < tail_offset + LANDLOOK_RANGE_SLOT_BYTES {
        return Vec::new();
    }
    let slots =
        ((buffer.len() - tail_offset) / LANDLOOK_RANGE_SLOT_BYTES).min(LANDLOOK_RANGE_SLOTS);
    (0..slots)
        .map(|slot| {
            let start = tail_offset + slot * LANDLOOK_RANGE_SLOT_BYTES;
            LandlookRangeSlot {
                slot,
                label: landlook_range_label(slot).to_string(),
                first_tile: i16_be(buffer, start),
                last_tile: i16_be(buffer, start + 2),
                reserved: i16_be(buffer, start + 4),
            }
        })
        .collect()
}

fn landlook_range_label(slot: usize) -> &'static str {
    match slot {
        0 => "Mountain range",
        1 => "Open range",
        2 => "Rubble range",
        3 => "House range",
        _ => "Reserved range",
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

pub fn parse_land_layout(buffer: &[u8]) -> Result<LandLayout> {
    if buffer.len() < LAND_LAYOUT_BYTES {
        return Err(ProvidenceError::message(format!(
            "Layout is {} byte(s); expected at least {} bytes",
            buffer.len(),
            LAND_LAYOUT_BYTES
        )));
    }
    let mut cells = Vec::with_capacity(LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS);
    for index in 0..LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS {
        cells.push(i16_be(buffer, index * 2));
    }
    Ok(LandLayout {
        rows: LAND_LAYOUT_ROWS,
        cols: LAND_LAYOUT_COLS,
        cells,
        trailing_bytes: buffer.get(LAND_LAYOUT_BYTES..).unwrap_or(&[]).to_vec(),
        authored: false,
        provenance: Some(provenance("Layout", 0, 0, LAND_LAYOUT_BYTES)),
    })
}

pub fn write_land_layout(layout: &LandLayout) -> Result<Vec<u8>> {
    if layout.rows != LAND_LAYOUT_ROWS || layout.cols != LAND_LAYOUT_COLS {
        return Err(ProvidenceError::message(format!(
            "Layout must be {} rows by {} columns",
            LAND_LAYOUT_ROWS, LAND_LAYOUT_COLS
        )));
    }
    let mut output = vec![0u8; LAND_LAYOUT_BYTES + layout.trailing_bytes.len()];
    for index in 0..LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS {
        let value = layout.cells.get(index).copied().unwrap_or(0);
        write_i16_be(&mut output, index * 2, value);
    }
    if !layout.trailing_bytes.is_empty() {
        output[LAND_LAYOUT_BYTES..].copy_from_slice(&layout.trailing_bytes);
    }
    Ok(output)
}

pub fn parse_map_records(buffer: &[u8]) -> Vec<MapRecord> {
    let count = buffer.len() / MAP_RECORD_BYTES;
    (0..count)
        .map(|id| {
            let start = id * MAP_RECORD_BYTES;
            let record = &buffer[start..start + MAP_RECORD_BYTES];
            MapRecord {
                id,
                markers: parse_map_record_markers(record),
                start_x: i16_be(record, 60),
                start_y: i16_be(record, 62),
                level: i16_be(record, 64),
                pict_id: i16_be(record, 66),
                icon_size: i16_be(record, 68),
                show: i16_be(record, 70),
                is_dungeon: i16_be(record, 72) != 0,
                rect: MapRecordRect {
                    top: i16_be(record, 76),
                    left: i16_be(record, 78),
                    bottom: i16_be(record, 80),
                    right: i16_be(record, 82),
                },
                note: decode_pascal_text(&record[84..MAP_RECORD_BYTES]),
                raw_bytes: record.to_vec(),
                authored: false,
                name: None,
                primary_name: None,
                secondary_name: None,
                name_source: None,
                map_name_authored: false,
                provenance: provenance("Data MD2", id, start, MAP_RECORD_BYTES),
            }
        })
        .collect()
}

pub fn write_map_records(records: &[MapRecord]) -> Result<Vec<u8>> {
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let max_id = records.iter().map(|record| record.id).max().unwrap_or(0);
    let mut output = vec![0u8; (max_id + 1) * MAP_RECORD_BYTES];
    for record in records {
        let start = record.id * MAP_RECORD_BYTES;
        if record.raw_bytes.len() == MAP_RECORD_BYTES {
            output[start..start + MAP_RECORD_BYTES].copy_from_slice(&record.raw_bytes);
        }
        if !record.authored && record.raw_bytes.len() == MAP_RECORD_BYTES {
            continue;
        }
        for (slot, marker) in normalized_map_record_markers(record).iter().enumerate() {
            let offset = start + slot * MAP_RECORD_MARKER_BYTES;
            write_i16_be(&mut output, offset, marker.icon_id);
            write_i16_be(&mut output, offset + 2, marker.x);
            write_i16_be(&mut output, offset + 4, marker.y);
        }
        write_i16_be(&mut output, start + 60, record.start_x);
        write_i16_be(&mut output, start + 62, record.start_y);
        write_i16_be(&mut output, start + 64, record.level);
        write_i16_be(&mut output, start + 66, record.pict_id);
        write_i16_be(&mut output, start + 68, record.icon_size);
        write_i16_be(&mut output, start + 70, record.show);
        write_i16_be(
            &mut output,
            start + 72,
            if record.is_dungeon { 1 } else { 0 },
        );
        write_i16_be(&mut output, start + 76, record.rect.top);
        write_i16_be(&mut output, start + 78, record.rect.left);
        write_i16_be(&mut output, start + 80, record.rect.bottom);
        write_i16_be(&mut output, start + 82, record.rect.right);
        encode_pascal_text(
            &mut output[start + 84..start + MAP_RECORD_BYTES],
            &record.note,
        )?;
    }
    Ok(output)
}

fn parse_map_record_markers(record: &[u8]) -> Vec<MapMarker> {
    (0..MAP_RECORD_MARKERS)
        .map(|slot| {
            let offset = slot * MAP_RECORD_MARKER_BYTES;
            MapMarker {
                icon_id: i16_be(record, offset),
                x: i16_be(record, offset + 2),
                y: i16_be(record, offset + 4),
            }
        })
        .collect()
}

fn normalized_map_record_markers(record: &MapRecord) -> Vec<MapMarker> {
    (0..MAP_RECORD_MARKERS)
        .map(|slot| {
            record
                .markers
                .get(slot)
                .cloned()
                .or_else(|| {
                    let offset = slot * MAP_RECORD_MARKER_BYTES;
                    (record.raw_bytes.len() >= offset + MAP_RECORD_MARKER_BYTES).then(|| {
                        MapMarker {
                            icon_id: i16_be(&record.raw_bytes, offset),
                            x: i16_be(&record.raw_bytes, offset + 2),
                            y: i16_be(&record.raw_bytes, offset + 4),
                        }
                    })
                })
                .unwrap_or(MapMarker {
                    icon_id: 0,
                    x: 0,
                    y: 0,
                })
        })
        .collect()
}

pub fn parse_scenario_shell(source_file: &str, buffer: &[u8]) -> Result<ScenarioShell> {
    if buffer.len() < 316 {
        return Err(ProvidenceError::message(format!(
            "{} is {} byte(s); scenario marker/main file must be at least 316 bytes",
            source_file,
            buffer.len()
        )));
    }
    Ok(ScenarioShell {
        source_file: source_file.to_string(),
        rec_level: i32_be(buffer, 0),
        max_level: i32_be(buffer, 4),
        land_level: i32_be(buffer, 8),
        look_x: i32_be(buffer, 12),
        look_y: i32_be(buffer, 16),
        codeseg1: buffer[20..40].to_vec(),
        codeseg2: buffer[40..60].to_vec(),
        creator_user: decode_pascal_text(&buffer[60..316]),
        trailing_bytes: buffer.get(316..).unwrap_or(&[]).to_vec(),
        raw_bytes: buffer.to_vec(),
        authored: false,
        provenance: Some(provenance(source_file, 0, 0, buffer.len())),
    })
}

pub fn write_scenario_shell(shell: &ScenarioShell) -> Result<Vec<u8>> {
    if !shell.authored && !shell.raw_bytes.is_empty() {
        return Ok(shell.raw_bytes.clone());
    }
    let mut output = if !shell.raw_bytes.is_empty() {
        shell.raw_bytes.clone()
    } else {
        vec![0u8; 316 + shell.trailing_bytes.len()]
    };
    if output.len() < 316 + shell.trailing_bytes.len() {
        output.resize(316 + shell.trailing_bytes.len(), 0);
    }
    write_i32_be(&mut output, 0, shell.rec_level);
    write_i32_be(&mut output, 4, shell.max_level);
    write_i32_be(&mut output, 8, shell.land_level);
    write_i32_be(&mut output, 12, shell.look_x);
    write_i32_be(&mut output, 16, shell.look_y);
    copy_fixed_bytes(&mut output[20..40], &shell.codeseg1);
    copy_fixed_bytes(&mut output[40..60], &shell.codeseg2);
    encode_pascal_text(&mut output[60..316], &shell.creator_user)?;
    if !shell.trailing_bytes.is_empty() {
        output[316..].copy_from_slice(&shell.trailing_bytes);
    }
    Ok(output)
}

pub fn parse_scenario_support_file(
    source_file: &str,
    buffer: &[u8],
) -> Result<ScenarioSupportFile> {
    if buffer.len() < 40 {
        return Err(ProvidenceError::message(format!(
            "{} is {} byte(s); Scenario support file must be at least 40 bytes",
            source_file,
            buffer.len()
        )));
    }
    Ok(ScenarioSupportFile {
        source_file: source_file.to_string(),
        divinity_string_editor_slot: Some(buffer[23] as i32),
        divinity_string_sound_id: Some(i16_be(buffer, 38) as i32),
        raw_bytes: buffer.to_vec(),
        authored: false,
        provenance: Some(provenance(source_file, 0, 0, buffer.len())),
    })
}

pub fn write_scenario_support_file(support: &ScenarioSupportFile) -> Result<Vec<u8>> {
    if !support.authored && !support.raw_bytes.is_empty() {
        return Ok(support.raw_bytes.clone());
    }
    let mut output = if !support.raw_bytes.is_empty() {
        support.raw_bytes.clone()
    } else {
        vec![0u8; 600]
    };
    if output.len() < 40 {
        output.resize(40, 0);
    }
    if support.authored {
        if let Some(slot) = support.divinity_string_editor_slot {
            if !(0..=255).contains(&slot) {
                return Err(ProvidenceError::message(format!(
                    "Divinity string editor slot {slot} is outside the 0..255 byte range"
                )));
            }
            let raw_slot = support.raw_bytes.get(23).map(|value| *value as i32);
            if raw_slot != Some(slot) {
                output[23] = slot as u8;
            }
        }
        if let Some(sound_id) = support.divinity_string_sound_id {
            if !(i16::MIN as i32..=i16::MAX as i32).contains(&sound_id) {
                return Err(ProvidenceError::message(format!(
                    "Divinity string sound id {sound_id} is outside the signed 16-bit range"
                )));
            }
            let raw_sound =
                (support.raw_bytes.len() >= 40).then(|| i16_be(&support.raw_bytes, 38) as i32);
            if raw_sound != Some(sound_id) {
                write_i16_be(&mut output, 38, sound_id as i16);
            }
        }
    }
    Ok(output)
}

pub fn parse_scenario_contact_info(buffer: &[u8]) -> Result<ScenarioContactInfo> {
    if buffer.len() < 4608 {
        return Err(ProvidenceError::message(format!(
            "Data CI is {} byte(s); expected 4608 bytes",
            buffer.len()
        )));
    }
    Ok(ScenarioContactInfo {
        scenario_name: pascal_record_string(buffer, 0),
        version: pascal_record_string(buffer, 1),
        date: pascal_record_string(buffer, 2),
        author: pascal_record_string(buffer, 3),
        email: pascal_record_string(buffer, 4),
        web: pascal_record_string(buffer, 5),
        fee: pascal_record_string(buffer, 6),
        pay_info: (7..12)
            .map(|slot| pascal_record_string(buffer, slot))
            .collect(),
        titles: (12..17)
            .map(|slot| pascal_record_string(buffer, slot))
            .collect(),
        description: pascal_record_string(buffer, 17),
        raw_bytes: buffer[..4608].to_vec(),
        authored: false,
        provenance: Some(provenance("Data CI", 0, 0, 4608)),
    })
}

pub fn write_scenario_contact_info(contact: &ScenarioContactInfo) -> Result<Vec<u8>> {
    if !contact.authored && contact.raw_bytes.len() == 4608 {
        return Ok(contact.raw_bytes.clone());
    }
    let mut output = if contact.raw_bytes.len() == 4608 {
        contact.raw_bytes.clone()
    } else {
        vec![0u8; 4608]
    };
    let fields = [
        contact.scenario_name.as_str(),
        contact.version.as_str(),
        contact.date.as_str(),
        contact.author.as_str(),
        contact.email.as_str(),
        contact.web.as_str(),
        contact.fee.as_str(),
    ];
    for (slot, value) in fields.iter().enumerate() {
        encode_pascal_text(&mut output[slot * 256..slot * 256 + 256], value)?;
    }
    for index in 0..5 {
        encode_pascal_text(
            &mut output[(7 + index) * 256..(8 + index) * 256],
            contact
                .pay_info
                .get(index)
                .map(String::as_str)
                .unwrap_or(""),
        )?;
        encode_pascal_text(
            &mut output[(12 + index) * 256..(13 + index) * 256],
            contact.titles.get(index).map(String::as_str).unwrap_or(""),
        )?;
    }
    encode_pascal_text(&mut output[17 * 256..18 * 256], &contact.description)?;
    Ok(output)
}

pub fn parse_scenario_restrictions(buffer: &[u8]) -> Result<ScenarioRestrictions> {
    if buffer.len() < 320 {
        return Err(ProvidenceError::message(format!(
            "Data RI is {} byte(s); expected 320 bytes",
            buffer.len()
        )));
    }
    Ok(ScenarioRestrictions {
        description: decode_pascal_text(&buffer[0..256]),
        max_party_characters: i16_be(buffer, 256),
        max_party_level: i16_be(buffer, 258),
        banned_races: buffer[260..290]
            .iter()
            .enumerate()
            .filter_map(|(index, value)| (*value != 0).then_some((index + 1) as u8))
            .collect(),
        banned_castes: buffer[290..320]
            .iter()
            .enumerate()
            .filter_map(|(index, value)| (*value != 0).then_some((index + 1) as u8))
            .collect(),
        raw_bytes: buffer[..320].to_vec(),
        authored: false,
        provenance: Some(provenance("Data RI", 0, 0, 320)),
    })
}

pub fn write_scenario_restrictions(restrictions: &ScenarioRestrictions) -> Result<Vec<u8>> {
    if !restrictions.authored && restrictions.raw_bytes.len() == 320 {
        return Ok(restrictions.raw_bytes.clone());
    }
    let mut output = if restrictions.raw_bytes.len() == 320 {
        restrictions.raw_bytes.clone()
    } else {
        vec![0u8; 320]
    };
    encode_pascal_text(&mut output[0..256], &restrictions.description)?;
    write_i16_be(&mut output, 256, restrictions.max_party_characters);
    write_i16_be(&mut output, 258, restrictions.max_party_level);
    output[260..320].fill(0);
    for race in &restrictions.banned_races {
        if (1..=30).contains(race) {
            output[260 + *race as usize - 1] = 1;
        }
    }
    for caste in &restrictions.banned_castes {
        if (1..=30).contains(caste) {
            output[290 + *caste as usize - 1] = 1;
        }
    }
    Ok(output)
}

pub fn parse_global_macro_hooks(buffer: &[u8]) -> ScenarioGlobalMacroHooks {
    let mut slots = Vec::new();
    for slot in 0..7 {
        let door = if buffer.len() >= slot * 2 + 2 {
            i16_be(buffer, slot * 2)
        } else {
            0
        };
        slots.push(GlobalMacroHook {
            slot,
            label: global_macro_slot_label(slot).to_string(),
            door,
            source_backed: matches!(slot, 0 | 1 | 2 | 4 | 5),
            runtime_consumer: global_macro_slot_runtime_consumer(slot).to_string(),
        });
    }
    ScenarioGlobalMacroHooks {
        slots,
        raw_bytes: buffer.to_vec(),
        authored: false,
        provenance: Some(provenance("Global", 0, 0, buffer.len())),
    }
}

pub fn write_global_macro_hooks(hooks: &ScenarioGlobalMacroHooks) -> Result<Vec<u8>> {
    let mut output = if hooks.raw_bytes.len() == 60 {
        hooks.raw_bytes.clone()
    } else {
        vec![0u8; 60]
    };
    for hook in &hooks.slots {
        if hook.slot < 30 {
            write_i16_be(&mut output, hook.slot * 2, hook.door);
        }
    }
    Ok(output)
}

fn global_macro_slot_label(slot: usize) -> &'static str {
    match slot {
        0 => "Start",
        1 => "Death",
        2 => "Quit",
        4 => "Shop",
        5 => "Temple",
        _ => "Reserved",
    }
}

fn global_macro_slot_runtime_consumer(slot: usize) -> &'static str {
    match slot {
        0 => "mainscreeninit/new-game start",
        1 => "partyloss death/revive path",
        2 => "end current game",
        4 => "shop button when a shop is available",
        5 => "shop/temple button when a temple is available",
        _ => "no source-backed runtime consumer found",
    }
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
        // Random-level raw bytes are the export authority. Authoring commands update
        // raw_values alongside decoded fields, and preserving the raw stream avoids
        // canonicalizing Divinity-authored flag bytes during no-edit exports.
        for rect in &level.rects {
            if rect.rect_index >= 20 {
                return Err(ProvidenceError::message(format!(
                    "{} random rect index {} is out of range",
                    level.id, rect.rect_index
                )));
            }
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

pub fn parse_option_labels(buffer: &[u8]) -> Vec<OptionLabelRecord> {
    parse_fixed_records(buffer, OPTION_LABEL_BYTES)
        .map(|(id, start, record)| OptionLabelRecord {
            id,
            text: decode_pascal_text(record),
            raw_bytes: record.to_vec(),
            authored: false,
            provenance: provenance("Data OD", id, start, OPTION_LABEL_BYTES),
        })
        .collect()
}

pub fn write_option_labels(records: &[OptionLabelRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, OPTION_LABEL_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, OPTION_LABEL_BYTES) {
            return Ok(());
        }
        encode_pascal_text(buffer, &record.text)?;
        Ok(())
    })
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
        6..=8 => Some(156),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after.iter())
            .enumerate()
            .filter_map(|(offset, (left, right))| (left != right).then_some(offset))
            .collect()
    }

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
    fn map_storage_land_tiles_mutate_only_owned_cell() {
        let mut input = vec![0xA5; FIELD_BYTES * 2];
        let level_index = 1;
        let tile_index = MAP_SIZE + 7;
        let tile_offset = level_index * FIELD_BYTES + tile_index * 2;
        write_i16_be(&mut input, tile_offset, 0x0102);

        let mut maps = parse_fields(&input, LevelType::Land, "Data LD");
        maps[level_index].tiles[tile_index] = 0x0304;

        let output = write_fields(&maps, LevelType::Land).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(i16_be(&output, tile_offset), 0x0304);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![tile_offset, tile_offset + 1]
        );
    }

    #[test]
    fn land_layout_round_trip() {
        let mut input = vec![0u8; LAND_LAYOUT_BYTES + 4];
        write_i16_be(&mut input, 0, -1);
        write_i16_be(&mut input, 2, 1);
        write_i16_be(
            &mut input,
            (LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS - 1) * 2,
            19,
        );
        input[LAND_LAYOUT_BYTES..].copy_from_slice(&[9, 8, 7, 6]);
        let layout = parse_land_layout(&input).unwrap();
        assert_eq!(layout.rows, LAND_LAYOUT_ROWS);
        assert_eq!(layout.cols, LAND_LAYOUT_COLS);
        assert_eq!(layout.cells[0], -1);
        assert_eq!(layout.cells[1], 1);
        assert_eq!(layout.cells[LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS - 1], 19);
        assert_eq!(layout.trailing_bytes, vec![9, 8, 7, 6]);
        let output = write_land_layout(&layout).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn map_storage_layout_mutates_only_owned_cell_and_preserves_tail() {
        let mut input = vec![0xA5; LAND_LAYOUT_BYTES + 6];
        input[LAND_LAYOUT_BYTES..].copy_from_slice(&[0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
        let cell_index = LAND_LAYOUT_COLS + 4;
        let cell_offset = cell_index * 2;
        write_i16_be(&mut input, cell_offset, 0x0102);

        let mut layout = parse_land_layout(&input).unwrap();
        layout.cells[cell_index] = 0x0304;

        let output = write_land_layout(&layout).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(&output[LAND_LAYOUT_BYTES..], &input[LAND_LAYOUT_BYTES..]);
        assert_eq!(i16_be(&output, cell_offset), 0x0304);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![cell_offset, cell_offset + 1]
        );
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
    fn map_storage_random_levels_mutate_only_owned_raw_words() {
        for (level_type, source) in [
            (LevelType::Land, "Data RD"),
            (LevelType::Dungeon, "Data RDD"),
        ] {
            let mut input = vec![0xA5; RANDLEVEL_BYTES * 2];
            let level_index = 1;
            let raw_word_index = 281;
            let raw_offset = level_index * RANDLEVEL_BYTES + raw_word_index * 2;
            write_i16_be(&mut input, raw_offset, 0x0102);

            let mut levels = parse_random_levels(&input, level_type, source);
            levels[level_index].raw_values[raw_word_index] = 0x0304;

            let output = write_random_levels(&levels, level_type).unwrap();

            assert_eq!(output.len(), input.len());
            assert_eq!(i16_be(&output, raw_offset), 0x0304);
            assert_eq!(
                changed_offsets(&input, &output),
                vec![raw_offset, raw_offset + 1]
            );
        }
    }

    #[test]
    fn mapstats_parse_source_backed_tile_attributes() {
        let mut input = vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 64];
        let tile_start = MAPSTATS_RECORD_BYTES;
        write_i16_be(&mut input, tile_start, 9);
        write_i16_be(&mut input, tile_start + 2, 4);
        write_i16_be(&mut input, tile_start + 4, 2);
        write_i16_be(&mut input, tile_start + 6, 1);
        write_i16_be(&mut input, tile_start + 8, 2);
        write_i16_be(&mut input, tile_start + 10, 1);
        write_i16_be(&mut input, tile_start + 12, 1);
        write_i16_be(&mut input, tile_start + 14, 1);
        write_i16_be(&mut input, tile_start + 16, 3);
        write_i16_be(&mut input, tile_start + 18, 77);
        write_i16_be(&mut input, tile_start + 20, 101);
        write_i16_be(&mut input, tile_start + 22, 102);
        write_i16_be(&mut input, tile_start + 24, 103);
        write_i16_be(&mut input, tile_start + 26, 104);
        write_i16_be(&mut input, tile_start + 28, 105);
        write_i16_be(&mut input, tile_start + 30, 106);
        write_i16_be(&mut input, tile_start + 32, 107);
        write_i16_be(&mut input, tile_start + 34, 108);
        write_i16_be(&mut input, tile_start + 36, 109);
        write_i16_be(&mut input, tile_start + 38, 12);
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS, 1);
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 2, 4);
        let profiles = parse_landlook_mapstats_data(&input, 0, "Data P BD");
        assert_eq!(profiles.len(), MAPSTATS_RECORDS);
        let tile = &profiles[1];
        assert_eq!(tile.landlook, Some(0));
        assert_eq!(tile.movement_sound_id, Some(9));
        assert_eq!(tile.movement_cost, Some(4));
        assert_eq!(tile.solid_type, Some(2));
        assert_eq!(tile.shore, Some(true));
        assert_eq!(tile.boat_requirement, Some(2));
        assert_eq!(tile.path_flag, Some(true));
        assert_eq!(tile.blocks_los, Some(true));
        assert_eq!(tile.fly_float_required, Some(true));
        assert_eq!(tile.forest_type, Some(3));
        assert_eq!(tile.spare, Some(77));
        assert_eq!(tile.combat_build[0], vec![101, 102, 103]);
        assert_eq!(tile.combat_build[2], vec![107, 108, 109]);
        assert_eq!(tile.clear_land_id, Some(12));
        assert_eq!(tile.base_tile, Some(1));
        assert_eq!(tile.base_scale, Some(4));
        assert_eq!(tile.editable_scope, "built-in-reference");
        assert!(tile.flags.contains(&TileAttributeFlag::Solid));
        assert!(tile.flags.contains(&TileAttributeFlag::Shore));
        assert!(tile.flags.contains(&TileAttributeFlag::BoatRequired));
        assert!(tile.flags.contains(&TileAttributeFlag::Path));
        assert!(tile.flags.contains(&TileAttributeFlag::BlocksLos));
        assert!(tile.flags.contains(&TileAttributeFlag::FlyFloatRequired));
        assert!(tile.flags.contains(&TileAttributeFlag::Forest));
        assert!(tile.flags.contains(&TileAttributeFlag::CombatBuild));
        assert!(matches!(
            tile.source_kind,
            TileAttributeSourceKind::Mapstats
        ));
    }

    #[test]
    fn mapstats_tail_parses_divinity_tile_ranges() {
        let mut input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let tail_start = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
        for (slot, first, last) in [(0, 62, 85), (1, 155, 158), (2, 159, 167), (3, 190, 200)] {
            let offset = tail_start + slot * LANDLOOK_RANGE_SLOT_BYTES;
            write_i16_be(&mut input, offset, first);
            write_i16_be(&mut input, offset + 2, last);
            write_i16_be(&mut input, offset + 4, 0);
        }

        let ranges = parse_landlook_range_tail(&input);

        assert_eq!(ranges.len(), LANDLOOK_RANGE_SLOTS);
        assert_eq!(ranges[0].label, "Mountain range");
        assert_eq!(
            (
                ranges[0].first_tile,
                ranges[0].last_tile,
                ranges[0].reserved
            ),
            (62, 85, 0)
        );
        assert_eq!(ranges[1].label, "Open range");
        assert_eq!(
            (
                ranges[1].first_tile,
                ranges[1].last_tile,
                ranges[1].reserved
            ),
            (155, 158, 0)
        );
        assert_eq!(ranges[2].label, "Rubble range");
        assert_eq!(
            (
                ranges[2].first_tile,
                ranges[2].last_tile,
                ranges[2].reserved
            ),
            (159, 167, 0)
        );
        assert_eq!(ranges[3].label, "House range");
        assert_eq!(
            (
                ranges[3].first_tile,
                ranges[3].last_tile,
                ranges[3].reserved
            ),
            (190, 200, 0)
        );
        assert!(ranges[4..]
            .iter()
            .all(|slot| slot.first_tile == 0 && slot.last_tile == 0 && slot.reserved == 0));
    }

    #[test]
    fn custom_landlook_metadata_no_edit_reencodes_byte_identical() {
        let mut input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let tile_start = 12 * MAPSTATS_RECORD_BYTES;
        for (offset, value) in [
            (0, 88),
            (2, 6),
            (4, 2),
            (6, 1),
            (8, 4),
            (10, 1),
            (12, 1),
            (14, 0),
            (16, 3),
            (18, 99),
            (20, 155),
            (22, 156),
            (24, 157),
            (26, 158),
            (28, 159),
            (30, 160),
            (32, 161),
            (34, 162),
            (36, 163),
            (38, 155),
        ] {
            write_i16_be(&mut input, tile_start + offset, value);
        }
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS, 156);
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 2, 1);
        let tail_start = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
        write_i16_be(&mut input, tail_start, 62);
        write_i16_be(&mut input, tail_start + 2, 85);

        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        assert_eq!(metadata.records.len(), MAPSTATS_RECORDS);
        assert_eq!(metadata.base_tile, 156);
        assert_eq!(metadata.base_scale, 1);
        assert_eq!(metadata.range_slots[0].first_tile, 62);

        let output = write_custom_landlook_metadata(&metadata).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn custom_landlook_attribute_update_mutates_only_owned_word() {
        let input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let updated = update_custom_land_tile_attributes(
            &metadata,
            5,
            CustomLandTileAttributePatch {
                sound: Some(321),
                ..CustomLandTileAttributePatch::default()
            },
        );
        assert!(updated.authored);

        let output = write_custom_landlook_metadata(&updated).unwrap();
        let changed: Vec<_> = input
            .iter()
            .zip(output.iter())
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect();
        assert_eq!(
            changed,
            vec![5 * MAPSTATS_RECORD_BYTES, 5 * MAPSTATS_RECORD_BYTES + 1]
        );
        assert_eq!(i16_be(&output, 5 * MAPSTATS_RECORD_BYTES), 321);
    }

    #[test]
    fn custom_landlook_behavior_update_writes_all_editable_behavior_words() {
        let input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let tile = 9usize;
        let updated = update_custom_land_tile_attributes(
            &metadata,
            tile,
            CustomLandTileAttributePatch {
                sound: Some(7),
                time: Some(2),
                solid: Some(1),
                shore: Some(1),
                need_boat: Some(3),
                is_path: Some(1),
                los: Some(1),
                fly_float: Some(1),
                forest: Some(2),
                clear_land_id: Some(155),
            },
        );

        let output = write_custom_landlook_metadata(&updated).unwrap();
        let start = tile * MAPSTATS_RECORD_BYTES;
        for (offset, value) in [
            (0, 7),
            (2, 2),
            (4, 1),
            (6, 1),
            (8, 3),
            (10, 1),
            (12, 1),
            (14, 1),
            (16, 2),
            (38, 155),
        ] {
            assert_eq!(i16_be(&output, start + offset), value);
        }
        let changed: Vec<_> = input
            .iter()
            .zip(output.iter())
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect();
        assert!(changed.iter().all(|offset| {
            let relative = offset.saturating_sub(start);
            *offset >= start
                && *offset < start + MAPSTATS_RECORD_BYTES
                && relative != 18
                && !(20..38).contains(&relative)
        }));
        assert!(!changed.is_empty());
    }

    #[test]
    fn custom_landlook_combat_update_mutates_only_selected_build_cell() {
        let input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let updated = update_custom_land_tile_combat_build(&metadata, 10, 2, 1, 177);
        let output = write_custom_landlook_metadata(&updated).unwrap();
        let offset = 10 * MAPSTATS_RECORD_BYTES + 34;
        let changed: Vec<_> = input
            .iter()
            .zip(output.iter())
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect();
        assert!(changed
            .iter()
            .all(|changed_offset| *changed_offset == offset || *changed_offset == offset + 1));
        assert!(!changed.is_empty());
        assert_eq!(i16_be(&output, offset), 177);
    }

    #[test]
    fn custom_landlook_range_update_preserves_reserved_word() {
        let mut input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let tail_start = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
        write_i16_be(&mut input, tail_start, 62);
        write_i16_be(&mut input, tail_start + 2, 85);
        write_i16_be(&mut input, tail_start + 4, 1234);
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let updated = update_custom_landlook_range_slot(&metadata, 0, Some(70), Some(80));
        let output = write_custom_landlook_metadata(&updated).unwrap();

        assert_eq!(i16_be(&output, tail_start), 70);
        assert_eq!(i16_be(&output, tail_start + 2), 80);
        assert_eq!(i16_be(&output, tail_start + 4), 1234);
    }

    #[test]
    fn data_solids_round_trip_from_tile_attributes() {
        let mut input = vec![0u8; 1024];
        input[35] = 1;
        input[190] = 2;
        input[998] = 1;
        let profiles = parse_tile_attributes(&input);
        let output = write_tile_solids(&profiles).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn data_solids_mutates_only_selected_special_tile_solidity() {
        let input = vec![0u8; 1024];
        let mut profiles = parse_tile_attributes(&input);
        profiles[190].raw_byte = Some(1);
        profiles[190].solid_type = Some(1);
        profiles[190].flags = vec![TileAttributeFlag::Solid];

        let output = write_tile_solids(&profiles).unwrap();

        assert_eq!(changed_offsets(&input, &output), vec![190]);
        assert_eq!(output[190], 1);
    }

    #[test]
    fn scenario_shell_contact_and_restrictions_round_trip() {
        let shell = ScenarioShell {
            source_file: "Tutorial".to_string(),
            rec_level: 5,
            max_level: 42,
            land_level: 1,
            look_x: 12,
            look_y: 34,
            creator_user: "Eric".to_string(),
            codeseg1: (0..20).collect(),
            codeseg2: (20..40).collect(),
            trailing_bytes: vec![9, 8, 7, 6],
            raw_bytes: Vec::new(),
            authored: true,
            provenance: None,
        };
        let shell_bytes = write_scenario_shell(&shell).unwrap();
        let parsed_shell = parse_scenario_shell("Tutorial", &shell_bytes).unwrap();
        assert_eq!(parsed_shell.rec_level, 5);
        assert_eq!(parsed_shell.max_level, 42);
        assert_eq!(parsed_shell.land_level, 1);
        assert_eq!(parsed_shell.look_x, 12);
        assert_eq!(parsed_shell.look_y, 34);
        assert_eq!(parsed_shell.creator_user, "Eric");
        assert_eq!(parsed_shell.codeseg1[19], 19);
        assert_eq!(parsed_shell.codeseg2[0], 20);
        assert_eq!(parsed_shell.trailing_bytes, vec![9, 8, 7, 6]);

        let contact = ScenarioContactInfo {
            scenario_name: "New Scenario".to_string(),
            version: "1.0".to_string(),
            date: "2026".to_string(),
            author: "Providence".to_string(),
            email: "none".to_string(),
            web: "example".to_string(),
            fee: "free".to_string(),
            pay_info: vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string(),
                "E".to_string(),
            ],
            titles: vec![
                "T1".to_string(),
                "T2".to_string(),
                "T3".to_string(),
                "T4".to_string(),
                "T5".to_string(),
            ],
            description: "Description".to_string(),
            raw_bytes: Vec::new(),
            authored: true,
            provenance: None,
        };
        let contact_bytes = write_scenario_contact_info(&contact).unwrap();
        let parsed_contact = parse_scenario_contact_info(&contact_bytes).unwrap();
        assert_eq!(parsed_contact.scenario_name, "New Scenario");
        assert_eq!(parsed_contact.pay_info[2], "C");
        assert_eq!(parsed_contact.titles[4], "T5");
        assert_eq!(parsed_contact.description, "Description");

        let restrictions = ScenarioRestrictions {
            description: "No giants".to_string(),
            max_party_characters: 4,
            max_party_level: 20,
            banned_races: vec![1, 30],
            banned_castes: vec![2, 29],
            raw_bytes: Vec::new(),
            authored: true,
            provenance: None,
        };
        let restrictions_bytes = write_scenario_restrictions(&restrictions).unwrap();
        let parsed_restrictions = parse_scenario_restrictions(&restrictions_bytes).unwrap();
        assert_eq!(parsed_restrictions.description, "No giants");
        assert_eq!(parsed_restrictions.max_party_characters, 4);
        assert_eq!(parsed_restrictions.max_party_level, 20);
        assert_eq!(parsed_restrictions.banned_races, vec![1, 30]);
        assert_eq!(parsed_restrictions.banned_castes, vec![2, 29]);
    }

    #[test]
    fn scenario_startup_shell_writer_mutates_only_core_and_preserves_tail() {
        let mut input = vec![0u8; 320];
        input[60] = 1;
        input[61] = b'A';
        input[316..320].copy_from_slice(&[0x11, 0x22, 0x33, 0x44]);

        let mut shell = parse_scenario_shell("Startup", &input).unwrap();
        shell.authored = true;
        shell.rec_level = 0x01020304;
        shell.creator_user = "Go".to_string();

        let output = write_scenario_shell(&shell).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(&output[316..320], &input[316..320]);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![0, 1, 2, 3, 60, 61, 62]
        );
    }

    #[test]
    fn scenario_support_file_decodes_divinity_string_sound_evidence_fields() {
        let mut input = vec![0u8; 600];
        input[23] = 2;
        write_i16_be(&mut input, 38, 143);

        let support = parse_scenario_support_file("Scenario", &input).unwrap();

        assert_eq!(support.divinity_string_editor_slot, Some(2));
        assert_eq!(support.divinity_string_sound_id, Some(143));
    }

    #[test]
    fn scenario_support_file_writes_divinity_string_sound_without_touching_unrelated_bytes() {
        let mut input = vec![0u8; 600];
        input[23] = 2;
        write_i16_be(&mut input, 38, 143);

        let mut support = parse_scenario_support_file("Scenario", &input).unwrap();
        support.authored = true;
        support.divinity_string_editor_slot = Some(3);
        support.divinity_string_sound_id = Some(145);

        let output = write_scenario_support_file(&support).unwrap();

        assert_eq!(output[23], 3);
        assert_eq!(i16_be(&output, 38), 145);
        assert_eq!(changed_offsets(&input, &output), vec![23, 39]);
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

    #[test]
    fn fixed_record_text_writers_mutate_only_owned_pascal_bytes() {
        let mut message_input = vec![0u8; MESSAGE_BYTES * 2];
        message_input[0] = 1;
        message_input[1] = b'Z';
        let message_start = MESSAGE_BYTES;
        let mut messages = parse_messages(&message_input);
        messages[1].authored = true;
        messages[1].text = "Go".to_string();
        let message_output = write_messages(&messages).unwrap();
        assert_eq!(message_output.len(), message_input.len());
        assert_eq!(
            changed_offsets(&message_input, &message_output),
            vec![message_start, message_start + 1, message_start + 2]
        );

        let mut option_input = vec![0u8; OPTION_LABEL_BYTES * 3];
        option_input[1] = 1;
        option_input[2] = b'Q';
        let option_start = OPTION_LABEL_BYTES * 2;
        let mut option_labels = parse_option_labels(&option_input);
        option_labels[2].authored = true;
        option_labels[2].text = "On".to_string();
        let option_output = write_option_labels(&option_labels).unwrap();
        assert_eq!(option_output.len(), option_input.len());
        assert_eq!(
            changed_offsets(&option_input, &option_output),
            vec![option_start, option_start + 1, option_start + 2]
        );
    }

    #[test]
    fn fixed_record_scenario_shell_writers_mutate_only_owned_fields() {
        let contact_input = vec![0u8; 4608];
        let mut contact = parse_scenario_contact_info(&contact_input).unwrap();
        contact.authored = true;
        contact.scenario_name = "Go".to_string();
        let contact_output = write_scenario_contact_info(&contact).unwrap();
        assert_eq!(contact_output.len(), contact_input.len());
        assert_eq!(
            changed_offsets(&contact_input, &contact_output),
            vec![0, 1, 2]
        );

        let restrictions_input = vec![0u8; 320];
        let mut restrictions = parse_scenario_restrictions(&restrictions_input).unwrap();
        restrictions.authored = true;
        restrictions.description = "No".to_string();
        restrictions.max_party_characters = 0x0102;
        restrictions.max_party_level = 0x0304;
        restrictions.banned_races = vec![1, 30];
        restrictions.banned_castes = vec![2];
        let restrictions_output = write_scenario_restrictions(&restrictions).unwrap();
        assert_eq!(restrictions_output.len(), restrictions_input.len());
        assert_eq!(
            changed_offsets(&restrictions_input, &restrictions_output),
            vec![0, 1, 2, 256, 257, 258, 259, 260, 289, 291]
        );
    }

    #[test]
    fn global_macro_hooks_mutate_only_source_backed_slots() {
        let mut input = vec![0u8; 60];
        write_i16_be(&mut input, 6, 0x1111);

        let mut hooks = parse_global_macro_hooks(&input);
        assert!(!hooks.slots[3].source_backed);
        assert!(hooks.slots[4].source_backed);
        hooks.authored = true;
        hooks.slots[0].door = 0x0102;
        hooks.slots[4].door = 0x0304;

        let output = write_global_macro_hooks(&hooks).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(i16_be(&output, 6), 0x1111);
        assert_eq!(changed_offsets(&input, &output), vec![0, 1, 8, 9]);
    }

    #[test]
    fn target_records_round_trip_full_records() {
        let cases: [(usize, fn(&[u8]) -> Vec<u8>); 5] = [
            (MESSAGE_BYTES, |bytes| {
                write_messages(&parse_messages(bytes)).unwrap()
            }),
            (OPTION_LABEL_BYTES, |bytes| {
                write_option_labels(&parse_option_labels(bytes)).unwrap()
            }),
            (ITEM_BYTES, |bytes| {
                write_scenario_items(&parse_scenario_items(bytes)).unwrap()
            }),
            (TREASURE_BYTES, |bytes| {
                write_treasures(&parse_treasures(bytes)).unwrap()
            }),
            (SHOP_BYTES, |bytes| {
                write_shops(&parse_shops(bytes)).unwrap()
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
    fn map_record_storage_mutates_only_modeled_fields_and_preserves_prefix() {
        let mut input = vec![0u8; MAP_RECORD_BYTES * 2];
        let record_start = MAP_RECORD_BYTES;
        for offset in 0..60 {
            input[record_start + offset] = 0xA5;
        }
        input[record_start + 74] = 0xCA;
        input[record_start + 75] = 0xFE;

        let mut records = parse_map_records(&input);
        records[1].authored = true;
        records[1].start_x = 0x0304;
        records[1].level = -2;
        records[1].is_dungeon = true;
        records[1].rect.bottom = 0x0506;
        records[1].note = "Go".to_string();

        let output = write_map_records(&records).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            &output[record_start..record_start + 60],
            &input[record_start..record_start + 60]
        );
        assert_eq!(
            &output[record_start + 74..record_start + 76],
            &input[record_start + 74..record_start + 76]
        );
        assert_eq!(i16_be(&output, record_start + 60), 0x0304);
        assert_eq!(i16_be(&output, record_start + 64), -2);
        assert_eq!(i16_be(&output, record_start + 72), 1);
        assert_eq!(i16_be(&output, record_start + 80), 0x0506);
        assert_eq!(
            &output[record_start + 84..record_start + 87],
            &[2, b'G', b'o']
        );
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                record_start + 60,
                record_start + 61,
                record_start + 64,
                record_start + 65,
                record_start + 73,
                record_start + 80,
                record_start + 81,
                record_start + 84,
                record_start + 85,
                record_start + 86,
            ]
        );
    }

    #[test]
    fn map_record_marker_storage_mutates_only_selected_marker_words() {
        let mut input = vec![0u8; MAP_RECORD_BYTES * 2];
        let record_start = MAP_RECORD_BYTES;
        input[record_start + 74] = 0xCA;
        input[record_start + 75] = 0xFE;

        let marker_slot = 4;
        let marker_start = record_start + marker_slot * MAP_RECORD_MARKER_BYTES;
        let mut records = parse_map_records(&input);
        records[1].authored = true;
        records[1].markers[marker_slot].icon_id = 0x1234;
        records[1].markers[marker_slot].x = 0x5678;
        records[1].markers[marker_slot].y = -0x1234;

        let output = write_map_records(&records).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            &output[record_start + 74..record_start + 76],
            &input[record_start + 74..record_start + 76]
        );
        assert_eq!(i16_be(&output, marker_start), 0x1234);
        assert_eq!(i16_be(&output, marker_start + 2), 0x5678);
        assert_eq!(i16_be(&output, marker_start + 4), -0x1234);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                marker_start,
                marker_start + 1,
                marker_start + 2,
                marker_start + 3,
                marker_start + 4,
                marker_start + 5,
            ]
        );
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

        let option_label = OptionLabelRecord {
            id: 0,
            text: "Attack".to_string(),
            raw_bytes: vec![0; OPTION_LABEL_BYTES],
            authored: true,
            provenance: provenance("Data OD", 0, 0, OPTION_LABEL_BYTES),
        };
        let option_bytes = write_option_labels(&[option_label]).unwrap();
        assert_eq!(option_bytes.len(), OPTION_LABEL_BYTES);
        assert_eq!(&option_bytes[..7], &[6, b'A', b't', b't', b'a', b'c', b'k']);

        let monster_description = MonsterDescriptionRecord {
            id: 0,
            text: "A rather dramatic monster.".to_string(),
            raw_bytes: vec![0; MONSTER_DESCRIPTION_BYTES],
            authored: true,
            provenance: provenance("Data DES", 0, 0, MONSTER_DESCRIPTION_BYTES),
        };
        let description_bytes = write_monster_descriptions(&[monster_description]).unwrap();
        assert_eq!(description_bytes.len(), MONSTER_DESCRIPTION_BYTES);
        assert_eq!(description_bytes[0], 26);
        assert_eq!(&description_bytes[1..4], b"A r");

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

        let over_cap_battle = BattleRecord {
            id: 1,
            grid: (0..13 * 13)
                .map(|slot| if slot < 101 { 1 } else { 0 })
                .collect(),
            dist: 1,
            message_before: 0,
            message_after: 0,
            battle_macro: 0,
            raw_bytes: vec![0; BATTLE_BYTES],
            authored: true,
            provenance: provenance("Data BD", 1, BATTLE_BYTES, BATTLE_BYTES),
        };
        let error =
            write_battles(&[over_cap_battle]).expect_err("over-cap authored battles must fail");
        assert!(error.to_string().contains("at most 100 loaded monsters"));

        let monster = MonsterRecord {
            id: 0,
            hit_dice: 9,
            stamina_bonus: 3,
            agility: 12,
            name_id: 4,
            movement_max: 11,
            armor: -4,
            magic_resistance: 25,
            distance: 2,
            traitor: 1,
            size: 6,
            type_flags: vec![1, 0, 1, 0, 0, 0, 0, 0],
            attack_count: 2,
            magic_attack_count: 1,
            attacks: vec![vec![4, 8, 0, 0], vec![5, 12, 1, 0]],
            damage_bonus: 7,
            cast_percent: 20,
            run_percent: 5,
            surrender_percent: 6,
            missile_percent: 30,
            can_summon: 1,
            saves: vec![-5, 0, 5, 0, 0, 0],
            spell_immunities: vec![0, 1, 0, 1, 0, 0],
            money: vec![10, 20, 30],
            spells: vec![1101, 1102],
            items: vec![501, 502],
            weapon: 601,
            icon_id: -222,
            spell_points: 40,
            exp: 750,
            stamina: 88,
            stamina_max: 99,
            underneath: vec![1, 2, 3, 4],
            target: 3,
            guarding: 1,
            not_on_menu: true,
            been_attacked: 0,
            movement: 9,
            magic_to_hit: 12,
            conditions: vec![0; 40],
            lr: 4,
            up: 5,
            attack_num: 1,
            bonus_attack: 2,
            death_macro: 77,
            max_spell_points: 60,
            display_name: "Test Monster".to_string(),
            raw_bytes: vec![0; MONSTER_BYTES],
            authored: true,
            provenance: provenance("Data MD", 0, 0, MONSTER_BYTES),
        };
        let monster_bytes = write_monsters(&[monster]).unwrap();
        assert_eq!(monster_bytes.len(), MONSTER_BYTES);
        assert_eq!(monster_bytes[0], 9);
        assert_eq!(monster_bytes[5] as i8, -4);
        assert_eq!(monster_bytes[10], 1);
        assert_eq!(monster_bytes[20], 4);
        assert_eq!(i16_be(&monster_bytes, 64), 1101);
        assert_eq!(i16_be(&monster_bytes, 84), 501);
        assert_eq!(i16_be(&monster_bytes, 98), -222);
        assert_eq!(monster_bytes[118], 1);
        assert_eq!(i16_be(&monster_bytes, 166), 77);
        assert_eq!(&monster_bytes[170..182], b"Test Monster");

        let item = ScenarioItemRecord {
            id: 100,
            item_id: 900,
            icon_id: -222,
            item_type: 6,
            st: 2,
            blunt: 1,
            hands: 1,
            lu: 3,
            movement: -1,
            ac: 4,
            magic_resistance: 5,
            damage: 12,
            spell_points: 9,
            sound: 605,
            weight: 7,
            cost: -1500,
            charge: 3,
            cursed_item_id: 901,
            magical: 1,
            item_cat0: 0x01020304,
            item_cat1: -2,
            race_restrictions: 8,
            caste_restrictions: 9,
            specific_race: 10,
            specific_caste: 11,
            race_class_only: 12,
            caste_class_only: 13,
            spare2: vec![0; 7],
            v_small: 14,
            v_large: 15,
            heat: 16,
            cold: 17,
            electric: 18,
            vs_undead: 19,
            vs_demon_devil: 20,
            vs_evil: 21,
            special1: 22,
            special2: 23,
            special3: 24,
            special4: 25,
            special5: 26,
            weight_per_charge: 27,
            drop_on_empty: 1,
            raw_bytes: vec![0; ITEM_BYTES],
            authored: true,
            provenance: provenance("Data NI", 100, 100 * ITEM_BYTES, ITEM_BYTES),
        };
        let item_bytes = write_scenario_items(&[item]).unwrap();
        assert_eq!(item_bytes.len(), ITEM_BYTES * 101);
        let item_offset = ITEM_BYTES * 100;
        assert_eq!(i16_be(&item_bytes, item_offset), 2);
        assert_eq!(i16_be(&item_bytes, item_offset + 2), 900);
        assert_eq!(i16_be(&item_bytes, item_offset + 4), -222);
        assert_eq!(i32_be(&item_bytes, item_offset + 36), 0x01020304);
        assert_eq!(i16_be(&item_bytes, item_offset + 86), 22);
        assert_eq!(i16_be(&item_bytes, item_offset + 98), 1);

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
            action_result: 1,
            word_result: 2,
            groups: vec![3, 0, -1, 0, 0, 0, 0, 0],
            spell_ids: vec![1109, 3605, 0, 0, 0, 0, 0, 0, 0, 0],
            spell_results: vec![1, 3, 0, 0, 0, 0, 0, 0, 0, 0],
            item_ids: vec![641, 0, 0, 0, 0],
            item_results: vec![1, 0, 0, 0, 0],
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
        assert_eq!(complex_bytes[96], 1);
        assert_eq!(complex_bytes[97], 2);
        assert_eq!(complex_bytes[98], 3);
        assert_eq!(complex_bytes[100] as i8, -1);
        assert_eq!(i16_be(&complex_bytes, 106), 1109);
        assert_eq!(i16_be(&complex_bytes, 108), 3605);
        assert_eq!(complex_bytes[126], 1);
        assert_eq!(complex_bytes[127], 3);
        assert_eq!(i16_be(&complex_bytes, 136), 641);
        assert_eq!(complex_bytes[146], 1);
        assert_eq!(complex_bytes[151], 1);
        assert_eq!(i16_be(&complex_bytes, 158), 66);
        assert_eq!(complex_bytes[160], 4);
        assert_eq!(&complex_bytes[161..165], b"Nine");

        let thief = ThiefEncounterRecord {
            id: 0,
            type_flags: vec![
                true, false, true, false, true, false, true, false, true, false,
            ],
            modifiers: vec![0, -10, 20, 0, 0, 5, 0, 0],
            success_codes: vec![0, 2, 3, 0, 0, 0, 0, 0],
            failure_codes: vec![0, -1, -2, 0, 0, 0, 0, 0],
            success_text: vec![101, 102, 0, 0, 0, 0, 0, 0],
            failure_text: vec![201, 202, 0, 0, 0, 0, 0, 0],
            success_sounds: vec![301, 302, 0, 0, 0, 0, 0, 0],
            failure_sounds: vec![401, 402, 0, 0, 0, 0, 0, 0],
            spell: 1201,
            low_damage: 4,
            high_damage: 12,
            tumblers: 3,
            prompts: vec![55, 77, 6],
            prompt_sounds: vec![10136, 5, 10],
            raw_bytes: vec![0; THIEF_ENCOUNTER_BYTES],
            authored: true,
            provenance: provenance("Data TD2", 0, 0, THIEF_ENCOUNTER_BYTES),
        };
        let thief_bytes = write_thief_encounters(&[thief]).unwrap();
        assert_eq!(thief_bytes.len(), THIEF_ENCOUNTER_BYTES);
        assert_eq!(thief_bytes[0], 1);
        assert_eq!(thief_bytes[2], 1);
        assert_eq!(thief_bytes[11] as i8, -10);
        assert_eq!(thief_bytes[26] as i8, 0);
        assert_eq!(thief_bytes[27] as i8, -1);
        assert_eq!(i16_be(&thief_bytes, 34), 101);
        assert_eq!(i16_be(&thief_bytes, 50), 201);
        assert_eq!(i16_be(&thief_bytes, 66), 301);
        assert_eq!(i16_be(&thief_bytes, 82), 401);
        assert_eq!(i16_be(&thief_bytes, 98), 1201);
        assert_eq!(i16_be(&thief_bytes, 100), 4);
        assert_eq!(i16_be(&thief_bytes, 102), 12);
        assert_eq!(i16_be(&thief_bytes, 104), 3);
        assert_eq!(i16_be(&thief_bytes, 106), 55);
        assert_eq!(i16_be(&thief_bytes, 112), 10136);

        let timed = TimedEncounterRecord {
            id: 0,
            day: 35,
            increment: 5,
            percent: 50,
            door: 24,
            required_level: 8,
            required_random_rect: 17,
            required_x: -1,
            required_y: -1,
            required_item: 901,
            required_quest: 7,
            location_kind: "dungeon".to_string(),
            stuff: vec![2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            raw_bytes: vec![0; TIMED_ENCOUNTER_BYTES],
            authored: true,
            provenance: provenance("Data TD3", 0, 0, TIMED_ENCOUNTER_BYTES),
        };
        let timed_bytes = write_timed_encounters(&[timed]).unwrap();
        assert_eq!(i16_be(&timed_bytes, 0), 35);
        assert_eq!(i16_be(&timed_bytes, 2), 5);
        assert_eq!(i16_be(&timed_bytes, 4), 50);
        assert_eq!(i16_be(&timed_bytes, 6), 24);
        assert_eq!(i16_be(&timed_bytes, 8), 8);
        assert_eq!(i16_be(&timed_bytes, 10), 17);
        assert_eq!(i16_be(&timed_bytes, 12), -1);
        assert_eq!(i16_be(&timed_bytes, 16), 901);
        assert_eq!(i16_be(&timed_bytes, 18), 7);
        assert_eq!(i16_be(&timed_bytes, 20), 2);
    }
}
