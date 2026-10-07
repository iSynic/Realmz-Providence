use crate::dispatch_result;
use providence_core::{model::StableId, session::EditorSession};
use serde_json::json;

#[test]
fn bounded_intent_preview_atomic_apply_revision_and_history() {
    let mut session = EditorSession::new(providence_core::model::ProjectSnapshot::new_authored(
        StableId("intent-adapter".into()),
    ));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let map = session.snapshot().world.maps[0].clone();
    let params = json!({"expectedRevision":1,"identity":map.identity,"intent":{
        "tilesetId":map.runtime.unwrap().tileset_id,"cells":[{"x":2,"y":3},{"x":3,"y":3}],
        "operation":"paint","selectedTile":5,"replaceTile":null,"variation":"single",
        "variationTiles":[],"fillPercent":100,"seed":1234}});
    let before = session.snapshot().clone();
    let plan = dispatch_result(&mut session, "map.preview-intent", params.clone()).unwrap();
    assert_eq!(session.snapshot(), &before);
    assert_eq!(plan["paintedCells"].as_array().unwrap().len(), 2);
    let result = dispatch_result(&mut session, "map.apply-intent", params.clone()).unwrap();
    assert_eq!(result["paintedCells"], plan["paintedCells"]);
    assert_eq!(result["terrainCells"], plan["terrainCells"]);
    assert_eq!(session.revision().0, 2);
    assert!(dispatch_result(&mut session, "map.apply-intent", params.clone()).is_err());
    let mut no_op = params.clone();
    no_op["expectedRevision"] = json!(2);
    assert!(dispatch_result(&mut session, "map.apply-intent", no_op).is_err());
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), &before);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":3})).unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[3 * 90 + 2], 5);
}
