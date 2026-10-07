use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::dispatch_result_with_application;
use crate::dispatch_result_with_store;
use crate::open_application_library_argument;
use crate::request_params::coerce_integral_numbers;
use crate::session_summary::ADAPTER_PROTOCOL_VERSION;
use crate::session_summary::clean_summary_text;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::NativeRecordId;
use providence_core::model::ScenarioMessage;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::json;

#[test]
fn compiler_description_exposes_the_identity_embedded_in_the_adapter() {
    let mut session = EditorSession::new(demo_snapshot());
    let description =
        dispatch_result_with_store(&mut session, None, "compiler.describe", json!({}))
            .expect("compiler description");
    let embedded = providence_core::build_identity::current("providence-native-adapter");
    assert_eq!(description["kind"], "providence.tool-build-identity");
    assert_eq!(description["tool"], "providence-native-adapter");
    assert_eq!(description["version"], embedded.version);
    assert_eq!(description["commit"], embedded.commit);
    assert_eq!(description["sourceTree"], embedded.source_tree);
    assert_eq!(description["schemaSha256"], embedded.schema_sha256);
    assert!(!description["commit"].as_str().unwrap().is_empty());
}

#[test]
fn summary_text_rejects_binary_control_bytes_without_mutating_authored_text() {
    assert_eq!(
        clean_summary_text("  Gate opened\nquietly  "),
        Some("Gate opened quietly".into())
    );
    assert_eq!(clean_summary_text("\0binary-looking label"), None);
    assert_eq!(clean_summary_text(" \t\r\n "), None);
}

#[test]
fn integral_godot_json_numbers_remain_typed_in_bounded_commands() {
    let normalized = coerce_integral_numbers(json!({
        "whole": 7.0,
        "fraction": 7.5,
        "nested": [0.0, -12.0],
    }));

    assert_eq!(normalized["whole"], json!(7));
    assert_eq!(normalized["fraction"], json!(7.5));
    assert_eq!(normalized["nested"], json!([0, -12]));
}

#[test]
fn application_library_process_arguments_are_strict() {
    let mut unknown = vec!["--unknown".to_string()].into_iter();
    assert_eq!(
        open_application_library_argument(&mut unknown).unwrap_err(),
        "unknown serve-project option '--unknown'"
    );
    let mut missing = vec!["--application-library-root".to_string()].into_iter();
    assert_eq!(
        open_application_library_argument(&mut missing).unwrap_err(),
        "--application-library-root requires a directory"
    );
    let mut missing_monster = vec!["--monster-library-root".to_string()].into_iter();
    assert_eq!(
        open_application_library_argument(&mut missing_monster).unwrap_err(),
        "--monster-library-root requires a directory"
    );
}

#[test]
fn personal_monster_library_arguments_create_reopen_and_reject_unrelated_directories() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("monsters");
    let open = || {
        crate::library_arguments::open_library_arguments(
            &mut vec![
                "--personal-monster-library-root".into(),
                root.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        )
    };
    let mut opened = open().unwrap().monster_library.unwrap();
    assert!(opened.session.catalog().custom_entries.is_empty());
    let record = providence_core::session::new_monster_template(NativeRecordId(7)).unwrap();
    opened
        .session
        .execute(providence_core::session::ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: providence_core::monster_library::MonsterLibraryCommand::CreateCustom {
                label: "Personal Guardian".into(),
                preferred_scenario_monster_id: NativeRecordId(7),
                template: Box::new(record),
                description: "Independent Library".into(),
                origin: providence_core::monster_library::MonsterLibraryOrigin::Blank,
            },
        })
        .unwrap();
    opened.store.checkpoint_session(&opened.session).unwrap();
    let reopened = open().unwrap().monster_library.unwrap();
    assert_eq!(reopened.session.revision(), Revision(1));
    assert_eq!(
        reopened.session.catalog().custom_entries[0].label,
        "Personal Guardian"
    );
    let occupied = temporary.path().join("occupied");
    std::fs::create_dir(&occupied).unwrap();
    std::fs::write(occupied.join("unrelated.txt"), b"preserved").unwrap();
    let rejected = crate::library_arguments::open_library_arguments(
        &mut vec![
            "--personal-monster-library-root".into(),
            occupied.to_string_lossy().into_owned(),
        ]
        .into_iter(),
    );
    assert!(rejected.is_err());
    assert_eq!(
        std::fs::read(occupied.join("unrelated.txt")).unwrap(),
        b"preserved"
    );
    assert!(!occupied.join("monster-library.providence.json").exists());
}

#[test]
fn routine_update_returns_a_bounded_projection_not_a_snapshot() {
    let mut session = EditorSession::new(demo_snapshot());
    let result = dispatch_result(
        &mut session,
        "message.update",
        json!({
            "expectedRevision": 0,
            "identity": "message:12",
            "text": "Gate opened"
        }),
    )
    .expect("update");

    assert_eq!(result["revision"], 1);
    assert_eq!(result["changedEntities"], json!(["message:12"]));
    assert!(result.get("messages").is_none());
    assert!(result.get("projectId").is_none());
}

#[test]
fn repair_removes_the_dangling_reference_diagnostic() {
    let mut session = EditorSession::new(demo_snapshot());
    let result = dispatch_result(
        &mut session,
        "action-reference.retarget",
        json!({
            "expectedRevision": 0,
            "source": "action-point:land:0:17",
            "slot": 0,
            "targetNativeId": 47
        }),
    )
    .expect("repair");

    assert_eq!(result["affectedDiagnostics"], json!([]));
    assert_eq!(result["referenceChanges"][0]["resolution"], "resolved");
}

