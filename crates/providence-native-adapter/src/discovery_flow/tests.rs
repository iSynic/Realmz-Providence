use super::*;
use providence_core::model::{
    ClassicAction, ExtraActionPoint, NativeRecordId, ProjectSnapshot, ScenarioMessage, StableId,
};

fn fixture() -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("flow-service".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:349".into()),
        native_id: NativeRecordId(349),
        text: "A bounded caller fixture".into(),
        authored: true,
    });
    snapshot.extra_action_points = (0..140)
        .map(|id| ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: id as i32,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 349,
            }],
        })
        .collect();
    EditorSession::new(snapshot)
}

fn params(session: &EditorSession) -> Value {
    json!({"projectId":session.snapshot().project_id,"expectedRevision":session.revision(),
        "root":{"identity":"message:349","scope":"scenario"},"direction":"both","depth":2})
}

fn read_default(session: &EditorSession, p: &Value) -> Result<Value, String> {
    read(session, p, "test", || Ok(FlowCatalog::default()))
}

#[test]
fn bounded_pages_and_retry_preserve_snapshot_and_both_histories() {
    let session = fixture();
    let before = session.persisted_state();
    let mut p = params(&session);
    let first = read_default(&session, &p).unwrap();
    assert_eq!(first["graph"]["nodes"].as_array().unwrap().len(), 64);
    assert!(first["cursor"].is_string());
    p["cursor"] = first["cursor"].clone();
    let second = read_default(&session, &p).unwrap();
    assert_eq!(read_default(&session, &p).unwrap(), second);
    p["cursor"] = second["cursor"].clone();
    let third = read_default(&session, &p).unwrap();
    assert_eq!(third["graph"]["complete"], true);
    assert_eq!(third["graph"]["nodesTotal"], 141);
    assert_eq!(third["graph"]["edgesTotal"], 140);
    assert_eq!(before, session.persisted_state());
}

#[test]
fn continuation_cannot_cross_root_direction_filter_catalog_or_reopened_session() {
    let session = fixture();
    let mut p = params(&session);
    p["cursor"] = read_default(&session, &p).unwrap()["cursor"].clone();
    for (key, value) in [
        ("root", json!({"identity":"extra-action-point:0"})),
        ("direction", json!("upstream")),
        ("depth", json!(3)),
        ("categories", json!(["calls"])),
    ] {
        let mut changed = p.clone();
        changed[key] = value;
        assert!(
            read_default(&session, &changed)
                .unwrap_err()
                .contains("continuation expired")
        );
    }
    assert!(read(&session, &p, "different-catalog", || Ok(Default::default())).is_err());
    let reopened = EditorSession::from_persisted_state(session.persisted_state());
    assert!(read_default(&reopened, &p).is_err());
}

#[test]
fn guards_reject_wrong_project_stale_revision_and_invalid_queries() {
    let session = fixture();
    let before = session.persisted_state();
    for (key, value) in [
        ("projectId", json!("another")),
        ("expectedRevision", json!(42)),
        ("depth", json!(-1)),
        ("depth", json!(33)),
        ("direction", json!("around")),
        ("categories", json!(["unknown"])),
        ("cursor", json!("")),
        ("cursor", json!(17)),
        ("root", json!({"identity":"message:349","entryPosition":9})),
    ] {
        let mut p = params(&session);
        p[key] = value;
        assert!(read_default(&session, &p).is_err(), "{key}");
    }
    assert_eq!(before, session.persisted_state());
}

#[test]
fn catalog_only_record_has_honest_empty_graph_without_project_transport() {
    let session = fixture();
    let mut p = params(&session);
    p["root"] = json!({"identity":"personal:isolated","scope":"personal"});
    let result = read(&session, &p, "isolated", || {
        Ok(FlowCatalog {
            records: vec![providence_core::discovery::DiscoveryRecord {
                identity: "personal:isolated".into(),
                scope: "personal".into(),
                kind: "personal-asset".into(),
                native_id: String::new(),
                name: "Unassigned portrait".into(),
                root_reason: None,
                fields: vec![("privatePayload".into(), "must not be transported".into())],
            }],
            ..Default::default()
        })
    })
    .unwrap();
    assert_eq!(result["graph"]["nodesTotal"], 1);
    assert_eq!(result["graph"]["edgesTotal"], 0);
    assert_eq!(result["graph"]["complete"], true);
    assert!(!result.to_string().contains("must not be transported"));
    assert!(!result.to_string().contains("snapshot"));
}

#[test]
fn semantic_batches_keep_guards_bounds_and_godot_integer_context() {
    let session = fixture();
    let before = session.persisted_state();
    let mut p = params(&session);
    p["selections"] = json!([{"identity":"extra-action-point:40","scope":"scenario"}]);
    let response = summaries(&session, &p, None).unwrap();
    assert_eq!(
        response["items"][0]["summary"]["steps"]
            .as_array()
            .unwrap()
            .len(),
        8
    );
    assert_eq!(response["items"][0]["summary"]["usedSteps"], 1);
    let mut wrong = p.clone();
    wrong["projectId"] = json!("another-project");
    assert!(summaries(&session, &wrong, None).is_err());
    wrong = p.clone();
    wrong["expectedRevision"] = json!(999);
    assert!(summaries(&session, &wrong, None).is_err());
    for count in [0, 65] {
        wrong = p.clone();
        wrong["selections"] = json!(vec![p["selections"][0].clone(); count]);
        assert!(summaries(&session, &wrong, None).is_err());
    }
    p["root"] = json!({"identity":"simple-encounter:1:result:0","scope":"scenario","entryPosition":2.0,"throughPosition":5.0});
    p["depth"] = json!(4.0);
    let decoded = query(&p).unwrap();
    assert_eq!(decoded.root.entry_position, Some(2));
    assert_eq!(decoded.root.through_position, Some(5));
    p["selections"] = json!([p["root"]]);
    let response = summaries(&session, &p, None).unwrap();
    assert!(
        response["items"][0]["error"]
            .as_str()
            .unwrap()
            .contains("unavailable")
    );
    assert_eq!(before, session.persisted_state());
}
