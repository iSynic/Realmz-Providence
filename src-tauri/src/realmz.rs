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
pub const LAND_LAYOUT_ROWS: usize = 8;
pub const LAND_LAYOUT_COLS: usize = 16;
pub const LAND_LAYOUT_BYTES: usize = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS * 2;
pub const SIMPLE_ENCOUNTER_BYTES: usize = 426;
pub const COMPLEX_ENCOUNTER_BYTES: usize = 520;
pub const TIMED_ENCOUNTER_BYTES: usize = 40;
pub const BATTLE_BYTES: usize = 346;
pub const MONSTER_BYTES: usize = 210;
pub const MONSTER_DESCRIPTION_BYTES: usize = 256;
pub const SHOP_BYTES: usize = 3002;
pub const MESSAGE_BYTES: usize = 256;
pub const OPTION_LABEL_BYTES: usize = 25;
pub const TREASURE_BYTES: usize = 48;
pub const MAP_RECORD_BYTES: usize = 340;
pub const MAP_RECORD_MARKERS: usize = 10;
pub const MAP_RECORD_MARKER_BYTES: usize = 6;
pub const MAPSTATS_RECORD_BYTES: usize = 40;
pub const MAPSTATS_RECORDS: usize = 201;
pub const LANDLOOK_RANGE_TAIL_BYTES: usize = 60;
pub const LANDLOOK_RANGE_SLOT_BYTES: usize = 6;
pub const LANDLOOK_RANGE_SLOTS: usize = LANDLOOK_RANGE_TAIL_BYTES / LANDLOOK_RANGE_SLOT_BYTES;
pub const ITEM_BYTES: usize = 100;
pub const SPELL_BYTES: usize = 30;
pub const SPELL_OVERRIDE_RECORDS: usize = 105;
pub const RACE_BYTES: usize = 408;
pub const CASTE_BYTES: usize = 576;
pub const THIEF_ENCOUNTER_BYTES: usize = 118;

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
                raw_bytes: record.to_vec(),
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
        if record.raw_bytes.len() == SPELL_BYTES {
            output[start..start + SPELL_BYTES].copy_from_slice(&record.raw_bytes);
        }
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
        output[start + 28] = if record.in_combat { 1 } else { 0 };
        output[start + 29] = if record.in_camp { 1 } else { 0 };
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
                raw_bytes: record.to_vec(),
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
        let start = record.id * RACE_BYTES;
        let target = &mut output[start..start + RACE_BYTES];
        if record.raw_bytes.len() == RACE_BYTES {
            target.copy_from_slice(&record.raw_bytes);
        }
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
                raw_bytes: record.to_vec(),
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
        let start = record.id * CASTE_BYTES;
        let target = &mut output[start..start + CASTE_BYTES];
        if record.raw_bytes.len() == CASTE_BYTES {
            target.copy_from_slice(&record.raw_bytes);
        }
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

pub fn parse_scenario_items(buffer: &[u8]) -> Vec<ScenarioItemRecord> {
    parse_fixed_records(buffer, ITEM_BYTES)
        .map(|(id, start, record)| {
            let stored_item_id = i16_be(record, 2);
            ScenarioItemRecord {
                id,
                item_id: if stored_item_id != 0 {
                    stored_item_id
                } else {
                    800 + id as i16
                },
                icon_id: i16_be(record, 4),
                item_type: i16_be(record, 6),
                st: i16_be(record, 0),
                blunt: i16_be(record, 8),
                hands: i16_be(record, 10),
                lu: i16_be(record, 12),
                movement: i16_be(record, 14),
                ac: i16_be(record, 16),
                magic_resistance: i16_be(record, 18),
                damage: i16_be(record, 20),
                spell_points: i16_be(record, 22),
                sound: i16_be(record, 24),
                weight: i16_be(record, 26),
                cost: i16_be(record, 28),
                charge: i16_be(record, 30),
                cursed_item_id: i16_be(record, 32),
                magical: i16_be(record, 34),
                item_cat0: i32_be(record, 36),
                item_cat1: i32_be(record, 40),
                race_restrictions: i16_be(record, 44),
                caste_restrictions: i16_be(record, 46),
                specific_race: i16_be(record, 48),
                specific_caste: i16_be(record, 50),
                race_class_only: i16_be(record, 52),
                caste_class_only: i16_be(record, 54),
                spare2: (0..7).map(|index| i16_be(record, 56 + index * 2)).collect(),
                v_small: i16_be(record, 70),
                v_large: i16_be(record, 72),
                heat: i16_be(record, 74),
                cold: i16_be(record, 76),
                electric: i16_be(record, 78),
                vs_undead: i16_be(record, 80),
                vs_demon_devil: i16_be(record, 82),
                vs_evil: i16_be(record, 84),
                special1: i16_be(record, 86),
                special2: i16_be(record, 88),
                special3: i16_be(record, 90),
                special4: i16_be(record, 92),
                special5: i16_be(record, 94),
                weight_per_charge: i16_be(record, 96),
                drop_on_empty: i16_be(record, 98),
                raw_bytes: record.to_vec(),
                authored: false,
                provenance: provenance("Data NI", id, start, ITEM_BYTES),
            }
        })
        .collect()
}

