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
pub const MAP_RECORD_BYTES: usize = 340;
pub const MAPSTATS_RECORD_BYTES: usize = 40;
pub const MAPSTATS_RECORDS: usize = 201;
pub const SPELL_BYTES: usize = 30;
pub const SPELL_OVERRIDE_RECORDS: usize = 105;
pub const RACE_BYTES: usize = 408;
pub const CASTE_BYTES: usize = 576;

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
    "Data MD2",
    "Data TD",
    "Global",
    "Data Spell",
    "Data Race",
    "Data Caste",
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
    "Data RI",
    "Data MENU",
    "Data Solids",
    "Data Spell",
    "Data Race",
    "Data Caste",
    "Data Custom 1 BD",
    "Data Custom 2 BD",
    "Data Custom 3 BD",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedScenario {
    pub maps: Vec<MapEntity>,
    pub map_records: Vec<MapRecord>,
    pub tile_attributes: Vec<TileAttributeProfile>,
    pub triggers: Vec<TriggerRecord>,
    pub random_levels: Vec<RandomLevel>,
    pub extracodes: Vec<ExtraCodeRow>,
    pub messages: Vec<MessageRecord>,
    pub battles: Vec<BattleRecord>,
    pub treasures: Vec<TreasureRecord>,
    pub shops: Vec<ShopRecord>,
    pub simple_encounters: Vec<SimpleEncounterRecord>,
    pub complex_encounters: Vec<ComplexEncounterRecord>,
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
    let mut random_levels = Vec::new();
    let mut triggers = Vec::new();
    let mut extracodes = Vec::new();
    let mut messages = Vec::new();
    let mut battles = Vec::new();
    let mut treasures = Vec::new();
    let mut shops = Vec::new();
    let mut simple_encounters = Vec::new();
    let mut complex_encounters = Vec::new();
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
        ("Data MD", 210),
        ("Data BD", BATTLE_BYTES),
        ("Data SD", SHOP_BYTES),
        ("Data SD2", MESSAGE_BYTES),
        ("Data MD2", MAP_RECORD_BYTES),
        ("Data TD", TREASURE_BYTES),
        ("Data TD2", 118),
        ("Data TD3", 40),
        ("Data CI", 4608),
        ("Data RI", 320),
        ("Global", 60),
        ("Data MENU", 502),
        ("Data Solids", 1024),
        ("Data Spell", SPELL_BYTES),
        ("Data Race", RACE_BYTES),
        ("Data Caste", CASTE_BYTES),
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
            tile_attributes.extend(parse_landlook_mapstats_data(
                buffer,
                landlook,
                file_name,
            ));
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
        map_records,
        tile_attributes,
        triggers,
        random_levels,
        extracodes,
        messages,
        battles,
        treasures,
        shops,
        simple_encounters,
        complex_encounters,
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
            solid_type: Some(*solid_type),
            movement_sound_id: None,
            movement_cost: None,
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

pub fn parse_landlook_mapstats_data(
    buffer: &[u8],
    landlook: i8,
    source: &str,
) -> Vec<TileAttributeProfile> {
    let count = (buffer.len() / MAPSTATS_RECORD_BYTES).min(MAPSTATS_RECORDS);
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
            let forest = i16_be(buffer, start + 16) != 0;
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
            if forest && !flags.contains(&TileAttributeFlag::Solid) {
                flags.push(TileAttributeFlag::Walkable);
            }
            TileAttributeProfile {
                tile: tile as i16,
                landlook: Some(landlook),
                solid_type: Some(solid as u8),
                movement_sound_id: Some(sound),
                movement_cost: Some(time),
                flags,
                confidence: TileAttributeConfidence::SourceBacked,
                source_kind: TileAttributeSourceKind::Mapstats,
                source: source.to_string(),
                raw_byte: None,
            }
        })
        .collect()
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

