use super::*;
use crate::model::{BlobId, MapRuntimeMetadata, TerrainProfile};
#[test]
fn map_input_projection_preserves_landlook_and_exact_mapstats_fields() {
    let snapshot = map_input_snapshot();

    let projection = project_rebuilt_v3_map_inputs(&snapshot).expect("map inputs");
    let encoded = serde_json::to_string(&projection).expect("serialize map inputs");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_map_inputs(&snapshot).unwrap()).unwrap()
    );
    let value = serde_json::to_value(&projection).expect("map input JSON");
    assert_eq!(value["maps"][0]["metadata"]["usesLos"], true);
    assert_eq!(value["maps"][0]["tilesetId"], "classic.landlook.2");
    assert_eq!(value["maps"][0]["randomRectangles"][0]["top"], 0);
    assert_eq!(value["maps"][0]["randomRectangles"][0]["left"], 0);
    assert_eq!(value["maps"][0]["randomRectangles"][0]["bottom"], 89);
    assert_eq!(value["maps"][0]["randomRectangles"][0]["right"], 89);
    let source_rectangle = &snapshot.world.maps[0]
        .runtime
        .as_ref()
        .unwrap()
        .random_rectangles[0];
    assert_eq!(
        [
            source_rectangle.top,
            source_rectangle.left,
            source_rectangle.bottom,
            source_rectangle.right,
        ],
        [-7, -23, 90, 99]
    );
    assert_eq!(value["terrainSets"][0]["landlook"], 2);
    assert_eq!(value["terrainSets"][0]["tiles"][0]["sound"], 82);
    assert_eq!(value["terrainSets"][0]["tiles"][0]["needBoat"], 2);
    assert_eq!(
        value["terrainSets"][0]["tiles"][0]["combatBuild"][2][2],
        109
    );

    let reopened: RebuiltV3MapInputs = serde_json::from_str(&encoded).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn offscreen_rectangles_are_rejected_for_authored_and_quarantined_for_imported() {
    let snapshot = map_input_snapshot();
    let mut offscreen = snapshot.clone();
    let rectangle = &mut offscreen.world.maps[0]
        .runtime
        .as_mut()
        .unwrap()
        .random_rectangles[0];
    rectangle.top = 90;
    rectangle.bottom = 99;
    assert!(project_rebuilt_v3_map_inputs(&offscreen).is_none());

    offscreen.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let imported = project_rebuilt_v3_map_inputs(&offscreen)
        .expect("imported off-map rectangles are quarantined from runtime output");
    assert!(imported.maps[0].random_rectangles.is_empty());
    assert_eq!(
        offscreen.world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0]
            .top,
        90,
        "quarantine must not mutate imported source truth"
    );
}

#[test]
fn package_clipping_preserves_classic_region_membership_on_playable_cells() {
    for (index, bounds) in [
        [-7, -23, 90, 99],
        [0, 14, 18, 90],
        [82, 83, 90, 90],
        [52, 8, 99, 10],
    ]
    .into_iter()
    .enumerate()
    {
        let source = RandomRectangle {
            identity: StableId(format!("land:0:rect:{index}")),
            top: bounds[0],
            left: bounds[1],
            bottom: bounds[2],
            right: bounds[3],
            chance_ten_thousand: 100,
            battle_range: [0; 2],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        };
        let projected = project_rebuilt_v3_random_rectangle(&source)
            .expect("the controlled rectangle intersects the playable map");
        for y in 0..CLASSIC_MAP_SIZE as i16 {
            for x in 0..CLASSIC_MAP_SIZE as i16 {
                let classic =
                    source.left <= x && x <= source.right && source.top <= y && y <= source.bottom;
                let rebuilt = i16::from(projected.left) <= x
                    && x <= i16::from(projected.right)
                    && i16::from(projected.top) <= y
                    && y <= i16::from(projected.bottom);
                assert_eq!(classic, rebuilt, "bounds {bounds:?} at ({x},{y})");
            }
        }
        assert_eq!(
            [source.top, source.left, source.bottom, source.right],
            bounds
        );
    }
}

#[test]
fn dungeon_map_inputs_do_not_invent_or_require_land_terrain_profiles() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-inputs".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Vault of Embers".into(),
        tiles: vec![1; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "controlled Data RDD fixture".into(),
            source_blob: None,
            dark: true,
            uses_los: true,
            landlook: Some(-1),
            base_scale: Some(7),
            tileset_id: StableId("dungeon-top-down-302".into()),
            base_tile: Some(88),
            random_rectangles: Vec::new(),
        }),
    });

    let projection = project_rebuilt_v3_map_inputs(&snapshot).expect("dungeon inputs");
    assert!(projection.terrain_sets.is_empty());
    assert!(projection.battle_terrain_sets.is_empty());
    assert_eq!(projection.maps[0].metadata.landlook, None);
    assert_eq!(projection.maps[0].metadata.base_scale, None);
    assert_eq!(projection.maps[0].base_tile, None);
    assert_eq!(
        projection.maps[0].tileset_id,
        StableId("dungeon-top-down-302".into())
    );
}

fn map_input_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("terrain".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(map_input_runtime()),
    });
    snapshot.terrain_catalog.push(map_input_profile());
    snapshot
}

fn map_input_runtime() -> MapRuntimeMetadata {
    MapRuntimeMetadata {
        source: "synthetic random-level fixture".into(),
        source_blob: None,
        dark: true,
        uses_los: true,
        landlook: Some(2),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.2".into()),
        base_tile: Some(4),
        random_rectangles: vec![map_input_rectangle()],
    }
}

fn map_input_rectangle() -> RandomRectangle {
    RandomRectangle {
        identity: StableId("land:0:rect:3".into()),
        top: -7,
        left: -23,
        bottom: 90,
        right: 99,
        chance_ten_thousand: 2500,
        battle_range: [4, 7],
        random_doors: [0; 3],
        random_door_percent: [0; 3],
        only: false,
        option: 0,
        sound_id: 82,
        text_id: 47,
    }
}

fn map_input_profile() -> TerrainProfile {
    TerrainProfile {
        source: "synthetic mapstats fixture".into(),
        source_blob: None,
        tile: 7,
        landlook: Some(2),
        movement_sound_id: Some(82),
        movement_cost: 4,
        solid_type: 17,
        walkable: false,
        shore: true,
        boat_requirement: 2,
        path: false,
        blocks_los: true,
        fly_float: false,
        forest_type: 3,
        combat_build: [[101, 102, 103], [104, 105, 106], [107, 108, 109]],
    }
}
