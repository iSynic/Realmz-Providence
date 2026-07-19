use super::action_points::{
    parse_door_file, parse_extracodes, parse_macro_file, DOOR_BYTES, DOOR_LEVEL_BYTES,
    EXTRACODE_BYTES,
};
use super::asset_catalog::build_asset_catalog;
use super::combat::{
    parse_battles, parse_monster_descriptions, parse_monster_set, parse_monsters, BATTLE_BYTES,
    MONSTER_BYTES, MONSTER_DESCRIPTION_BYTES,
};
use super::economy::{
    parse_scenario_items, parse_shops, parse_treasures, ITEM_BYTES, SHOP_BYTES, TREASURE_BYTES,
};
use super::encounters::{
    parse_complex_encounter_records, parse_simple_encounter_records, parse_thief_encounters,
    parse_timed_encounters, COMPLEX_ENCOUNTER_BYTES, SIMPLE_ENCOUNTER_BYTES, THIEF_ENCOUNTER_BYTES,
    TIMED_ENCOUNTER_BYTES,
};
use super::landlooks::{
    parse_custom_landlook_metadata, parse_landlook_mapstats_data, parse_tile_attributes,
};
use super::maps::{
    attach_render_info, parse_fields, parse_land_layout, parse_map_records, FIELD_BYTES,
    LAND_LAYOUT_BYTES, MAP_RECORD_BYTES,
};
use super::random_levels::{parse_random_levels, RANDLEVEL_BYTES};
use super::rules::{
    parse_caste_overrides, parse_race_overrides, parse_spell_overrides, CASTE_BYTES, RACE_BYTES,
    SPELL_BYTES,
};
use super::text_records::{parse_messages, parse_option_labels, MESSAGE_BYTES, OPTION_LABEL_BYTES};
use crate::project::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
        let mut alignment = alignment_for(name, buffers.get(name), record_bytes);
        if name == "Data SD" {
            if let Some(buffer) = buffers.get(name) {
                let shop_count = super::economy::shop_prefix_record_count(buffer);
                let preserved_records = alignment.count.saturating_sub(shop_count);
                if preserved_records > 0 {
                    alignment.count = shop_count;
                    diagnostics.push(Diagnostic {
                        severity: DiagnosticSeverity::Info,
                        code: "non-shop-data-suffix".to_string(),
                        message: format!(
                            "Data SD has {preserved_records} trailing full record(s) that do not match shop structure; Providence preserves them as non-shop source data"
                        ),
                        source: Some(name.to_string()),
                    });
                }
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alignment_reports_missing_aligned_and_trailing_sources() {
        let missing = alignment_for("Data SD2", None, MESSAGE_BYTES);
        assert!(matches!(missing.status, AlignmentStatus::Missing));
        assert_eq!(missing.count, 0);
        assert_eq!(missing.trailing_bytes, 0);

        let aligned_bytes = vec![0; MESSAGE_BYTES * 2];
        let aligned = alignment_for("Data SD2", Some(&aligned_bytes), MESSAGE_BYTES);
        assert!(matches!(aligned.status, AlignmentStatus::Aligned));
        assert_eq!(aligned.count, 2);
        assert_eq!(aligned.trailing_bytes, 0);

        let trailing_bytes = vec![0; MESSAGE_BYTES + 3];
        let trailing = alignment_for("Data SD2", Some(&trailing_bytes), MESSAGE_BYTES);
        assert!(matches!(trailing.status, AlignmentStatus::HasTrailingBytes));
        assert_eq!(trailing.count, 1);
        assert_eq!(trailing.trailing_bytes, 3);
    }

    #[test]
    fn scenario_assembly_preserves_alignment_diagnostics() {
        let mut buffers = BTreeMap::new();
        buffers.insert("Data SD2".to_string(), vec![0; MESSAGE_BYTES + 1]);

        let parsed = parse_scenario_buffers(&buffers);
        let alignment = parsed
            .records
            .alignments
            .iter()
            .find(|alignment| alignment.source == "Data SD2")
            .expect("Data SD2 alignment");

        assert_eq!(parsed.messages.len(), 1);
        assert_eq!(parsed.records.counts.get("Data SD2"), Some(&1));
        assert_eq!(alignment.trailing_bytes, 1);
        assert!(matches!(
            alignment.status,
            AlignmentStatus::HasTrailingBytes
        ));
        assert!(parsed.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == "trailing-bytes" && diagnostic.source.as_deref() == Some("Data SD2")
        }));
    }
}