pub fn parse_map_records(buffer: &[u8]) -> Vec<MapRecord> {
    let count = buffer.len() / MAP_RECORD_BYTES;
    (0..count)
        .map(|id| {
            let start = id * MAP_RECORD_BYTES;
            let record = &buffer[start..start + MAP_RECORD_BYTES];
            MapRecord {
                id,
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
        authored: false,
        provenance: Some(provenance(source_file, 0, 0, buffer.len())),
    })
}

pub fn write_scenario_shell(shell: &ScenarioShell) -> Result<Vec<u8>> {
    let mut output = vec![0u8; 316 + shell.trailing_bytes.len()];
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
        pay_info: (7..12).map(|slot| pascal_record_string(buffer, slot)).collect(),
        titles: (12..17).map(|slot| pascal_record_string(buffer, slot)).collect(),
        description: pascal_record_string(buffer, 17),
        authored: false,
        provenance: Some(provenance("Data CI", 0, 0, 4608)),
    })
}

pub fn write_scenario_contact_info(contact: &ScenarioContactInfo) -> Result<Vec<u8>> {
    let mut output = vec![0u8; 4608];
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
            contact.pay_info.get(index).map(String::as_str).unwrap_or(""),
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
        authored: false,
        provenance: Some(provenance("Data RI", 0, 0, 320)),
    })
}

pub fn write_scenario_restrictions(restrictions: &ScenarioRestrictions) -> Result<Vec<u8>> {
    let mut output = vec![0u8; 320];
    encode_pascal_text(&mut output[0..256], &restrictions.description)?;
    write_i16_be(&mut output, 256, restrictions.max_party_characters);
    write_i16_be(&mut output, 258, restrictions.max_party_level);
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
                spellcasters: (0..4).map(|row| read_i16_vec(record, 84 + row * 6, 3)).collect(),
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
                victory: read_i16_vec(record, 264, 30),
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
        write_i16_vec(target, 0, record.special_ability.first().map(Vec::as_slice).unwrap_or(&[]), 14);
        write_i16_vec(target, 28, record.special_ability.get(1).map(Vec::as_slice).unwrap_or(&[]), 14);
        write_i16_vec(target, 56, &record.drv_bonus, 8);
        write_i16_vec(target, 72, &record.att_bonus, 6);
        for row in 0..4 {
            write_i16_vec(target, 84 + row * 6, record.spellcasters.get(row).map(Vec::as_slice).unwrap_or(&[]), 3);
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
        write_i16_vec(target, 264, &record.victory, 30);
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
        let profiles = parse_landlook_mapstats_data(&input, 0, "Data P BD");
        assert_eq!(profiles.len(), MAPSTATS_RECORDS);
        let tile = &profiles[1];
        assert_eq!(tile.landlook, Some(0));
        assert_eq!(tile.movement_sound_id, Some(9));
        assert_eq!(tile.movement_cost, Some(4));
        assert_eq!(tile.solid_type, Some(2));
        assert!(tile.flags.contains(&TileAttributeFlag::Solid));
        assert!(tile.flags.contains(&TileAttributeFlag::Shore));
        assert!(tile.flags.contains(&TileAttributeFlag::BoatRequired));
        assert!(tile.flags.contains(&TileAttributeFlag::Path));
        assert!(tile.flags.contains(&TileAttributeFlag::BlocksLos));
        assert!(tile.flags.contains(&TileAttributeFlag::FlyFloatRequired));
        assert!(matches!(tile.source_kind, TileAttributeSourceKind::Mapstats));
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

        let mut caste_input = vec![0u8; CASTE_BYTES];
        write_i16_be(&mut caste_input, 252, 2);
        write_i16_be(&mut caste_input, 384, 500);
        let mut castes = parse_caste_overrides(&caste_input);
        assert_eq!(castes[0].move_bonus, 2);
        assert_eq!(castes[0].start_money, 500);
        castes[0].authored = true;
        castes[0].start_money = 750;
        castes[0].start_items[0] = 42;
        let caste_output = write_caste_overrides(&castes).unwrap();
        assert_eq!(i16_be(&caste_output, 384), 750);
        assert_eq!(i16_be(&caste_output, 386), 42);
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
