use std::{fs, io::Cursor};

use providence_core::{
    codecs::{
        ResourceEntry, decode_classic_text_assets, parse_resource_entries_preserving_duplicates,
        write_resource_fork,
    },
    model::{NativeRecordId, ProjectSnapshot, ScenarioMessage, StableId},
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

use crate::text_resource_authoring::{check_number, create, prepare_import, validate_draft};

fn project() -> (tempfile::TempDir, ProjectStore, EditorSession) {
    let temp = tempfile::tempdir().unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("text-authoring".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Text authoring anchor".into(),
        authored: true,
    });
    let store = ProjectStore::create(temp.path().join("project"), &snapshot).unwrap();
    (temp, store, EditorSession::new(snapshot))
}

fn request(revision: u64, number: i32) -> Value {
    json!({"expectedRevision": revision, "resourceId": number,
        "label": "Moon Gate Chronicle", "text": "A café by the river.\nSecond page."})
}

#[test]
fn text_draft_validation_is_field_local_complete_and_nonmutating() {
    let (_temp, store, mut session) = project();
    let before = session.snapshot().clone();
    for (label, text, name_invalid, text_invalid) in [
        (
            "A café".to_owned(),
            "Long line.\n".repeat(2000),
            false,
            false,
        ),
        ("".to_owned(), "Supported text".into(), true, false),
        ("a".repeat(256), "🧭".into(), true, true),
        ("Name\nBreak".into(), "Line\rBreak".into(), true, true),
        ("🧭".into(), "a".repeat(1024 * 1024 + 1), true, true),
    ] {
        let params = json!({"expectedRevision":0, "resourceId":203, "label":label, "text":text});
        let value = validate_draft(&session, &params).unwrap();
        assert_eq!(value["valid"], !name_invalid && !text_invalid);
        assert_eq!(!value["nameError"].is_null(), name_invalid);
        assert_eq!(!value["textError"].is_null(), text_invalid);
        assert!(value.get("text").is_none());
        assert_eq!(session.snapshot(), &before);
        if name_invalid || text_invalid {
            assert!(create(&mut session, Some(&store), &params).is_err());
        }
    }
    assert_eq!(session.snapshot(), &before);
    assert!(
        validate_draft(&session, &request(1, 203))
            .unwrap_err()
            .starts_with("revision conflict:")
    );
    let wire = json!({"id":1, "method":"text-resource.validate-draft", "params":request(0, 203)});
    let mut output = Vec::new();
    crate::transport::serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{wire}\n")),
        &mut output,
    )
    .unwrap();
    let value: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(value["result"]["valid"], true);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn text_import_preparation_is_complete_nonmutating_and_reports_transcoding() {
    let (temp, _store, session) = project();
    let file = temp.path().join("chronicle.txt");
    let content = "\u{feff}First\r\nSecond\rThird 🧭\n".to_owned() + &"A long page.\n".repeat(2000);
    fs::write(&file, content.as_bytes()).unwrap();
    let before = session.snapshot().clone();
    let prepared = prepare_import(&session, &json!({"expectedRevision": 0, "path": file})).unwrap();
    let expected = content
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    assert_eq!(prepared["text"], expected);
    assert_eq!(prepared["bomRemoved"], true);
    assert_eq!(prepared["lineEndingsNormalized"], true);
    assert_eq!(prepared["classicCompatible"], false);
    assert!(
        prepared["encodingError"]
            .as_str()
            .unwrap()
            .contains("not representable")
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(prepared.get("snapshot").is_none());
    fs::write(&file, [0xff, 0xfe, 0x41, 0]).unwrap();
    assert!(
        prepare_import(&session, &json!({"expectedRevision": 0, "path": file}))
            .unwrap_err()
            .contains("UTF-8")
    );
    fs::write(&file, vec![b'A'; 1024 * 1024 + 1]).unwrap();
    assert!(
        prepare_import(&session, &json!({"expectedRevision": 0, "path": file}))
            .unwrap_err()
            .contains("1 MiB")
    );
    assert!(
        prepare_import(
            &session,
            &json!({"expectedRevision": 1, "path": "not-a-file"})
        )
        .unwrap_err()
        .starts_with("revision conflict:")
    );
}

#[test]
fn text_creation_is_one_durable_command_with_exact_classic_output() {
    let (temp, store, mut session) = project();
    let wire = json!({"id": 1, "method": "text-resource.create", "params": request(0, -202)});
    let mut output = Vec::new();
    crate::transport::serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{wire}\n")),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["identity"], "text:-202");
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(session.snapshot().assets.len(), 1);
    assert!(response["result"].get("snapshot").is_none());
    let (_, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.snapshot(), session.snapshot());
    let asset = &reopened.snapshot().assets[0];
    assert_eq!(
        store.read_blob(&asset.blob).unwrap(),
        request(0, -202)["text"].as_str().unwrap().as_bytes()
    );
    assert_eq!(
        store
            .read_blob(asset.classic_payload_blob.as_ref().unwrap())
            .unwrap(),
        b"A caf\x8e by the river.\rSecond page."
    );
    crate::dispatch_result(&mut reopened, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert!(reopened.snapshot().assets.is_empty());
    crate::dispatch_result(&mut reopened, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(reopened.snapshot(), session.snapshot());
    let first = temp.path().join("first");
    let second = temp.path().join("second");
    let a = crate::classic_compilation::compile_project_classic_slice(
        &reopened,
        &store,
        json!({"directory": first}),
    )
    .unwrap();
    let b = crate::classic_compilation::compile_project_classic_slice(
        &reopened,
        &store,
        json!({"directory": second}),
    )
    .unwrap();
    assert_eq!(a["manifestSha256"], b["manifestSha256"]);
    let bytes = fs::read(first.join("Scenario.rsrc")).unwrap();
    let entries = parse_resource_entries_preserving_duplicates(&bytes).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].id, -202);
    assert_eq!(entries[0].name, "Moon Gate Chronicle");
    let imported = decode_classic_text_assets(&bytes, "Scenario.rsrc").unwrap();
    assert_eq!(
        imported[0].runtime_payload,
        store.read_blob(&session.snapshot().assets[0].blob).unwrap()
    );
}

#[test]
fn text_creation_rejects_collisions_invalid_content_and_stale_revisions_without_mutation() {
    let (_temp, store, mut session) = project();
    for (field, value) in [
        ("resourceId", json!(0)),
        ("resourceId", json!(32768)),
        ("resourceId", json!(-32769)),
        ("text", json!("🧭")),
        ("text", json!("First\r\nSecond")),
        ("label", json!("")),
        ("label", json!("Line\nBreak")),
        ("label", json!("a".repeat(256))),
        ("text", json!("a".repeat(1024 * 1024 + 1))),
    ] {
        let mut invalid = request(0, -202);
        invalid[field] = value;
        let before = session.snapshot().clone();
        assert!(
            create(&mut session, Some(&store), &invalid).is_err(),
            "{field}"
        );
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision(), Revision(0));
    }
    create(&mut session, Some(&store), &request(0, -202)).unwrap();
    let before = session.snapshot().clone();
    assert!(
        create(&mut session, Some(&store), &request(0, -203))
            .unwrap_err()
            .starts_with("revision conflict:")
    );
    assert!(
        create(&mut session, Some(&store), &request(1, -202))
            .unwrap_err()
            .contains("already used")
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(1));
    for number in [i16::MIN as i32, i16::MAX as i32] {
        let revision = session.revision().0;
        create(&mut session, Some(&store), &request(revision, number)).unwrap();
    }
}

