use crate::dispatch_result;
use crate::dispatch_result_with_store;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;

#[test]
fn raw_cell_deltas_refresh_terrain_without_transporting_the_map() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "raw-terrain".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision": 0, "levelType": "land"}),
    )
    .unwrap();
    let revision = session.revision();
    let result = dispatch_result(
        &mut session,
        "map.paint-cells",
        json!({
            "expectedRevision": revision, "identity": "land:0", "cells": [
                {"x": 0, "y": 0, "tile": 77}, {"x": 1, "y": 0, "tile": -3112},
                {"x": 2, "y": 0, "tile": 0}, {"x": 3, "y": 0, "tile": 0x6000 | 2112}
            ]
        }),
    )
    .unwrap();
    assert_eq!(
        result["terrainCells"],
        json!([
            {"x": 0, "y": 0, "tile": 77}, {"x": 1, "y": 0, "tile": null},
            {"x": 2, "y": 0, "tile": 1}, {"x": 3, "y": 0, "tile": 112}
        ])
    );
    assert_eq!(
        result["paintedCells"][1],
        json!({"x": 1, "y": 0, "tile": -112})
    );
    assert!(result.get("map").is_none());
    assert!(result.get("snapshot").is_none());
    assert!(result.get("terrainTiles").is_none());
}

#[test]
fn terrain_paint_preview_checkpoint_reopen_and_compiled_words_are_exact() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "terrain-workflow".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision": 0, "levelType": "land"}),
    )
    .unwrap();
    for (x, tile) in [(0, 0x6000 | 1112), (1, -3112), (2, 2112)] {
        let revision = session.revision();
        dispatch_result(&mut session, "map.update-cell", json!({"expectedRevision": revision, "identity": "land:0", "x": x, "y": 0, "tile": tile})).unwrap();
    }
    let before = session.snapshot().clone();
    let revision = session.revision();
    let tileset = &before.world.maps[0].runtime.as_ref().unwrap().tileset_id;
    let params = json!({"expectedRevision": revision, "identity": "land:0", "paint": {
        "tilesetId": tileset, "cells": [{"x": 0, "y": 0, "tile": 90}, {"x": 1, "y": 0, "tile": 90}, {"x": 2, "y": 0, "tile": 90}]
    }});
    let preview = dispatch_result(&mut session, "map.preview-terrain", params.clone()).unwrap();
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), revision);
    assert_eq!(preview["protectedCells"], json!([]));
    assert_eq!(
        preview["paintedCells"],
        json!([{"x": 0, "y": 0, "tile": 0x6000 | 1090}, {"x": 1, "y": 0, "tile": 90}, {"x": 2, "y": 0, "tile": 2090}])
    );
    let temporary = tempfile::tempdir().unwrap();
    let project_root = temporary.path().join("project");
    let store = ProjectStore::create(&project_root, &before).unwrap();
    let committed = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "map.paint-terrain",
        params.clone(),
    )
    .unwrap();
    assert_eq!(committed["paintedCells"], preview["paintedCells"]);
    assert_eq!(committed["protectedCells"], preview["protectedCells"]);
    assert!(committed.get("snapshot").is_none());
    assert!(committed.get("map").is_none());
    assert_eq!(session.revision(), Revision(revision.0 + 1));
    let after = session.snapshot().clone();
    assert!(dispatch_result(&mut session, "map.paint-terrain", params.clone()).is_err());
    assert!(dispatch_result(&mut session, "map.preview-terrain", params).is_err());
    assert_eq!(session.snapshot(), &after);
    store
        .checkpoint_session(&session, &json!({"method": "map.paint-terrain"}))
        .unwrap();
    let (_, mut reopened) = ProjectStore::open_session(&project_root).unwrap();
    assert_eq!(reopened.snapshot(), &after);
    assert_paint_history_restores_snapshots(&mut reopened, &before, &after);
    let bytes = providence_core::codecs::encode_land_maps(&after.world.maps, None).unwrap();
    assert_eq!(&bytes[..2], &[0x64, 0x42]);
    assert_eq!(&bytes[180..182], &[0x00, 0x5a]);
    assert_eq!(&bytes[360..362], &[0x08, 0x2a]);
}

fn assert_paint_history_restores_snapshots(
    reopened: &mut EditorSession,
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
) {
    let undo_revision = reopened.revision();
    dispatch_result(
        reopened,
        "history.undo",
        json!({"expectedRevision": undo_revision}),
    )
    .unwrap();
    assert_eq!(reopened.snapshot(), before);
    let redo_revision = reopened.revision();
    dispatch_result(
        reopened,
        "history.redo",
        json!({"expectedRevision": redo_revision}),
    )
    .unwrap();
    assert_eq!(reopened.snapshot(), after);
}
