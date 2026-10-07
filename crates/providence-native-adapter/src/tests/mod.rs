use providence_core::codecs::decode_available_string_list_resource;
use providence_core::model::ProjectOrigin;
use providence_core::rebuilt::RebuiltV3ReachableRuntimeSelection;
use serde_json::Value;
use serde_json::json;
use std::io::Cursor;
use tempfile::tempdir;

#[path = "preview_package_tests.rs"]
mod preview_package_tests;
#[path = "ui_contract_tests.rs"]
mod ui_contract_tests;
#[path = "world_route_projection_tests.rs"]
mod world_route_projection_tests;

mod action_document_safety;
mod action_documents;
mod battle_authoring;
mod battle_import;
mod classic_rule_selection;
mod dungeon_import;
mod durable_acknowledgement;
mod economy_import;
mod encounter_import;
mod extra_code_repairs;
mod global_macro_authoring;
mod icon_import;
mod import_repair;
mod item_drafts;
mod item_import;
mod item_stock;
mod labels;
mod land_import;
mod land_layout_review;
mod level_settings;
mod map_catalog_paging;
mod map_lifecycle;
mod map_rendering;
mod media_authoring;
mod media_import;
mod media_readiness;
mod monster_appearance;
mod monster_drafts;
mod monster_import;
mod monster_library;
mod monster_library_authoring;
mod monster_library_defaults;
mod picture_import;
mod player_map_authoring;
mod player_map_import;
mod project_history;
mod publication;
mod random_regions;
mod reachability;
mod readiness;
mod rebuilt_encounters;
mod reference_libraries;
mod rule_authoring;
mod rule_import;
mod rule_view_source;
mod scenario_authoring;
mod scenario_metadata;
mod scenario_preflight;
mod shop_browsing;
mod sound_import;
mod spell_authoring;
mod spell_catalog_filters;
mod spell_import;
mod startup_timing;
mod text_authoring;
mod text_catalogs;
mod transport;
mod world_metadata;

fn empty_runtime_selection() -> RebuiltV3ReachableRuntimeSelection {
    RebuiltV3ReachableRuntimeSelection {
        reachable_program_ids: Vec::new(),
        reachable_simple_encounter_ids: Vec::new(),
        reachable_complex_encounter_ids: Vec::new(),
        reachable_rogue_encounter_ids: Vec::new(),
        reachable_message_ids: Vec::new(),
        reachable_treasure_ids: Vec::new(),
        reachable_shop_ids: Vec::new(),
        reachable_text_resource_ids: Vec::new(),
        reachable_style_resource_ids: Vec::new(),
        message_references: Vec::new(),
        catalog_references: Vec::new(),
        deferred_references: Vec::new(),
        item_spells: providence_core::rebuilt::RebuiltV3ReachableItemSpellSelection {
            portable_standard_item_count: 0,
            portable_standard_spell_count: 0,
            reachable_scenario_item_ids: Vec::new(),
            reachable_scenario_spell_ids: Vec::new(),
            references: Vec::new(),
            items: Vec::new(),
            spells: Vec::new(),
        },
        messages: Vec::new(),
        timed_encounters: Vec::new(),
        excluded_timed_encounter_ids: Vec::new(),
        treasures: Vec::new(),
        shops: Vec::new(),
        scenario: empty_runtime_scenario(),
        simple_encounters: Vec::new(),
        complex_encounters: Vec::new(),
        rogue_encounters: Vec::new(),
        combat: providence_core::rebuilt::RebuiltV3ReachableCombatSelection {
            reachable_battle_ids: Vec::new(),
            reachable_monster_ids: Vec::new(),
            battles: Vec::new(),
            monsters: Vec::new(),
            monster_sets: Vec::new(),
            monster_descriptions: Vec::new(),
        },
        assets: providence_core::rebuilt::RebuiltV3AssetIndex {
            kind: "realmz2.asset-index".into(),
            schema_version: 3,
            assets: Vec::new(),
        },
    }
}

fn empty_runtime_scenario() -> providence_core::rebuilt::RebuiltV3ScenarioDocument {
    providence_core::rebuilt::RebuiltV3ScenarioDocument {
        kind: "realmz2.scenario".into(),
        schema_version: 3,
        application_hooks: providence_core::rebuilt::RebuiltV3ApplicationHooks {
            start_game: None,
            party_death: None,
            end_adventure: None,
            shop: None,
            temple: None,
        },
        programs: Vec::new(),
        scenario_actions: [],
        state_definitions: [],
        migrations: [],
        extra_code_tail: None,
    }
}

fn terrain_profile_json(tile: i16, boat_requirement: i16) -> Value {
    json!({
        "source": "synthetic mapstats fixture",
        "sourceBlob": null,
        "tile": tile,
        "landlook": 0,
        "movementSoundId": 82,
        "movementCost": 3,
        "solidType": 0,
        "walkable": true,
        "shore": false,
        "boatRequirement": boat_requirement,
        "path": false,
        "blocksLos": false,
        "flyFloat": false,
        "forestType": 0,
        "combatBuild": [[tile, tile, tile], [tile, tile, tile], [tile, tile, tile]]
    })
}

fn wav_pcm16_stereo(sample_rate: u32, frames: &[(i16, i16)]) -> Vec<u8> {
    let data_bytes = frames.len() * 4;
    let mut wav = Vec::with_capacity(44 + data_bytes);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36u32 + data_bytes as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&(sample_rate * 4).to_le_bytes());
    wav.extend_from_slice(&4u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data_bytes as u32).to_le_bytes());
    for (left, right) in frames {
        wav.extend_from_slice(&left.to_le_bytes());
        wav.extend_from_slice(&right.to_le_bytes());
    }
    wav
}

