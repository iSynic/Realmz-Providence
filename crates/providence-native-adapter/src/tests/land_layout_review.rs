use crate::{demo::demo_snapshot, dispatch_result};
use providence_core::model::LandLayout;
use providence_core::session::EditorSession;
use serde_json::json;

#[test]
fn layout_preview_is_pure_and_apply_matches_its_relocation_and_replacement_plan() {
    let mut session = EditorSession::new(demo_snapshot());
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let mut snapshot = session.snapshot().clone();
    let mut cells = vec![0; 128];
    cells[0] = -1;
    cells[17] = -1;
    cells[34] = 1;
    cells[100] = 99;
    cells[127] = -42;
    snapshot.world.land_layout = Some(LandLayout { cells });
    session = EditorSession::new(snapshot.clone());
    let params = json!({"expectedRevision":0,"row":2,"column":2,"target":"land:0"});
    let preview =
        dispatch_result(&mut session, "land-layout.preview-cell", params.clone()).unwrap();
    assert_eq!(preview["canApply"], true);
    assert_eq!(preview["placement"]["target"]["identity"], "land:0");
    assert_eq!(preview["placement"]["replaced"]["identity"], "land:1");
    assert_eq!(preview["placement"]["changes"].as_array().unwrap().len(), 3);
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision().0, 0);
    let applied = dispatch_result(&mut session, "land-layout.apply-cell", params.clone()).unwrap();
    assert_eq!(applied["layoutChanges"], preview["placement"]["changes"]);
    assert!(applied.get("snapshot").is_none());
    assert_eq!(applied["revision"], 1);
    let after = session.snapshot().clone();
    let cells = &after.world.land_layout.as_ref().unwrap().cells;
    assert_eq!(
        (cells[0], cells[17], cells[34], cells[100], cells[127]),
        (0, 0, -1, 99, -42)
    );
    assert!(dispatch_result(&mut session, "land-layout.apply-cell", params).is_err());
    assert_eq!(session.snapshot(), &after);
    let same = json!({"expectedRevision":1,"row":2,"column":2,"target":"land:0"});
    assert_eq!(
        dispatch_result(&mut session, "land-layout.preview-cell", same.clone()).unwrap()["canApply"],
        false
    );
    assert!(dispatch_result(&mut session, "land-layout.apply-cell", same).is_err());
    assert_eq!(session.revision().0, 1);
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), &after);
}
