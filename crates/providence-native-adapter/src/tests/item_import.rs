use super::*;
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use crate::transport::serve_io;
use providence_core::model::{ProjectSnapshot, StableId};
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

#[test]
fn complete_scenario_import_uses_the_source_owned_item_text_fork() {
    let temporary = tempfile::tempdir().expect("temporary source");
    let scenario_fork = temporary.path().join("Scenario.rsrc");
    let item_fork = temporary.path().join("Data NI.rsrc");
    let text = scenario_item_text_resource();
    fs::write(&scenario_fork, &text).unwrap();

    assert_eq!(
        crate::scenario_import::scenario_item_text_path(temporary.path()).unwrap(),
        Some(scenario_fork.clone())
    );
    fs::write(&item_fork, &text).unwrap();
    assert_eq!(
        crate::scenario_import::scenario_item_text_path(temporary.path()).unwrap(),
        Some(scenario_fork.clone())
    );
    fs::write(&item_fork, providence_core::codecs::empty_resource_fork()).unwrap();
    assert_eq!(
        crate::scenario_import::scenario_item_text_path(temporary.path()).unwrap(),
        Some(scenario_fork.clone())
    );
    fs::remove_file(&item_fork).unwrap();
    fs::write(
        &scenario_fork,
        providence_core::codecs::empty_resource_fork(),
    )
    .unwrap();
    assert_eq!(
        crate::scenario_import::scenario_item_text_path(temporary.path()).unwrap(),
        None
    );
}

