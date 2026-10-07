use super::super::ApplicationMediaCatalog;
use crate::model::{
    ActionPoint, AssetDescriptor, BlobId, CLASSIC_MAP_SIZE, ClassicResourceKey, LevelType,
    MapCoordinate, MapLevel, MapRuntimeMetadata, PlayerMapMarker, PlayerMapRecord, PlayerMapRect,
    ProjectSnapshot, RandomRectangle, StableId, TerrainProfile,
};

pub(super) fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("world-fixture".into()));
    snapshot.world.maps.push(land_map());
    snapshot.world.action_points.push(placed_action_point());
    snapshot.terrain_catalog = terrain_profiles();
    snapshot
}

fn land_map() -> MapLevel {
    MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(runtime()),
    }
}

fn runtime() -> MapRuntimeMetadata {
    MapRuntimeMetadata {
        source: "controlled Map Stats".into(),
        source_blob: None,
        dark: false,
        uses_los: true,
        landlook: Some(2),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.2".into()),
        base_tile: Some(4),
        random_rectangles: vec![RandomRectangle {
            identity: StableId("land:0:rect:0".into()),
            top: 1,
            left: 2,
            bottom: 3,
            right: 4,
            chance_ten_thousand: 2500,
            battle_range: [0, 0],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: 82,
            text_id: 0,
        }],
    }
}

fn placed_action_point() -> ActionPoint {
    ActionPoint {
        identity: StableId("action-point:land:0:5".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 5,
        classic_door_id: 702,
        coordinate: Some(MapCoordinate { x: 2, y: 7 }),
        post_action_level: 0,
        post_action_x: 2,
        post_action_y: 7,
        chance_percent: 100,
        actions: Vec::new(),
    }
}

fn terrain_profiles() -> Vec<TerrainProfile> {
    [7, 60, 99, 147]
        .into_iter()
        .map(|tile| TerrainProfile {
            source: "controlled Map Stats".into(),
            source_blob: None,
            tile,
            landlook: Some(2),
            movement_sound_id: Some(12),
            movement_cost: 2,
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
        .collect()
}

pub(super) fn set_missing_player_map_records(snapshot: &mut ProjectSnapshot) {
    let mut markers = vec![
        PlayerMapMarker {
            icon_id: 0,
            x: 0,
            y: 0,
        };
        10
    ];
    markers[0] = PlayerMapMarker {
        icon_id: 143,
        x: 18,
        y: 23,
    };
    snapshot.world.player_maps = vec![
        player_map(
            0,
            false,
            0,
            30_000,
            0,
            vec![
                PlayerMapMarker {
                    icon_id: 0,
                    x: 0,
                    y: 0
                };
                10
            ],
        ),
        player_map(1, false, 0, 0, 0, markers),
    ];
}

pub(super) fn player_map(
    native_id: u32,
    is_dungeon: bool,
    level: i16,
    picture_id: i16,
    show: i16,
    markers: Vec<PlayerMapMarker>,
) -> PlayerMapRecord {
    PlayerMapRecord {
        identity: StableId(format!("player-map:{native_id}")),
        native_id: crate::model::NativeRecordId(native_id),
        markers,
        start_x: 7,
        start_y: 9,
        level,
        picture_id,
        icon_size: 16,
        show,
        is_dungeon,
        picture_rect: PlayerMapRect {
            top: 0,
            left: 0,
            bottom: 300,
            right: 480,
        },
        note: "A corpus-realistic player map".into(),
        authored: true,
    }
}

pub(super) fn player_map_asset(
    identity: &str,
    kind: &str,
    resource_type: &str,
    resource_id: i32,
) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(identity.into()),
        label: identity.into(),
        kind: kind.into(),
        mime_type: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: resource_type.into(),
            resource_id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 1,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: None,
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
        source: "controlled player-map fixture".into(),
    }
}

pub(super) fn application_icon(resource_id: i32) -> crate::rebuilt::ApplicationMediaAsset {
    crate::rebuilt::ApplicationMediaAsset {
        source: StableId("classic-application:family-jewels".into()),
        source_priority: 0,
        descriptor: player_map_asset(
            &format!("application:cicn:{resource_id}"),
            "icon",
            "cicn",
            resource_id,
        ),
    }
}

pub(super) fn player_map_application_fixture() -> ApplicationMediaCatalog {
    let portrait_marker = application_icon(143);
    let mut special_land_marker = application_icon(-99);
    special_land_marker.descriptor.kind = "special-land-tile".into();
    special_land_marker.descriptor.identity = StableId("realmz-special-land-neg-99".into());
    let mut second_portrait_marker = application_icon(257);
    second_portrait_marker.descriptor.kind = "portrait".into();
    second_portrait_marker.descriptor.identity = StableId("realmz-portrait-257".into());
    ApplicationMediaCatalog {
        format_version: crate::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        library_id: StableId("classic-application".into()),
        sources: vec![crate::rebuilt::ApplicationMediaSource {
            identity: StableId("classic-application:family-jewels".into()),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 0,
            blob: BlobId(format!("sha256:{}", "b".repeat(64))),
            byte_length: 1,
        }],
        assets: vec![
            application_icon(138),
            portrait_marker,
            special_land_marker,
            second_portrait_marker,
        ],
        ambiguous_resources: Vec::new(),
        failures: Vec::new(),
    }
}
