use super::*;

#[test]
fn data_race_import_is_atomic_exact_and_source_blob_backed() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("Data Race");
    let bytes = vec![0u8; providence_core::codecs::RACE_RECORD_BYTES * 30];
    fs::write(&source, &bytes).expect("write controlled Data Race");
    let store = ProjectStore::create(temporary.path().join("project"), &demo_snapshot())
        .expect("create project store");
    let request = json!({
        "id": 1,
        "method": "race-rules.import",
        "params": {
            "expectedRevision": 0,
            "path": source
        }
    });
    let mut output = Vec::new();
    let mut session = EditorSession::new(demo_snapshot());

    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .expect("import through stored adapter");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["changedEntities"]
            .as_array()
            .unwrap()
            .len(),
        30
    );
    let (_, mut reopened) = ProjectStore::open_session(store.root()).expect("reopen race project");
    assert_eq!(reopened.snapshot().race_rules.len(), 30);
    let blob = reopened.snapshot().race_rules[0]
        .source_blob
        .as_ref()
        .expect("source blob");
    assert_eq!(store.read_blob(blob).unwrap(), bytes);
    assert!(
        reopened
            .snapshot()
            .race_rules
            .iter()
            .all(|rule| rule.source_blob.as_ref() == Some(blob))
    );
    assert_imported_race_catalog(&mut reopened);
}

#[test]
fn data_race_import_preserves_and_reports_bytes_after_the_complete_table() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("Data Race");
    let mut bytes = vec![0u8; providence_core::codecs::RACE_RECORD_BYTES * 30];
    bytes.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
    fs::write(&source, &bytes).expect("write controlled Data Race");
    let store = ProjectStore::create(temporary.path().join("project"), &demo_snapshot())
        .expect("create project store");
    let request = json!({
        "id": 1,
        "method": "race-rules.import",
        "params": { "expectedRevision": 0, "path": source }
    });
    let mut output = Vec::new();
    let mut session = EditorSession::new(demo_snapshot());

    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .expect("import through stored adapter");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["trailingBytes"], 4);
    assert_eq!(
        response["result"]["trailingDisposition"],
        "preserved-source-bytes"
    );
    let (_, reopened) = ProjectStore::open_session(store.root()).expect("reopen race project");
    let blob = reopened.snapshot().race_rules[0]
        .source_blob
        .as_ref()
        .expect("source blob");
    assert_eq!(store.read_blob(blob).unwrap(), bytes);
}

fn assert_imported_race_catalog(reopened: &mut EditorSession) {
    let listed = dispatch_result(reopened, "race-rule.list", json!({"offset": 0, "limit": 1}))
        .expect("list race rules");
    assert_eq!(listed["total"], 30);
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["items"][0]["identity"], "classic.race.1");
    assert_eq!(listed["truncated"], true);
    let opened = dispatch_result(
        reopened,
        "race-rule.open",
        json!({"identity": "classic.race.1"}),
    )
    .expect("open race rule");
    assert_eq!(opened["rule"]["classicId"], 1);
    assert_eq!(opened["source"]["nativePath"], "Data Race record 0");
    assert_eq!(opened["source"]["retained"], true);
    assert!(opened.get("project").is_none());
    assert!(opened.get("snapshot").is_none());
}

#[test]
fn data_caste_import_derives_reciprocal_eligibility_and_preserves_duplicate_items() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("Data Caste");
    let mut bytes = vec![0u8; providence_core::codecs::CASTE_RECORD_BYTES * 30];
    bytes[386..388].copy_from_slice(&37i16.to_be_bytes());
    bytes[388..390].copy_from_slice(&37i16.to_be_bytes());
    fs::write(&source, &bytes).expect("write controlled Data Caste");
    let snapshot = caste_eligible_race_snapshot();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let request = json!({
        "id": 1,
        "method": "caste-rules.import",
        "params": { "expectedRevision": 0, "path": source }
    });
    let mut output = Vec::new();
    let mut session = EditorSession::new(snapshot);

    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .expect("import through stored adapter");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["changedEntities"]
            .as_array()
            .unwrap()
            .len(),
        30
    );
    let (_, mut reopened) = ProjectStore::open_session(store.root()).expect("reopen caste project");
    let first = &reopened.snapshot().caste_rules[0];
    assert_eq!(
        first.definition.eligible_race_ids,
        [StableId("classic.race.1".into())]
    );
    assert_eq!(
        first.definition.starting_item_ids,
        [
            StableId("classic.item.37".into()),
            StableId("classic.item.37".into())
        ]
    );
    let blob = first.source_blob.as_ref().expect("source blob");
    assert_eq!(store.read_blob(blob).unwrap(), bytes);
    assert!(
        reopened
            .snapshot()
            .caste_rules
            .iter()
            .all(|rule| rule.source_blob.as_ref() == Some(blob))
    );
    assert_imported_caste_catalog(&mut reopened);
}

