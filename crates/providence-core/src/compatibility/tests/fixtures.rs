use super::*;

pub(super) fn slice_snapshot(target: i16) -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("classification".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:47".into()),
        native_id: NativeRecordId(47),
        text: "Open the gate.".into(),
        authored: true,
    });
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 101,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: target,
        }],
    });
    snapshot
}

pub(super) fn application_appearance_catalog() -> ApplicationMediaCatalog {
    let source = StableId("classic-application:appearance".into());
    let assets = (257..377)
        .map(|resource_id| (resource_id, "portrait"))
        .chain((9000..9120).map(|resource_id| (resource_id, "combat-icon")))
        .map(
            |(resource_id, kind)| crate::rebuilt::ApplicationMediaAsset {
                source: source.clone(),
                source_priority: 0,
                descriptor: AssetDescriptor {
                    identity: StableId(format!("application:{kind}:{resource_id}")),
                    label: format!("Application {kind} {resource_id}"),
                    kind: kind.into(),
                    mime_type: Some("image/png".into()),
                    classic_resource: Some(ClassicResourceKey {
                        resource_type: "cicn".into(),
                        resource_id,
                    }),
                    scenario_music_slot: None,
                    blob: BlobId(format!("sha256:{}", "a".repeat(64))),
                    byte_length: 1,
                    classic_payload_blob: Some(BlobId(format!("sha256:{}", "b".repeat(64)))),
                    classic_payload_byte_length: Some(1),
                    extension: Some("png".into()),
                    width: Some(32),
                    height: Some(32),
                    duration_ms: None,
                    sample_rate: None,
                    channels: None,
                    tile_width: None,
                    tile_height: None,
                    columns: None,
                    rows: None,
                    landlook: None,
                    base_tile: None,
                    source: "controlled application media".into(),
                },
            },
        )
        .collect();
    ApplicationMediaCatalog {
        format_version: crate::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("classic-application".into()),
        sources: vec![crate::rebuilt::ApplicationMediaSource {
            identity: source,
            native_name: "Appearance.rsrc".into(),
            priority: 0,
            blob: BlobId(format!("sha256:{}", "c".repeat(64))),
            byte_length: 1,
        }],
        assets,
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    }
}

pub(super) fn special_land_snapshot() -> ProjectSnapshot {
    let mut snapshot = slice_snapshot(47);
    snapshot.world.maps[0].tiles[0] = -99;
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "synthetic map runtime fixture".into(),
        source_blob: None,
        dark: false,
        uses_los: true,
        landlook: Some(0),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: Some(4),
        random_rectangles: Vec::new(),
    });
    snapshot.world.special_land_solidity = Some(crate::model::SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId(format!("sha256:{}", "e".repeat(64))),
        solid: vec![false; crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES],
    });
    snapshot.terrain_catalog = [0, 4, 60, 99, 147]
        .into_iter()
        .map(|tile| TerrainProfile {
            source: "synthetic mapstats fixture".into(),
            source_blob: None,
            tile,
            landlook: Some(0),
            movement_sound_id: Some(82),
            movement_cost: 3,
            solid_type: 0,
            walkable: true,
            shore: false,
            boat_requirement: 0,
            path: false,
            blocks_los: false,
            fly_float: false,
            forest_type: 0,
            combat_build: [[tile; 3]; 3],
        })
        .collect();

    snapshot
}
