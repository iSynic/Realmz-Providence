use super::*;

#[test]
fn a_changed_local_stamp_rejects_the_whole_prepared_project_change() {
    use providence_core::paint_resources::PaintResourceChange;
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    fixture.group(
        json!([{"name":"map","tool":"providence_map_create",
        "arguments":{"levelType":"land"}}]),
        "stamp-map",
    );
    let tileset = &fixture.session.snapshot().world.maps[0]
        .runtime
        .as_ref()
        .unwrap()
        .tileset_id;
    let mut resource: providence_core::paint_resources::PaintResource =
        serde_json::from_value(json!({
            "identity":"paint:local-test","name":"Village","collection":"Test","kind":"stamp",
            "levelType":"land","tilesetId":tileset,"width":1,"height":1,
            "cells":[{"x":0,"y":0,"tile":5}],"favorite":false
        }))
        .unwrap();
    fixture
        .store
        .change_paint_resources(
            0,
            PaintResourceChange::Create {
                resource: resource.clone(),
            },
        )
        .unwrap();
    let mut request = fixture.meta();
    request["steps"] = json!([
        {"name":"text","tool":"providence_message_create","arguments":{"nativeId":1,"text":"Village"}},
        {"name":"stamp","tool":"providence_map_stamp_apply","arguments":{
            "identity":"land:0","resourceIdentity":resource.identity,"resourceRevision":1,"origin":{"x":4,"y":5}}}
    ]);
    let prepared = fixture.request(1, "changes.prepare", request);
    assert!(prepared.ok, "{:?}", prepared.error);
    let token = prepared.result.unwrap()["previewToken"].clone();
    let before = fixture.session.snapshot().clone();
    resource.cells[0].tile = 6;
    fixture
        .store
        .change_paint_resources(1, PaintResourceChange::Replace { resource })
        .unwrap();
    let mut commit = fixture.meta();
    commit["operationId"] = json!("stale-stamp");
    commit["previewToken"] = token;
    fixture.reject(1, "changes.commit", commit, "paint-resource-changed:");
    assert_eq!(fixture.session.snapshot(), &before);
    assert_eq!(fixture.session.undo_history().len(), 1);
    assert!(fixture.session.snapshot().messages.is_empty());
}

#[test]
fn collection_receipt_queries_preserve_the_original_operation_and_its_local_history_scope() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "native");
    let before = fixture.session.snapshot().clone();
    let change = json!({"operation":"create","resource":{"identity":"paint:paths","name":"Paths",
        "collection":"Village","kind":"palette","levelType":"land","tilesetId":"tiles",
        "width":1,"height":1,"cells":[{"x":0,"y":0,"tile":5}],"favorite":true}});
    let mut write = fixture.meta();
    write["operationId"] = json!("a".repeat(64));
    write["resourceRevision"] = json!(0);
    write["change"] = change.clone();
    let saved = fixture.request(1, "paint-resources.apply", write.clone());
    assert!(saved.ok, "{:?}", saved.error);
    assert_eq!(
        saved.result.unwrap()["historyScope"],
        "local paint resources; outside project Undo/Redo"
    );
    let summary = fixture
        .request(1, "session.describe", fixture.meta())
        .result
        .unwrap();
    assert_eq!(summary["revision"], 0);
    assert_eq!(summary["localResourceCursor"], 1);
    let mut feed_request = fixture.meta();
    feed_request["cursor"] = json!(0);
    let feed = fixture
        .request(1, "session.changes", feed_request)
        .result
        .unwrap();
    assert_eq!(
        feed["changes"][0]["refreshScopes"],
        json!(["paint-resources"])
    );
    assert_eq!(feed["changes"][0]["revision"], 0);
    let original = fixture.request(1, "paint-resources.operation-status", write.clone());
    assert!(original.ok, "{:?}", original.error);
    assert_eq!(original.result.unwrap()["outcome"], "committed");
    write["operationId"] = json!("b".repeat(64));
    write["change"]["resource"]["identity"] = json!("paint:stale");
    assert!(
        !fixture
            .request(1, "paint-resources.apply", write.clone())
            .ok
    );
    let rejected = fixture.request(1, "paint-resources.operation-status", write);
    assert!(rejected.ok, "{:?}", rejected.error);
    assert_eq!(rejected.result.unwrap()["outcome"], "not-committed");
    assert_eq!(fixture.session.snapshot(), &before);
    assert!(fixture.session.undo_history().is_empty());
    assert_eq!(
        fixture.store.read_paint_resources().unwrap().entries.len(),
        1
    );
}
