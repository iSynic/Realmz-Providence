use super::*;

#[test]
fn classic_complex_encounter_import_edit_repair_compile_and_reopen_is_bounded_and_exact() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source");
    fs::create_dir(&source).expect("create source directory");
    let data_ed2 = write_controlled_complex_source(&source);
    let snapshot = complex_reference_targets();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);

    import_stored_complex_encounters(&mut session, &store, &source);
    assert_bounded_complex_document(&mut session);
    repair_complex_targets(&mut session, &store);
    update_stored_complex_encounter(&mut session, &store);
    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen complex encounter project");
    assert_eq!(reopened.revision(), Revision(4));
    assert_eq!(
        reopened.snapshot().complex_encounters[1].texts[0],
        "Present the moonstone"
    );
    assert_eq!(reopened.snapshot().classic_sources.len(), 1);
    let source_record = &reopened.snapshot().classic_sources[0];
    assert_eq!(source_record.native_path, "Data ED2");
    assert_eq!(store.read_blob(&source_record.blob).unwrap(), data_ed2);

    assert_complex_compile(&reopened, &store, temporary.path(), &data_ed2);
}

fn write_controlled_complex_source(source: &std::path::Path) -> Vec<u8> {
    let mut data_ed2 = vec![0u8; COMPLEX_ENCOUNTER_RECORD_BYTES * 2];
    let row = COMPLEX_ENCOUNTER_RECORD_BYTES;
    data_ed2[row + 3] = 1;
    data_ed2[row + 38..row + 40].copy_from_slice(&99_i16.to_be_bytes());
    data_ed2[row + 97] = 2;
    data_ed2[row + 157] = 0xa5;
    data_ed2[row + 158..row + 160].copy_from_slice(&99_i16.to_be_bytes());
    data_ed2[row + 480] = 9;
    data_ed2[row + 481..row + 490].copy_from_slice(b"moonstone");
    data_ed2.extend_from_slice(&[0xde, 0xad]);
    fs::write(source.join("Data ED2"), &data_ed2)
        .expect("write controlled complex encounter source");

    data_ed2
}

fn complex_reference_targets() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complex-import".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:7".into()),
        native_id: NativeRecordId(7),
        text: "The sealed archive opens.".into(),
        authored: true,
    });
    snapshot
}

fn import_stored_complex_encounters(
    session: &mut EditorSession,
    store: &ProjectStore,
    source: &std::path::Path,
) {
    let import = json!({
        "id": 1,
        "method": "project.import-classic-complex-encounters",
        "params": {"expectedRevision": 0, "directory": source}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&import).unwrap())),
        &mut output,
    )
    .expect("import complex encounters through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("import response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["count"], 2);
    assert_eq!(response["result"]["trailingBytes"], 2);
    assert_eq!(response["result"]["hasRogueSource"], false);
    assert!(response["result"].get("snapshot").is_none());
}

fn assert_bounded_complex_document(session: &mut EditorSession) {
    let opened = dispatch_result(
        session,
        "encounter.open-complex",
        json!({"identity": "complex-encounter:1"}),
    )
    .expect("open bounded complex encounter document");
    assert!(opened.get("snapshot").is_none());
    assert_eq!(opened["encounter"]["texts"][8], "moonstone");
    assert_eq!(opened["steps"].as_array().unwrap().len(), 1);
    assert_eq!(opened["responseControls"]["physical"]["count"], 8);
    assert_eq!(opened["responseControls"]["magic"]["count"], 10);
    assert_eq!(
        opened["responseControls"]["magic"]["spellClassRange"],
        json!([1, 6])
    );
    assert_eq!(
        opened["responseControls"]["magic"]["blankEnabledSentinel"],
        1100
    );
    assert_eq!(opened["responseControls"]["items"]["count"], 5);
    assert_eq!(
        opened["responseControls"]["items"]["blankEnabledSentinel"],
        9999
    );
    assert_eq!(
        opened["responseControls"]["typedReply"]["matchStopsAtSpace"],
        true
    );
    assert_eq!(opened["responseControls"]["defaultFailureResult"], 4);
    assert!(
        opened["references"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| {
                reference["field"] == "promptMessage" && reference["resolution"] == "missing"
            })
    );
    let listed = dispatch_result(
        session,
        "encounter.list-complex",
        json!({"offset": 1, "limit": 1}),
    )
    .expect("list bounded complex encounter rows");
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["items"][0]["label"], "moonstone");
    assert!(listed.get("snapshot").is_none());
}

