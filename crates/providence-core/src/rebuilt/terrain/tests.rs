use super::*;
use crate::codecs::BATTLE_GRID_SLOTS;
use crate::model::{BattleRecord, CLASSIC_MAP_SIZE, MapLevel, MapRuntimeMetadata, NativeRecordId};
use crate::rebuilt::{RebuiltV3MapInputs, package_capabilities, project_rebuilt_v3_map_inputs};
fn terrain_profile(tile: i16, landlook: i8) -> TerrainProfile {
    TerrainProfile {
        source: format!("controlled mapstats landlook {landlook}"),
        source_blob: None,
        tile,
        landlook: Some(landlook),
        movement_sound_id: Some(tile),
        movement_cost: tile.max(0),
        solid_type: tile % 19,
        walkable: tile % 2 == 0,
        shore: tile % 3 == 0,
        boat_requirement: tile.rem_euclid(3),
        path: tile % 5 == 0,
        blocks_los: tile % 7 == 0,
        fly_float: tile % 11 == 0,
        forest_type: tile % 13,
        combat_build: [[tile; 3]; 3],
    }
}

fn battle_terrain_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-terrain".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "controlled land runtime".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(2),
            base_scale: Some(1),
            tileset_id: StableId("classic.landlook.2".into()),
            base_tile: Some(4),
            random_rectangles: Vec::new(),
        }),
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
    snapshot
        .terrain_catalog
        .extend((200..=400).map(|tile| terrain_profile(tile, -1)));
    snapshot
        .terrain_catalog
        .extend((0..=200).map(|tile| terrain_profile(tile, 2)));
    snapshot
}

#[test]
fn battle_terrain_sets_are_exact_deterministic_schema_v3_inputs() {
    let snapshot = battle_terrain_snapshot();
    let sets = project_rebuilt_v3_battle_terrain_sets(&snapshot).expect("terrain sets");
    assert!(sets.len() == 2 && package_capabilities(&snapshot).len() == 4);
    assert_eq!(sets[0].id.0, "classic.battle-terrain.dungeon");
    assert_eq!(sets[0].tiles.len(), 201);
    assert_eq!(sets[0].tiles[0].tile, 200);
    assert_eq!(sets[1].id.0, "classic.battle-terrain.landlook.2");
    assert_eq!(sets[1].base_tile, Some(4));
    assert_eq!(sets[1].tiles.len(), 401);
    assert_eq!(sets[1].tiles[200].tile, 200);
    assert_eq!(sets[1].tiles[201].tile, 201);

    let inputs = project_rebuilt_v3_map_inputs(&snapshot).expect("map inputs");
    assert_eq!(inputs.battle_terrain_sets, sets);
    assert_eq!(
        inputs.maps[0].metadata.battle_terrain_set_id,
        Some(StableId("classic.battle-terrain.landlook.2".into()))
    );
    let first = serde_json::to_string(&inputs).expect("serialize");
    let second = serde_json::to_string(
        &project_rebuilt_v3_map_inputs(&snapshot).expect("repeat projection"),
    )
    .expect("serialize repeat");
    assert_eq!(first, second);
    let reopened: RebuiltV3MapInputs = serde_json::from_str(&first).expect("reimport");
    assert_eq!(reopened, inputs);
}

#[test]
fn battle_terrain_sets_reject_incomplete_profiles_and_ambiguous_base_tiles() {
    let mut snapshot = battle_terrain_snapshot();
    snapshot
        .terrain_catalog
        .retain(|profile| !(profile.landlook == Some(2) && profile.tile == 17));
    assert_eq!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::IncompleteProfiles {
            landlook: 2,
            first_tile: 0,
            last_tile: 200,
            actual: 200,
        })
    );

    let mut snapshot = battle_terrain_snapshot();
    let mut second = snapshot.world.maps[0].clone();
    second.identity = StableId("land:1".into());
    second.native_index = 1;
    second.runtime.as_mut().expect("runtime").base_tile = Some(5);
    snapshot.world.maps.push(second);
    assert_eq!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::AmbiguousBaseTile {
            landlook: 2,
            values: vec![4, 5],
        })
    );
}

#[test]
fn combat_profiles_are_validated_before_land_metadata() {
    let mut snapshot = battle_terrain_snapshot();
    snapshot.world.maps[0].runtime = None;
    snapshot
        .terrain_catalog
        .retain(|profile| profile.tile != 399);
    assert_eq!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::IncompleteProfiles {
            landlook: -1,
            first_tile: 200,
            last_tile: 400,
            actual: 200,
        })
    );
    snapshot.terrain_catalog.push(terrain_profile(399, -1));
    assert_eq!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::MissingMapRuntime(StableId(
            "land:0".into()
        )))
    );
}

#[test]
fn all_land_metadata_is_checked_before_grouped_base_tile_conflicts() {
    let mut snapshot = battle_terrain_snapshot();
    let mut conflicting = snapshot.world.maps[0].clone();
    conflicting.identity = StableId("land:1".into());
    conflicting.native_index = 1;
    conflicting.runtime.as_mut().unwrap().base_tile = Some(5);
    snapshot.world.maps.push(conflicting);
    let mut missing = snapshot.world.maps[0].clone();
    missing.identity = StableId("land:2".into());
    missing.native_index = 2;
    missing.runtime.as_mut().unwrap().landlook = None;
    snapshot.world.maps.push(missing);
    assert_eq!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::MissingMapLandlook(StableId(
            "land:2".into()
        )))
    );
    snapshot.world.maps.pop();
    assert_eq!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::AmbiguousBaseTile {
            landlook: 2,
            values: vec![4, 5]
        })
    );
}

#[test]
fn projects_without_battles_do_not_require_battle_profiles() {
    let mut snapshot = battle_terrain_snapshot();
    snapshot.battles.clear();
    snapshot.terrain_catalog.clear();
    snapshot.world.maps[0].runtime = None;
    assert_eq!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Ok(Vec::new())
    );
    assert!(project_rebuilt_v3_map_inputs(&snapshot).is_none());
}
