use crate::project::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

mod action_points;
mod combat;
mod economy;
mod encounters;
mod landlooks;
mod maps;
mod record_bytes;
mod rules;
mod scenario;
mod text_records;

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
pub use landlooks::{
    parse_custom_landlook_metadata, parse_landlook_mapstats_data, parse_landlook_range_tail,
    update_custom_land_tile_attributes, update_custom_land_tile_combat_build,
    update_custom_landlook_base, update_custom_landlook_range_slot, write_custom_landlook_metadata,
    write_tile_solids, CustomLandTileAttributePatch, LANDLOOK_RANGE_SLOTS,
    LANDLOOK_RANGE_SLOT_BYTES, LANDLOOK_RANGE_TAIL_BYTES, MAPSTATS_RECORDS, MAPSTATS_RECORD_BYTES,
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
pub use text_records::{
    parse_messages, parse_option_labels, write_messages, write_option_labels, MESSAGE_BYTES,
    OPTION_LABEL_BYTES,
};

use landlooks::parse_tile_attributes;
use maps::attach_render_info;
pub use record_bytes::{i16_be, write_i16_be};
use record_bytes::{i32_be, provenance};

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
