use providence_core::codecs::decode_scenario_item_rules;
use providence_core::model::ActionPoint;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::ClassicAction;
use providence_core::model::ExtraActionPoint;
use providence_core::model::ExtraCodeRow;
use providence_core::model::LevelType;
use providence_core::model::MapCoordinate;
use providence_core::model::MapLevel;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::ScenarioMessage;
use providence_core::model::SimpleEncounter;
use providence_core::model::StableId;
use providence_core::model::WorldModel;

pub(crate) fn demo_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("ashen-crown".into()));
    snapshot.extra_codes = vec![
        ExtraCodeRow {
            native_id: NativeRecordId(311),
            values: [3, 4, 0, -25, 2],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(312),
            values: [12, 8, 24, 18, 0],
        },
    ];
    snapshot.extra_action_points = demo_extra_action_points();
    snapshot.messages = demo_messages();
    snapshot.world = demo_world();
    snapshot.simple_encounters = demo_simple_encounters();
    snapshot
}

fn demo_extra_action_points() -> Vec<ExtraActionPoint> {
    vec![ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 47,
            },
            ClassicAction {
                slot: 1,
                raw_opcode: 39,
                target_native_id: 40,
            },
            ClassicAction {
                slot: 2,
                raw_opcode: 92,
                target_native_id: 311,
            },
        ],
    }]
}

fn demo_messages() -> Vec<ScenarioMessage> {
    vec![
        ScenarioMessage {
            identity: StableId("message:12".into()),
            native_id: NativeRecordId(12),
            text: "The western gate is sealed until moonrise.".into(),
            authored: true,
        },
        ScenarioMessage {
            identity: StableId("message:47".into()),
            native_id: NativeRecordId(47),
            text: "Captain Veyra lowers her voice: the reliquary is empty.".into(),
            authored: true,
        },
        ScenarioMessage {
            identity: StableId("message:103".into()),
            native_id: NativeRecordId(103),
            text: "A cold draft carries the scent of salt and old iron.".into(),
            authored: true,
        },
    ]
}

fn demo_simple_encounters() -> Vec<SimpleEncounter> {
    vec![SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 47,
        }],
        choice_results: [1, 0, 0, 0],
        can_back_out: true,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 12,
        texts: ["Continue".into(), "".into(), "".into(), "".into()],
        authored: true,
    }]
}

fn demo_world() -> WorldModel {
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    for y in 0..CLASSIC_MAP_SIZE {
        for x in 0..CLASSIC_MAP_SIZE {
            tiles[y * CLASSIC_MAP_SIZE + x] = if (x + y) % 11 == 0 { 7 } else { 3 };
        }
    }
    WorldModel {
        maps: vec![MapLevel {
            identity: StableId("land:0".into()),
            level_type: LevelType::Land,
            native_index: 0,
            name: "Thornwatch Coast".into(),
            tiles,
            runtime: None,
        }],
        action_points: vec![ActionPoint {
            identity: StableId("action-point:land:0:17".into()),
            level_type: LevelType::Land,
            level_index: 0,
            record_index: 17,
            classic_door_id: 2318,
            coordinate: Some(MapCoordinate { x: 18, y: 23 }),
            post_action_level: 0,
            post_action_x: 18,
            post_action_y: 23,
            chance_percent: 100,
            actions: vec![
                ClassicAction {
                    slot: 0,
                    raw_opcode: 1,
                    target_native_id: 999,
                },
                ClassicAction {
                    slot: 1,
                    raw_opcode: 4,
                    target_native_id: 3,
                },
            ],
        }],
        land_layout: None,
        player_maps: Vec::new(),
        special_land_solidity: None,
    }
}

pub(crate) fn demo_scenario_items() -> Vec<providence_core::model::SourcedScenarioItemRule> {
    let source = vec![0u8; providence_core::codecs::ITEM_RECORD_BYTES * 200];
    let source_blob = providence_core::model::BlobId(format!("sha256:{}", "d".repeat(64)));
    let mut rules = decode_scenario_item_rules(&source, None, source_blob, None)
        .expect("controlled UI demo item table is valid")
        .rules;
    for (record_index, name, unidentified, description) in [
        (
            99usize,
            "Grave Salt Ampoule",
            "Clouded glass ampoule",
            "A wax-sealed ampoule of salt gathered from the old western cemetery.",
        ),
        (
            100,
            "East Road Patrol Token",
            "Notched brass token",
            "A patrol marker stamped with Captain Renald's weathered seal.",
        ),
        (
            101,
            "Moonsteel Signet",
            "Tarnished silver ring",
            "A pale signet engraved with the lost crest of the western watch.",
        ),
        (
            102,
            "Unmarked Reliquary Key",
            "Long blackened key",
            "A narrow key whose wards match no surviving Portstown lock.",
        ),
    ] {
        let definition = &mut rules[record_index].definition;
        definition.name = name.into();
        definition.unidentified_name = unidentified.into();
        definition.description = description.into();
        definition.cost = 250 + record_index as i32 * 10;
        definition.weight = 1;
        definition.icon_id = 309 + record_index as i32;
    }
    rules[101].definition.cost = 1_250;
    rules[101].definition.icon_id = 410;
    rules[101].definition.cursed_item_id = Some(StableId("classic.item.1047".into()));
    rules
}

pub(crate) fn demo_ui_snapshot() -> ProjectSnapshot {
    let mut snapshot = demo_snapshot();
    snapshot.scenario_item_rules = demo_scenario_items();
    snapshot
}