#[test]
fn standard_item_import_is_exact_blob_backed_and_surfaces_source_warnings() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let binary_path = temporary.path().join("Data ID");
    let text_path = temporary.path().join("Data ID.rsrc");
    let (binary, texts) = write_standard_item_sources(&binary_path, &text_path);
    let store = ProjectStore::create(temporary.path().join("project"), &demo_snapshot())
        .expect("create project store");
    let request = json!({
        "id": 1,
        "method": "item-rules.import-standard",
        "params": {
            "expectedRevision": 0,
            "path": binary_path,
            "textPath": text_path
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
    .expect("import standard items through stored adapter");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["changedEntities"]
            .as_array()
            .unwrap()
            .len(),
        providence_core::session::CHANGE_PROJECTION_LIMIT
    );
    assert_eq!(response["result"]["changedEntitiesTotal"], 799);
    assert_eq!(response["result"]["truncated"], true);
    assert_eq!(
        response["result"]["sourceWarnings"],
        json!(["STR# 402 ended before its declared string count; available strings were retained"])
    );
    assert!(response["result"].get("snapshot").is_none());

    let (_, mut reopened) = ProjectStore::open_session(store.root()).expect("reopen item project");
    assert_eq!(reopened.snapshot().item_rules.len(), 799);
    assert_eq!(reopened.snapshot().item_rules[0].definition.name, "Item 1");
    let source_blob = &reopened.snapshot().item_rules[0].source_blob;
    let text_blob = &reopened.snapshot().item_rules[0].text_source_blob;
    assert_eq!(store.read_blob(source_blob).unwrap(), binary);
    assert_eq!(store.read_blob(text_blob).unwrap(), texts);

    assert_standard_item_projections(&mut reopened);
}

#[test]
fn scenario_item_import_is_exact_source_backed_and_projects_all_data_ni_rows() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("Data NI");
    let text_source_path = temporary.path().join("Data NI.rsrc");
    let (bytes, text_source) = write_scenario_item_sources(&source, &text_source_path);
    let snapshot = ProjectSnapshot::new_authored(StableId("scenario-item-import".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let request = json!({
        "id": 1,
        "method": "item-rules.import-scenario",
        "params": {
            "expectedRevision": 0,
            "path": source,
            "textPath": text_source_path
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
    .expect("import Data NI through stored adapter");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_scenario_import_response(&response);

    let (_, mut reopened) = ProjectStore::open_session(store.root()).expect("reopen item project");
    assert_scenario_item_sources(&reopened, &store, &bytes, &text_source);

    assert_scenario_item_projections(&mut reopened);

    edit_stored_scenario_item(&mut reopened, &store);

    assert_edited_item_compile(&mut reopened, &store, temporary.path(), &bytes);
    assert_full_classic_compile_uses_standalone_item_sources(
        &mut reopened,
        &store,
        temporary.path(),
    );
}

fn assert_scenario_import_response(response: &Value) {
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["changedEntities"]
            .as_array()
            .unwrap()
            .len(),
        providence_core::session::CHANGE_PROJECTION_LIMIT
    );
    assert_eq!(response["result"]["changedEntitiesTotal"], 200);
    assert_eq!(response["result"]["truncated"], true);
    assert_eq!(response["result"]["sourceWarnings"], json!([]));
    assert!(response["result"].get("snapshot").is_none());
}

fn assert_scenario_item_sources(
    reopened: &EditorSession,
    store: &ProjectStore,
    bytes: &[u8],
    text_source: &[u8],
) {
    assert_eq!(reopened.snapshot().scenario_item_rules.len(), 200);
    let source_blob = &reopened.snapshot().scenario_item_rules[0].source_blob;
    assert_eq!(store.read_blob(source_blob).unwrap(), bytes);
    let text_blob = reopened.snapshot().scenario_item_rules[0]
        .text_source_blob
        .as_ref()
        .expect("text source identity");
    assert_eq!(store.read_blob(text_blob).unwrap(), text_source);
    assert!(reopened.snapshot().scenario_item_rules.iter().all(|item| {
        item.source_blob == *source_blob && item.text_source_blob.as_ref() == Some(text_blob)
    }));
}

fn assert_standard_item_projections(reopened: &mut EditorSession) {
    let listed = dispatch_result(
        reopened,
        "item.list",
        json!({"scope": "standard", "query": "item 1", "limit": 1}),
    )
    .expect("list bounded standard items");
    assert!(listed["total"].as_u64().unwrap() > 0);
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["items"][0]["scope"], "standard");
    assert_eq!(listed["items"][0]["editable"], false);
    let magic = dispatch_result(
        reopened,
        "item.list",
        json!({"scope": "standard", "category": "magic", "offset": 0, "limit": 1}),
    )
    .expect("filter category before paging");
    assert_eq!(magic["total"], 200);
    assert_eq!(magic["items"][0]["classicId"], 600);
    let invalid = dispatch_result(reopened, "item.list", json!({"category": "trinket"}))
        .expect_err("reject unknown item category");
    assert!(invalid.contains("item category must be"));
    let opened = dispatch_result(reopened, "item.open", json!({"identity": "classic.item.1"}))
        .expect("open standard item");
    assert_eq!(opened["item"]["classicId"], 1);
    assert_eq!(opened["source"]["binaryRetained"], true);
    assert_eq!(opened["source"]["textRetained"], true);
    assert!(opened.get("project").is_none());
    assert!(opened.get("snapshot").is_none());

    let projection = dispatch_result(
        &mut EditorSession::new(reopened.snapshot().clone()),
        "project.inspect-rebuilt-items",
        json!({}),
    )
    .expect("inspect Rebuilt item catalog");
    assert_eq!(projection.as_array().unwrap().len(), 799);
    assert_eq!(projection[0]["id"], "classic.item.1");
}

fn write_standard_item_sources(
    binary_path: &std::path::Path,
    text_path: &std::path::Path,
) -> (Vec<u8>, Vec<u8>) {
    let mut binary = vec![0u8; providence_core::codecs::ITEM_RECORD_BYTES * 800];
    for id in 0..800usize {
        let record = &mut binary[id * 100..(id + 1) * 100];
        record[2..4].copy_from_slice(&(id as i16).to_be_bytes());
        record[56..70].fill(0xa5);
    }
    let texts = standard_item_text_resource(Some(402));
    fs::write(binary_path, &binary).expect("write controlled Data ID");
    fs::write(text_path, &texts).expect("write controlled Data ID resource fork");
    (binary, texts)
}

fn assert_scenario_item_projections(reopened: &mut EditorSession) {
    let listed = dispatch_result(
        reopened,
        "item.list",
        json!({"scope": "scenario", "offset": 100, "limit": 1}),
    )
    .expect("list bounded scenario items");
    assert_eq!(listed["total"], 200);
    assert_eq!(listed["items"][0]["classicId"], 900);
    assert_eq!(listed["items"][0]["recordIndex"], 100);
    assert_eq!(listed["items"][0]["editable"], true);
    let opened = dispatch_result(
        reopened,
        "item.open",
        json!({"identity": "classic.item.900"}),
    )
    .expect("open scenario item");
    assert_eq!(opened["scope"], "scenario");
    assert_eq!(opened["recordIndex"], 100);
    assert_eq!(opened["source"]["textRetained"], true);
    assert!(opened.get("project").is_none());
    assert!(opened.get("snapshot").is_none());

    let projection = dispatch_result(
        &mut EditorSession::new(reopened.snapshot().clone()),
        "project.inspect-rebuilt-scenario-items",
        json!({}),
    )
    .expect("inspect Rebuilt scenario items");
    assert_eq!(projection.as_array().unwrap().len(), 200);
    assert_eq!(projection[0]["id"], "classic.item.800");
    assert_eq!(projection[0]["name"], "Scenario Item 800");
    assert_eq!(projection[199]["classicId"], 999);
}

fn edit_stored_scenario_item(reopened: &mut EditorSession, store: &ProjectStore) {
    let mut definition =
        serde_json::to_value(&reopened.snapshot().scenario_item_rules[100].definition)
            .expect("serialize item definition");
    definition["cost"] = json!(0x1234);
    definition["name"] = json!("Providence Token");
    let update = json!({
        "id": 2,
        "method": "scenario-item.update",
        "params": {
            "expectedRevision": 1,
            "recordIndex": 100,
            "definition": definition
        }
    });
    let mut update_output = Vec::new();
    serve_io(
        reopened,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&update).unwrap())),
        &mut update_output,
    )
    .expect("update one scenario item");
    let update_response: Value =
        serde_json::from_slice(&update_output).expect("update response JSON");
    assert_eq!(update_response["ok"], true);
    assert_eq!(
        update_response["result"]["changedEntities"],
        json!(["classic.item.900"])
    );
    assert!(update_response["result"].get("snapshot").is_none());
}

