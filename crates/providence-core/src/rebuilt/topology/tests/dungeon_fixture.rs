use crate::codecs::{
    DUNGEON_ACTION_POINT_MARKER_MASK, DUNGEON_ALLOW_MOVE_NORTH_MASK, DUNGEON_ALLOW_MOVE_WEST_MASK,
    DUNGEON_COLUMN_MASK, DUNGEON_HORIZONTAL_DOOR_MASK, DUNGEON_NO_WALL_IN_BATTLE_MASK,
    DUNGEON_NOTE_MARKER_MASK, DUNGEON_REVEALED_SECRET_MASK, DUNGEON_STAIRS_MASK,
    DUNGEON_UNMAPPED_MASK, DUNGEON_VISIBLE_ARCH_MASK, DUNGEON_WALL_MASK,
};
use crate::model::{ActionPoint, MapCoordinate, MapRuntimeMetadata, RandomRectangle};
use crate::model::{CLASSIC_MAP_SIZE, LevelType, MapLevel, ProjectSnapshot, StableId};

pub(super) struct DungeonFixture {
    pub snapshot: ProjectSnapshot,
    pub detailed_index: usize,
    pub hidden_secret_index: usize,
}

pub(super) fn dungeon_fixture() -> DungeonFixture {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-topology".into()));
    let detailed_index = 7 * CLASSIC_MAP_SIZE + 2;
    let hidden_secret_index = 8 * CLASSIC_MAP_SIZE + 3;
    snapshot.world.maps.push(dungeon_map());
    snapshot.world.action_points.push(dungeon_trigger());
    DungeonFixture {
        snapshot,
        detailed_index,
        hidden_secret_index,
    }
}

fn dungeon_map() -> MapLevel {
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    let detailed_index = 7 * CLASSIC_MAP_SIZE + 2;
    tiles[detailed_index] = (DUNGEON_WALL_MASK
        | DUNGEON_HORIZONTAL_DOOR_MASK
        | DUNGEON_STAIRS_MASK
        | DUNGEON_COLUMN_MASK
        | DUNGEON_NOTE_MARKER_MASK
        | DUNGEON_REVEALED_SECRET_MASK
        | DUNGEON_UNMAPPED_MASK
        | DUNGEON_ALLOW_MOVE_NORTH_MASK
        | DUNGEON_ACTION_POINT_MARKER_MASK
        | DUNGEON_VISIBLE_ARCH_MASK
        | DUNGEON_NO_WALL_IN_BATTLE_MASK) as i16;
    let hidden_secret_index = 8 * CLASSIC_MAP_SIZE + 3;
    tiles[hidden_secret_index] = (DUNGEON_WALL_MASK | DUNGEON_ALLOW_MOVE_WEST_MASK) as i16;

    MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Vault of Embers".into(),
        tiles,
        runtime: Some(MapRuntimeMetadata {
            source: "controlled Data RDD fixture".into(),
            source_blob: None,
            dark: true,
            uses_los: true,
            landlook: None,
            base_scale: None,
            tileset_id: StableId("dungeon-top-down-302".into()),
            base_tile: None,
            random_rectangles: vec![RandomRectangle {
                identity: StableId("dungeon:0:rect:2".into()),
                top: 7,
                left: 2,
                bottom: 8,
                right: 3,
                chance_ten_thousand: 900,
                battle_range: [0, 0],
                random_doors: [0; 3],
                random_door_percent: [0; 3],
                only: false,
                option: 0,
                sound_id: 0,
                text_id: 0,
            }],
        }),
    }
}

fn dungeon_trigger() -> ActionPoint {
    ActionPoint {
        identity: StableId("action-point:dungeon:0:4".into()),
        level_type: LevelType::Dungeon,
        level_index: 0,
        record_index: 4,
        classic_door_id: 702,
        coordinate: Some(MapCoordinate { x: 2, y: 7 }),
        post_action_level: 0,
        post_action_x: 2,
        post_action_y: 7,
        chance_percent: 100,
        actions: Vec::new(),
    }
}
