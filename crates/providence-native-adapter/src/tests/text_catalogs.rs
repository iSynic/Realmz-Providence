use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::dispatch_result_with_application;
use providence_core::model::NativeRecordId;
use providence_core::model::ScenarioMessage;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::json;

#[test]
fn text_export_check_is_paged_and_uses_the_classic_message_codec_policy() {
    let mut snapshot = demo_snapshot();
    snapshot.messages = message_encoding_cases();
    let mut session = EditorSession::new(snapshot);

    let issues = dispatch_result(
        &mut session,
        "text.export-check",
        json!({"offset": 0, "limit": 1}),
    )
    .expect("inspect export issues");
    assert_eq!(issues["revision"], 0);
    assert_eq!(issues["summary"]["messages"], 3);
    assert_eq!(issues["summary"]["ready"], 1);
    assert_eq!(issues["summary"]["issues"], 2);
    assert_eq!(issues["summary"]["tooLong"], 1);
    assert_eq!(issues["summary"]["replacementMessages"], 1);
    assert_eq!(issues["summary"]["replacementCharacters"], 1);
    assert_eq!(issues["matched"], 2);
    assert_eq!(issues["items"].as_array().unwrap().len(), 1);
    assert_eq!(issues["items"][0]["nativeId"], 1);
    assert_eq!(issues["items"][0]["encodedBytes"], 6);
    assert_eq!(issues["items"][0]["replacementCharacters"], 1);
    assert_eq!(issues["items"][0]["classicReady"], false);
    assert_eq!(issues["items"][0]["needsReview"], true);
    assert_eq!(issues["truncated"], true);

    let all = dispatch_result(
        &mut session,
        "text.export-check",
        json!({"includeReady": true, "query": "2", "limit": 128}),
    )
    .expect("filter complete export check");
    assert_eq!(all["matched"], 1);
    assert_eq!(all["items"][0]["nativeId"], 2);
    assert_eq!(all["items"][0]["encodedBytes"], 256);
    assert_eq!(all["items"][0]["classicReady"], false);
    assert_eq!(
        all["items"][0]["codes"],
        json!(["classic.message.text-too-long"])
    );
    assert!(all.get("snapshot").is_none());
    assert!(all.get("project").is_none());
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn reference_string_catalog_pages_canonical_str_lists_without_project_state() {
    let mut snapshot = demo_snapshot();
    snapshot.rule_names = Some(providence_core::model::RuleNameCatalog {
        source: "Custom Names.rsrc".into(),
        source_blob: providence_core::model::BlobId("sha256:rule-names".into()),
        race_resource_id: 129,
        caste_resource_id: 131,
        race_names: vec!["Human".into(), "Dwarf".into(), "Elf".into()],
        caste_names: vec!["Warrior".into(), "Wizard".into()],
    });
    snapshot.player_map_names = Some(providence_core::model::PlayerMapNameCatalog {
        source_blob: Some(providence_core::model::BlobId(
            "sha256:player-map-names".into(),
        )),
        available_names: vec!["Western Coast".into(), "Moon Gate".into()],
        unavailable_names: vec!["Unknown Coast".into(), "Sealed Gate".into()],
    });
    let mut session = EditorSession::new(snapshot);

    let list = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "reference-string.list",
        json!({"query": "dwarf", "limit": 128}),
    )
    .expect("search canonical STR# groups");
    assert_eq!(list["counts"]["stringLists"], 4);
    assert_eq!(list["total"], 1);
    assert_eq!(list["items"][0]["resourceType"], "STR#");
    assert_eq!(list["items"][0]["resourceId"], 129);
    assert_eq!(list["items"][0]["entryCount"], 3);

    let opened = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "reference-string.open",
        json!({
            "identity": "reference-string:rule-races:STR#:129",
            "entryOffset": 1,
            "entryLimit": 1
        }),
    )
    .expect("open one STR# entry page");
    assert_eq!(opened["entryTotal"], 3);
    assert_eq!(opened["entries"][0]["index"], 1);
    assert_eq!(opened["entries"][0]["text"], "Dwarf");
    assert_eq!(opened["entriesTruncated"], true);
    assert!(opened["editableDocument"].is_null());
    assert!(opened.get("snapshot").is_none());
    assert!(opened.get("project").is_none());
    assert_eq!(session.revision(), Revision(0));
}

