use super::*;

#[test]
fn adapter_bounds_direct_map_coordinates_without_inventing_references() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (identity, values, keys) in [
        (
            "realmz.action.12",
            json!({"level": 0, "xOrDungeonY": 89, "yOrDungeonX": 0,
                "tileValue": 7, "isDungeon": 0}),
            ["xOrDungeonY", "yOrDungeonX"],
        ),
        (
            "realmz.action.37",
            json!({"mode": 0, "level": 3, "x": 89, "y": 0, "signedHeading": -2}),
            ["x", "y"],
        ),
    ] {
        let description = dispatch_result(
            &mut session,
            "action-form.describe",
            json!({"query": {
                "actionIdentity": identity, "targetNativeId": 33,
                "values": values, "context": {}
            }}),
        )
        .expect("describe direct map coordinates through adapter");
        for key in keys {
            let coordinate = description["fields"]
                .as_array()
                .unwrap()
                .iter()
                .find(|field| field["key"] == key)
                .unwrap();
            assert_eq!(coordinate["minimum"], 0);
            assert_eq!(coordinate["maximum"], 89);
            assert!(coordinate["targetKind"].is_null());
            assert!(coordinate["preview"].is_null());
        }
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn adapter_projects_destination_tile_choices_without_removing_raw_entry() {
    let mut session = EditorSession::new(demo_snapshot());
    let description = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.12", "targetNativeId": 33,
            "values": {"level": 0, "xOrDungeonY": 12, "yOrDungeonX": 18,
                "tileValue": 147, "isDungeon": 0}, "context": {}
        }}),
    )
    .unwrap();
    let tile = description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == "tileValue")
        .unwrap();
    assert_eq!(tile["control"], "integer");
    assert_eq!(tile["valuePickerKind"], "map-tile");
    assert_eq!(tile["valuePickerPreview"]["value"], 147);
    assert_eq!(tile["targetContext"]["mapIdentity"], "land:0");

    let page = dispatch_result(
        &mut session,
        "action-target.list",
        json!({"query": {
            "kind": "map-tile", "search": "147", "limit": 40,
            "context": tile["targetContext"]
        }}),
    )
    .unwrap();
    assert_eq!(page["total"], 1);
    assert_eq!(page["items"][0]["value"], 147);
}

#[test]
fn adapter_projects_named_dungeon_features_and_preserves_workflow_bits() {
    let mut session = EditorSession::new(demo_snapshot());
    let imported = (providence_core::codecs::DUNGEON_PRESERVED_HIGH_SIGN_MASK
        | providence_core::codecs::DUNGEON_NOTE_MARKER_MASK
        | providence_core::codecs::DUNGEON_ACTION_POINT_MARKER_MASK
        | providence_core::codecs::DUNGEON_WALL_MASK) as i16;
    let description = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.12", "targetNativeId": 33,
            "values": {"level": 0, "xOrDungeonY": 12, "yOrDungeonX": 18,
                "tileValue": imported, "isDungeon": 1},
            "context": {"authoring": {"modes": {
                "dungeon.wall": 0, "dungeon.verticalDoor": 1
            }}}
        }}),
    )
    .unwrap();
    let controls = description["authoring"]["controls"].as_array().unwrap();
    assert_eq!(controls.len(), 12);
    assert!(
        controls
            .iter()
            .any(|control| { control["key"] == "dungeon.verticalDoor" && control["value"] == 1 })
    );
    let resolved = description["authoring"]["resolvedValues"]["tileValue"]
        .as_i64()
        .unwrap() as i16 as u16;
    assert_eq!(resolved & providence_core::codecs::DUNGEON_WALL_MASK, 0);
    assert_ne!(
        resolved & providence_core::codecs::DUNGEON_VERTICAL_DOOR_MASK,
        0
    );
    assert_ne!(
        resolved & providence_core::codecs::DUNGEON_PRESERVED_HIGH_SIGN_MASK,
        0
    );
    assert_ne!(
        resolved & providence_core::codecs::DUNGEON_NOTE_MARKER_MASK,
        0
    );
    assert_ne!(
        resolved & providence_core::codecs::DUNGEON_ACTION_POINT_MARKER_MASK,
        0
    );
}
