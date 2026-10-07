use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result;
use crate::economy_import::import_classic_option_labels;
use providence_core::codecs::OPTION_LABEL_RECORD_BYTES;
use providence_core::codecs::decode_option_labels;
use providence_core::model::ClassicAction;
use providence_core::model::ExtraActionPoint;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

#[test]
fn classic_option_label_import_open_update_compile_and_reopen_is_bounded() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source-options");
    fs::create_dir(&source).expect("create source directory");
    let data_od = option_label_source();
    fs::write(source.join("Data OD"), &data_od).expect("write controlled option source");

    let snapshot = ProjectSnapshot::new_authored(StableId("option-import".into()));
    let store = ProjectStore::create(temporary.path().join("project-options"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    let import = import_classic_option_labels(
        &mut session,
        Some(&store),
        json!({"expectedRevision": 0, "directory": source}),
    )
    .expect("import option labels");
    assert_eq!(import["count"], 2);
    assert_eq!(import["trailingBytes"], 1);
    let listed = dispatch_result(&mut session, "option-label.list", json!({"limit": 1})).unwrap();
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["truncated"], true);
    let opened =
        dispatch_result(&mut session, "option-label.open", json!({"nativeId": 1})).unwrap();
    assert_eq!(opened["optionLabel"]["text"], "Stay");
    let rebuilt = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-option-labels",
        json!({}),
    )
    .unwrap();
    assert_eq!(rebuilt[1], json!({"id": 1, "text": "Stay"}));
    let mut edited = session.snapshot().option_labels[1].clone();
    edited.text = "Withdraw".into();
    dispatch_result(
        &mut session,
        "option-label.update",
        json!({"expectedRevision": 1, "optionLabel": edited}),
    )
    .expect("update option label");
    assert_option_label_lifecycle(&mut session, &store, &temporary, &data_od);
}

fn assert_option_label_lifecycle(
    session: &mut EditorSession,
    store: &ProjectStore,
    temporary: &tempfile::TempDir,
    data_od: &[u8],
) {
    let created = dispatch_result(
        session,
        "option-label.create",
        json!({"expectedRevision": 2}),
    )
    .expect("create option label");
    assert_eq!(created["changedEntities"], json!(["option-label:2"]));
    let duplicated = dispatch_result(
        session,
        "option-label.duplicate",
        json!({"expectedRevision": 3, "nativeId": 1}),
    )
    .expect("duplicate option label");
    assert_eq!(duplicated["changedEntities"], json!(["option-label:3"]));
    store
        .checkpoint_session(session, &json!({"method": "option-label.duplicate"}))
        .unwrap();
    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen option project");
    assert_eq!(reopened.snapshot().option_labels[1].text, "Withdraw");
    assert_eq!(reopened.snapshot().option_labels[2].text, "");
    assert_eq!(reopened.snapshot().option_labels[3].text, "Withdraw");
    let output = temporary.path().join("compiled-options");
    compile_project_classic_slice(&reopened, &store, json!({"directory": output})).unwrap();
    let compiled = fs::read(temporary.path().join("compiled-options").join("Data OD")).unwrap();
    assert_eq!(
        &compiled[..OPTION_LABEL_RECORD_BYTES],
        &data_od[..OPTION_LABEL_RECORD_BYTES]
    );
    assert_eq!(&compiled[4 * OPTION_LABEL_RECORD_BYTES..], &[0xde]);
    assert_eq!(decode_option_labels(&compiled).records[1].text, "Withdraw");
    assert_eq!(decode_option_labels(&compiled).records[3].text, "Withdraw");
}

#[test]
fn quest_projection_labels_and_uses_are_bounded_revisioned_and_durable() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let snapshot = quest_source_snapshot();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create quest project");
    let mut session = EditorSession::new(snapshot);

    let listed = dispatch_result(&mut session, "quest.list", json!({"offset": 6, "limit": 1}))
        .expect("list bounded quest projection");
    assert_eq!(listed["total"], 126);
    assert_eq!(listed["items"][0]["id"], 7);
    assert_eq!(listed["items"][0]["usedBy"], 1);
    assert_eq!(listed["items"][0]["authored"], false);

    let upsert = dispatch_result(
        &mut session,
        "quest-label.upsert",
        json!({
            "expectedRevision": 0,
            "questLabel": {
                "id": 7,
                "label": "Bridge secured",
                "note": "Set by Extra Action Point 2"
            }
        }),
    )
    .expect("upsert quest label");
    assert_eq!(upsert["changedEntities"], json!(["quest:7"]));
    store
        .checkpoint_session(&session, &json!({"method": "quest-label.upsert"}))
        .expect("checkpoint quest label");
    let (_store, mut reopened) =
        ProjectStore::open_session(store.root()).expect("reopen quest project");
    let opened = dispatch_result(&mut reopened, "quest.open", json!({"id": 7}))
        .expect("open quest projection");
    assert_eq!(opened["quest"]["label"], "Bridge secured");
    assert_eq!(opened["usedBy"].as_array().unwrap().len(), 1);
    assert_eq!(
        opened["usedBy"][0]["byteProvenance"]["nativePath"],
        "Data ED3"
    );

    dispatch_result(
        &mut reopened,
        "quest-label.delete",
        json!({"expectedRevision": 1, "id": 7}),
    )
    .expect("delete quest label metadata");
    let opened = dispatch_result(&mut reopened, "quest.open", json!({"id": 7})).unwrap();
    assert_eq!(opened["quest"]["authored"], false);
    assert_eq!(opened["quest"]["label"], "Quest 7");
    assert_eq!(opened["usedBy"].as_array().unwrap().len(), 1);
}

fn option_label_source() -> Vec<u8> {
    let mut data_od = vec![0xa5; OPTION_LABEL_RECORD_BYTES * 2];
    data_od[0] = 2;
    data_od[1..3].copy_from_slice(b"Go");
    data_od[OPTION_LABEL_RECORD_BYTES] = 4;
    data_od[OPTION_LABEL_RECORD_BYTES + 1..OPTION_LABEL_RECORD_BYTES + 5].copy_from_slice(b"Stay");
    data_od.extend_from_slice(&[0xde]);
    data_od
}

fn quest_source_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("quest-adapter".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:2".into()),
        native_id: NativeRecordId(2),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 1,
            raw_opcode: 47,
            target_native_id: 7,
        }],
    });
    snapshot
}
