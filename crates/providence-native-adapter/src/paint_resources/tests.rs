use super::*;
use crate::{dispatch_result, dispatch_result_with_store};
use providence_core::{model::ProjectSnapshot, session::EditorSession};

fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    super::dispatch(
        session,
        store,
        crate::catalogs::CatalogViews::default(),
        method,
        params,
    )
}

#[test]
fn resource_pages_and_stamp_use_real_store_revisions_without_authoring_preferences() {
    let temp = tempfile::tempdir().unwrap();
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "adapter-stamps".into(),
    )));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let store = ProjectStore::create(temp.path(), session.snapshot()).unwrap();
    let before = session.snapshot().clone();
    let template = json!({"identity":"stamp:town","name":"Town streets","collection":"Town","kind":"stamp", "levelType":"land",
        "tilesetId":"unused", "width":1,"height":1,"cells":[],"favorite":true});
    let capture = dispatch(
        &mut session,
        Some(&store),
        "paint-resources.capture",
        &json!({"expectedRevision":1,
        "identity":"land:0","cells":[{"x":0,"y":0}],"resource":template}),
    )
    .unwrap();
    let mut resource = capture["capture"]["resource"].clone();
    resource["cells"][0]["tile"] = json!(5);
    dispatch(
        &mut session,
        Some(&store),
        "paint-resources.apply",
        &json!({"expectedRevision":1,"resourceRevision":0,"operationId":"a".repeat(64),
        "change":{"operation":"create","resource":resource}}),
    )
    .unwrap();
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision().0, 1);
    let list = dispatch(
        &mut session,
        Some(&store),
        "paint-resources.list",
        &json!({"expectedRevision":1,"query":"streets","limit":1}),
    )
    .unwrap();
    assert_eq!(list["total"], 1);
    assert!(list["items"][0].get("cells").is_none());
    let params = json!({"expectedRevision":1,"resourceRevision":1,"identity":"land:0","resourceIdentity":"stamp:town","origin":{"x":2,"y":3}});
    let plan = dispatch(&mut session, Some(&store), "map-stamp.preview", &params).unwrap();
    assert_eq!(session.snapshot(), &before);
    let applied = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "map-stamp.apply",
        params.clone(),
    )
    .unwrap();
    assert_eq!(applied["preview"], plan["preview"]);
    assert_eq!(session.undo_history().len(), 2);
    assert_eq!(session.snapshot().world.maps[0].tiles[3 * 90 + 2], 5);
    assert!(dispatch(&mut session, Some(&store), "map-stamp.preview", &params).is_err());
    check_history_and_local_revision(&mut session, &store, &before);
}

fn check_history_and_local_revision(
    session: &mut EditorSession,
    store: &ProjectStore,
    before: &ProjectSnapshot,
) {
    dispatch_result(session, "history.undo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), before);
    dispatch_result(session, "history.redo", json!({"expectedRevision":3})).unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[3 * 90 + 2], 5);
    assert_eq!(store.read_paint_resources().unwrap().revision, 1);
}

#[test]
fn geometry_review_is_pure_revision_bound_and_preserves_holes() {
    let temp = tempfile::tempdir().unwrap();
    let mut session =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("geometry".into())));
    let store = ProjectStore::create(temp.path(), session.snapshot()).unwrap();
    let params = json!({"expectedRevision":0,"resource":{"identity":"paint:bridge","name":"Bridge","collection":"",
        "kind":"stamp","levelType":"land","tilesetId":"landlook:0","width":2,"height":2,
        "cells":[{"x":0,"y":0,"tile":0},{"x":1,"y":1,"tile":17}],"favorite":false},
        "edit":{"operation":"resize","width":4,"height":3,"fill":2}});
    let source = session.snapshot().clone();
    let result = dispatch(
        &mut session,
        Some(&store),
        "paint-resources.geometry",
        &params,
    )
    .unwrap();
    assert_eq!(
        result["preview"]["resource"]["cells"],
        params["resource"]["cells"]
    );
    assert_eq!(result["preview"]["added"], 0);
    assert_eq!(session.snapshot(), &source);
    assert_eq!(store.read_paint_resources().unwrap().revision, 0);
    let mut stale = params.clone();
    stale["expectedRevision"] = json!(1);
    assert!(
        dispatch(
            &mut session,
            Some(&store),
            "paint-resources.geometry",
            &stale
        )
        .is_err()
    );
    let mut extra = params;
    extra["edit"]["discardUnreviewed"] = json!(true);
    assert!(
        dispatch(
            &mut session,
            Some(&store),
            "paint-resources.geometry",
            &extra
        )
        .is_err()
    );
}

#[test]
fn builtins_are_bounded_contextual_and_cannot_be_relabelled_by_local_entries() {
    let temp = tempfile::tempdir().unwrap();
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("presets".into())));
    dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let store = ProjectStore::create(temp.path(), session.snapshot()).unwrap();
    let params = json!({"identity":"land:0","expectedRevision":1,"scope":"built-in","query":"tree","limit":1});
    let list = dispatch(&mut session, Some(&store), "paint-resources.list", &params).unwrap();
    assert_eq!(list["items"].as_array().unwrap().len(), 1);
    assert_eq!(list["total"], 2);
    assert_eq!(list["nextOffset"], 1);
    assert_eq!(list["items"][0]["ownership"], "built-in");
    let origin = json!({"expectedRevision":1,"resourceRevision":0,"identity":"land:0","resourceIdentity":"preset:tree-pair-151-152","origin":{"x":8,"y":8}});
    assert!(
        list["items"][0]["availabilityReason"]
            .as_str()
            .unwrap()
            .contains("artwork")
    );
    assert!(
        dispatch(&mut session, Some(&store), "map-stamp.preview", &origin).is_err(),
        "A Landlook number without resolved artwork cannot certify a built-in stamp"
    );
    let mut bad_origin = origin.clone();
    bad_origin["origin"]["x"] = json!(250);
    assert!(dispatch(&mut session, Some(&store), "map-stamp.preview", &bad_origin).is_err());
    bad_origin = origin;
    bad_origin["resourceIdentity"] = json!("preset:castle-bed-156-157");
    assert!(dispatch(&mut session, Some(&store), "map-stamp.preview", &bad_origin).is_err());
    assert_eq!(session.revision().0, 1);
    assert_eq!(store.read_paint_resources().unwrap().revision, 0);
}