fn repair_complex_targets(session: &mut EditorSession, store: &ProjectStore) {
    for (request_id, revision, field) in [(2, 1, "promptMessage"), (3, 2, "actions[3].target")] {
        let request = json!({
            "id": request_id,
            "method": "encounter.reference.retarget",
            "params": {
                "expectedRevision": revision,
                "source": "complex-encounter:1",
                "field": field,
                "targetId": 7
            }
        });
        let mut output = Vec::new();
        serve_io(
            session,
            Some(store),
            Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
            &mut output,
        )
        .expect("repair complex encounter reference");
        let response: Value = serde_json::from_slice(&output).expect("repair response");
        assert_eq!(response["ok"], true);
        assert_eq!(
            response["result"]["changedEntities"],
            json!(["complex-encounter:1"])
        );
        assert!(response["result"].get("snapshot").is_none());
    }
}

fn update_stored_complex_encounter(session: &mut EditorSession, store: &ProjectStore) {
    let mut edited = session.snapshot().complex_encounters[1].clone();
    edited.texts[0] = "Present the moonstone".into();
    edited.word_result = 3;
    let steps = edited
        .actions
        .iter()
        .map(|action| {
            json!({
                "slot": action.slot,
                "actionIdentity": format!("realmz.action.{}", action.raw_opcode.unsigned_abs()),
                "gosub": action.raw_opcode < 0,
                "targetNativeId": action.target_native_id,
            })
        })
        .collect::<Vec<_>>();
    let update = json!({
        "id": 4,
        "method": "encounter.apply-complex-draft",
        "params": {"expectedRevision": 3, "draft": {
            "source": edited.identity,
            "nativeId": edited.native_id,
            "promptMessageNativeId": edited.prompt_message_native_id,
            "canBackOut": edited.can_back_out,
            "maxTimes": edited.max_times,
            "actionResult": edited.action_result,
            "wordResult": edited.word_result,
            "groups": edited.groups,
            "spellIds": edited.spell_ids,
            "spellResults": edited.spell_results,
            "itemIds": edited.item_ids,
            "itemResults": edited.item_results,
            "thief": edited.thief,
            "casteSuccess": edited.caste_success,
            "thiefSuccess": edited.thief_success,
            "thiefFail": edited.thief_fail,
            "texts": edited.texts,
            "steps": steps,
        }}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&update).unwrap())),
        &mut output,
    )
    .expect("update complex encounter through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("update response");
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["change"]["changedEntities"],
        json!(["complex-encounter:1"])
    );
}

fn assert_complex_compile(
    reopened: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    data_ed2: &[u8],
) {
    let first = root.join("compiled-complex-first");
    let second = root.join("compiled-complex-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile edited complex encounter project");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("repeat complex encounter compile");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    let compiled =
        fs::read(root.join("compiled-complex-first").join("Data ED2")).expect("compiled Data ED2");
    let row = COMPLEX_ENCOUNTER_RECORD_BYTES;
    assert_eq!(
        &compiled[..COMPLEX_ENCOUNTER_RECORD_BYTES],
        &data_ed2[..COMPLEX_ENCOUNTER_RECORD_BYTES]
    );
    assert_eq!(compiled[row + 97], 3);
    assert_eq!(compiled[row + 157], 0xa5);
    assert_eq!(
        i16::from_be_bytes([compiled[row + 158], compiled[row + 159]]),
        7
    );
    assert_eq!(
        i16::from_be_bytes([compiled[row + 38], compiled[row + 39]]),
        7
    );
    assert_eq!(
        &compiled[COMPLEX_ENCOUNTER_RECORD_BYTES * 2..],
        &[0xde, 0xad]
    );
}

