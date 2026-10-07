use super::*;
use crate::codecs::{BATTLE_GRID_SLOTS, COMPLEX_ENCOUNTER_RECORD_BYTES, decode_complex_encounters};
use crate::model::{
    ActionPoint, AssetDescriptor, BattleRecord, BlobId, ClassicResourceKey, MapLevel,
    MapRuntimeMetadata, NativeRecordId, RandomRectangle, ScenarioMessage, SimpleEncounter,
    TerrainProfile,
};

pub(super) fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("trigger-programs".into()));
    for index in 0..=1 {
        snapshot.world.maps.push(MapLevel {
            identity: StableId(format!("land:{index}")),
            level_type: LevelType::Land,
            native_index: index,
            name: format!("Land {index}"),
            tiles: vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
            runtime: None,
        });
    }
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "controlled map runtime".into(),
        source_blob: None,
        dark: false,
        uses_los: false,
        landlook: Some(0),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: Some(0),
        random_rectangles: vec![RandomRectangle {
            identity: StableId("land:0:rect:0".into()),
            top: 0,
            left: 0,
            bottom: 1,
            right: 1,
            chance_ten_thousand: 0,
            battle_range: [0, 0],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        }],
    });
    add_placed_triggers(&mut snapshot);
    add_extra_codes(&mut snapshot);
    add_simple_encounter(&mut snapshot);

    snapshot
}

pub(super) fn branch_snapshot() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    snapshot.world.action_points[0].actions = [67, 72, 75, 78, 85]
        .into_iter()
        .enumerate()
        .map(|(slot, opcode)| ClassicAction {
            slot: slot as u8,
            raw_opcode: opcode,
            target_native_id: 10 + slot as i16,
        })
        .collect();
    snapshot.extra_codes.extend([
        ExtraCodeRow {
            native_id: NativeRecordId(10),
            values: [1, 0, 0, 0, 40],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(11),
            values: [0, 0, 0, 2, 0],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(12),
            values: [0, 0, 0, 0, 40],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(13),
            values: [0, 0, 1, 3, 3],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(14),
            values: [0, 40, 40, 0, 0],
        },
    ]);
    snapshot
        .item_rules
        .push(crate::rebuilt::items::item_rule_fixture(1));
    snapshot.complex_encounters.push(
        decode_complex_encounters(&vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0),
    );
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot
}

pub(super) fn text_asset(resource_type: &str, resource_id: i32) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(format!("text-resource:{resource_id}")),
        label: format!("Text Resource {resource_id}"),
        kind: "text-resource".into(),
        mime_type: Some("text/plain".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: resource_type.into(),
            resource_id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "4".repeat(64))),
        byte_length: 12,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("txt".into()),
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled TEXT resource".into(),
    }
}

pub(super) fn random_rectangle_snapshot() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "controlled random rectangle".into(),
        source_blob: None,
        dark: false,
        uses_los: false,
        landlook: Some(0),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: Some(0),
        random_rectangles: vec![RandomRectangle {
            identity: StableId("land:0:rect:0".into()),
            top: 1,
            left: 2,
            bottom: 3,
            right: 4,
            chance_ten_thousand: 2500,
            battle_range: [147, 145],
            random_doors: [40, -99, 0],
            random_door_percent: [25, 0, 0],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        }],
    });
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:147".into()),
        native_id: NativeRecordId(147),
        grid: vec![0; BATTLE_GRID_SLOTS],
        distance: 0,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    snapshot
}

pub(super) fn complex_result_snapshot(result: i16) -> ProjectSnapshot {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    let mut encounter = decode_complex_encounters(&vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES])
        .records
        .remove(0);
    encounter.actions.push(ClassicAction {
        slot: 0,
        raw_opcode: 44,
        target_native_id: result,
    });
    snapshot.complex_encounters.push(encounter);
    snapshot
}

pub(super) fn opcode_57_snapshot() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    for map in &mut snapshot.world.maps {
        map.runtime = Some(MapRuntimeMetadata {
            source: "controlled landlook runtime".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(2),
            base_scale: Some(1),
            tileset_id: StableId("classic.landlook.2".into()),
            base_tile: Some(4),
            random_rectangles: vec![RandomRectangle {
                identity: StableId(format!("{}:rect:0", map.identity.0)),
                top: 0,
                left: 0,
                bottom: 1,
                right: 1,
                chance_ten_thousand: 0,
                battle_range: [0, 0],
                random_doors: [0; 3],
                random_door_percent: [0; 3],
                only: false,
                option: 0,
                sound_id: 0,
                text_id: 0,
            }],
        });
    }
    let action = snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 4)
        .expect("replace direct action");
    action.raw_opcode = 57;
    action.target_native_id = 15;
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(15),
        values: [2, 1, 0, 0, 0],
    });
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:1".into()),
        native_id: NativeRecordId(1),
        grid: vec![0; BATTLE_GRID_SLOTS],
        distance: 0,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    snapshot.terrain_catalog.extend(
        (200..=400)
            .map(|tile| controlled_terrain_profile(tile, -1))
            .chain((0..=200).map(|tile| controlled_terrain_profile(tile, 2))),
    );
    snapshot
}

pub(super) fn controlled_terrain_profile(tile: i16, landlook: i8) -> TerrainProfile {
    TerrainProfile {
        source: format!("controlled mapstats landlook {landlook}"),
        source_blob: None,
        tile,
        landlook: Some(landlook),
        movement_sound_id: Some(tile),
        movement_cost: tile.max(0),
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[tile; 3]; 3],
    }
}

fn add_placed_triggers(snapshot: &mut ProjectSnapshot) {
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:5".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 5,
        classic_door_id: 702,
        coordinate: Some(MapCoordinate { x: 2, y: 7 }),
        post_action_level: 1,
        post_action_x: 8,
        post_action_y: 9,
        chance_percent: 75,
        actions: vec![
            ClassicAction {
                slot: 2,
                raw_opcode: 92,
                target_native_id: 8,
            },
            ClassicAction {
                slot: 0,
                raw_opcode: -4,
                target_native_id: 3,
            },
        ],
    });
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:inactive".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 6,
        classic_door_id: 703,
        coordinate: Some(MapCoordinate { x: 3, y: 7 }),
        post_action_level: 0,
        post_action_x: 3,
        post_action_y: 7,
        chance_percent: 0,
        actions: Vec::new(),
    });
}

fn add_extra_codes(snapshot: &mut ProjectSnapshot) {
    snapshot.extra_codes = vec![
        ExtraCodeRow {
            native_id: NativeRecordId(3),
            values: [30, 31, 32, 33, 34],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(8),
            values: [0, 0, 0, 83, 84],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(9),
            values: [90, 91, 92, 93, 94],
        },
    ];
}

fn add_simple_encounter(snapshot: &mut ProjectSnapshot) {
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Choose a response.".into(),
        authored: true,
    });
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: Vec::new(),
        choice_results: [1, 0, 0, 0],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: [
            "Continue".into(),
            String::new(),
            String::new(),
            String::new(),
        ],
        authored: true,
    });
}
