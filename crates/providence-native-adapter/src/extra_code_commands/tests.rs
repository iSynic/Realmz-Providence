use providence_core::model::ClassicAction;
use providence_core::model::ExtraActionPoint;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::io::Cursor;

fn session(opcode: i16) -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("settings-wire".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: opcode,
            target_native_id: 1,
        }],
    });
    EditorSession::new(snapshot)
}

fn params(revision: u64) -> Value {
    json!({"expectedRevision": revision, "edit": {
        "source":"extra-action-point:0", "slot":0, "targetNativeId":3,
        "values":[-32768,-1,0,1,32767], "secondaryValues":[1,2,3,4,5]
    }})
}

fn wire(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: Value,
) -> Value {
    let request = json!({"id": 17, "method": method, "params": params});
    let mut output = Vec::new();
    crate::transport::serve_io(
        session,
        store,
        Cursor::new(format!("{request}\n")),
        &mut output,
    )
    .unwrap();
    serde_json::from_slice(&output).unwrap()
}

#[test]
fn action_settings_wire_payload_is_strict_and_rejection_preserves_session() {
    let mut session = session(92);
    for (field, value) in [
        ("values", json!([1, 2, 3, 4])),
        ("values", json!([1, 2, 3, 4, 5, 6])),
        ("values", json!([1, 2, 3, 4, 32768])),
        ("values", json!([1, 2, 3, 4, -32769])),
        ("values", json!([1, 2, 3, 4, 0.5])),
        ("values", json!([1, 2, 3, 4, "5"])),
        ("values", Value::Null),
        ("secondaryValues", json!([1, 2, 3, 4])),
        ("secondaryValues", Value::Null),
        ("targetNativeId", json!(32768)),
        ("targetNativeId", json!(-1)),
        ("targetNativeId", json!("3")),
        ("slot", json!(256)),
        ("slot", json!(-1)),
        ("allowSharedUpdates", json!("true")),
        ("allowSharedUpdates", json!(1)),
        ("allowSharedUpdates", Value::Null),
        ("unrecognized", json!(true)),
    ] {
        let before = serde_json::to_value(session.persisted_state()).unwrap();
        let mut params = params(0);
        params["edit"][field] = value;
        let response = wire(&mut session, None, "action-settings.apply", params);
        assert_eq!(response["ok"], false, "{field}: {response}");
        assert!(!response["error"].as_str().unwrap().is_empty());
        assert_eq!(
            serde_json::to_value(session.persisted_state()).unwrap(),
            before
        );
    }
    for field in [
        "source",
        "slot",
        "targetNativeId",
        "values",
        "secondaryValues",
    ] {
        let mut params = params(0);
        params["edit"].as_object_mut().unwrap().remove(field);
        assert_eq!(
            wire(&mut session, None, "action-settings.apply", params)["ok"],
            false,
            "{field}"
        );
        assert_eq!(session.revision(), Revision(0));
    }
    let mut invalid = params(0);
    invalid.as_object_mut().unwrap().remove("expectedRevision");
    assert_eq!(
        wire(&mut session, None, "action-settings.apply", invalid)["ok"],
        false
    );
    assert_eq!(session.revision(), Revision(0));
    let response = wire(&mut session, None, "action-settings.apply", params(1));
    assert!(
        response["error"]
            .as_str()
            .unwrap()
            .starts_with("revision conflict:")
    );
}

#[test]
fn action_settings_apply_save_reopen_and_history_use_the_portable_session_path() {
    let temp = tempfile::Builder::new()
        .prefix("providence-action-settings-")
        .tempdir()
        .unwrap();
    let mut session = session(-92);
    let before = session.snapshot().clone();
    let store = ProjectStore::create(temp.path().join("project"), &before).unwrap();
    let initial = wire(
        &mut session,
        Some(&store),
        "validation.list",
        json!({"query":"Random-area settings"}),
    );
    assert_eq!(initial["ok"], true, "{initial}");
    assert!(
        initial
            .to_string()
            .contains("extra-code.opcode-92.primary-missing")
    );
    assert!(
        initial
            .to_string()
            .contains("extra-code.opcode-92.secondary-missing")
    );
    let response = wire(
        &mut session,
        Some(&store),
        "action-settings.apply",
        params(0),
    );
    assert_eq!(response["ok"], true, "{response}");
    let delta = &response["result"];
    assert_eq!(delta["revision"], 1);
    assert_eq!(delta["changedEntitiesTotal"], 3);
    assert_eq!(delta["truncated"], false);
    assert!(delta.get("snapshot").is_none());
    assert!(response.to_string().len() < 12000);
    let after = session.snapshot().clone();
    let (_, checkpointed) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(checkpointed.snapshot(), &after);
    assert_eq!(checkpointed.undo_history().len(), 1);
    let response = wire(&mut session, Some(&store), "project.save", json!({}));
    assert_eq!(response["ok"], true, "{response}");
    let (_, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.snapshot(), &after);
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(after.extra_action_points[0].actions[0].target_native_id, 3);
    assert_eq!(after.extra_action_points[0].actions[0].raw_opcode, -92);
    assert_eq!(after.extra_codes[0].values, [-32768, -1, 0, 1, 32767]);
    assert_eq!(after.extra_codes[1].values, [1, 2, 3, 4, 5]);
    let repaired = wire(
        &mut reopened,
        Some(&store),
        "validation.list",
        json!({"query":"Random-area settings"}),
    );
    assert_eq!(repaired["ok"], true);
    assert!(!repaired.to_string().contains("extra-code.opcode-92."));
    assert_eq!(
        wire(
            &mut reopened,
            Some(&store),
            "history.undo",
            json!({"expectedRevision":1})
        )["ok"],
        true
    );
    assert_eq!(reopened.snapshot(), &before);
    let (_, mut reopened_undo) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened_undo.snapshot(), &before);
    assert!(reopened_undo.can_redo());
    assert_eq!(
        wire(
            &mut reopened_undo,
            Some(&store),
            "history.redo",
            json!({"expectedRevision":2})
        )["ok"],
        true
    );
    let (_, durable_redo) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(durable_redo.snapshot(), &after);
    assert_eq!(durable_redo.revision(), Revision(3));
    let rejected = wire(
        &mut reopened_undo,
        Some(&store),
        "action-settings.apply",
        params(2),
    );
    assert!(
        rejected["error"]
            .as_str()
            .unwrap()
            .starts_with("revision conflict:")
    );
    let (_, unchanged) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(
        serde_json::to_value(unchanged.persisted_state()).unwrap(),
        serde_json::to_value(durable_redo.persisted_state()).unwrap()
    );
}
