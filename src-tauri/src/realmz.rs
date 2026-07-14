use crate::error::Result;
use crate::project::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

mod action_points;
mod combat;
mod economy;
mod encounters;
mod maps;
mod record_bytes;
mod rules;
mod scenario;

pub use action_points::{
    parse_door_file, parse_extracodes, parse_macro_file, write_door_file,
    write_door_file_for_levels, write_extracodes, write_macro_file, DOORS_PER_LEVEL, DOOR_BYTES,
    DOOR_LEVEL_BYTES, EXTRACODE_BYTES,
};
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
pub use maps::{
    parse_fields, parse_land_layout, parse_map_records, parse_random_levels, write_fields,
    write_land_layout, write_map_records, write_random_levels, FIELD_BYTES, LAND_LAYOUT_BYTES,
    LAND_LAYOUT_COLS, LAND_LAYOUT_ROWS, MAP_RECORD_BYTES, MAP_RECORD_MARKERS,
    MAP_RECORD_MARKER_BYTES, RANDLEVEL_BYTES,
};
pub use rules::{
    parse_caste_overrides, parse_race_overrides, parse_spell_overrides, write_caste_overrides,
    write_race_overrides, write_spell_overrides, CASTE_BYTES, RACE_BYTES, SPELL_BYTES,
    SPELL_OVERRIDE_RECORDS,
};
pub use scenario::{
    parse_global_macro_hooks, parse_scenario_contact_info, parse_scenario_restrictions,
    parse_scenario_shell, parse_scenario_support_file, write_global_macro_hooks,
    write_scenario_contact_info, write_scenario_restrictions, write_scenario_shell,
    write_scenario_support_file,
};

use maps::attach_render_info;
use record_bytes::{
    copy_raw, decode_pascal_text, encode_pascal_text, i32_be, parse_fixed_records, preserve_raw,
    provenance, write_fixed_records,
};
pub use record_bytes::{i16_be, write_i16_be};

pub const MESSAGE_BYTES: usize = 256;
pub const OPTION_LABEL_BYTES: usize = 25;
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
