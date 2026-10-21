use super::*;

#[test]
fn lost_native_stale_rejection_is_recoverable_by_exact_original_intent() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    fixture.group(
        json!([{"name":"map","tool":"providence_map_create","arguments":{"levelType":"land"}}]),
        "initial-map",
    );
    fixture.attach(2, "native");
    let before = fixture.session.snapshot().clone();
    let id = "a".repeat(64);
    let intent = json!({"expectedRevision":0,"operationId":id,"levelType":"dungeon"});
    let mut request = intent.clone();
    request["_hostSession"] = fixture.meta();
    let rejected = fixture.request(2, "map.create", request.clone());
    assert!(
        !rejected.ok
            && rejected
                .error
                .as_deref()
                .unwrap()
                .starts_with("revision-conflict:")
    );
    // Ignore the reply, as if its acknowledgement was lost after host rejection.
    let mut lookup = json!({"domain":"project","operationId":id,"expectedIntent":{"method":"map.create","params":intent}});
    lookup["_hostSession"] = fixture.meta();
    let response = fixture.request(2, "world.operation.status", lookup);
    assert!(response.ok, "{:?}", response.error);
    let original = response.result.unwrap();
    assert_eq!(original["outcome"], "not-committed");
    assert_eq!(original["intent"]["params"], intent);
    assert_eq!(fixture.session.snapshot(), &before);
    let replay = fixture.request(2, "map.create", request);
    assert_eq!(replay.error, rejected.error);
    assert_eq!(fixture.session.revision().0, 1);
    let (store, _) = ProjectStore::open(fixture.store.root()).unwrap();
    assert_eq!(
        providence_storage::MonsterOperationStore::for_project(&store)
            .lookup(&id)
            .unwrap()["outcome"],
        "not-committed"
    );
}

#[test]
fn stale_mcp_commit_has_a_durable_rejection_without_replaying_its_stage() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    let mut stale = fixture.meta();
    fixture.group(
        json!([{"name":"map","tool":"providence_map_create","arguments":{"levelType":"land"}}]),
        "initial-map",
    );
    stale["previewToken"] = json!("old-token");
    stale["operationId"] = json!("stale-commit");
    fixture.reject(1, "changes.commit", stale.clone(), "revision-conflict:");
    let mut query = fixture.meta();
    query["operationId"] = json!("stale-commit");
    let receipt = fixture
        .request(1, "session.operation-status", query)
        .result
        .unwrap();
    assert_eq!(receipt["state"], "rejected");
    fixture.reject(1, "changes.commit", stale, "revision-conflict:");
    assert_eq!(fixture.session.revision().0, 1);
    assert_eq!(fixture.session.undo_history().len(), 1);
}
