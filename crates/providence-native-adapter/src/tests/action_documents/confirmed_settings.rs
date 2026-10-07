use super::*;
use providence_core::model::{ClassicAction, ExtraActionPoint, ExtraCodeRow};
use providence_storage::ProjectStore;

fn session() -> EditorSession {
    let mut snapshot = demo_snapshot();
    let action = ClassicAction {
        slot: 1,
        raw_opcode: 19,
        target_native_id: 12,
    };
    snapshot.world.action_points[0].actions = vec![action.clone()];
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: -1,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![action],
    });
    snapshot.extra_codes = vec![ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: [1, 2, 0, 0, 0],
    }];
    EditorSession::new(snapshot)
}

fn steps() -> serde_json::Value {
    json!([{"slot": 1, "actionIdentity": "realmz.action.19", "targetNativeId": 12,
        "settings": {"values": {"messageLow": 8, "messageHigh": 9}}}])
}

#[test]
fn native_ap_and_xap_preview_confirm_and_apply_use_exact_core_impact() {
    for extra in [false, true] {
        let mut session = session();
        let before = session.persisted_state();
        let source = if extra {
            "extra-action-point:0"
        } else {
            "action-point:land:0:17"
        };
        let peer = if extra {
            "action-point:land:0:17"
        } else {
            "extra-action-point:0"
        };
        let mut steps = steps();
        let query = json!({"query": {"expectedRevision": 0, "source": source, "steps": steps}});
        let impact =
            dispatch_result(&mut session, "action-form.shared-impact", query.clone()).unwrap();
        assert_eq!(session.persisted_state(), before);
        assert_eq!(impact["revision"], 0);
        assert_eq!(
            impact["steps"][0]["affectedCallers"],
            json!([{"source": peer, "slot": 1}])
        );
        steps[0]["settings"]["scope"] = json!({"mode": "update-affected",
            "confirmedCallers": impact["steps"][0]["affectedCallers"]});
        let (method, header) = if extra {
            (
                "extra-action-point.apply-draft",
                json!({"classicDoorId": -1, "postActionLevel": 0,
                "postActionX": 0, "postActionY": 0, "chancePercent": 100}),
            )
        } else {
            (
                "action-point.apply-draft",
                json!({"coordinate": {"x": 18, "y": 23}, "postActionLevel": 0,
                "postActionX": 19, "postActionY": 23, "chancePercent": 100}),
            )
        };
        let result = dispatch_result(
            &mut session,
            method,
            json!({"expectedRevision": 0,
            "draft": {"source": source, "header": header, "steps": steps}}),
        )
        .unwrap();
        assert_eq!(result["change"]["revision"], 1);
        assert!(result.get("snapshot").is_none());
        assert_eq!(session.snapshot().extra_codes[0].values, [8, 9, 0, 0, 0]);
        assert_eq!(session.snapshot().extra_codes.len(), 1);
        assert!(dispatch_result(&mut session, "action-form.shared-impact", query).is_err());
    }
}

#[test]
fn native_default_shared_write_rejects_without_silent_isolation() {
    let mut session = session();
    let before = session.persisted_state();
    let result = dispatch_result(
        &mut session,
        "extra-action-point.apply-draft",
        json!({
            "expectedRevision": 0, "draft": {"source": "extra-action-point:0", "steps": steps(),
            "header": {"classicDoorId": -1, "postActionLevel": 0, "postActionX": 0,
                "postActionY": 0, "chancePercent": 100}}
        }),
    );
    assert!(
        result
            .unwrap_err()
            .contains("confirm every affected action")
    );
    assert_eq!(session.persisted_state(), before);
}

#[test]
fn confirmed_shared_command_checkpoints_reopens_and_retains_undo_redo() {
    let temporary = tempfile::tempdir().unwrap();
    let mut session = session();
    let before = session.snapshot().clone();
    let store = ProjectStore::create(temporary.path().join("project"), &before).unwrap();
    let impact = dispatch_result(
        &mut session,
        "action-form.shared-impact",
        json!({"query": {"expectedRevision": 0, "source": "action-point:land:0:17", "steps": steps()}}),
    )
    .unwrap();
    let mut confirmed_steps = steps();
    confirmed_steps[0]["settings"]["scope"] = json!({"mode": "update-affected",
        "confirmedCallers": impact["steps"][0]["affectedCallers"]});
    dispatch_result(
        &mut session,
        "action-point.apply-draft",
        json!({"expectedRevision": 0, "draft": {"source": "action-point:land:0:17",
            "header": {"coordinate": {"x": 18, "y": 23}, "postActionLevel": 0,
            "postActionX": 19, "postActionY": 23, "chancePercent": 100},
            "steps": confirmed_steps}}),
    )
    .unwrap();
    let after = session.snapshot().clone();
    store
        .checkpoint_session(&session, &json!({"method": "action-point.apply-draft"}))
        .unwrap();
    let (_store, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.snapshot(), &after);
    dispatch_result(
        &mut reopened,
        "history.undo",
        json!({"expectedRevision": 1}),
    )
    .unwrap();
    assert_eq!(reopened.snapshot(), &before);
    dispatch_result(
        &mut reopened,
        "history.redo",
        json!({"expectedRevision": 2}),
    )
    .unwrap();
    assert_eq!(reopened.snapshot(), &after);
}