#[test]
fn session_message_and_validation_navigation_are_bounded() {
    let mut snapshot = demo_snapshot();
    snapshot.messages = (0..300)
        .map(|native_id| ScenarioMessage {
            identity: StableId(format!("message:{native_id}")),
            native_id: NativeRecordId(native_id),
            text: format!("Message {native_id} with a deliberately realistic list preview"),
            authored: true,
        })
        .collect();
    let mut session = EditorSession::new(snapshot);

    let summary = dispatch_result(&mut session, "session.describe", json!({}))
        .expect("bounded session summary");
    assert_eq!(summary["adapterProtocol"], ADAPTER_PROTOCOL_VERSION);
    assert_eq!(summary["counts"]["messages"], 300);
    assert!(summary.get("messages").is_none());
    assert!(summary.get("references").is_none());
    assert!(summary.get("diagnostics").is_none());
    assert!(serde_json::to_vec(&summary).unwrap().len() < 2_048);

    let page = dispatch_result(
        &mut session,
        "message.list",
        json!({"offset": 128, "limit": 10_000}),
    )
    .expect("bounded message page");
    assert_eq!(page["offset"], 128);
    assert_eq!(page["limit"], 128);
    assert_eq!(page["total"], 300);
    assert_eq!(page["truncated"], true);
    assert_eq!(page["items"].as_array().unwrap().len(), 128);
    assert!(page.get("snapshot").is_none());
    assert!(serde_json::to_vec(&page).unwrap().len() < 80_000);

    let filtered = dispatch_result(
        &mut session,
        "message.list",
        json!({"offset": 0, "limit": 128, "query": "Message 299"}),
    )
    .expect("filtered message page");
    assert_eq!(filtered["total"], 1);
    assert_eq!(filtered["items"][0]["nativeId"], 299);

    assert_message_used_by_page(&mut session);

    let opened = dispatch_result(&mut session, "message.open", json!({"nativeId": 299}))
        .expect("one-message projection");
    assert_eq!(opened["index"], 299);
    assert_eq!(opened["message"]["identity"], "message:299");
    assert_eq!(opened["message"]["nativeId"], 299);
    assert!(opened.get("messages").is_none());
    assert!(serde_json::to_vec(&opened).unwrap().len() < 4_096);

    assert_bounded_validation_page(&mut session);
}

#[test]
fn adapter_rejects_integer_wraparound_at_the_command_boundary() {
    let mut session = EditorSession::new(demo_snapshot());
    let error = dispatch_result(
        &mut session,
        "map.update-cell",
        json!({
            "expectedRevision": 0,
            "identity": "land:0",
            "x": 256,
            "y": 0,
            "tile": 0
        }),
    )
    .expect_err("out-of-range coordinate must fail before command execution");
    assert!(error.contains("outside u8 range"));

    let error = dispatch_result(
        &mut session,
        "action-reference.retarget",
        json!({
            "expectedRevision": 0,
            "source": "action-point:land:0:17",
            "slot": 0,
            "targetNativeId": 32768
        }),
    )
    .expect_err("out-of-range target must not wrap negative");
    assert!(error.contains("outside i16 range"));
}

#[test]
fn project_benchmark_is_bounded_read_only_and_names_scale_inputs() {
    let mut session = EditorSession::new(demo_snapshot());
    let revision = session.revision();
    let result =
        dispatch_result_with_application(&mut session, None, None, "project.benchmark", json!({}))
            .expect("benchmark project");

    assert_eq!(result["revision"], revision.0);
    assert_eq!(result["counts"]["maps"], 1);
    assert_eq!(
        result["counts"]["mapTiles"],
        CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE
    );
    assert!(result["counts"]["references"].as_u64().is_some());
    assert!(result["counts"]["diagnostics"].as_u64().is_some());
    assert!(result["timing"]["validationMicros"].as_u64().is_some());
    assert_eq!(session.revision(), revision);
    assert!(result.get("project").is_none());
    assert!(result.get("snapshot").is_none());
    assert!(result.get("references").is_none());
    assert!(result.get("diagnostics").is_none());
}

fn assert_message_used_by_page(session: &mut EditorSession) {
    let used_by = dispatch_result(
        session,
        "reference.used-by",
        json!({"targetKind": "message", "targetId": "47", "offset": 0, "limit": 128}),
    )
    .expect("bounded typed used-by page");
    assert_eq!(used_by["targetKind"], "message");
    assert_eq!(used_by["targetId"], "47");
    assert_eq!(used_by["total"], 2);
    assert_eq!(used_by["items"].as_array().unwrap().len(), 2);
    assert!(
        used_by["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|reference| {
                reference["targetKind"] == "message" && reference["targetId"] == "47"
            })
    );
    assert!(used_by.get("snapshot").is_none());
}

fn assert_bounded_validation_page(session: &mut EditorSession) {
    let validation = dispatch_result(
        session,
        "validation.list",
        json!({"offset": 0, "limit": 10_000}),
    )
    .expect("bounded diagnostic page");
    assert_eq!(validation["limit"], 128);
    assert!(validation["items"].as_array().unwrap().len() <= 128);
    assert!(validation.get("snapshot").is_none());
}
