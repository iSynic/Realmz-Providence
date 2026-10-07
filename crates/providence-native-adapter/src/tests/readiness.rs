#[test]
fn rebuilt_readiness_is_grouped_paged_and_never_returns_project_state() {
    let mut session = EditorSession::new(demo_snapshot());
    let result = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "project.inspect-rebuilt-readiness",
        json!({ "offset": 0, "limit": 1 }),
    )
    .expect("inspect bounded readiness");

    let blocker_count = result["blockerCount"].as_u64().unwrap();
    let grouped_count = result["groups"]
        .as_array()
        .unwrap()
        .iter()
        .map(|group| group["count"].as_u64().unwrap())
        .sum::<u64>();
    assert!(blocker_count > 1);
    assert_eq!(grouped_count, blocker_count);
    assert_eq!(result["blockers"].as_array().unwrap().len(), 1);
    assert_eq!(result["truncated"], true);
    assert_eq!(result["revision"], 0);
    assert_eq!(result["target"], "rebuilt-package-v3");
    assert!(result.get("snapshot").is_none());
    assert!(result.get("project").is_none());
}

#[test]
fn classic_readiness_is_grouped_paged_and_never_returns_project_state() {
    let mut snapshot = demo_snapshot();
    for native_id in [998, 999] {
        snapshot
            .message_references
            .push(providence_core::model::MessageReference {
                source: StableId(format!("controlled:{native_id}")),
                field: "message".into(),
                target_native_id: NativeRecordId(native_id),
                required: true,
            });
    }
    let mut session = EditorSession::new(snapshot);
    let result = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "project.inspect-classic-readiness",
        json!({ "offset": 0, "limit": 1 }),
    )
    .expect("inspect bounded Classic readiness");

    let blocker_count = result["blockerCount"].as_u64().unwrap();
    let grouped_count = result["groups"]
        .as_array()
        .unwrap()
        .iter()
        .map(|group| group["count"].as_u64().unwrap())
        .sum::<u64>();
    assert!(blocker_count > 1);
    assert_eq!(grouped_count, blocker_count);
    assert_eq!(result["blockers"].as_array().unwrap().len(), 1);
    assert_eq!(result["truncated"], true);
    assert_eq!(result["revision"], 0);
    assert_eq!(result["target"], "classic-certification-slice");
    assert!(result.get("snapshot").is_none());
    assert!(result.get("project").is_none());
}

#[test]
fn readiness_pages_preserve_the_full_blocker_denominator() {
    let readiness = TargetCompatibility {
        target: providence_core::compatibility::CompileTarget::RebuiltPackageV3,
        status: CompatibilityStatus::Blocked,
        warnings: Vec::new(),
        blockers: (0..501)
            .map(|index| CompatibilityBlocker {
                code: "reference.unresolved".into(),
                message: format!("Missing reference {index}"),
                entity: Some(StableId(format!("entity:{index}"))),
                group: None,
            })
            .collect(),
    };
    let mut entities = Vec::new();
    for offset in [0, 200, 400] {
        let page = readiness_projection(
            Revision(7),
            &readiness,
            &[],
            0,
            &json!({"offset": offset, "limit": 10000}),
        )
        .expect("bounded readiness page");
        assert_eq!(page["revision"], 7);
        assert_eq!(page["limit"], 200);
        assert_eq!(page["blockerCount"], 501);
        assert_eq!(page["groups"][0]["count"], 501);
        assert_eq!(page["truncated"], offset < 400);
        entities.extend(
            page["blockers"]
                .as_array()
                .unwrap()
                .iter()
                .map(|row| row["entity"].as_str().unwrap().to_owned()),
        );
    }
    assert_eq!(
        entities,
        (0..501)
            .map(|index| format!("entity:{index}"))
            .collect::<Vec<_>>()
    );
    let beyond = readiness_projection(
        Revision(7),
        &readiness,
        &[],
        0,
        &json!({"offset": 501, "limit": 0}),
    )
    .expect("empty final page");
    assert_eq!(beyond["limit"], 1);
    assert_eq!(beyond["blockers"], json!([]));
    assert_eq!(beyond["blockerCount"], 501);
    assert_eq!(beyond["truncated"], false);
}

#[test]
fn readiness_problem_pages_preserve_the_full_projection_denominator() {
    let readiness = TargetCompatibility {
        target: providence_core::compatibility::CompileTarget::RebuiltPackageV3,
        status: CompatibilityStatus::Blocked,
        warnings: Vec::new(),
        blockers: Vec::new(),
    };
    let problems = (0..401)
        .map(|index| json!({"source": format!("source:{index}")}))
        .collect::<Vec<_>>();
    let mut sources = Vec::new();
    for offset in [0, 200, 400] {
        let page = readiness_projection(
            Revision(8),
            &readiness,
            &problems,
            problems.len(),
            &json!({"problemOffset": offset, "problemLimit": 200}),
        )
        .expect("bounded readiness problem page");
        assert_eq!(page["problemOffset"], offset);
        assert_eq!(page["problemLimit"], 200);
        assert_eq!(page["problemCount"], 401);
        assert_eq!(page["problemsTruncated"], offset < 400);
        sources.extend(
            page["problems"]
                .as_array()
                .unwrap()
                .iter()
                .map(|row| row["source"].as_str().unwrap().to_owned()),
        );
    }
    assert_eq!(
        sources,
        (0..401)
            .map(|index| format!("source:{index}"))
            .collect::<Vec<_>>()
    );
}

#[test]
fn package_failure_summary_collapses_repeated_blocker_codes() {
    let readiness = TargetCompatibility {
        target: providence_core::compatibility::CompileTarget::RebuiltPackageV3,
        status: CompatibilityStatus::Blocked,
        warnings: Vec::new(),
        blockers: (0..500)
            .map(|index| CompatibilityBlocker {
                code: "reference.unresolved".into(),
                message: format!("Missing reference {index}"),
                entity: Some(StableId(format!("entity:{index}"))),
                group: None,
            })
            .collect(),
    };

    assert_eq!(
        bounded_blocker_code_summary(&readiness),
        "reference.unresolved (500)"
    );
}
use crate::demo::demo_snapshot;
use crate::dispatch_result_with_application;
use crate::readiness::bounded_blocker_code_summary;
use crate::readiness::readiness_projection;
use providence_core::compatibility::CompatibilityBlocker;
use providence_core::compatibility::CompatibilityStatus;
use providence_core::compatibility::TargetCompatibility;
use providence_core::model::NativeRecordId;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::json;
