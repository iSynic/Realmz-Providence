use super::*;

#[test]
fn compact_dungeon_topology_matches_pinned_bitfield_semantics() {
    let DungeonFixture {
        snapshot,
        detailed_index,
        hidden_secret_index,
    } = dungeon_fixture();

    let topology = project_rebuilt_v3_topologies(&snapshot, &BTreeMap::new())
        .expect("dungeon topology")
        .remove(0);
    let repeated = project_rebuilt_v3_topologies(&snapshot, &BTreeMap::new())
        .expect("repeat dungeon topology")
        .remove(0);
    assert_eq!(topology, repeated);
    assert_eq!(topology.boat_replacement_profiles, None);
    let value = serde_json::to_value(&topology).expect("topology JSON");
    assert_eq!(value["topologyFormat"], "realmz2.compact-cell-rows.v2");
    assert_eq!(value["boatReplacementProfiles"], serde_json::Value::Null);

    let detailed = &value["cells"][detailed_index];
    assert_detailed_cell(detailed);

    let hidden = &value["cells"][hidden_secret_index];
    assert_eq!(hidden[2], 3);
    assert_eq!(hidden[6][0], serde_json::json!(["wall", 6, null, null]));
    assert_eq!(
        hidden[6][3],
        serde_json::json!(["secret", 3, null, "dungeon:0:cell:3,8:secret:west"])
    );
    assert_eq!(hidden[7][0][2], "hidden");
    assert_eq!(hidden[7][0][3], "west");

    let encoded = serde_json::to_vec(&topology).expect("serialize topology");
    let reopened: RebuiltV3Topology = serde_json::from_slice(&encoded).expect("reimport topology");
    assert_eq!(reopened, topology);
}

fn assert_detailed_cell(detailed: &serde_json::Value) {
    assert_eq!(detailed[0], "classic.dungeon.wall");
    assert_eq!(detailed[1], 1);
    assert_eq!(detailed[2], 1);
    assert_eq!(detailed[3], serde_json::Value::Null);
    assert_eq!(detailed[4][0], "Data DDD:0:4");
    assert_eq!(detailed[5][0], "dungeon:0:rect:2");
    assert_eq!(
        detailed[6][0],
        serde_json::json!([
            "secret",
            5,
            "dungeon:0:cell:2,7:door",
            "dungeon:0:cell:2,7:secret:north"
        ])
    );
    assert_eq!(
        detailed[6][1],
        serde_json::json!(["door", 5, "dungeon:0:cell:2,7:door", null])
    );
    assert_eq!(detailed[7][0][1], "secret");
    assert_eq!(detailed[7][0][2], "revealed");
    assert_eq!(detailed[7][0][3], "north");
    assert_eq!(detailed[7][1][1], "door");
    assert_eq!(detailed[7][1][3], "horizontal");
    assert_eq!(detailed[7][8][1], "no-wall-in-battle");
    assert_eq!(detailed[8], 0);
    assert_eq!(detailed[9], "dungeon-top-down-302");
    assert_eq!(detailed[10], serde_json::Value::Null);
    assert_eq!(detailed[11], 0);
    assert_eq!(detailed[12], 0);
}
