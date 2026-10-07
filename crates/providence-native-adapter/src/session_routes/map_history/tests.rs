use crate::dispatch_result;
use providence_core::{
    model::{LevelType, MapLevel, ProjectSnapshot, StableId},
    session::EditorSession,
};
use serde_json::json;

fn session() -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("terrain-history".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Map".into(),
        tiles: vec![1; 8100],
        runtime: None,
    });
    EditorSession::new(snapshot)
}

#[test]
fn terrain_history_delta_restores_cells_after_checkpoint_reopen_and_rejects_stale_undo() {
    let mut session = session();
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("project");
    let store = providence_storage::ProjectStore::create(&path, session.snapshot()).unwrap();
    dispatch_result(
        &mut session,
        "map.paint-cells",
        json!({
            "expectedRevision": 0, "identity": "land:0",
            "cells": [{"x": 7, "y": 8, "tile": 90}, {"x": 8, "y": 8, "tile": 164}]
        }),
    )
    .unwrap();
    store
        .checkpoint_session(&session, &json!({"method": "map.paint-cells"}))
        .unwrap();
    let (_, mut reopened) = providence_storage::ProjectStore::open_session(&path).unwrap();
    let stale = dispatch_result(
        &mut reopened,
        "history.undo",
        json!({"expectedRevision": 0}),
    );
    assert!(stale.is_err());
    assert_eq!(reopened.snapshot(), session.snapshot());
    for (method, values) in [("history.undo", [1, 1]), ("history.redo", [90, 164])] {
        let revision = reopened.revision();
        let result =
            dispatch_result(&mut reopened, method, json!({"expectedRevision": revision})).unwrap();
        assert_eq!(
            result["mapTerrainDelta"],
            json!({"identity": "land:0", "cells": [
                    {"x": 7, "y": 8, "tile": values[0], "blocksLos": false, "hiddenPath": false, "combatClearing": false},
                    {"x": 8, "y": 8, "tile": values[1], "blocksLos": false, "hiddenPath": false, "combatClearing": false}
            ]})
        );
        assert_eq!(
            reopened.snapshot().world.maps[0].tiles[8 * 90 + 7],
            values[0]
        );
        assert!(result.get("map").is_none());
        assert!(result.get("snapshot").is_none());
    }
    assert_eq!(reopened.snapshot(), session.snapshot());
}

#[test]
fn terrain_history_updates_los_hints_using_the_core_projection() {
    use providence_core::codecs::{MAPSTATS_CORE_BYTES, decode_landlook_mapstats};
    use providence_core::model::BlobId;
    let mut snapshot = session().snapshot().clone();
    let mut bytes = vec![0; MAPSTATS_CORE_BYTES];
    bytes[90 * 40 + 12..90 * 40 + 14].copy_from_slice(&1i16.to_be_bytes());
    snapshot.terrain_catalog = decode_landlook_mapstats(&bytes, 0, "test", BlobId("f".repeat(64)))
        .unwrap()
        .profiles;
    for profile in &mut snapshot.terrain_catalog {
        profile.landlook = None;
    }
    let mut session = EditorSession::new(snapshot);
    dispatch_result(
        &mut session,
        "map.paint-cells",
        json!({
            "expectedRevision": 0, "identity": "land:0", "cells": [{"x": 7, "y": 8, "tile": 90}]
        }),
    )
    .unwrap();
    for (method, expected) in [("history.undo", false), ("history.redo", true)] {
        let revision = session.revision();
        let result =
            dispatch_result(&mut session, method, json!({"expectedRevision": revision})).unwrap();
        assert_eq!(result["mapTerrainDelta"]["cells"][0]["blocksLos"], expected);
        let opened =
            dispatch_result(&mut session, "map.open", json!({"identity": "land:0"})).unwrap();
        assert_eq!(
            opened["losBlockers"]
                .as_array()
                .unwrap()
                .contains(&json!({"x": 7, "y": 8})),
            expected
        );
    }
}

#[test]
fn terrain_history_keeps_overlay_and_map_lifecycle_refreshes_complete() {
    let mut session = session();
    dispatch_result(
        &mut session,
        "map.update-cell",
        json!({
            "expectedRevision": 0, "identity": "land:0", "x": 7, "y": 8, "tile": 1090
        }),
    )
    .unwrap();
    let result =
        dispatch_result(&mut session, "history.undo", json!({"expectedRevision": 1})).unwrap();
    assert!(result.get("mapTerrainDelta").is_none());
    assert_eq!(session.snapshot().world.maps[0].tiles[8 * 90 + 7], 1);
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision": 2, "levelType": "land"}),
    )
    .unwrap();
    let result =
        dispatch_result(&mut session, "history.undo", json!({"expectedRevision": 3})).unwrap();
    assert!(result.get("mapTerrainDelta").is_none());
    assert_eq!(session.snapshot().world.maps.len(), 1);
}

#[test]
fn terrain_history_projection_is_bounded_and_rejects_changed_map_metadata() {
    let before = session().snapshot().world.maps[0].clone();
    let mut after = before.clone();
    after.tiles[..1024].fill(90);
    assert_eq!(
        super::terrain_delta(&before, &after).unwrap()["cells"]
            .as_array()
            .unwrap()
            .len(),
        1024
    );
    after.tiles[1024] = 90;
    assert!(super::terrain_delta(&before, &after).is_none());
    after = before.clone();
    after.tiles[0] = 90;
    after.name = "Renamed".into();
    assert!(super::terrain_delta(&before, &after).is_none());
    after.name = before.name.clone();
    after.native_index = 1;
    assert!(super::terrain_delta(&before, &after).is_none());
}
