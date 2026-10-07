use super::*;
use serde_json::json;

#[test]
fn restored_scenario_cicn_becomes_the_authored_land_overlay() {
    let mut world = json!({"battleTerrainSets": [{"id": "terrain.4", "baseTile": 111}], "maps": [{"id": "land:2", "levelType": "land", "metadata": {"battleTerrainSetId": "terrain.4"}, "cells": [
        ["classic.terrain.785", 1, 5, null, [], [], [], [], 785, "classic.landlook.4", null, 0, 1],
        ["classic.terrain.111", 5, 7, 82, [], [], [["open", 7, null, null]], [], 111, "classic.landlook.4", null, 0, 5]
    ]}]});
    let identities = BTreeMap::from([(785, "scenario-cicn-785".into())]);

    assert_eq!(
        restore_land_overlay_references(&mut world, &identities).unwrap(),
        1
    );
    assert_eq!(world["maps"][0]["cells"][0][0], "classic.terrain.111");
    assert_eq!(world["maps"][0]["cells"][0][8], 111);
    assert_eq!(world["maps"][0]["cells"][0][10], "scenario-cicn-785");
}

#[test]
fn short_overlay_cells_fail_without_changing_their_authored_fields() {
    let identities = BTreeMap::from([(785, "scenario-cicn-785".into())]);
    let profile = Some(vec![Value::Null; 13]);
    for length in [11, 12] {
        let mut fields = vec![Value::Null; length];
        fields[0] = json!("classic.terrain.785");
        let mut cell = Value::Array(fields);
        let original = cell.clone();

        assert_eq!(
            restore_cell_overlay(&mut cell, &profile, &identities, "land:2"),
            Err(format!(
                "land map land:2 has scenario CICN 785 in a cell with {length} fields; overlay restoration requires at least 13"
            ))
        );
        assert_eq!(cell, original);
    }
}
