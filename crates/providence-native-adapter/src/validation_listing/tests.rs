use super::*;
mod temporary_filters;
use providence_core::{model::StableId, references::FieldPath};

#[test]
fn categories_partition_all_findings_and_unknown_codes_remain_visible() {
    let codes = [
        "reference.message.missing",
        "reference.picture.ambiguous",
        "extra-code.opcode-92.secondary-missing",
        "battle.empty",
        "future.new-check",
    ];
    let diagnostics = codes
        .iter()
        .enumerate()
        .map(|(i, code)| Diagnostic {
            code: (*code).into(),
            severity: Severity::Information,
            message: "Controlled finding".into(),
            entity: Some(StableId(format!("source:{i}"))),
            field: None,
        })
        .collect::<Vec<_>>();
    let all = project(diagnostics.clone(), Revision(1), 0, &json!({"limit":1})).unwrap();
    assert_eq!(
        all["categories"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["total"].as_u64().unwrap())
            .sum::<u64>(),
        5
    );
    for (id, _) in CATEGORIES {
        let result = project(diagnostics.clone(), Revision(1), 0, &json!({"category":id})).unwrap();
        assert_eq!(result["total"], 1);
        assert_eq!(result["categories"], all["categories"]);
    }
    let unknown = project(
        diagnostics.clone(),
        Revision(1),
        0,
        &json!({"category":"other"}),
    )
    .unwrap();
    assert_eq!(unknown["items"][0]["code"], "future.new-check");
    let filtered = project(
        diagnostics.clone(),
        Revision(1),
        0,
        &json!({"query":"source:4", "category":"other"}),
    )
    .unwrap();
    assert_eq!(filtered["total"], 1);
    assert_eq!(filtered["categories"][4]["total"], 1);
    assert!(project(diagnostics, Revision(1), 0, &json!({"category":"unknown"})).is_err());
}

fn fixture() -> Vec<Diagnostic> {
    (0..501)
        .map(|i| Diagnostic {
            code: format!("group.{:03}", i % 70),
            severity: if i % 2 == 0 {
                Severity::Error
            } else {
                Severity::Warning
            },
            message: format!("Missing target {i}"),
            entity: (i != 500).then(|| StableId(format!("source:{i}"))),
            field: (i != 500).then(|| FieldPath("actions[0].target".into())),
        })
        .collect()
}

#[test]
fn group_counts_cover_all_findings_independent_of_row_page() {
    let first = project(fixture(), Revision(9), 4, &json!({"limit": 1})).unwrap();
    let next = project(
        fixture(),
        Revision(9),
        4,
        &json!({"offset": 128, "limit": 128}),
    )
    .unwrap();
    assert_eq!(first["groups"], next["groups"]);
    assert_eq!(first["total"], 501);
    assert_eq!(first["groupTotal"], 70);
    assert_eq!(first["groupsTruncated"], true);
    let mut count = 0;
    for offset in [0, 32, 64] {
        let result = project(fixture(), Revision(9), 4, &json!({"groupOffset": offset})).unwrap();
        for group in result["groups"].as_array().unwrap() {
            count += group["total"].as_u64().unwrap();
            assert_eq!(
                group["total"].as_u64().unwrap(),
                group["errors"].as_u64().unwrap() + group["warnings"].as_u64().unwrap()
            );
        }
    }
    assert_eq!(count, 501);
}

#[test]
fn global_search_and_severity_filter_precede_group_and_paging() {
    let result = project(
        fixture(),
        Revision(9),
        4,
        &json!({"query": " SOURCE:499 ", "severity": "warning", "limit": 1}),
    )
    .unwrap();
    assert_eq!(result["total"], 1);
    assert_eq!(result["items"][0]["entity"], "source:499");
    assert_eq!(result["unfilteredTotal"], 501);
    let grouped = project(
        fixture(),
        Revision(9),
        4,
        &json!({"code": "group.000", "limit": 1}),
    )
    .unwrap();
    assert_eq!(grouped["total"], 8);
    assert_eq!(grouped["groupTotal"], 70);
    assert_eq!(grouped["matchedBeforeGroup"], 501);
    let untargeted = project(
        fixture(),
        Revision(9),
        4,
        &json!({"query": "missing target 500"}),
    )
    .unwrap();
    assert!(untargeted["items"][0]["entity"].is_null());
    assert!(untargeted["items"][0]["field"].is_null());
}

#[test]
fn responses_and_invalid_filters_are_bounded() {
    let result = project(
        fixture(),
        Revision(9),
        4,
        &json!({"limit": 9999, "groupLimit": 9999}),
    )
    .unwrap();
    assert_eq!(result["items"].as_array().unwrap().len(), 128);
    assert_eq!(result["groups"].as_array().unwrap().len(), 64);
    assert_eq!(result["applicationFallbacks"], 4);
    for params in [
        json!({"severity":"fatal"}),
        json!({"query":7}),
        json!({"code":false}),
    ] {
        assert!(project(fixture(), Revision(9), 4, &params).is_err());
    }
    let empty = project(
        fixture(),
        Revision(9),
        4,
        &json!({"offset":9999,"groupOffset":9999}),
    )
    .unwrap();
    assert_eq!(empty["items"], json!([]));
    assert_eq!(empty["groups"], json!([]));
    assert_eq!(empty["truncated"], false);
    assert_eq!(empty["groupsTruncated"], false);
}

