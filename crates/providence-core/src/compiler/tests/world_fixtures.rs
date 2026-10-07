use super::*;

pub(super) fn certification() -> ProjectSnapshot {
    let map = certification_map();
    let action_point = certification_action_point();
    let message = ScenarioMessage {
        identity: StableId("message:47".into()),
        native_id: NativeRecordId(47),
        text: "The reliquary is empty.".into(),
        authored: true,
    };
    let encounter = certification_encounter();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("certification".into()));
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(47),
        values: [1, -2, 3, -4, 5],
    });
    snapshot.extra_action_points = certification_macros();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: crate::model::ScenarioApplicationHooks {
            start_game: Some(StableId("extra-action-point:1".into())),
            ..Default::default()
        },
    });
    snapshot.messages.push(message);
    snapshot.world.maps.push(map);
    snapshot.world.action_points.push(action_point);
    snapshot.simple_encounters.push(encounter);
    snapshot
}

pub(super) struct PlayerMapFixture {
    pub snapshot: ProjectSnapshot,
    pub data_md2: Vec<u8>,
    pub scenario_resources: Vec<u8>,
    pub asset_payloads: BTreeMap<String, Vec<u8>>,
}

pub(super) fn player_maps() -> PlayerMapFixture {
    let mut data_md2 = vec![0u8; crate::codecs::PLAYER_MAP_RECORD_BYTES * 2];
    data_md2[72..74].copy_from_slice(&(-7_i16).to_be_bytes());
    data_md2[74..76].copy_from_slice(&[0xca, 0xfe]);
    let second_row = crate::codecs::PLAYER_MAP_RECORD_BYTES;
    data_md2[second_row + 68..second_row + 70].copy_from_slice(&16_i16.to_be_bytes());
    data_md2[second_row + 70..second_row + 72].copy_from_slice(&(-200_i16).to_be_bytes());
    data_md2[second_row + 74..second_row + 76].copy_from_slice(&[0xba, 0xbe]);
    data_md2.extend_from_slice(&[0xde, 0xad]);
    let records = decode_player_maps(&data_md2).records;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("player-map-compile".into()));
    snapshot.world.player_maps = records;
    snapshot.player_map_names = Some(crate::model::PlayerMapNameCatalog {
        source_blob: None,
        available_names: (1..=20).map(|index| format!("Known Map {index}")).collect(),
        unavailable_names: (1..=20)
            .map(|index| format!("Unknown Map {index}"))
            .collect(),
    });
    let scenario_resources = crate::codecs::encode_player_map_name_resources(
        snapshot.player_map_names.as_ref().unwrap(),
        None,
    )
    .unwrap();
    let text_payload = b"Road journal".to_vec();
    let text_payload_blob = BlobId(format!("sha256:{:x}", Sha256::digest(&text_payload)));
    let scenario_resources = crate::codecs::merge_resource_entries(
        &scenario_resources,
        vec![crate::codecs::ResourceEntry {
            resource_type: *b"TEXT",
            id: -200,
            name: "Road journal".into(),
            attributes: 0,
            data: text_payload.clone(),
        }],
    )
    .unwrap();
    snapshot
        .assets
        .push(journal_descriptor(&text_payload, &text_payload_blob));
    let asset_payloads = BTreeMap::from([(text_payload_blob.0.clone(), text_payload.clone())]);
    PlayerMapFixture {
        snapshot,
        data_md2,
        scenario_resources,
        asset_payloads,
    }
}

pub(super) fn dungeon() -> ProjectSnapshot {
    let runtime = dungeon_runtime();
    let map = MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Vault of Embers".into(),
        tiles: vec![0x1234; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(runtime),
    };
    let action_point = dungeon_action_point();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-certification".into()));
    snapshot.world = WorldModel {
        maps: vec![map],
        action_points: vec![action_point],
        land_layout: None,
        player_maps: Vec::new(),
        special_land_solidity: None,
    };
    snapshot.extra_action_points = (1..=3)
        .map(|native_id| ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{native_id}")),
            native_id: NativeRecordId(native_id),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        })
        .collect();
    snapshot.battles = (0..=12)
        .map(|native_id| BattleRecord {
            identity: StableId(format!("battle:{native_id}")),
            native_id: NativeRecordId(native_id),
            grid: vec![0; crate::codecs::BATTLE_GRID_SLOTS],
            distance: 0,
            message_before: 0,
            message_after: 0,
            battle_macro: 0,
            authored: true,
        })
        .collect();
    snapshot
}

fn certification_map() -> MapLevel {
    MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Ashen Coast".into(),
        tiles: vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    }
}

fn certification_action_point() -> ActionPoint {
    ActionPoint {
        identity: StableId("action-point:land:0:7".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 7,
        classic_door_id: 712,
        coordinate: Some(MapCoordinate { x: 12, y: 7 }),
        post_action_level: 0,
        post_action_x: 12,
        post_action_y: 7,
        chance_percent: 100,
        actions: vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 47,
            },
            ClassicAction {
                slot: 1,
                raw_opcode: 4,
                target_native_id: 3,
            },
        ],
    }
}

fn certification_encounter() -> SimpleEncounter {
    SimpleEncounter {
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
        prompt_message_native_id: 47,
        texts: ["Continue".into(), "".into(), "".into(), "".into()],
        authored: true,
    }
}

fn dungeon_runtime() -> MapRuntimeMetadata {
    MapRuntimeMetadata {
        source: "Data RDD".into(),
        source_blob: None,
        dark: true,
        uses_los: true,
        landlook: Some(-1),
        base_scale: None,
        tileset_id: StableId("dungeon-top-down-302".into()),
        base_tile: None,
        random_rectangles: vec![RandomRectangle {
            identity: StableId("dungeon:0:rect:2".into()),
            top: 3,
            left: 4,
            bottom: 8,
            right: 9,
            chance_ten_thousand: 750,
            battle_range: [10, 12],
            random_doors: [1, 2, 3],
            random_door_percent: [25, -50, 75],
            only: true,
            option: -2,
            sound_id: 0,
            text_id: 0,
        }],
    }
}

fn journal_descriptor(text_payload: &[u8], text_payload_blob: &BlobId) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("classic-resource:TEXT:-200".into()),
        label: "Road journal".into(),
        kind: "text-resource".into(),
        mime_type: Some("text/plain".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "TEXT".into(),
            resource_id: -200,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: text_payload.len() as u64,
        classic_payload_blob: Some(text_payload_blob.clone()),
        classic_payload_byte_length: Some(text_payload.len() as u64),
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
        source: crate::codecs::CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}

fn certification_macros() -> Vec<ExtraActionPoint> {
    vec![
        ExtraActionPoint {
            identity: StableId("extra-action-point:0".into()),
            native_id: NativeRecordId(0),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
            actions: Vec::new(),
        },
        ExtraActionPoint {
            identity: StableId("extra-action-point:1".into()),
            native_id: NativeRecordId(1),
            classic_door_id: 900,
            post_action_level: 0,
            post_action_x: 12,
            post_action_y: 7,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: 39,
                target_native_id: 1,
            }],
        },
    ]
}

fn dungeon_action_point() -> ActionPoint {
    ActionPoint {
        identity: StableId("action-point:dungeon:0:7".into()),
        level_type: LevelType::Dungeon,
        level_index: 0,
        record_index: 7,
        classic_door_id: 712,
        coordinate: Some(MapCoordinate { x: 12, y: 7 }),
        post_action_level: 0,
        post_action_x: 12,
        post_action_y: 7,
        chance_percent: 100,
        actions: Vec::new(),
    }
}