#[test]
fn classic_rogue_encounter_import_edit_repair_compile_and_reopen_is_bounded_and_exact() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source");
    fs::create_dir(&source).expect("create source directory");
    let data_td2 = write_controlled_rogue_source(&source);
    let snapshot = rogue_reference_targets();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);

    import_stored_rogue_encounters(&mut session, &store, &source);
    assert_bounded_rogue_document(&mut session);
    repair_rogue_targets(&mut session, &store);
    update_stored_rogue_encounter(&mut session, &store);
    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen Rogue encounter project");
    assert_eq!(reopened.revision(), Revision(4));
    assert_eq!(reopened.snapshot().rogue_encounters[1].high_damage, 12);
    let source_record = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data TD2")
        .expect("Data TD2 source record");
    assert_eq!(store.read_blob(&source_record.blob).unwrap(), data_td2);

    assert_rogue_compile(&reopened, &store, temporary.path(), &data_td2);
}

fn write_controlled_rogue_source(source: &std::path::Path) -> Vec<u8> {
    let mut data_td2 = vec![0u8; ROGUE_ENCOUNTER_RECORD_BYTES * 2];
    let row = ROGUE_ENCOUNTER_RECORD_BYTES;
    data_td2[row] = 1;
    data_td2[row + 5] = 72;
    data_td2[row + 34..row + 36].copy_from_slice(&99_i16.to_be_bytes());
    data_td2[row + 100..row + 102].copy_from_slice(&9_i16.to_be_bytes());
    data_td2[row + 102..row + 104].copy_from_slice(&3_i16.to_be_bytes());
    data_td2[row + 104..row + 106].copy_from_slice(&4_i16.to_be_bytes());
    data_td2[row + 106..row + 108].copy_from_slice(&99_i16.to_be_bytes());
    data_td2.extend_from_slice(&[0xde, 0xad]);
    fs::write(source.join("Data TD2"), &data_td2).expect("write controlled Rogue encounter source");

    data_td2
}

fn rogue_reference_targets() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-import".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:7".into()),
        native_id: NativeRecordId(7),
        text: "The trap mechanism yields.".into(),
        authored: true,
    });
    snapshot
}

fn import_stored_rogue_encounters(
    session: &mut EditorSession,
    store: &ProjectStore,
    source: &std::path::Path,
) {
    let import = json!({
        "id": 1,
        "method": "project.import-classic-rogue-encounters",
        "params": {"expectedRevision": 0, "directory": source}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&import).unwrap())),
        &mut output,
    )
    .expect("import Rogue encounters through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("import response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["count"], 2);
    assert_eq!(response["result"]["trailingBytes"], 2);
    assert!(response["result"].get("snapshot").is_none());
}

fn assert_bounded_rogue_document(session: &mut EditorSession) {
    let opened = dispatch_result(
        session,
        "encounter.open-rogue",
        json!({"identity": "rogue-encounter:1"}),
    )
    .expect("open bounded Rogue encounter document");
    assert!(opened.get("snapshot").is_none());
    assert_eq!(opened["encounter"]["typeFlags"][5], true);
    assert!(
        opened["diagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|diagnostic| { diagnostic["code"] == "rogue-encounter.damage.inverted" })
    );
    let listed = dispatch_result(
        session,
        "encounter.list-rogue",
        json!({"offset": 1, "limit": 1}),
    )
    .expect("list bounded Rogue encounter rows");
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["items"][0]["label"], "Rogue Encounter 1");
    assert!(listed.get("snapshot").is_none());
}

fn repair_rogue_targets(session: &mut EditorSession, store: &ProjectStore) {
    for (request_id, revision, field) in [(2, 1, "prompts[0]"), (3, 2, "successText[0]")] {
        let request = json!({
            "id": request_id,
            "method": "rogue-encounter.reference.retarget",
            "params": {
                "expectedRevision": revision,
                "source": "rogue-encounter:1",
                "field": field,
                "targetId": 7
            }
        });
        let mut output = Vec::new();
        serve_io(
            session,
            Some(store),
            Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
            &mut output,
        )
        .expect("repair Rogue encounter reference");
        let response: Value = serde_json::from_slice(&output).expect("repair response");
        assert_eq!(response["ok"], true);
        assert_eq!(
            response["result"]["changedEntities"],
            json!(["rogue-encounter:1"])
        );
        assert!(response["result"].get("snapshot").is_none());
    }
}