fn custom_names_resource(races: &[String], castes: &[String]) -> Vec<u8> {
    fn string_list(names: &[String]) -> Vec<u8> {
        let mut output = Vec::new();
        output.extend_from_slice(&(names.len() as u16).to_be_bytes());
        for name in names {
            output.push(name.len() as u8);
            output.extend_from_slice(name.as_bytes());
        }
        output
    }
    let race_data = string_list(races);
    let caste_data = string_list(castes);
    let mut data = Vec::new();
    data.extend_from_slice(&(race_data.len() as u32).to_be_bytes());
    data.extend_from_slice(&race_data);
    let caste_offset = data.len();
    data.extend_from_slice(&(caste_data.len() as u32).to_be_bytes());
    data.extend_from_slice(&caste_data);
    let data_offset = 16usize;
    let map_offset = data_offset + data.len();
    let mut map = vec![0; 28];
    map[24..26].copy_from_slice(&28u16.to_be_bytes());
    map[26..28].copy_from_slice(&62u16.to_be_bytes());
    map.extend_from_slice(&0u16.to_be_bytes());
    map.extend_from_slice(b"STR#");
    map.extend_from_slice(&1u16.to_be_bytes());
    map.extend_from_slice(&10u16.to_be_bytes());
    for (id, offset) in [(129i16, 0usize), (131i16, caste_offset)] {
        map.extend_from_slice(&id.to_be_bytes());
        map.extend_from_slice(&(-1i16).to_be_bytes());
        map.push(0);
        map.extend_from_slice(&[
            ((offset >> 16) & 0xff) as u8,
            ((offset >> 8) & 0xff) as u8,
            (offset & 0xff) as u8,
        ]);
        map.extend_from_slice(&0u32.to_be_bytes());
    }
    let mut output = Vec::new();
    output.extend_from_slice(&(data_offset as u32).to_be_bytes());
    output.extend_from_slice(&(map_offset as u32).to_be_bytes());
    output.extend_from_slice(&(data.len() as u32).to_be_bytes());
    output.extend_from_slice(&(map.len() as u32).to_be_bytes());
    output.extend_from_slice(&data);
    output.extend_from_slice(&map);
    output
}

fn standard_item_text_resource(truncated_resource: Option<i16>) -> Vec<u8> {
    let mut resources = Vec::new();
    for base in [0i16, 200, 400, 600] {
        for offset in 0..=2i16 {
            let resource_id = base + offset;
            let strings = (0..200)
                .map(|index| match offset {
                    0 => format!("Unknown {}", i32::from(base) + index),
                    1 => format!("Item {}", i32::from(base) + index),
                    _ => format!("Description {}", i32::from(base) + index),
                })
                .collect::<Vec<_>>();
            let mut resource = Vec::new();
            let declared = if truncated_resource == Some(resource_id) {
                strings.len() + 1
            } else {
                strings.len()
            };
            resource.extend_from_slice(&(declared as u16).to_be_bytes());
            for string in strings {
                resource.push(string.len() as u8);
                resource.extend_from_slice(string.as_bytes());
            }
            resources.push((resource_id, resource));
        }
    }
    resource_fork(&resources)
}

fn scenario_item_text_resource() -> Vec<u8> {
    let resources = (0..=2i16)
        .map(|offset| {
            let strings = (0..200)
                .map(|index| match offset {
                    0 => format!("Unknown {}", 800 + index),
                    1 => format!("Scenario Item {}", 800 + index),
                    _ => format!("Scenario description {}", 800 + index),
                })
                .collect::<Vec<_>>();
            let mut payload = Vec::new();
            payload.extend_from_slice(&200u16.to_be_bytes());
            for string in strings {
                payload.push(string.len() as u8);
                payload.extend_from_slice(string.as_bytes());
            }
            (800 + offset, payload)
        })
        .collect::<Vec<_>>();
    resource_fork(&resources)
}

fn resource_fork(resources: &[(i16, Vec<u8>)]) -> Vec<u8> {
    let mut data = Vec::new();
    let mut offsets = Vec::new();
    for (_, resource) in resources {
        offsets.push(data.len());
        data.extend_from_slice(&(resource.len() as u32).to_be_bytes());
        data.extend_from_slice(resource);
    }
    let data_offset = 16usize;
    let map_offset = data_offset + data.len();
    let type_list_length = 10 + resources.len() * 12;
    let mut map = vec![0; 28];
    map[24..26].copy_from_slice(&28u16.to_be_bytes());
    map[26..28].copy_from_slice(&(28 + type_list_length as u16).to_be_bytes());
    map.extend_from_slice(&0u16.to_be_bytes());
    map.extend_from_slice(b"STR#");
    map.extend_from_slice(&((resources.len() - 1) as u16).to_be_bytes());
    map.extend_from_slice(&10u16.to_be_bytes());
    for ((id, _), offset) in resources.iter().zip(offsets) {
        map.extend_from_slice(&id.to_be_bytes());
        map.extend_from_slice(&(-1i16).to_be_bytes());
        map.push(0);
        map.extend_from_slice(&[
            ((offset >> 16) & 0xff) as u8,
            ((offset >> 8) & 0xff) as u8,
            (offset & 0xff) as u8,
        ]);
        map.extend_from_slice(&0u32.to_be_bytes());
    }
    let mut output = Vec::new();
    output.extend_from_slice(&(data_offset as u32).to_be_bytes());
    output.extend_from_slice(&(map_offset as u32).to_be_bytes());
    output.extend_from_slice(&(data.len() as u32).to_be_bytes());
    output.extend_from_slice(&(map.len() as u32).to_be_bytes());
    output.extend_from_slice(&data);
    output.extend_from_slice(&map);
    output
}
