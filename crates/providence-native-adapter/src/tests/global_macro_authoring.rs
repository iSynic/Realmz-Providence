use crate::{demo::demo_snapshot, dispatch_result};
use providence_core::model::{
    GlobalMacroHook, NativeRecordId, ScenarioApplicationContract, StableId,
};
use providence_core::session::EditorSession;
use serde_json::json;

#[test]
fn a_visible_five_hook_form_commits_atomically_and_undo_restores_the_contract() {
    let mut snapshot = demo_snapshot();
    let mut imported = ScenarioApplicationContract::default();
    imported.hooks.set(
        GlobalMacroHook::Quit,
        Some(StableId("extra-action-point:-27".into())),
    );
    snapshot.scenario_application = Some(imported.clone());
    let mut session = EditorSession::new(snapshot);
    let hooks = json!({"start":"extra-action-point:40", "death":"extra-action-point:40",
        "quit":"extra-action-point:-27", "shop":null, "temple":"extra-action-point:40"});
    let result = dispatch_result(
        &mut session,
        "global-macro.update-all",
        json!({"expectedRevision":0,"hooks":hooks}),
    )
    .unwrap();
    assert_eq!(result["revision"], 1);
    let saved = session.snapshot().scenario_application.clone();
    assert_eq!(
        saved.as_ref().unwrap().hooks.start_game,
        Some(StableId("extra-action-point:40".into()))
    );
    assert_eq!(
        saved.as_ref().unwrap().hooks.temple,
        saved.as_ref().unwrap().hooks.start_game
    );
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(session.snapshot().scenario_application, Some(imported));
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot().scenario_application, saved);
}

#[test]
fn a_missing_changed_hook_or_incomplete_form_cannot_partially_write_other_hooks() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for hooks in [
        json!({"start":"extra-action-point:40"}),
        json!({"start":"extra-action-point:40", "death":"extra-action-point:999", "quit":null,"shop":null,"temple":null}),
        json!({"start":"extra-action-point:0", "death":null, "quit":null,"shop":null,"temple":null}),
    ] {
        assert!(
            dispatch_result(
                &mut session,
                "global-macro.update-all",
                json!({"expectedRevision":0,"hooks":hooks})
            )
            .is_err()
        );
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision().0, 0);
    }
    assert!(
        dispatch_result(
            &mut session,
            "global-macro.update-all",
            json!({"expectedRevision":1,
        "hooks":{"start":null,"death":null,"quit":null,"shop":null,"temple":null}})
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn full_catalog_pages_reveal_current_and_keep_missing_imported_identity_unavailable() {
    let mut snapshot = demo_snapshot();
    let template = snapshot.extra_action_points[0].clone();
    snapshot.extra_action_points = (0..125)
        .map(|id| {
            let mut row = template.clone();
            row.native_id = NativeRecordId(id);
            row.identity = StableId(format!("extra-action-point:{id}"));
            row
        })
        .collect();
    let mut session = EditorSession::new(snapshot);
    let result = dispatch_result(
        &mut session,
        "global-macro.catalog",
        json!({"currentValue":119,"seekCurrent":true,"limit":100}),
    )
    .unwrap();
    assert_eq!(result["page"]["total"], 124);
    assert_eq!(result["page"]["limit"], 40);
    assert_eq!(result["page"]["offset"], 80);
    assert!(
        result["page"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["value"] == 119)
    );
    let missing = dispatch_result(
        &mut session,
        "global-macro.catalog",
        json!({"currentValue":-27,"seekCurrent":true}),
    )
    .unwrap();
    assert_eq!(
        missing["page"]["items"][0]["identity"],
        "extra-action-point:-27"
    );
    assert_eq!(missing["page"]["items"][0]["available"], false);
    let unavailable = dispatch_result(
        &mut session,
        "global-macro.catalog",
        json!({"showUnavailable":true,"search":"0"}),
    )
    .unwrap();
    assert_eq!(unavailable["page"]["items"][0]["value"], 0);
    assert_eq!(unavailable["page"]["items"][0]["available"], false);
    let unassigned = dispatch_result(
        &mut session,
        "global-macro.catalog",
        json!({"currentValue":0}),
    )
    .unwrap();
    assert_eq!(unassigned["page"]["items"][0]["value"], 1);
    assert_eq!(unassigned["page"]["total"], 124);
    assert_eq!(session.revision().0, 0);
}
