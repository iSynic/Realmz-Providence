use crate::model::{
    ActionPoint, BlobId, MapCoordinate, MapRuntimeMetadata, RandomRectangle,
    SpecialLandSolidityCatalog,
};
use crate::model::{
    CLASSIC_MAP_SIZE, LevelType, MapLevel, ProjectSnapshot, StableId, TerrainProfile,
};

pub(super) fn topology_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("topology".into()));
    snapshot.world.maps.push(land_map());
    snapshot.world.action_points.push(land_trigger());
    snapshot.world.special_land_solidity = Some(SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId(format!("sha256:{}", "e".repeat(64))),
        solid: vec![false; crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES],
    });
    snapshot.terrain_catalog = terrain_profiles();
    snapshot
}

fn land_map() -> MapLevel {
    let mut tiles = vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[7 * CLASSIC_MAP_SIZE + 2] = -1099;
    tiles[7 * CLASSIC_MAP_SIZE + 3] = 2007;
    tiles[7 * CLASSIC_MAP_SIZE + 4] = 3007;
    MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles,
        runtime: Some(MapRuntimeMetadata {
            source: "synthetic random-level fixture".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(2),
            base_scale: Some(1),
            tileset_id: StableId("classic.landlook.2".into()),
            base_tile: Some(4),
            random_rectangles: vec![RandomRectangle {
                identity: StableId("land:0:rect:3".into()),
                top: 6,
                left: 1,
                bottom: 8,
                right: 4,
                chance_ten_thousand: 2500,
                battle_range: [4, 7],
                random_doors: [0; 3],
                random_door_percent: [0; 3],
                only: false,
                option: 0,
                sound_id: 82,
                text_id: 47,
            }],
        }),
    }
}

fn land_trigger() -> ActionPoint {
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
    [
        (4, 5, 17, false, true, true, true, true, 3, Some(44)),
        (7, 2, 0, true, false, false, false, false, 0, Some(12)),
        (99, 5, 17, false, true, true, true, true, 3, Some(44)),
        (60, 3, 0, true, false, false, false, false, 0, Some(82)),
        (147, 4, 0, true, false, false, false, false, 0, Some(82)),
    ]
    .into_iter()
    .map(profile_from_values)
    .collect()
}

type TerrainValues = (
    i16,
    i16,
    i16,
    bool,
    bool,
    bool,
    bool,
    bool,
    i16,
    Option<i16>,
);

fn profile_from_values(values: TerrainValues) -> TerrainProfile {
    let (
        tile,
        movement_cost,
        solid_type,
        walkable,
        blocks_los,
        shore,
        path,
        fly_float,
        forest_type,
        movement_sound_id,
    ) = values;
    TerrainProfile {
        source: "synthetic mapstats fixture".into(),
        source_blob: None,
        tile,
        landlook: Some(2),
        movement_sound_id,
        movement_cost,
        solid_type,
        walkable,
        shore,
        boat_requirement: if tile == 4 || tile == 99 || tile == 60 {
            2
        } else if tile == 147 {
            1
        } else {
            0
        },
        path,
        blocks_los,
        fly_float,
        forest_type,
        combat_build: [[tile; 3]; 3],
    }
}