fn message_encoding_cases() -> Vec<ScenarioMessage> {
    vec![
        ScenarioMessage {
            identity: StableId("message:0".into()),
            native_id: NativeRecordId(0),
            text: "Ready for Classic".into(),
            authored: true,
        },
        ScenarioMessage {
            identity: StableId("message:1".into()),
            native_id: NativeRecordId(1),
            text: "Café 🐉".into(),
            authored: true,
        },
        ScenarioMessage {
            identity: StableId("message:2".into()),
            native_id: NativeRecordId(2),
            text: "x".repeat(256),
            authored: true,
        },
    ]
}

#[test]
fn export_check_names_family_limits_and_exact_unsupported_character_locations() {
    let temporary = tempfile::tempdir().unwrap();
    let (mut session, store) = encoding_project(temporary.path());
    let before = session.snapshot().clone();
    let checked = crate::dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text.export-check",
        json!({"includeReady":true,"limit":999}),
    )
    .unwrap();
    assert_eq!(checked["summary"]["optionLabels"], 1);
    assert_eq!(checked["summary"]["textResources"], 1);
    assert_eq!(checked["summary"]["issues"], 3);
    assert_eq!(checked["limit"], 128);
    let rows = checked["items"].as_array().unwrap();
    let bad = rows
        .iter()
        .find(|row| row["identity"] == "message:1")
        .unwrap();
    assert_eq!(bad["issues"][0]["characterIndex"], 5);
    assert_eq!(bad["issues"][0]["line"], 1);
    assert_eq!(bad["issues"][0]["column"], 6);
    let option = rows
        .iter()
        .find(|row| row["family"] == "option-label")
        .unwrap();
    assert_eq!(option["classicMaximumBytes"], 24);
    assert_eq!(option["issues"][0]["characterIndex"], 24);
    let text = rows
        .iter()
        .find(|row| row["family"] == "text-resource")
        .unwrap();
    assert_eq!(text["classicMaximumBytes"], serde_json::Value::Null);
    assert_eq!(text["classicReady"], true);
    assert_eq!(text["status"], "clean");
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(1));
    let filtered = crate::dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text.export-check",
        json!({"includeReady":true,"family":"text-resource","query":"chronicle","offset":999}),
    )
    .unwrap();
    assert_eq!(filtered["matched"], 1);
    assert_eq!(filtered["offset"], 0);
    let full_text = crate::dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text.export-check",
        json!({"includeReady":true,"query":"beyond the preview"}),
    )
    .unwrap();
    assert_eq!(full_text["matched"], 1);
    assert_eq!(full_text["items"][0]["identity"], "text:-201");
    assert!(full_text["items"][0].get("textMatch").is_none());
}

fn encoding_project(root: &std::path::Path) -> (EditorSession, providence_storage::ProjectStore) {
    use providence_core::model::{OptionLabelRecord, ProjectSnapshot};
    let mut snapshot = ProjectSnapshot::new_authored(StableId("encoding-review".into()));
    snapshot.messages = message_encoding_cases();
    snapshot.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:4".into()),
        native_id: NativeRecordId(4),
        text: "x".repeat(25),
        authored: false,
    });
    let store = providence_storage::ProjectStore::create(root.join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    crate::dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text-resource.create",
        json!({
            "expectedRevision": 0,
            "resourceId": -201,
            "label": "Long chronicle",
            "text": "Café guard\n".repeat(200) + "Beyond the preview",
        }),
    )
    .unwrap();
    (session, store)
}
