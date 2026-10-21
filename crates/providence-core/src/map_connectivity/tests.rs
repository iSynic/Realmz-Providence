use super::*;

fn fixture() -> ProjectSnapshot {
    let (mut snapshot, _, _) = crate::terrain_generation::tests::fixture();
    snapshot.terrain_catalog = vec![TerrainProfile {
        source: "authored walking fixture".into(),
        source_blob: None,
        tile: 156,
        landlook: Some(0),
        movement_sound_id: None,
        movement_cost: 1,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[0; 3]; 3],
    }];
    snapshot
}

#[test]
fn route_uses_behavior_and_reports_missing_information() {
    let mut snapshot = fixture();
    let identity = StableId("land:0".into());
    let connection = Connection {
        from: MapCoordinate { x: 0, y: 0 },
        to: MapCoordinate { x: 2, y: 0 },
    };
    assert_eq!(
        preview(&snapshot, &identity, std::slice::from_ref(&connection)).unwrap()[0].status,
        Status::Connected
    );
    snapshot.terrain_catalog[0].solid_type = 1;
    snapshot.terrain_catalog[0].walkable = false;
    assert_eq!(
        preview(&snapshot, &identity, std::slice::from_ref(&connection)).unwrap()[0].status,
        Status::Blocked
    );
    snapshot.terrain_catalog.clear();
    assert_eq!(
        preview(&snapshot, &identity, &[connection]).unwrap()[0].status,
        Status::Unknown
    );
}

#[test]
fn unknown_is_reported_only_when_it_could_connect_the_endpoints() {
    let mut snapshot = fixture();
    let identity = StableId("land:0".into());
    let pair = Connection {
        from: MapCoordinate { x: 1, y: 1 },
        to: MapCoordinate { x: 3, y: 1 },
    };
    snapshot.world.maps[0].tiles[91] = 1156;
    let route = &preview(&snapshot, &identity, std::slice::from_ref(&pair)).unwrap()[0];
    assert_eq!(route.status, Status::Unknown);
    assert!(route.problematic_cells.contains(&pair.from));
    snapshot.world.maps[0].tiles[91] = -17;
    assert_eq!(
        preview(&snapshot, &identity, std::slice::from_ref(&pair)).unwrap()[0].status,
        Status::Unknown
    );
    snapshot.world.special_land_solidity = Some(SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId(format!("sha256:{}", "b".repeat(64))),
        solid: vec![false; 1024],
    });
    assert_eq!(
        preview(&snapshot, &identity, std::slice::from_ref(&pair)).unwrap()[0].status,
        Status::Connected
    );
    snapshot.world.special_land_solidity.as_mut().unwrap().solid[17] = true;
    assert_eq!(
        preview(&snapshot, &identity, &[pair]).unwrap()[0].status,
        Status::Blocked
    );
}

#[test]
fn required_route_can_reject_an_otherwise_valid_generation_without_writes() {
    let (snapshot, atlas, mut intent) = crate::terrain_generation::tests::fixture();
    intent.connections = vec![Connection {
        from: MapCoordinate { x: 0, y: 0 },
        to: MapCoordinate { x: 1, y: 0 },
    }];
    let plan = crate::terrain_generation::preview(
        &snapshot,
        &StableId("land:0".into()),
        &intent,
        &atlas,
        &mut || false,
    )
    .unwrap();
    assert_ne!(plan.outcome, crate::terrain_generation::Outcome::Success);
    assert!(plan.painted_cells.is_empty());
    assert_eq!(plan.routes[0].status, Status::Unknown);
}
