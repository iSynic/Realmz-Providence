use super::*;

#[test]
fn native_control_requires_owner_capability_and_cannot_author_project_changes() {
    let mut fixture = Fixture::new();
    let attached = fixture.attach(1, "native");
    let binding = attached["nativeControl"].clone();
    let mut bad = binding.clone();
    bad["token"] = json!("wrong");
    fixture.reject(
        2,
        "host.attach",
        attach(bad),
        "native-control-authentication:",
    );
    assert!(
        fixture
            .request(2, "host.attach", attach(binding.clone()))
            .ok
    );
    let mut draft = fixture.meta();
    draft["active"] = json!(false);
    let registered = fixture.request(2, "session.draft", draft.clone());
    assert!(registered.ok, "{:?}", registered.error);
    assert!(!fixture.state.has_drafts());
    assert_eq!(
        registered.result.unwrap()["clients"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    for method in [
        "changes.prepare",
        "changes.commit",
        "history.undo",
        "session.write-permit",
        "session.external-edits",
        "session.release-hold",
        "session.replace-support",
        "session.detach",
    ] {
        fixture.reject(2, method, fixture.meta(), "native-control-only:");
    }
    assert_eq!(fixture.session.revision().0, 0);
    assert!(fixture.session.undo_history().is_empty());
}

#[test]
fn newer_control_rejects_late_clean_reports_and_cannot_outlive_its_native_owner() {
    let mut fixture = Fixture::new();
    let binding = fixture.attach(1, "native")["nativeControl"].clone();
    assert!(
        fixture
            .request(2, "host.attach", attach(binding.clone()))
            .ok
    );
    let mut draft = fixture.meta();
    draft["active"] = json!(true);
    assert!(
        fixture
            .request(5, "host.attach", attach(binding.clone()))
            .ok
    );
    assert!(fixture.request(5, "session.draft", draft.clone()).ok);
    let mut stale_clean = draft.clone();
    stale_clean["active"] = json!(false);
    fixture.reject(2, "session.draft", stale_clean, "native-control-stale:");
    fixture.reject(
        2,
        "host.attach",
        attach(binding.clone()),
        "host-authentication:",
    );
    fixture.reject(
        3,
        "host.attach",
        attach(binding.clone()),
        "native-control-stale:",
    );
    fixture.state.disconnect(5).unwrap();
    fixture.reject(
        3,
        "host.attach",
        attach(binding.clone()),
        "native-control-stale:",
    );
    assert!(fixture.request(6, "host.attach", attach(binding)).ok);
    assert!(fixture.state.has_drafts());
    fixture.state.disconnect(1).unwrap();
    assert!(!fixture.state.has_connected_clients());
    fixture.reject(6, "session.draft", draft, "native-control-stale:");
    assert!(fixture.state.has_drafts());
    assert_eq!(fixture.session.revision().0, 0);
    assert!(fixture.session.undo_history().is_empty());
}

fn attach(binding: Value) -> Value {
    json!({"token":"fixture-token","protocol":providence_session_client::HOST_PROTOCOL,
        "client":{"kind":"native-control","nativeControl":binding,"supportInputs":[],
        "authority":providence_session_client::authority_identity(),"build":providence_core::build_identity::current("providence-native-adapter")}})
}
