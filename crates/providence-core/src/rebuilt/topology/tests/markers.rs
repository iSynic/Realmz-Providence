use super::*;

fn with_native_tile(tile: i16) -> ProjectSnapshot {
    let mut snapshot = topology_snapshot();
    snapshot.world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 2] = tile;
    for id in [40, 76, 111, 158] {
        let mut profile = snapshot.terrain_catalog[1].clone();
        profile.tile = id;
        snapshot.terrain_catalog.push(profile);
    }
    snapshot
}

#[test]
fn placed_land_records_do_not_invent_native_map_markers() {
    // City of Bywater: coffin 6:2, accusations 5:68/6:68, office 5:65, treasury 5:74.
    for (tile, marked) in [
        (158, false),
        (111, false),
        (40, false),
        (1076, true),
        (1111, true),
    ] {
        for chance in [100, 0, -1] {
            let mut snapshot = with_native_tile(tile);
            snapshot.world.action_points[0].chance_percent = chance;
            let before = snapshot.clone();
            let assets = BTreeMap::from([(-99, StableId("asset.special-land.-99".into()))]);
            let topology = project_land_topologies(&snapshot, &assets)
                .unwrap()
                .remove(0);
            let cell = &topology.cells[7 * CLASSIC_MAP_SIZE + 2];
            assert_eq!(cell.4, vec![StableId("Data DD:0:5".into())]);
            assert_eq!(
                cell.7.iter().any(|feature| feature.1 == "action-point"),
                marked
            );
            assert_eq!(
                snapshot, before,
                "projection must preserve the placed definition"
            );
        }
    }
}

#[test]
fn native_markers_and_secrets_do_not_require_a_placed_record() {
    for (tile, state) in [
        (1158, None),
        (2158, Some("revealed")),
        (3158, Some("hidden")),
    ] {
        let mut snapshot = with_native_tile(tile);
        snapshot.world.action_points.clear();
        let assets = BTreeMap::from([(-99, StableId("asset.special-land.-99".into()))]);
        let topology = project_land_topologies(&snapshot, &assets)
            .unwrap()
            .remove(0);
        let cell = &topology.cells[7 * CLASSIC_MAP_SIZE + 2];
        assert!(cell.4.is_empty());
        assert!(cell.7.iter().any(|feature| feature.1 == "action-point"));
        assert_eq!(
            cell.7
                .iter()
                .find(|feature| feature.1 == "secret")
                .and_then(|feature| feature.2.as_deref()),
            state
        );
    }
}

#[test]
fn empty_placed_records_retain_native_first_match_order() {
    let mut snapshot = with_native_tile(158);
    let mut dormant = snapshot.world.action_points[0].clone();
    dormant.identity = StableId("action-point:land:0:18".into());
    dormant.record_index = 18;
    dormant.chance_percent = 0;
    let mut later = dormant.clone();
    later.identity = StableId("action-point:land:0:19".into());
    later.record_index = 19;
    later.chance_percent = 100;
    snapshot.world.action_points = vec![later, dormant];
    let assets = BTreeMap::from([(-99, StableId("asset.special-land.-99".into()))]);
    let topology = project_land_topologies(&snapshot, &assets)
        .unwrap()
        .remove(0);
    assert_eq!(
        topology.cells[7 * CLASSIC_MAP_SIZE + 2].4,
        vec![
            StableId("Data DD:0:18".into()),
            StableId("Data DD:0:19".into())
        ]
    );
    let projection = crate::rebuilt::project_rebuilt_v3_trigger_programs(&snapshot).unwrap();
    assert_eq!(projection.triggers.len(), 2);
    assert_eq!(projection.triggers[0].chance_percent, 0);
    assert_eq!(projection.triggers[1].chance_percent, 100);
    assert!(
        projection
            .programs
            .iter()
            .all(|program| program.instructions.is_empty())
    );
}
