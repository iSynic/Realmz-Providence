use super::*;
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result_with_store;
use crate::transport::serve_io;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

#[test]
fn scenario_picture_import_compiles_one_owned_pict_and_reopens_preview() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("observatory-door.png");
    fs::write(&source, b"controlled PNG source bytes").expect("write picture source");
    let snapshot = ProjectSnapshot::new_authored(StableId("pictures".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let rgba = [0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255];
    let request = json!({
        "id": 1,
        "method": "picture.import",
        "params": {
            "expectedRevision": 0,
            "path": source,
            "label": "The Observatory Door Beyond the Long Western Passage",
            "resourceId": 30000,
            "width": 2,
            "height": 2,
            "rgbaBase64": BASE64.encode(rgba),
            "dither": true
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
    .expect("import Scenario Picture");
    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["resourceType"], "PICT");

    let (_, reopened) = ProjectStore::open_session(store.root()).expect("reopen picture project");
    let picture = &reopened.snapshot().assets[0];
    assert_eq!(picture.identity.0, "picture:30000");
    assert_eq!(
        picture.classic_payload_byte_length,
        response["result"]["classicPayloadBytes"].as_u64()
    );
    assert_picture_source_preview(&reopened, &store);
    assert_picture_resource_compile(
        &reopened,
        &store,
        temporary.path(),
        picture.classic_payload_byte_length.unwrap(),
    );
}

fn assert_picture_resource_compile(
    reopened: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    expected_payload_bytes: u64,
) {
    let first = root.join("compile-first");
    let second = root.join("compile-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile first resource fork");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("compile second resource fork");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    let first_bytes = fs::read(first.join("Scenario.rsrc")).unwrap();
    let second_bytes = fs::read(second.join("Scenario.rsrc")).unwrap();
    assert_eq!(first_bytes, second_bytes);
    let entries = providence_core::codecs::parse_resource_entries(&first_bytes).unwrap();
    let pict = entries
        .iter()
        .find(|entry| entry.resource_type == *b"PICT" && entry.id == 30_000)
        .expect("owned PICT resource");
    assert_eq!(
        pict.name,
        "The Observatory Door Beyond the Long Western Passage"
    );
    assert_eq!(pict.data.len() as u64, expected_payload_bytes);
}

fn assert_picture_source_preview(reopened: &EditorSession, store: &ProjectStore) {
    let preview = dispatch_result_with_store(
        &mut reopened.clone(),
        Some(store),
        "picture.preview",
        json!({"identity": "picture:30000"}),
    )
    .expect("read selected preview");
    assert_eq!(
        BASE64.decode(preview["base64"].as_str().unwrap()).unwrap(),
        b"controlled PNG source bytes"
    );
}
