use crate::dispatch_result;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
};
use serde_json::json;

#[test]
fn native_region_selection_is_revision_bound_pure_and_exposes_mixed_features() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "region-selection".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"dungeon"}),
    )
    .unwrap();
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles[0] = 0;
    let mut session = EditorSession::new(snapshot.clone());
    let params = json!({"identity":"dungeon:0","expectedRevision":0,"selection":{
        "shape":"rectangle","start":{"x":0,"y":0},"end":{"x":1,"y":1},
        "filled":true,"operation":"replace","current":[]}});
    let selected = dispatch_result(&mut session, "map.selection-preview", params.clone()).unwrap();
    assert_eq!(selected["cells"].as_array().unwrap().len(), 4);
    assert_eq!(
        selected["features"]
            .as_array()
            .unwrap()
            .iter()
            .find(|feature| feature["primitive"] == "wall")
            .unwrap()["enabled"],
        json!(null)
    );
    assert!(selected.get("snapshot").is_none() && selected.get("map").is_none());
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision(), Revision(0));
    let mut stale = params.clone();
    stale["expectedRevision"] = json!(1);
    assert!(dispatch_result(&mut session, "map.selection-preview", stale).is_err());
    let mut subtract = params;
    subtract["selection"]["operation"] = json!("subtract");
    subtract["selection"]["current"] = selected["cells"].clone();
    let empty = dispatch_result(&mut session, "map.selection-preview", subtract).unwrap();
    assert_eq!(empty["cells"], json!([]));
    assert_eq!(empty["features"], json!([]));
    assert_eq!(session.snapshot(), &snapshot);
}