fn assert_edited_item_compile(
    reopened: &mut EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    bytes: &[u8],
) {
    let missing_text_path = dispatch_result_with_store(
        reopened,
        Some(store),
        "project.compile-data-ni",
        json!({ "path": root.join("must-not-write") }),
    )
    .expect_err("text-bearing catalog requires a text output path");
    assert!(missing_text_path.contains("requires textPath"));

    let compiled_path = root.join("compiled Data NI");
    let compiled_text_path = root.join("compiled Data NI.rsrc");
    let compiled = dispatch_result_with_store(
        reopened,
        Some(store),
        "project.compile-data-ni",
        json!({ "path": compiled_path, "textPath": compiled_text_path }),
    )
    .expect("compile edited Data NI");
    assert_eq!(compiled["bytes"], 20_000);
    assert_eq!(compiled["textPath"], json!(compiled_text_path));
    let edited = fs::read(&compiled_path).expect("read compiled Data NI");
    let changed = bytes
        .iter()
        .zip(&edited)
        .enumerate()
        .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
        .collect::<Vec<_>>();
    assert_eq!(changed, vec![100 * 100 + 28, 100 * 100 + 29]);
    assert_eq!(&edited[100 * 100 + 56..100 * 100 + 70], &[0xa5; 14]);
    let edited_text = fs::read(&compiled_text_path).expect("read compiled item text");
    let (names, complete) = decode_available_string_list_resource(&edited_text, 801)
        .expect("decode compiled names")
        .expect("STR# 801");
    assert!(complete);
    assert_eq!(names[100], "Providence Token");
    assert_eq!(reopened.revision(), Revision(2));
}

fn assert_full_classic_compile_uses_standalone_item_sources(
    reopened: &mut EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
) {
    let output = root.join("classic item slice");
    dispatch_result_with_store(
        reopened,
        Some(store),
        "project.compile-classic-slice",
        json!({"directory": output}),
    )
    .expect("compile Classic slice after standalone Data NI import");
    assert_eq!(
        fs::read(output.join("Data NI")).expect("read slice Data NI"),
        fs::read(root.join("compiled Data NI")).expect("read focused Data NI")
    );
    assert_eq!(
        fs::read(output.join("Data NI.rsrc")).expect("read slice Data NI text"),
        fs::read(root.join("compiled Data NI.rsrc")).expect("read focused Data NI text")
    );
}

fn write_scenario_item_sources(
    source: &std::path::Path,
    text_source_path: &std::path::Path,
) -> (Vec<u8>, Vec<u8>) {
    let mut bytes = vec![0u8; providence_core::codecs::ITEM_RECORD_BYTES * 200];
    for (index, record) in bytes.chunks_exact_mut(100).enumerate() {
        record[2..4].copy_from_slice(&(800i16 + index as i16).to_be_bytes());
        record[28..30].copy_from_slice(&(index as i16).to_be_bytes());
        record[56..70].fill(0xa5);
    }
    fs::write(source, &bytes).expect("write controlled Data NI");
    let text_source = scenario_item_text_resource();
    fs::write(text_source_path, &text_source).expect("write controlled Data NI text resource");
    (bytes, text_source)
}
