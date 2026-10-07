use super::*;

#[test]
fn compact_land_topology_matches_schema_tuple_order_and_classic_semantics() {
    let snapshot = topology_snapshot();
    let assets = BTreeMap::from([(-99, StableId("asset.special-land.-99".into()))]);

    let topology = project_land_topologies(&snapshot, &assets)
        .expect("certified topology")
        .remove(0);
    let encoded = serde_json::to_string(&topology).expect("serialize topology");
    let repeated = serde_json::to_string(&project_land_topologies(&snapshot, &assets).unwrap()[0])
        .expect("serialize repeated topology");
    assert_eq!(encoded, repeated);
    let value = serde_json::to_value(&topology).expect("topology JSON");
    assert_eq!(value["topologyFormat"], "realmz2.compact-cell-rows.v2");
    assert_eq!(value["cells"].as_array().unwrap().len(), 8100);

    let special = &value["cells"][7 * CLASSIC_MAP_SIZE + 2];
    assert_eq!(special[0], "classic.terrain.4");
    assert_eq!(special[1], 5);
    assert_eq!(special[2], 508);
    assert_eq!(special[3], 82);
    assert_eq!(special[4][0], "Data DD:0:5");
    assert_eq!(special[5][0], "land:0:rect:3");
    assert_eq!(special[6][0], serde_json::json!(["wall", 4, null, null]));
    assert_eq!(special[7][0][1], "action-point");
    assert_eq!(special[8], 4);
    assert_eq!(special[9], "classic.landlook.2");
    assert_eq!(special[10], "asset.special-land.-99");
    assert_eq!(special[11], 2);
    assert_eq!(special[12], 3);

    let revealed = &value["cells"][7 * CLASSIC_MAP_SIZE + 3];
    assert_eq!(revealed[7][1][1], "secret");
    assert_eq!(revealed[7][1][2], "revealed");
    let hidden = &value["cells"][7 * CLASSIC_MAP_SIZE + 4];
    assert_eq!(hidden[7][1][2], "hidden");
    assert_eq!(value["boatReplacementProfiles"]["removed"][5], 2);
    assert_eq!(value["boatReplacementProfiles"]["placed"][5], 1);

    let reopened: RebuiltV3Topology = serde_json::from_str(&encoded).expect("reimport topology");
    assert_eq!(reopened, topology);
}

#[test]
fn special_land_overlay_cannot_be_silently_dropped() {
    let error = project_land_topologies(&topology_snapshot(), &BTreeMap::new())
        .expect_err("missing special-land asset must block projection");

    assert_eq!(
        error,
        RebuiltV3TopologyError::MissingSpecialLandAssets(vec![-99])
    );
}

#[test]
fn land_preflight_precedes_map_shape_and_runtime_failures() {
    let mut snapshot = topology_snapshot();
    snapshot.world.maps[0].tiles = vec![-1099];
    snapshot.world.maps[0].runtime = None;
    assert_eq!(
        project_land_topologies(&snapshot, &BTreeMap::new()).unwrap_err(),
        RebuiltV3TopologyError::MissingSpecialLandAssets(vec![-99])
    );
    let assets = BTreeMap::from([(-99, StableId("asset.special-land.-99".into()))]);
    assert_eq!(
        project_land_topologies(&snapshot, &assets).unwrap_err(),
        RebuiltV3TopologyError::InvalidCellCount {
            map: StableId("land:0".into()),
            actual: 1,
        }
    );
    snapshot.world.maps[0].tiles = vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    assert_eq!(
        project_land_topologies(&snapshot, &assets).unwrap_err(),
        RebuiltV3TopologyError::MissingRuntimeMetadata(StableId("land:0".into()))
    );
}

#[test]
fn positive_land_values_above_the_classic_atlas_use_the_base_tile_profile() {
    let mut snapshot = topology_snapshot();
    snapshot.world.maps[0].tiles[0] = 430;
    snapshot.terrain_catalog[0].movement_cost = 9;
    let assets = BTreeMap::from([(-99, StableId("asset.special-land.-99".into()))]);

    let topology = project_land_topologies(&snapshot, &assets)
        .expect("out-of-atlas positive tile uses the Classic base")
        .remove(0);

    assert_eq!(topology.cells[0].0, StableId("classic.terrain.4".into()));
    assert_eq!(topology.cells[0].1, 9);
    assert_eq!(topology.cells[0].8, 4);
    assert_eq!(topology.cells[0].10, None);
}

#[test]
fn data_solids_blocks_a_negative_overlay_without_borrowing_los_semantics() {
    let mut snapshot = topology_snapshot();
    snapshot.world.maps[0].tiles[0] = -7;
    snapshot
        .world
        .special_land_solidity
        .as_mut()
        .expect("solidity fixture")
        .solid[7] = true;
    let assets = BTreeMap::from([
        (-99, StableId("asset.special-land.-99".into())),
        (-7, StableId("asset.special-land.-7".into())),
    ]);

    let topology = project_land_topologies(&snapshot, &assets)
        .expect("Data Solids projection")
        .remove(0);
    let cell = &topology.cells[0];

    assert_eq!(cell.0, StableId("classic.terrain.4".into()));
    assert_eq!(cell.10, Some(StableId("asset.special-land.-7".into())));
    assert_eq!(cell.2 & 1, 0, "solid overlay must not be passable");
    assert_eq!(cell.2 & 2, 0, "negative overlays do not block Classic LOS");
    assert_eq!(cell.6[0].1 & 1, 0, "solid overlay must expose a wall edge");
    assert_eq!(cell.6[0].1 & 2, 0, "wall edge must not invent LOS blocking");
}

#[test]
fn dormant_placed_rows_retain_topology_ids_but_unplaced_rows_do_not() {
    let mut snapshot = topology_snapshot();
    let assets = BTreeMap::from([(-99, StableId("asset.special-land.-99".into()))]);

    for chance in [0, -100] {
        snapshot.world.action_points[0].chance_percent = chance;
        let topology = project_land_topologies(&snapshot, &assets)
            .expect("dormant topology")
            .remove(0);
        assert_eq!(
            topology.cells[7 * CLASSIC_MAP_SIZE + 2].4,
            vec![StableId("Data DD:0:5".into())]
        );
    }

    snapshot.world.action_points[0].coordinate = None;
    let topology = project_land_topologies(&snapshot, &assets)
        .expect("unplaced topology")
        .remove(0);
    assert!(topology.cells[7 * CLASSIC_MAP_SIZE + 2].4.is_empty());
}
