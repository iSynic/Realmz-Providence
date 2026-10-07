use crate::dispatch_result;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use serde_json::json;

#[test]
fn smart_draft_preview_is_pure_and_apply_uses_one_revision_with_atomic_history() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "smart-adapter".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let before = session.snapshot().clone();
    let params = json!({"identity":"land:0","expectedRevision":1,"intent":{"tilesetId":"classic.landlook.0","preset":"water","mask":[{"x":5,"y":4},{"x":6,"y":4},{"x":7,"y":4}]}});
    let plan = dispatch_result(&mut session, "smart-terrain.preview", params.clone()).unwrap();
    assert_eq!(session.snapshot(), &before);
    assert_eq!(plan["paintedCells"].as_array().unwrap().len(), 3);
    let applied = dispatch_result(&mut session, "smart-terrain.apply", params.clone()).unwrap();
    assert_eq!(applied["paintedCells"], plan["paintedCells"]);
    assert_eq!(session.revision().0, 2);
    assert!(dispatch_result(&mut session, "smart-terrain.apply", params).is_err());
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), &before);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":3})).unwrap();
    assert_ne!(session.snapshot(), &before);
}

#[test]
fn unavailable_and_unresolved_are_distinct_and_reshape_never_mutates_the_project() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "smart-bounds".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let before = session.snapshot().clone();
    let base = json!({"identity":"land:0","expectedRevision":1});
    assert_eq!(
        dispatch_result(&mut session, "smart-terrain.open", base.clone()).unwrap()["available"],
        true
    );
    let mut request = base.clone();
    request["mask"] = json!([{"x":0,"y":0}]);
    request["operation"] = json!("grow");
    assert_eq!(
        dispatch_result(&mut session, "smart-terrain.reshape", request).unwrap()["mask"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    let mut request = base.clone();
    request["intent"] =
        json!({"tilesetId":"classic.landlook.0","preset":"forest","mask":[{"x":8,"y":8}]});
    let plan = dispatch_result(&mut session, "smart-terrain.preview", request.clone()).unwrap();
    assert_eq!(plan["unresolvedCells"].as_array().unwrap().len(), 1);
    assert_eq!(plan["canApply"], true);
    assert_eq!(session.snapshot(), &before);
    let applied = dispatch_result(&mut session, "smart-terrain.apply", request).unwrap();
    assert_eq!(applied["paintedCells"], plan["paintedCells"]);
    assert_eq!(session.revision().0, 2);
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), &before);
}
