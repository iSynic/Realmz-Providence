use crate::{dispatch_result, dispatch_result_with_store};
use providence_core::{
    model::{AssetDescriptor, BlobId, ClassicResourceKey, ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

#[test]
fn atomic_record_and_names_validate_before_commit_and_allocate_without_overwrite() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("maps".into())));
    dispatch_result(
        &mut session,
        "player-map.create",
        json!({"expectedRevision":0}),
    )
    .unwrap();
    let before = session.snapshot().clone();
    let mut record = before.world.player_maps[0].clone();
    record.note = "Élan\u{7}".into();
    record.markers[9].icon_id = -91;
    record.markers[9].x = 7;
    let names = json!({"availableName":"Élan\u{7}","unavailableName":"Unexplored"});
    let invalid_names = json!({"availableName":"🙂","unavailableName":"Unexplored"});
    let checked = dispatch_result(
        &mut session,
        "player-map.validate",
        json!({"expectedRevision":1,"playerMap":record,"names":invalid_names}),
    )
    .unwrap();
    assert_eq!(checked["valid"], false);
    assert!(
        dispatch_result(
            &mut session,
            "player-map.apply-draft",
            json!({"expectedRevision":1,"playerMap":record,"names":invalid_names})
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    let checked = dispatch_result(
        &mut session,
        "player-map.validate",
        json!({"expectedRevision":1,"playerMap":record,"names":names}),
    )
    .unwrap();
    assert_eq!(checked["valid"], true);
    assert_eq!(checked["noteBytes"], 5);
    assert_eq!(session.revision(), Revision(1));
    dispatch_result(
        &mut session,
        "player-map.apply-draft",
        json!({"expectedRevision":1,"playerMap":record,"names":names}),
    )
    .unwrap();
    assert_eq!(session.revision(), Revision(2));
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), &before);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":3})).unwrap();
    assert_eq!(
        session.snapshot().world.player_maps[0].markers[9].icon_id,
        -91
    );
}

#[test]
fn exact_signed_resource_picker_and_text_precedence_have_no_authoring_effects() {
    let temp = tempfile::tempdir().unwrap();
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("preview".into())));
    dispatch_result(
        &mut session,
        "player-map.create",
        json!({"expectedRevision":0}),
    )
    .unwrap();
    let store = ProjectStore::create(temp.path().join("project"), session.snapshot()).unwrap();
    install_signed_text(&mut session, &store);
    let mut record = session.snapshot().world.player_maps[0].clone();
    record.show = -201;
    record.picture_id = 30000;
    record.level = -3;
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "player-map.preview",
        json!({"expectedRevision":2,"playerMap":record}),
    )
    .unwrap();
    assert_eq!(preview["mode"], "scrolling-text");
    assert_eq!(preview["resource"]["identity"], "text.actual.-201");
    assert_eq!(preview["resource"]["text"], "Élan, exact TEXT");
    let page = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "player-map.resources.list",
        json!({"expectedRevision":2,"query":query("scrollingText", -201, "-201")}),
    )
    .unwrap();
    assert_eq!(
        page["page"]["items"][0]["targetIdentity"],
        "text.actual.-201"
    );
    assert_eq!(page["page"]["items"][0]["value"], -201);
    assert_eq!(session.revision(), Revision(2));
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "player-map.resource.preview",
            json!({"expectedRevision":1,"field":"scrollingText","value":-201})
        )
        .is_err()
    );
}

#[test]
fn extra_row_names_are_rejected_and_unavailable_signed_marker_can_be_retained() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("extra".into()));
    let mut record = providence_core::codecs::decode_player_maps(&vec![0; 340])
        .records
        .remove(0);
    record.identity = StableId("player-map:256".into());
    record.native_id.0 = 256;
    snapshot.world.player_maps.push(record.clone());
    let mut session = EditorSession::new(snapshot);
    assert!(dispatch_result(&mut session, "player-map.apply-draft", json!({"expectedRevision":0,"playerMap":record,"names":{"availableName":"Bad wrap","unavailableName":""}})).is_err());
    let page = dispatch_result_with_store(
        &mut session,
        None,
        "player-map.resources.list",
        json!({"expectedRevision":0,"query":query("marker", -91, "")}),
    )
    .unwrap();
    assert_eq!(page["page"]["items"][0]["value"], -91);
    assert_eq!(page["page"]["items"][0]["available"], false);
    assert_eq!(session.revision(), Revision(0));
}

fn query(field: &str, current: i16, search: &str) -> Value {
    json!({"field":field,"currentValue":current,"search":search,"ownership":"all","offset":0,"limit":64,"showUnavailable":false,"seekCurrent":true})
}

fn asset(
    identity: &str,
    resource_type: &str,
    id: i32,
    kind: &str,
    blob: BlobId,
    mime: &str,
    length: u64,
) -> AssetDescriptor {
    let mut descriptor: AssetDescriptor = serde_json::from_value(json!({"identity":identity,"label":"Exact resource","kind":kind,"blob":blob,"byteLength":length,"source":"authored","mimeType":mime})).unwrap();
    descriptor.classic_resource = Some(ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id: id,
    });
    descriptor
}

#[test]
fn allocation_preserves_occupied_slots_and_never_overwrites_a_full_catalog() {
    let mut session =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("allocation".into())));
    for id in 0..20 {
        let changed = dispatch_result(
            &mut session,
            "player-map.create",
            json!({"expectedRevision":id}),
        )
        .unwrap();
        assert_eq!(
            changed["changedEntities"],
            json!([format!("player-map:{id}")])
        );
    }
    let before = session.snapshot().clone();
    assert!(
        dispatch_result(
            &mut session,
            "player-map.create",
            json!({"expectedRevision":20})
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

fn install_signed_text(session: &mut EditorSession, store: &ProjectStore) {
    let blob = store.put_blob("Élan, exact TEXT".as_bytes()).unwrap();
    let asset = asset(
        "text.actual.-201",
        "TEXT",
        -201,
        "text-resource",
        blob,
        "text/plain",
        17,
    );
    session
        .execute(providence_core::session::ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: providence_core::session::EditorCommand::UpsertAsset {
                asset: Box::new(asset),
            },
        })
        .unwrap();
}