pub fn write_scenario_items(records: &[ScenarioItemRecord]) -> Result<Vec<u8>> {
    write_fixed_records(records, ITEM_BYTES, |record, buffer| {
        copy_raw(buffer, &record.raw_bytes);
        if preserve_raw(record.authored, &record.raw_bytes, ITEM_BYTES) {
            return Ok(());
        }
        write_i16_be(buffer, 0, record.st);
        write_i16_be(buffer, 2, record.item_id);
        write_i16_be(buffer, 4, record.icon_id);
        write_i16_be(buffer, 6, record.item_type);
        write_i16_be(buffer, 8, record.blunt);
        write_i16_be(buffer, 10, record.hands);
        write_i16_be(buffer, 12, record.lu);
        write_i16_be(buffer, 14, record.movement);
        write_i16_be(buffer, 16, record.ac);
        write_i16_be(buffer, 18, record.magic_resistance);
        write_i16_be(buffer, 20, record.damage);
        write_i16_be(buffer, 22, record.spell_points);
        write_i16_be(buffer, 24, record.sound);
        write_i16_be(buffer, 26, record.weight);
        write_i16_be(buffer, 28, record.cost);
        write_i16_be(buffer, 30, record.charge);
        write_i16_be(buffer, 32, record.cursed_item_id);
        write_i16_be(buffer, 34, record.magical);
        write_i32_be(buffer, 36, record.item_cat0);
        write_i32_be(buffer, 40, record.item_cat1);
        write_i16_be(buffer, 44, record.race_restrictions);
        write_i16_be(buffer, 46, record.caste_restrictions);
        write_i16_be(buffer, 48, record.specific_race);
        write_i16_be(buffer, 50, record.specific_caste);
        write_i16_be(buffer, 52, record.race_class_only);
        write_i16_be(buffer, 54, record.caste_class_only);
        write_i16_array(buffer, 56, &record.spare2, 7);
        write_i16_be(buffer, 70, record.v_small);
        write_i16_be(buffer, 72, record.v_large);
        write_i16_be(buffer, 74, record.heat);
        write_i16_be(buffer, 76, record.cold);
        write_i16_be(buffer, 78, record.electric);
        write_i16_be(buffer, 80, record.vs_undead);
        write_i16_be(buffer, 82, record.vs_demon_devil);
        write_i16_be(buffer, 84, record.vs_evil);
        write_i16_be(buffer, 86, record.special1);
        write_i16_be(buffer, 88, record.special2);
        write_i16_be(buffer, 90, record.special3);
        write_i16_be(buffer, 92, record.special4);
        write_i16_be(buffer, 94, record.special5);
        write_i16_be(buffer, 96, record.weight_per_charge);
        write_i16_be(buffer, 98, record.drop_on_empty);
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
            write_i16_be(buffer, 106 + slot * 2, record.spell_ids.get(slot).copied().unwrap_or(0));
        }
        write_i8_array(buffer, 126, &record.spell_results, 10);
        for slot in 0..5 {
            write_i16_be(buffer, 136 + slot * 2, record.item_ids.get(slot).copied().unwrap_or(0));
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
impl IndexedRecord for OptionLabelRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for BattleRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for MonsterRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for MonsterDescriptionRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for ScenarioItemRecord {
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
impl IndexedRecord for ThiefEncounterRecord {
    fn record_id(&self) -> usize {
        self.id
    }
}
impl IndexedRecord for TimedEncounterRecord {
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

fn signed_bytes(buffer: &[u8]) -> Vec<i8> {
    buffer.iter().map(|value| *value as i8).collect()
}

fn fallback_i8(value: i8, values: &[u8], index: usize) -> i8 {
    if value != 0 {
        value
    } else {
        values.get(index).copied().unwrap_or(0) as i8
    }
}

fn read_i16_array(buffer: &[u8], offset: usize, count: usize) -> Vec<i16> {
    (0..count)
        .map(|index| i16_be(buffer, offset + index * 2))
        .collect()
}

fn write_i8_array(buffer: &mut [u8], offset: usize, values: &[i8], count: usize) {
    for index in 0..count {
        buffer[offset + index] = values.get(index).copied().unwrap_or(0) as u8;
    }
}

fn write_i16_array(buffer: &mut [u8], offset: usize, values: &[i16], count: usize) {
    for index in 0..count {
        write_i16_be(buffer, offset + index * 2, *values.get(index).unwrap_or(&0));
    }
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

fn encode_fixed_text(buffer: &mut [u8], text: &str) -> Result<()> {
    let bytes = classic_text_bytes(text);
    if bytes.len() > buffer.len() {
        return Err(ProvidenceError::message(format!(
            "Classic fixed text is {} byte(s); maximum is {}",
            bytes.len(),
            buffer.len()
        )));
    }
    buffer.fill(0);
    buffer[..bytes.len()].copy_from_slice(&bytes);
    Ok(())
}

fn pascal_record_string(buffer: &[u8], slot: usize) -> String {
    let start = slot * 256;
    let end = (start + 256).min(buffer.len());
    if start >= end {
        return String::new();
    }
    decode_pascal_text(&buffer[start..end])
}

fn copy_fixed_bytes(dest: &mut [u8], source: &[u8]) {
    dest.fill(0);
    let len = dest.len().min(source.len());
    dest[..len].copy_from_slice(&source[..len]);
}

fn read_i16_vec(buffer: &[u8], offset: usize, count: usize) -> Vec<i16> {
    (0..count)
        .map(|index| i16_be(buffer, offset + index * 2))
        .collect()
}

fn write_i16_vec(buffer: &mut [u8], offset: usize, values: &[i16], count: usize) {
    for index in 0..count {
        write_i16_be(buffer, offset + index * 2, *values.get(index).unwrap_or(&0));
    }
}

fn read_i32_vec(buffer: &[u8], offset: usize, count: usize) -> Vec<i32> {
    (0..count)
        .map(|index| i32_be(buffer, offset + index * 4))
        .collect()
}

fn write_i32_vec(buffer: &mut [u8], offset: usize, values: &[i32], count: usize) {
    for index in 0..count {
        write_i32_be(buffer, offset + index * 4, *values.get(index).unwrap_or(&0));
    }
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

        let mut description_input = vec![0u8; MONSTER_DESCRIPTION_BYTES * 2];
        description_input[0] = 1;
        description_input[1] = b'X';
        let description_start = MONSTER_DESCRIPTION_BYTES;
        let mut descriptions = parse_monster_descriptions(&description_input);
        descriptions[1].authored = true;
        descriptions[1].text = "No".to_string();
        let description_output = write_monster_descriptions(&descriptions).unwrap();
        assert_eq!(description_output.len(), description_input.len());
        assert_eq!(
            changed_offsets(&description_input, &description_output),
            vec![
                description_start,
                description_start + 1,
                description_start + 2
            ]
        );
    }

    #[test]
    fn fixed_record_target_writers_mutate_only_owned_fields() {
        let mut treasure_input = vec![0u8; TREASURE_BYTES * 2];
        let treasure_start = TREASURE_BYTES;
        write_i16_be(&mut treasure_input, treasure_start + 40, 0x0102);
        let mut treasures = parse_treasures(&treasure_input);
        treasures[1].authored = true;
        treasures[1].exp = 0x0304;
        let treasure_output = write_treasures(&treasures).unwrap();
        assert_eq!(treasure_output.len(), treasure_input.len());
        assert_eq!(
            changed_offsets(&treasure_input, &treasure_output),
            vec![treasure_start + 40, treasure_start + 41]
        );

        let mut battle_input = vec![0u8; BATTLE_BYTES * 2];
        let battle_start = BATTLE_BYTES;
        let battle_grid_slot = 12;
        write_i16_be(
            &mut battle_input,
            battle_start + battle_grid_slot * 2,
            0x0102,
        );
        let mut battles = parse_battles(&battle_input);
        battles[1].authored = true;
        battles[1].grid[battle_grid_slot] = 0x0304;
        let battle_output = write_battles(&battles).unwrap();
        assert_eq!(battle_output.len(), battle_input.len());
        assert_eq!(
            changed_offsets(&battle_input, &battle_output),
            vec![
                battle_start + battle_grid_slot * 2,
                battle_start + battle_grid_slot * 2 + 1
            ]
        );

        let mut timed_input = vec![0u8; TIMED_ENCOUNTER_BYTES * 2];
        let timed_start = TIMED_ENCOUNTER_BYTES;
        write_i16_be(&mut timed_input, timed_start + 16, 0x0102);
        let mut timed_encounters = parse_timed_encounters(&timed_input);
        timed_encounters[1].authored = true;
        timed_encounters[1].required_item = 0x0304;
        let timed_output = write_timed_encounters(&timed_encounters).unwrap();
        assert_eq!(timed_output.len(), timed_input.len());
        assert_eq!(
            changed_offsets(&timed_input, &timed_output),
            vec![timed_start + 16, timed_start + 17]
        );
    }

    #[test]
    fn shop_storage_mutates_only_owned_fields() {
        let input = vec![0u8; SHOP_BYTES * 2];
        let shop_start = SHOP_BYTES;

        let mut shops = parse_shops(&input);
        shops[1].authored = true;
        shops[1].item_ids[10] = 0x0304;
        shops[1].quantities[11] = 9;
        shops[1].inflation = 0x0506;

        let output = write_shops(&shops).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                shop_start + 20,
                shop_start + 21,
                shop_start + 2000 + 11,
                shop_start + 3000,
                shop_start + 3001,
            ]
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
        let cases: [(usize, fn(&[u8]) -> Vec<u8>); 12] = [
            (MESSAGE_BYTES, |bytes| {
                write_messages(&parse_messages(bytes)).unwrap()
            }),
            (OPTION_LABEL_BYTES, |bytes| {
                write_option_labels(&parse_option_labels(bytes)).unwrap()
            }),
            (MONSTER_DESCRIPTION_BYTES, |bytes| {
                write_monster_descriptions(&parse_monster_descriptions(bytes)).unwrap()
            }),
            (BATTLE_BYTES, |bytes| {
                write_battles(&parse_battles(bytes)).unwrap()
            }),
            (MONSTER_BYTES, |bytes| {
                write_monsters(&parse_monsters(bytes)).unwrap()
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
    fn scenario_item_storage_mutates_only_modeled_fields_and_preserves_gap() {
        let mut input = vec![0u8; ITEM_BYTES * 2];
        let item_start = ITEM_BYTES;
        write_i16_be(&mut input, item_start + 2, 0x0102);
        for offset in 56..70 {
            input[item_start + offset] = 0xA5;
        }

        let mut items = parse_scenario_items(&input);
        assert_eq!(items[1].spare2, vec![-23131; 7]);
        items[1].authored = true;
        items[1].item_id = 0x0304;
        items[1].damage = 0x0506;
        items[1].item_cat0 = 0x01020304;
        items[1].v_small = 0x0708;

        let output = write_scenario_items(&items).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            &output[item_start + 56..item_start + 70],
            &input[item_start + 56..item_start + 70]
        );
        assert_eq!(i16_be(&output, item_start + 2), 0x0304);
        assert_eq!(i16_be(&output, item_start + 20), 0x0506);
        assert_eq!(i32_be(&output, item_start + 36), 0x01020304);
        assert_eq!(i16_be(&output, item_start + 70), 0x0708);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                item_start + 2,
                item_start + 3,
                item_start + 20,
                item_start + 21,
                item_start + 36,
                item_start + 37,
                item_start + 38,
                item_start + 39,
                item_start + 70,
                item_start + 71,
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