fn update_stored_rogue_encounter(session: &mut EditorSession, store: &ProjectStore) {
    let mut edited = session.snapshot().rogue_encounters[1].clone();
    edited.high_damage = 12;
    let update = json!({
        "id": 4,
        "method": "rogue-encounter.update",
        "params": {"expectedRevision": 3, "encounter": edited}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&update).unwrap())),
        &mut output,
    )
    .expect("update Rogue encounter through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("update response");
    assert_eq!(response["ok"], true);
}

fn assert_rogue_compile(
    reopened: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    data_td2: &[u8],
) {
    let first = root.join("compiled-rogue-first");
    let second = root.join("compiled-rogue-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile edited Rogue encounter project");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("repeat Rogue encounter compile");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    let compiled =
        fs::read(root.join("compiled-rogue-first").join("Data TD2")).expect("compiled Data TD2");
    let row = ROGUE_ENCOUNTER_RECORD_BYTES;
    assert_eq!(
        &compiled[..ROGUE_ENCOUNTER_RECORD_BYTES],
        &data_td2[..ROGUE_ENCOUNTER_RECORD_BYTES]
    );
    assert_eq!(compiled[row + 5], data_td2[row + 5]);
    assert_eq!(
        i16::from_be_bytes([compiled[row + 34], compiled[row + 35]]),
        7
    );
    assert_eq!(
        i16::from_be_bytes([compiled[row + 102], compiled[row + 103]]),
        12
    );
    assert_eq!(
        i16::from_be_bytes([compiled[row + 106], compiled[row + 107]]),
        7
    );
    assert_eq!(&compiled[ROGUE_ENCOUNTER_RECORD_BYTES * 2..], &[0xde, 0xad]);
}

#[test]
fn classic_timed_encounter_import_edit_compile_and_reopen_preserves_reserved_bytes() {
    let temporary = tempfile::tempdir().unwrap();
    let source = temporary.path().join("source");
    fs::create_dir(&source).unwrap();
    let snapshot = write_timed_source_and_targets(&source);
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let mut output = Vec::new();
    let request = json!({"id":1,"method":"project.import-classic-timed-encounters","params":{"expectedRevision":0,"directory":source}});
    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["trailingBytes"], 2);
    let opened = dispatch_result(
        &mut session,
        "encounter.open-timed",
        json!({"identity":"timed-encounter:0"}),
    )
    .unwrap();
    assert!(opened.get("snapshot").is_none());
    let mut edited = session.snapshot().timed_encounters[0].clone();
    edited.percent = 41;
    output.clear();
    let update = json!({"id":2,"method":"timed-encounter.update","params":{"expectedRevision":1,"encounter":edited}});
    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&update).unwrap())),
        &mut output,
    )
    .unwrap();
    let (store, reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.snapshot().timed_encounters[0].percent, 41);
    let out = temporary.path().join("compiled-timed");
    compile_project_classic_slice(&reopened, &store, json!({"directory":out})).unwrap();
    let compiled = fs::read(temporary.path().join("compiled-timed").join("Data TD3")).unwrap();
    assert_eq!(i16::from_be_bytes([compiled[4], compiled[5]]), 41);
    assert_eq!(&compiled[22..40], &[0xa5; 18]);
    assert_eq!(&compiled[40..], &[0xde, 0xad]);
}
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result;
use crate::transport::serve_io;
use providence_core::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::ROGUE_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use providence_core::model::ExtraActionPoint;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::ScenarioMessage;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

fn write_timed_source_and_targets(source: &std::path::Path) -> ProjectSnapshot {
    let mut data_td3 = vec![0u8; TIMED_ENCOUNTER_RECORD_BYTES];
    data_td3[0..2].copy_from_slice(&12_i16.to_be_bytes());
    data_td3[4..6].copy_from_slice(&75_i16.to_be_bytes());
    data_td3[20..22].copy_from_slice(&(-1_i16).to_be_bytes());
    data_td3[22..40].fill(0xa5);
    data_td3.extend_from_slice(&[0xde, 0xad]);
    fs::write(source.join("Data TD3"), &data_td3).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-import".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot
}
