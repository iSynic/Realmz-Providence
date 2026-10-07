use crate::{dispatch_result, dispatch_result_with_store};
use providence_core::model::{ProjectSnapshot, StableId};
use providence_core::session::{EditorSession, Revision};
use providence_storage::ProjectStore;
use serde_json::json;

#[test]
fn dungeon_feature_draft_preview_apply_history_and_checkpoint_round_trip_are_exact() {
    let mut seed = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "dungeon-feature-workflow".into(),
    )));
    dispatch_result(
        &mut seed,
        "map.create",
        json!({"expectedRevision":0,"levelType":"dungeon"}),
    )
    .unwrap();
    let mut snapshot = seed.snapshot().clone();
    snapshot.world.maps[0].tiles[0] = 0x9161_u16 as i16;
    snapshot.world.maps[0].tiles[1] = 0x8204_u16 as i16;
    let mut session = EditorSession::new(snapshot.clone());
    let cells = json!([{"x":0,"y":0},{"x":1,"y":0}]);
    let selected = dispatch_result(
        &mut session,
        "dungeon-cell.selection",
        json!({"identity":"dungeon:0","cells":cells}),
    )
    .unwrap();
    let wall = selected["features"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["primitive"] == "wall")
        .unwrap();
    assert_eq!(wall["enabled"], json!(null));
    assert_eq!(selected["features"].as_array().unwrap().len(), 12);
    let params = json!({"identity":"dungeon:0","expectedRevision":0,"edit":{"cells":cells,"changes":[
        {"primitive":"wall","enabled":false},{"primitive":"stairs","enabled":true}]}});
    let preview = dispatch_result(
        &mut session,
        "dungeon-cell.preview-features",
        params.clone(),
    )
    .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(preview["managedCells"], 2);
    assert_eq!(preview["renderCells"][0]["spriteLayers"], 104);
    assert_eq!(preview["renderCells"][0]["behaviorOverlays"], 2);
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("project");
    let store = ProjectStore::create(&root, &snapshot).unwrap();
    let applied = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "dungeon-cell.apply-features",
        params.clone(),
    )
    .unwrap();
    assert_eq!(applied["paintedCells"], preview["paintedCells"]);
    assert_eq!(applied["renderCells"], preview["renderCells"]);
    assert!(applied.get("snapshot").is_none() && applied.get("map").is_none());
    assert_eq!(session.revision(), Revision(1));
    let after = session.snapshot().clone();
    assert!(dispatch_result(&mut session, "dungeon-cell.apply-features", params).is_err());
    assert_eq!(session.snapshot(), &after);
    assert_checkpoint_history_and_native_words(&store, &root, &session, &snapshot, &after);
}

fn assert_checkpoint_history_and_native_words(
    store: &ProjectStore,
    root: &std::path::Path,
    session: &EditorSession,
    snapshot: &ProjectSnapshot,
    after: &ProjectSnapshot,
) {
    store
        .checkpoint_session(session, &json!({"method":"dungeon-cell.apply-features"}))
        .unwrap();
    let (_, mut reopened) = ProjectStore::open_session(root).unwrap();
    assert_eq!(reopened.snapshot(), after);
    dispatch_result(&mut reopened, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(reopened.snapshot(), snapshot);
    dispatch_result(&mut reopened, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(reopened.snapshot(), after);
    let bytes = providence_core::codecs::encode_dungeon_maps(&after.world.maps, None).unwrap();
    assert_eq!(&bytes[..2], &[0x91, 0x68]);
    assert_eq!(&bytes[2..4], &[0x82, 0x0c]);
}

#[test]
fn dungeon_feature_adapter_rejects_stale_or_invalid_drafts_without_partial_effects() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "dungeon-rejections".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"dungeon"}),
    )
    .unwrap();
    let before = session.snapshot().clone();
    let params = json!({"identity":"dungeon:0","expectedRevision":1,"edit":{"cells":[{"x":0,"y":0}],
        "changes":[{"primitive":"stairs","enabled":true},{"primitive":"note-marker","enabled":false}]}});
    assert!(dispatch_result(&mut session, "dungeon-cell.apply-features", params.clone()).is_err());
    let mut stale = params.clone();
    stale["expectedRevision"] = json!(0);
    assert!(dispatch_result(&mut session, "dungeon-cell.preview-features", stale).is_err());
    let mut outside = params;
    outside["edit"]["cells"] = json!([{"x":0,"y":0},{"x":90,"y":0}]);
    assert!(dispatch_result(&mut session, "dungeon-cell.apply-features", outside).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(1));
}