#[test]
fn text_creation_preserves_acknowledged_style_and_retained_neighbors() {
    let (temp, store, mut session) = project();
    let entries = vec![
        ResourceEntry {
            resource_type: *b"styl",
            id: -202,
            name: "Retained style".into(),
            attributes: 3,
            data: vec![0, 1, 2, 3],
        },
        ResourceEntry {
            resource_type: *b"TEXT",
            id: -201,
            name: "Neighbor".into(),
            attributes: 5,
            data: b"Untouched\rText".to_vec(),
        },
    ];
    let source = temp.path().join("source");
    fs::create_dir(&source).unwrap();
    fs::write(
        source.join("Scenario.rsrc"),
        write_resource_fork(&entries).unwrap(),
    )
    .unwrap();
    crate::classic_media_import::import_classic_media(
        &mut session,
        Some(&store),
        json!({"expectedRevision":0,"directory":source}),
    )
    .unwrap();
    let checked = check_number(&session, Some(&store), &request(1, -202)).unwrap();
    assert_eq!(checked["available"], true);
    assert_eq!(
        checked["styleCompanion"]["identity"],
        "classic-resource:styl:-202"
    );
    let before = session.snapshot().clone();
    assert!(
        create(&mut session, Some(&store), &request(1, -202))
            .unwrap_err()
            .contains("explicitly preserve")
    );
    assert_eq!(session.snapshot(), &before);
    let mut acknowledged = request(1, -202);
    acknowledged["preserveStyleIdentity"] = checked["styleCompanion"]["identity"].clone();
    create(&mut session, Some(&store), &acknowledged).unwrap();
    for neighbor in &before.assets {
        assert_eq!(
            session
                .snapshot()
                .assets
                .iter()
                .find(|asset| asset.identity == neighbor.identity),
            Some(neighbor)
        );
    }
    let output = temp.path().join("output");
    crate::classic_compilation::compile_project_classic_slice(
        &session,
        &store,
        json!({"directory":output}),
    )
    .unwrap();
    let compiled = parse_resource_entries_preserving_duplicates(
        &fs::read(output.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    for neighbor in &entries {
        assert!(compiled.contains(neighbor));
    }
    let mut retained = before.clone();
    retained.assets.clear();
    let retained_session = EditorSession::new(retained);
    for number in [-201, -202] {
        assert_eq!(
            check_number(&retained_session, Some(&store), &request(0, number)).unwrap()["available"],
            false
        );
    }
    let mut ambiguous = before;
    let mut duplicate = ambiguous
        .assets
        .iter()
        .find(|asset| asset.kind == "text-style-resource")
        .unwrap()
        .clone();
    duplicate.identity = StableId("duplicate-style".into());
    ambiguous.assets.push(duplicate);
    assert_eq!(
        check_number(
            &EditorSession::new(ambiguous),
            Some(&store),
            &request(0, -202)
        )
        .unwrap()["available"],
        false
    );
}
