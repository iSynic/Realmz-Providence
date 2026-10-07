use providence_core::model::ExtraCodeRow;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::io::Cursor;

#[test]
fn random_message_core_support_does_not_enable_an_unapproved_native_form() {
    let mut snapshot = session(false).snapshot().clone();
    snapshot.extra_action_points[0].actions[0].raw_opcode = 19;
    let mut session = EditorSession::new(snapshot);
    let view = prepared(&mut session);
    assert_eq!(view["phase"], "unsupported");
    assert_eq!(view["canApply"], false);
    let draft = repair::prepare_random_message(
        session.snapshot(),
        session.revision(),
        StableId("extra-action-point:158".into()),
        4,
    )
    .unwrap();
    let result = wire(
        &mut session,
        None,
        "action-settings.preview-repair",
        json!({"draft": draft}),
    );
    assert_eq!(result["ok"], false, "{result}");
    assert_eq!(session.revision(), Revision(0));
}

fn session(shared: bool) -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("repair-wire".into()));
    for id in if shared { vec![158, 159] } else { vec![158] } {
        snapshot.extra_action_points.push(serde_json::from_value(json!({
            "identity":format!("extra-action-point:{id}"), "nativeId":id,
            "classicDoorId":0,"postActionLevel":0,"postActionX":0,"postActionY":0,"chancePercent":100,
            "actions":[{"slot":4,"rawOpcode":92,"targetNativeId":10}]
        })).unwrap());
    }
    snapshot.world.maps.push(serde_json::from_value(json!({
        "identity":"land:1","levelType":"land","nativeIndex":1,"name":"North road","tiles":[],
        "runtime": {"source":"authored","sourceBlob":null,"dark":false,"usesLos":false,"landlook":null,"baseScale":null,
            "tilesetId":"test-tiles","baseTile":null,
            "randomRectangles":[{"identity":"land:1:rect:3","top":1,"left":2,"bottom":3,"right":4,
                "chanceTenThousand":500,"battleRange":[0,0],"randomDoors":[0,0,0],"randomDoorPercent":[0,0,0],
                "only":false,"option":0,"soundId":0,"textId":0}]
        }
    })).unwrap());
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(10),
        values: [1, 3, 0, 250, 0],
    });
    EditorSession::new(snapshot)
}

