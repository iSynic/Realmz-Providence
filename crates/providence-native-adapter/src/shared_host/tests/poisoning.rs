use super::*;

fn edit(fixture: &Fixture, operation: &str) -> Value {
    let mut params = json!({"expectedRevision":fixture.session.revision(),"operationId":operation.repeat(64),"levelType":"land"});
    params["_hostSession"] = fixture.meta();
    params
}

fn send(
    events: &mpsc::SyncSender<Event>,
    client: u64,
    method: &str,
    params: Value,
) -> mpsc::Receiver<Response> {
    let (reply, response) = mpsc::sync_channel(1);
    let request = Request {
        id: client,
        method: method.into(),
        params,
    };
    events.send(Event::Request(client, request, reply)).unwrap();
    response
}

#[test]
fn a_panicking_request_poisons_the_host_without_saving_or_stranding_other_clients() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "native");
    fixture.attach(2, "mcp");
    let acknowledged = fixture.request(1, "map.create", edit(&fixture, "a"));
    assert!(acknowledged.ok, "{:?}", acknowledged.error);
    let checkpointed = fixture.session.snapshot().clone();
    let (events, inbox) = mpsc::sync_channel(16);
    let panicked = send(&events, 1, "map.create", edit(&fixture, "b"));
    let mut prepare = fixture.meta();
    prepare["steps"] =
        json!([{"name":"map","tool":"providence_map_create","arguments":{"levelType":"dungeon"}}]);
    let refused = [
        send(&events, 2, "changes.prepare", prepare),
        send(&events, 2, "session.describe", json!({})),
        send(&events, 3, "host.attach", json!({})),
    ];
    events.send(Event::Disconnected(1)).unwrap();
    events.send(Event::Disconnected(2)).unwrap();
    let Fixture {
        session,
        store,
        libraries,
        state,
        root,
        ..
    } = fixture;
    let descriptor = root.path().join("host.endpoint.json");
    std::fs::write(&descriptor, "{}").unwrap();
    let startup = crate::startup::Startup {
        session,
        store: Some(store),
        libraries,
        timing: Default::default(),
    };
    crate::transport::arm_panic_before_checkpoint();
    serve(&inbox, startup, state, &descriptor).unwrap();

    let panicked = panicked.recv().unwrap();
    assert_eq!(panicked.outcome_unknown, Some(true));
    assert!(panicked.error.unwrap().starts_with("session-poisoned:"));
    for response in refused.map(|reply| reply.recv().unwrap()) {
        assert!(!response.ok && response.outcome_unknown.is_none());
        assert!(response.error.unwrap().starts_with("session-poisoned:"));
    }
    assert!(!descriptor.exists());
    let (_, reopened) = ProjectStore::open_session(root.path()).unwrap();
    assert_eq!(reopened.revision().0, 1);
    assert_eq!(reopened.snapshot(), &checkpointed);
}