#[test]
fn selection_locates_one_bounded_page_and_counts_remain_scenario_wide() {
    let selection = json!({"code":"group.009", "entity":"source:499", "field":"actions[0].target"});
    let result = project(
        fixture(),
        Revision(10),
        0,
        &json!({"selection":selection, "locateSelection":true, "clampOffset":true, "limit":8}),
    )
    .unwrap();
    assert_eq!(result["selectionIndex"], 499);
    assert_eq!(result["offset"], 496);
    assert_eq!(result["items"].as_array().unwrap().len(), 5);
    assert_eq!(result["items"][3]["entity"], "source:499");
    let resized = project(
        fixture(),
        Revision(10),
        0,
        &json!({"selection":selection, "locateSelection":true, "limit":11}),
    )
    .unwrap();
    assert_eq!(resized["offset"], 495);
    assert_eq!(resized["selectionIndex"], 499);
    let filtered = project(
        fixture(), Revision(10), 0,
        &json!({"selection":selection, "locateSelection":true, "severity":"warning", "query":"source:499"}),
    ).unwrap();
    assert_eq!(filtered["selectionIndex"], 0);
    assert_eq!(filtered["total"], 1);
    assert_eq!(
        filtered["unfilteredCounts"],
        json!({"errors":251,"warnings":250,"information":0})
    );
    let manual_page = project(
        fixture(),
        Revision(10),
        0,
        &json!({"selection":selection, "offset":8, "limit":8}),
    )
    .unwrap();
    assert_eq!(manual_page["offset"], 8);
}

#[test]
fn repaired_tail_clamps_and_missing_or_ambiguous_selection_never_borrows_identity() {
    let selection = json!({"code":"group.009", "entity":"source:499", "field":"actions[0].target"});
    let mut repaired = fixture();
    repaired.truncate(490);
    let result = project(
        repaired, Revision(11), 0,
        &json!({"selection":selection, "locateSelection":true, "clampOffset":true, "offset":496, "limit":8}),
    ).unwrap();
    assert!(result["selectionIndex"].is_null());
    assert_eq!(result["offset"], 488);
    assert_eq!(result["items"].as_array().unwrap().len(), 2);
    let mut duplicated = fixture();
    duplicated.push(duplicated[499].clone());
    let ambiguous = project(
        duplicated,
        Revision(11),
        0,
        &json!({"selection":selection, "locateSelection":true}),
    )
    .unwrap();
    assert!(ambiguous["selectionIndex"].is_null());
    assert_eq!(ambiguous["offset"], 0);
    let empty = project(
        Vec::new(),
        Revision(12),
        0,
        &json!({"offset":u64::MAX,"clampOffset":true}),
    )
    .unwrap();
    assert_eq!(empty["offset"], 0);
    for params in [
        json!({"selection":false}),
        json!({"selection":{"code":42}}),
        json!({"locateSelection":"yes"}),
        json!({"clampOffset":1}),
    ] {
        assert!(project(fixture(), Revision(11), 0, &params).is_err());
    }
}

#[test]
fn action_settings_checks_preserve_targets_filters_and_counts_after_repair() {
    use providence_core::{
        model::{ClassicAction, ExtraActionPoint, ExtraCodeRow, NativeRecordId, ProjectSnapshot},
        session::{EditorCommand, EditorSession, ExpectedRevisionCommand},
    };
    let mut snapshot = ProjectSnapshot::new_authored(StableId("settings-list".into()));
    snapshot.extra_action_points = (0..260)
        .map(|id| ExtraActionPoint {
            identity: StableId(format!("caller:{id:03}")),
            native_id: NativeRecordId(id),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 3,
                raw_opcode: 15,
                target_native_id: 4,
            }],
        })
        .collect();
    let mut session = EditorSession::new(snapshot);
    let params = json!({"category":"action-settings", "severity":"warning", "limit":9999});
    let result = project(session.diagnostics(), session.revision(), 0, &params).unwrap();
    assert_eq!(result["total"], 260);
    assert_eq!(result["items"].as_array().unwrap().len(), 128);
    assert_eq!(result["truncated"], true);
    assert_eq!(result["categories"][2]["total"], 260);
    let tail = project(
        session.diagnostics(),
        session.revision(),
        0,
        &json!({"category":"action-settings", "query":"caller:259", "limit":1}),
    )
    .unwrap();
    assert_eq!(tail["total"], 1);
    assert_eq!(tail["items"][0]["entity"], "caller:259");
    assert_eq!(tail["items"][0]["field"], "actions[3].extraCode");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertExtraCode {
                row: ExtraCodeRow {
                    native_id: NativeRecordId(4),
                    values: [0; 5],
                },
            },
        })
        .unwrap();
    let repaired = project(session.diagnostics(), session.revision(), 0, &params).unwrap();
    assert_eq!(repaired["revision"], 1);
    assert_eq!(repaired["total"], 0);
    assert_eq!(repaired["items"], json!([]));
    assert_eq!(category("action-settings.conflict"), "action-settings");
}