fn wire(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: Value,
) -> Value {
    let request = json!({"id":7,"method":method,"params":params});
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

fn prepared(session: &mut EditorSession) -> Value {
    let revision = session.revision().0;
    let result = wire(
        session,
        None,
        "action-settings.prepare-repair",
        json!({"expectedRevision":revision,"source":"extra-action-point:158","slot":4}),
    );
    assert_eq!(result["ok"], true, "{result}");
    result["result"].clone()
}

fn complete(session: &mut EditorSession) -> Value {
    let mut view = prepared(session);
    for (field, value) in [
        ("bound0", "9"),
        ("bound1", "18"),
        ("bound2", "13"),
        ("bound3", "24"),
    ] {
        let response = wire(
            session,
            None,
            "action-settings.change-repair",
            json!({"draft":view["draft"],"field":field,"value":value}),
        );
        assert_eq!(response["ok"], true, "{response}");
        view = response["result"].clone();
    }
    assert_eq!(view["canApply"], true);
    view
}

#[test]
fn repair_prepare_change_choices_and_uses_are_bounded_read_only_wire_projections() {
    let mut session = session(true);
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    let view = prepared(&mut session);
    assert_eq!(view["boundCount"], 4);
    assert_eq!(view["sharedCount"], 2);
    assert_eq!(view["canApply"], false);
    assert!(view["sessionToken"].as_str().unwrap().len() < 100);
    let choices = wire(
        &mut session,
        None,
        "action-settings.repair-choices",
        json!({"draft":view["draft"],"field":"area","limit":99999}),
    );
    assert_eq!(choices["ok"], true, "{choices}");
    assert_eq!(choices["result"]["limit"], 128);
    assert_eq!(choices["result"]["items"][0]["identity"], "land:1:rect:3");
    let uses = wire(
        &mut session,
        None,
        "action-settings.repair-uses",
        json!({"draft":view["draft"],"offset":1,"limit":1}),
    );
    assert_eq!(uses["result"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(uses["result"]["total"], 2);
    let view = complete(&mut session);
    assert!(serde_json::to_vec(&view).unwrap().len() < 16_384);
    assert!(view.get("snapshot").is_none() && view.get("world").is_none());
    assert_eq!(
        serde_json::to_value(session.persisted_state()).unwrap(),
        before
    );
}

#[test]
fn repair_wire_rejects_malformed_missing_stale_and_oversized_drafts_before_mutation() {
    let mut session = session(false);
    let view = complete(&mut session);
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    for (field, value) in [
        ("slot", json!(256)),
        ("slot", json!(4.5)),
        ("revision", json!(99)),
        ("unexpected", json!(true)),
        ("input", json!({})),
        ("contextFingerprint", json!("wrong")),
    ] {
        let mut draft = view["draft"].clone();
        draft[field] = value;
        let response = wire(
            &mut session,
            None,
            "action-settings.commit-repair",
            json!({"expectedRevision":0,"draft":draft}),
        );
        assert_eq!(response["ok"], false, "{field}: {response}");
    }
    let mut oversized = view["draft"].clone();
    oversized["input"]["chanceAdjustment"] = "9".repeat(20_000).into();
    let response = wire(
        &mut session,
        None,
        "action-settings.preview-repair",
        json!({"draft":oversized}),
    );
    assert!(response["error"].as_str().unwrap().contains("bounded"));
    let missing = wire(
        &mut session,
        None,
        "action-settings.commit-repair",
        json!({"draft":view["draft"]}),
    );
    assert_eq!(missing["ok"], false);
    assert_eq!(
        serde_json::to_value(session.persisted_state()).unwrap(),
        before
    );
}

#[test]
fn godot_numeric_draft_round_trip_accepts_integral_numbers_without_accepting_fractions() {
    let mut session = session(false);
    let view = complete(&mut session);
    let mut draft = view["draft"].clone();
    draft["revision"] = json!(0.0);
    draft["slot"] = json!(4.0);
    draft["originalAction"]["rawOpcode"] = json!(92.0);
    draft["input"]["map"]["index"] = json!(1.0);
    draft["input"]["retainedSpare"] = json!(0.0);
    let response = wire(
        &mut session,
        None,
        "action-settings.preview-repair",
        json!({"draft":draft}),
    );
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["canApply"], true);
    assert_eq!(session.revision(), Revision(0));
    draft["input"]["map"]["index"] = json!(1.5);
    let response = wire(
        &mut session,
        None,
        "action-settings.commit-repair",
        json!({"expectedRevision":0,"draft":draft}),
    );
    assert_eq!(response["ok"], false, "{response}");
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn repair_save_reopen_and_history_preserve_local_complete_pairs() {
    let temporary = tempfile::Builder::new()
        .prefix("providence-settings-repair-wire-")
        .tempdir()
        .unwrap();
    for shared_scope in [false, true] {
        let mut session = session(true);
        let before = session.snapshot().clone();
        let store = ProjectStore::create(
            temporary
                .path()
                .join(if shared_scope { "shared" } else { "private" }),
            &before,
        )
        .unwrap();
        let view = complete(&mut session);
        if shared_scope {
            let response = wire(
                &mut session,
                None,
                "action-settings.change-repair",
                json!({"draft":view["draft"],"field":"scope","value":"shared-actions"}),
            );
            assert_eq!(response["ok"], false);
            assert_eq!(session.snapshot(), &before);
        }
        let response = wire(
            &mut session,
            Some(&store),
            "action-settings.commit-repair",
            json!({"expectedRevision":0,"draft":view["draft"]}),
        );
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(session.undo_history().len(), 1);
        assert_eq!(
            session.snapshot().extra_action_points[1],
            before.extra_action_points[1]
        );
        let after = session.snapshot().clone();
        let saved = wire(&mut session, Some(&store), "project.save", json!({}));
        assert_eq!(saved["ok"], true, "{saved}");
        let (_, mut reopened) =
            ProjectStore::open_session(temporary.path().join(if shared_scope {
                "shared"
            } else {
                "private"
            }))
            .unwrap();
        assert_eq!(reopened.snapshot(), &after);
        let checked = wire(
            &mut reopened,
            Some(&store),
            "action-settings.reconcile-repair",
            json!({"intent":view["intent"],"sessionToken":view["sessionToken"]}),
        );
        assert_eq!(checked["result"]["outcome"], "matches-repair", "{checked}");
        assert_complete_pair_history(&mut reopened, &store, &before, &after);
    }
}

#[test]
fn repair_reconciliation_and_explicit_rebase_never_duplicate_a_mutation() {
    let mut session = session(false);
    let view = complete(&mut session);
    let not_applied = wire(
        &mut session,
        None,
        "action-settings.reconcile-repair",
        json!({"intent":view["intent"],"sessionToken":view["sessionToken"]}),
    );
    assert_eq!(not_applied["result"]["outcome"], "not-applied");
    let unknown = wire(
        &mut session,
        None,
        "action-settings.reconcile-repair",
        json!({"intent":view["intent"],"sessionToken":"different-process"}),
    );
    assert_eq!(unknown["result"]["outcome"], "unknown");
    let applied = wire(
        &mut session,
        None,
        "action-settings.commit-repair",
        json!({"expectedRevision":0,"draft":view["draft"]}),
    );
    assert_eq!(applied["ok"], true, "{applied}");
    let confirmed = wire(
        &mut session,
        None,
        "action-settings.reconcile-repair",
        json!({"intent":view["intent"],"sessionToken":view["sessionToken"]}),
    );
    assert_eq!(confirmed["result"]["outcome"], "matches-repair");
    let compared = wire(
        &mut session,
        None,
        "action-settings.compare-repair",
        json!({"draft":view["draft"]}),
    );
    assert_eq!(compared["result"]["canRebase"], true);
    let rebased = wire(
        &mut session,
        None,
        "action-settings.rebase-repair",
        json!({"expectedRevision":1,"draft":view["draft"]}),
    );
    assert_eq!(rebased["ok"], true);
    assert_eq!(rebased["result"]["draft"]["scope"], "only-this-action");
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(session.undo_history().len(), 1);
}
use super::*;

fn assert_complete_pair_history(
    reopened: &mut EditorSession,
    store: &ProjectStore,
    before: &ProjectSnapshot,
    after: &ProjectSnapshot,
) {
    let undo = wire(
        reopened,
        Some(store),
        "history.undo",
        json!({"expectedRevision":1}),
    );
    assert_eq!(undo["ok"], true, "{undo}");
    assert_eq!(reopened.snapshot(), before);
    let redo = wire(
        reopened,
        Some(store),
        "history.redo",
        json!({"expectedRevision":2}),
    );
    assert_eq!(redo["ok"], true, "{redo}");
    assert_eq!(reopened.snapshot(), after);
}
