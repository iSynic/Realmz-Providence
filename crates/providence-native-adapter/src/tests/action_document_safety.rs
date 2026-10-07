use crate::demo::demo_snapshot;
use crate::dispatch_result;
use providence_core::session::EditorSession;
use serde_json::json;

#[test]
fn extra_action_point_record_draft_route_commits_header_and_steps_together() {
    let mut session = EditorSession::new(demo_snapshot());
    let applied = dispatch_result(
        &mut session,
        "extra-action-point.apply-draft",
        json!({
            "expectedRevision": 0,
            "draft": {
                "source": "extra-action-point:40",
                "descriptor": "Moon Gate battle",
                "header": {"classicDoorId": 22, "postActionLevel": 3,
                    "postActionX": 4, "postActionY": 5, "chancePercent": 82},
                "steps": [
                    {"slot": 0, "actionIdentity": "realmz.action.1", "targetNativeId": 47},
                    {"slot": 1, "actionIdentity": "realmz.action.39", "targetNativeId": 40}
                ]
            }
        }),
    )
    .expect("apply one Extra Action Point record draft");
    assert_eq!(applied["change"]["revision"], 1);
    assert_eq!(applied["document"]["extraActionPoint"]["classicDoorId"], 22);
    assert_eq!(applied["document"]["extraActionPoint"]["chancePercent"], 82);
    assert_eq!(
        applied["document"]["extraActionPoint"]["descriptor"],
        "Moon Gate battle"
    );
    assert_eq!(
        applied["document"]["extraActionPoint"]["actions"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(session.undo_history().len(), 1);
}

#[test]
fn action_point_record_draft_projects_its_descriptor_to_open_and_list() {
    let mut session = EditorSession::new(demo_snapshot());
    let applied = dispatch_result(
        &mut session,
        "action-point.apply-draft",
        json!({
            "expectedRevision": 0,
            "draft": {
                "source": "action-point:land:0:17",
                "descriptor": "Moon Gate ambush",
                "header": {"coordinate": {"x": 18, "y": 23},
                    "postActionLevel": 0, "postActionX": 21,
                    "postActionY": 24, "chancePercent": 75},
                "steps": []
            }
        }),
    )
    .expect("apply one Action Point record draft");
    assert_eq!(
        applied["document"]["actionPoint"]["descriptor"],
        "Moon Gate ambush"
    );

    let list = dispatch_result(
        &mut session,
        "action-point.list",
        json!({"mapIdentity": "land:0", "offset": 0, "limit": 100}),
    )
    .expect("list Action Points after descriptor update");
    assert_eq!(list["items"][0]["descriptor"], "Moon Gate ambush");
}

#[test]
fn semantic_direct_targets_do_not_inherit_unrelated_settings_ownership() {
    let mut session = EditorSession::new(demo_snapshot());
    dispatch_result(
        &mut session,
        "action-point.step.apply",
        json!({
            "expectedRevision": 0,
            "edit": {"source": "action-point:land:0:17", "slot": 1,
                "actionIdentity": "realmz.action.19", "targetNativeId": 400,
                "settings": {"values": {"messageLow": 12, "messageHigh": 18}}}
        }),
    )
    .unwrap();
    let applied = dispatch_result(
        &mut session,
        "action-point.step.apply",
        json!({
            "expectedRevision": 1,
            "edit": {"source": "action-point:land:0:17", "slot": 2,
                "actionIdentity": "realmz.action.1", "targetNativeId": 400}
        }),
    )
    .unwrap();
    let steps = applied["document"]["steps"].as_array().unwrap();
    let direct = steps.iter().find(|step| step["slot"] == 2).unwrap();
    assert!(direct["primaryUsage"].is_null());
    assert!(direct["secondaryUsage"].is_null());
    let form = steps.iter().find(|step| step["slot"] == 1).unwrap();
    assert_eq!(form["primaryUsage"]["status"], "in-use");
    assert!(form["secondaryUsage"].is_null());
}

#[test]
fn extra_action_lifecycle_requires_delete_confirmation_and_retains_dangling_uses() {
    let mut session = EditorSession::new(demo_snapshot());
    let duplicated = dispatch_result(
        &mut session,
        "extra-action-point.duplicate",
        json!({
            "expectedRevision": 0,
            "source": "extra-action-point:40",
            "nativeId": 41
        }),
    )
    .expect("duplicate an Extra Action Point");
    assert_eq!(duplicated["revision"], 1);
    assert_eq!(session.snapshot().extra_action_points[41].actions.len(), 3);
    assert_eq!(session.snapshot().extra_codes.len(), 2);

    let warning = dispatch_result(
        &mut session,
        "extra-action-point.delete",
        json!({"expectedRevision": 1, "source": "extra-action-point:40"}),
    )
    .expect_err("delete requires an explicit acknowledgement");
    assert!(warning.contains("confirmation"));
    assert!(warning.contains("2 existing use(s)"));
    assert_eq!(session.revision().0, 1);

    dispatch_result(
        &mut session,
        "extra-action-point.delete",
        json!({
            "expectedRevision": 1,
            "source": "extra-action-point:40",
            "confirmed": true
        }),
    )
    .expect("delete after reviewing uses");
    assert!(
        session.snapshot().extra_action_points[40]
            .actions
            .is_empty()
    );
    assert!(session.references().iter().any(|reference| {
        reference.target_kind == providence_core::references::TargetKind::ExtraActionPoint
            && reference.target_id == "40"
            && reference.resolution == providence_core::references::ResolutionState::Missing
    }));
}
