use super::*;
use crate::model::{MapLevel, MapRuntimeMetadata, TerrainProfile};

fn fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("land-selection".into()));
    let mut tiles = vec![200; 8100];
    tiles[..3].copy_from_slice(&[1, 2, 61]);
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Land".into(),
        tiles,
        runtime: Some(MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: Some(0),
            base_scale: None,
            tileset_id: StableId("landlook:0".into()),
            base_tile: Some(1),
            random_rectangles: vec![],
        }),
    });
    snapshot
}

fn select(snapshot: &ProjectSnapshot, shape: SelectionShape) -> Vec<MapCoordinate> {
    preview_map_selection(
        snapshot,
        &StableId("land:0".into()),
        &MapSelectionRequest {
            shape,
            start: MapCoordinate { x: 0, y: 0 },
            end: MapCoordinate { x: 0, y: 0 },
            filled: true,
            operation: SelectionOperation::Replace,
            current: vec![],
            path: vec![],
        },
    )
    .unwrap()
}

fn profile(tile: i16) -> TerrainProfile {
    TerrainProfile {
        source: "mapstats".into(),
        source_blob: None,
        tile,
        landlook: Some(0),
        movement_sound_id: Some(1),
        movement_cost: 3,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[0; 3]; 3],
    }
}

#[test]
fn connected_family_uses_exact_stock_categories_and_unknown_falls_back_to_raw() {
    let mut snapshot = fixture();
    assert_eq!(select(&snapshot, SelectionShape::ConnectedExact).len(), 1);
    assert_eq!(select(&snapshot, SelectionShape::ConnectedFamily).len(), 2);
    snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(6);
    assert_eq!(select(&snapshot, SelectionShape::ConnectedFamily).len(), 1);
    snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(0);
    snapshot.world.maps[0].tiles[0] = 1001;
    assert_eq!(select(&snapshot, SelectionShape::ConnectedFamily).len(), 1);
    assert_eq!(
        land_families::family(5, 147),
        Some(land_families::LandFamily::Watercraft)
    );
    assert_eq!(
        land_families::family(4, 96),
        Some(land_families::LandFamily::Buildings)
    );
    assert_eq!(land_families::family(0, 0), None);
}

#[test]
fn behavior_matches_named_flags_not_cost_or_sound_and_rejects_ambiguous_metadata() {
    let mut snapshot = fixture();
    snapshot.terrain_catalog = vec![profile(1), profile(2), profile(61)];
    snapshot.terrain_catalog[1].movement_cost = 20;
    snapshot.terrain_catalog[1].movement_sound_id = Some(9);
    snapshot.terrain_catalog[2].blocks_los = true;
    assert_eq!(
        select(&snapshot, SelectionShape::ConnectedBehavior).len(),
        2
    );
    snapshot.terrain_catalog.push(profile(1));
    assert_eq!(
        select(&snapshot, SelectionShape::ConnectedBehavior).len(),
        1
    );
    snapshot.terrain_catalog.clear();
    assert_eq!(
        select(&snapshot, SelectionShape::ConnectedBehavior).len(),
        1
    );
}
