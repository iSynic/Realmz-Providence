use crate::{
    classic_media_import::import_classic_media, dispatch_result, dispatch_result_with_store,
};
use providence_core::{
    codecs::{ResourceEntry, parse_resource_entries_preserving_duplicates, write_resource_fork},
    model::{ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
    text_styles::{StyleRun, StyleTable},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::io::Cursor;

fn imported_project(
    root: &std::path::Path,
    styles: Vec<u8>,
) -> (ProjectStore, EditorSession, Vec<u8>) {
    let directory = root.join("classic");
    std::fs::create_dir(&directory).unwrap();
    let bytes = write_resource_fork(&[
        ResourceEntry {
            resource_type: *b"TEXT",
            id: -201,
            name: "Chronicle".into(),
            attributes: 5,
            data: b"ab\0c\rdef".to_vec(),
        },
        ResourceEntry {
            resource_type: *b"styl",
            id: -201,
            name: "Imported styles".into(),
            attributes: 3,
            data: styles,
        },
        ResourceEntry {
            resource_type: *b"PICT",
            id: 128,
            name: "Unowned neighbor".into(),
            attributes: 7,
            data: vec![9, 8, 7],
        },
    ])
    .unwrap();
    std::fs::write(directory.join("Scenario.rsrc"), &bytes).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("style-fixture".into()));
    snapshot
        .messages
        .push(providence_core::model::ScenarioMessage {
            identity: StableId("message:0".into()),
            native_id: providence_core::model::NativeRecordId(0),
            text: "Resource certification anchor".into(),
            authored: true,
        });
    let store = ProjectStore::create(root.join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    import_classic_media(
        &mut session,
        Some(&store),
        json!({"expectedRevision":0,"directory":directory}),
    )
    .unwrap();
    (store, session, bytes)
}

fn fixture_styles() -> Vec<u8> {
    let mut table = StyleTable::plain();
    table.runs[0] = StyleRun {
        font: 32000,
        padding: 0x5a,
        face: 0x81,
        color: [0x1234, 0x2345, 0x3456],
        height: 22,
        ascent: 17,
        ..StyleRun::default()
    };
    table.runs.push(StyleRun {
        start: 4,
        font: 3,
        size: 14,
        ..StyleRun::default()
    });
    let mut bytes = table.encode();
    bytes.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
    bytes
}

#[test]
fn text_and_formatting_commit_once_and_keep_exact_imported_neighbors_and_text_bytes() {
    let temporary = tempfile::tempdir().unwrap();
    let original_styles = fixture_styles();
    let (store, mut session, original_resources) =
        imported_project(temporary.path(), original_styles.clone());
    let before = session.snapshot().clone();
    let params = json!({"expectedRevision":1,"identity":"classic-resource:TEXT:-201","edits":[{"kind":"format","start":1,"end":3,"patch":{"italic":true}}]});
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text-resource.inspect-styles",
        params.clone(),
    )
    .unwrap();
    assert_eq!(session.snapshot(), &before);
    assert_eq!(preview["styles"][1]["font"], 32000);
    assert_eq!(preview["styles"][1]["face"], 0x83);
    let response = apply_style_transport(&mut session, &store, params);
    assert_eq!(response["result"]["revision"], 2);
    let text = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.kind == "text-resource")
        .unwrap();
    let original_text = before
        .assets
        .iter()
        .find(|asset| asset.kind == "text-resource")
        .unwrap();
    assert_eq!(text, original_text);
    let style = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.kind == "text-style-resource")
        .unwrap();
    let edited_bytes = store.read_blob(&style.blob).unwrap();
    assert_eq!(
        &edited_bytes[edited_bytes.len() - 4..],
        &[0xde, 0xad, 0xbe, 0xef]
    );
    let decoded = StyleTable::decode(&edited_bytes, 8).unwrap();
    assert_eq!(decoded.active_at(1).padding, 0x5a);
    assert_eq!(decoded.active_at(1).color, [0x1234, 0x2345, 0x3456]);
    dispatch_result_with_store(&mut session, Some(&store), "project.save", json!({})).unwrap();
    let (store, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    dispatch_result(&mut reopened, "history.undo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(reopened.snapshot(), &before);
    dispatch_result(&mut reopened, "history.redo", json!({"expectedRevision":3})).unwrap();
    let destination = temporary.path().join("classic-output");
    assert_classic_neighbors(
        &mut reopened,
        &store,
        &destination,
        &original_resources,
        &original_styles,
    );
}

fn apply_style_transport(
    session: &mut EditorSession,
    store: &ProjectStore,
    params: Value,
) -> Value {
    let mut output = Vec::new();
    crate::transport::serve_io(
        session,
        Some(store),
        Cursor::new(
            json!({"id":1,"method":"text-resource.apply-styles","params":params}).to_string()
                + "\n",
        ),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true);
    response
}

fn assert_classic_neighbors(
    reopened: &mut EditorSession,
    store: &ProjectStore,
    destination: &std::path::Path,
    original_resources: &[u8],
    original_styles: &[u8],
) {
    crate::classic_compilation::compile_project_classic_slice(
        reopened,
        store,
        json!({"directory":destination}),
    )
    .unwrap();
    let output = std::fs::read(destination.join("Scenario.rsrc")).unwrap();
    let entries = parse_resource_entries_preserving_duplicates(&output).unwrap();
    let originals = parse_resource_entries_preserving_duplicates(original_resources).unwrap();
    for kind in [*b"TEXT", *b"PICT"] {
        assert_eq!(
            entries.iter().find(|entry| entry.resource_type == kind),
            originals.iter().find(|entry| entry.resource_type == kind)
        );
    }
    assert_ne!(
        entries
            .iter()
            .find(|entry| entry.resource_type == *b"styl")
            .unwrap()
            .data,
        original_styles
    );
}

#[test]
fn malformed_style_and_stale_or_unrepresentable_edits_reject_without_losing_source() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session, _) = imported_project(temporary.path(), vec![0, 1, 2]);
    let before = session.snapshot().clone();
    let inspect = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text-resource.inspect-styles",
        json!({"expectedRevision":1,"identity":"classic-resource:TEXT:-201"}),
    )
    .unwrap();
    assert_eq!(inspect["styleEditable"], false);
    assert!(inspect["styles"].as_array().unwrap().is_empty());
    for edits in [
        json!([{"kind":"format","start":0,"end":1,"patch":{"bold":true}}]),
        json!([{"kind":"replace-text","start":0,"removed":1,"text":"longer"}]),
        json!([{"kind":"replace-text","start":0,"removed":1,"text":"🐉"}]),
    ] {
        assert!(
            dispatch_result_with_store(
                &mut session,
                Some(&store),
                "text-resource.apply-styles",
                json!({"expectedRevision":1,"identity":"classic-resource:TEXT:-201","edits":edits})
            )
            .is_err()
        );
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision(), Revision(1));
    }
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "text-resource.apply-styles",
            json!({"expectedRevision":0,"identity":"classic-resource:TEXT:-201"})
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn fresh_formatted_text_allocates_one_pair_and_cancels_without_a_mutation() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("new-style".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let edits = json!([{"kind":"replace-text","start":0,"removed":0,"text":"Café guard"},
        {"kind":"format","start":0,"end":4,"patch":{"bold":true,"underline":true,"color":[65535,32768,0]}}]);
    let params = json!({"expectedRevision":0,"resourceId":-201,"label":"Chronicle","text":"Café guard","edits":edits});
    let inspected = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text-resource.inspect-new-styles",
        params.clone(),
    )
    .unwrap();
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().assets.is_empty());
    assert_eq!(inspected["styles"][0]["face"], 5);
    let created = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text-resource.create",
        params.clone(),
    )
    .unwrap();
    assert_eq!(created["revision"], 1);
    assert_eq!(session.snapshot().assets.len(), 2);
    let opened = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "text-resource.open",
        json!({"identity":"text:-201"}),
    )
    .unwrap();
    assert_eq!(opened["text"], "Café guard");
    assert_eq!(opened["styles"][0]["color"], json!([65535, 32768, 0]));
    assert!(
        dispatch_result_with_store(&mut session, Some(&store), "text-resource.create", {
            let mut occupied = params.clone();
            occupied["expectedRevision"] = json!(1);
            occupied
        })
        .is_err()
    );
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert!(session.snapshot().assets.is_empty());
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot().assets.len(), 2);
}