fn caste_eligible_race_snapshot() -> providence_core::model::ProjectSnapshot {
    let mut snapshot = demo_snapshot();
    snapshot.race_rules = decode_race_rules(
        &vec![0u8; providence_core::codecs::RACE_RECORD_BYTES * 30],
        None,
    )
    .rules;
    snapshot.race_rules[0]
        .definition
        .eligible_caste_ids
        .push(StableId("classic.caste.1".into()));
    snapshot
}

fn assert_imported_caste_catalog(reopened: &mut EditorSession) {
    let listed = dispatch_result(
        reopened,
        "caste-rule.list",
        json!({"offset": 0, "limit": 1}),
    )
    .expect("list caste rules");
    assert_eq!(listed["total"], 30);
    assert_eq!(listed["items"][0]["identity"], "classic.caste.1");
    assert_eq!(listed["items"][0]["eligibleRaces"], 1);
    assert_eq!(listed["items"][0]["startingItems"], 2);
    let opened = dispatch_result(
        reopened,
        "caste-rule.open",
        json!({"identity": "classic.caste.1"}),
    )
    .expect("open caste rule");
    assert_eq!(opened["references"].as_array().unwrap().len(), 3);
    assert_eq!(opened["source"]["nativePath"], "Data Caste record 0");
    assert_eq!(opened["source"]["retained"], true);
    assert!(opened.get("project").is_none());
    assert!(opened.get("snapshot").is_none());
}

#[test]
fn classic_caste_compilation_refuses_mixed_source_provenance() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let store = ProjectStore::create(temporary.path().join("project"), &demo_snapshot())
        .expect("create project store");
    let first_blob = store
        .put_blob(&vec![0; providence_core::codecs::CASTE_RECORD_BYTES * 30])
        .expect("first caste source");
    let mut second_source = vec![0; providence_core::codecs::CASTE_RECORD_BYTES * 30];
    second_source[0] = 1;
    let second_blob = store.put_blob(&second_source).expect("second caste source");
    let mut snapshot = demo_snapshot();
    snapshot.caste_rules = decode_caste_rules(
        &vec![0; providence_core::codecs::CASTE_RECORD_BYTES * 30],
        Some(first_blob),
    )
    .rules;
    snapshot.caste_rules[1].source_blob = Some(second_blob);
    let session = EditorSession::new(snapshot);

    let error = compile_project_classic_slice(
        &session,
        &store,
        json!({"directory": temporary.path().join("output")}),
    )
    .expect_err("mixed caste provenance must not choose an arbitrary byte base");

    assert!(error.contains("one consistent source blob"));
    assert!(!temporary.path().join("output").exists());
}

#[test]
fn rule_name_import_is_source_blob_backed_and_preserves_blank_classic_slots() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("Custom Names.rsrc");
    let mut races = (1..=30).map(|id| format!("Race {id}")).collect::<Vec<_>>();
    let castes = (1..=30).map(|id| format!("Caste {id}")).collect::<Vec<_>>();
    races[0] = "Human".into();
    races[19] = String::new();
    let bytes = custom_names_resource(&races, &castes);
    fs::write(&source, &bytes).expect("write controlled Custom Names");
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let request = json!({
        "id": 1,
        "method": "rule-names.import",
        "params": {
            "expectedRevision": 0,
            "path": source,
            "source": "Data Files/Custom Names.rsrc"
        }
    });
    let mut output = Vec::new();
    let mut session = EditorSession::new(snapshot);

    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .expect("import through stored adapter");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    let (_, reopened) = ProjectStore::open_session(store.root()).expect("reopen named project");
    let catalog = reopened.snapshot().rule_names.as_ref().expect("rule names");
    assert_eq!(catalog.race_names[0], "Human");
    assert_eq!(catalog.race_names[19], "");
    assert_eq!(catalog.caste_names.len(), 30);
    assert_eq!(store.read_blob(&catalog.source_blob).unwrap(), bytes);
}
use crate::classic_compilation::compile_project_classic_slice;
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::transport::serve_io;
use providence_core::codecs::decode_caste_rules;
use providence_core::codecs::decode_race_rules;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
