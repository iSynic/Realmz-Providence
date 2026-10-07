use super::*;
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result;
use crate::transport::serve_io;
use providence_core::codecs::BATTLE_RECORD_BYTES;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::codecs::decode_monster_set;
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

#[test]
fn classic_battle_import_edit_repair_compile_and_reopen_is_bounded_and_exact() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source");
    fs::create_dir(&source).expect("create source directory");
    let data_bd = write_controlled_battle_source(&source);
    let snapshot = battle_reference_targets();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);

    import_stored_battles(&mut session, &store, &source);
    assert_bounded_battle_document(&mut session);
    repair_battle_targets(&mut session, &store);
    update_stored_battle(&mut session, &store);
    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen battle project");
    assert_eq!(reopened.revision(), Revision(5));
    assert_eq!(reopened.snapshot().battles[2].distance, 8);
    assert_eq!(reopened.snapshot().classic_sources.len(), 1);
    let source_record = &reopened.snapshot().classic_sources[0];
    assert_eq!(source_record.native_path, "Data BD");
    assert_eq!(store.read_blob(&source_record.blob).unwrap(), data_bd);

    assert_deterministic_battle_compile(&reopened, &store, temporary.path(), &data_bd);
}

fn write_controlled_battle_source(source: &std::path::Path) -> Vec<u8> {
    let mut data_bd = vec![0u8; BATTLE_RECORD_BYTES * 3];
    let row = BATTLE_RECORD_BYTES * 2;
    data_bd[row + 84 * 2..row + 84 * 2 + 2].copy_from_slice(&(-9_i16).to_be_bytes());
    data_bd[row + 338] = 4;
    data_bd[row + 339] = 0xa5;
    data_bd[row + 340..row + 342].copy_from_slice(&99_i16.to_be_bytes());
    data_bd[row + 344..row + 346].copy_from_slice(&8_i16.to_be_bytes());
    data_bd.extend_from_slice(&[0xde, 0xad]);
    fs::write(source.join("Data BD"), &data_bd).expect("write controlled battle source");

    data_bd
}

fn battle_reference_targets() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-import".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:4".into()),
        native_id: NativeRecordId(4),
        text: "The drowned watch closes ranks.".into(),
        authored: true,
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:6".into()),
        native_id: NativeRecordId(6),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let mut normal = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 2], "Data MD", 0);
    for monster in &mut normal.monsters {
        monster.authored = true;
    }
    normal.monsters[1].display_name = "Drowned Captain".into();
    normal.monsters[1].hit_dice = 9;
    snapshot.monster_sets.push(normal);
    snapshot
}

fn import_stored_battles(
    session: &mut EditorSession,
    store: &ProjectStore,
    source: &std::path::Path,
) {
    let import = json!({
        "id": 1,
        "method": "project.import-classic-battles",
        "params": {"expectedRevision": 0, "directory": source}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&import).unwrap())),
        &mut output,
    )
    .expect("import battles through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("import response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["count"], 3);
    assert_eq!(response["result"]["trailingBytes"], 2);
    assert!(response["result"].get("snapshot").is_none());
}

fn assert_bounded_battle_document(session: &mut EditorSession) {
    let opened = dispatch_result(session, "battle.open", json!({"nativeId": 2}))
        .expect("open bounded battle document");
    assert!(opened.get("snapshot").is_none());
    assert!(
        opened["references"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| {
                reference["field"] == "grid[84].monster" && reference["resolution"] == "missing"
            })
    );
    let listed = dispatch_result(session, "battle.list", json!({"offset": 2, "limit": 1}))
        .expect("list bounded battle rows");
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["items"][0]["placedMonsters"], 1);
    assert!(listed.get("snapshot").is_none());
}

fn repair_battle_targets(session: &mut EditorSession, store: &ProjectStore) {
    for (id, revision, field, target) in [
        (2, 1, "grid[84].monster", 1),
        (3, 2, "messageBefore", 4),
        (4, 3, "battleMacro", 6),
    ] {
        let request = json!({
            "id": id,
            "method": "battle-reference.retarget",
            "params": {
                "expectedRevision": revision,
                "source": "battle:2",
                "field": field,
                "targetId": target
            }
        });
        let mut output = Vec::new();
        serve_io(
            session,
            Some(store),
            Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
            &mut output,
        )
        .expect("repair battle reference");
        let response: Value = serde_json::from_slice(&output).expect("repair response");
        assert_eq!(response["ok"], true);
        assert_eq!(response["result"]["changedEntities"], json!(["battle:2"]));
        assert!(response["result"].get("snapshot").is_none());
    }
    assert_eq!(session.snapshot().battles[2].grid[84], -1);
    assert_eq!(session.snapshot().battles[2].battle_macro, -6);
}

fn update_stored_battle(session: &mut EditorSession, store: &ProjectStore) {
    let mut edited = session.snapshot().battles[2].clone();
    edited.distance = 8;
    let update = json!({
        "id": 5,
        "method": "battle.update",
        "params": {"expectedRevision": 4, "battle": edited}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&update).unwrap())),
        &mut output,
    )
    .expect("update battle through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("update response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["changedEntities"], json!(["battle:2"]));
}

fn assert_deterministic_battle_compile(
    reopened: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    data_bd: &[u8],
) {
    let first = root.join("compiled-battle-first");
    let second = root.join("compiled-battle-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile edited battle project");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("repeat battle compile");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    let compiled =
        fs::read(root.join("compiled-battle-first").join("Data BD")).expect("compiled Data BD");
    assert_battle_owned_bytes(&compiled, data_bd);
}

fn assert_battle_owned_bytes(compiled: &[u8], data_bd: &[u8]) {
    let row = BATTLE_RECORD_BYTES * 2;
    assert_eq!(
        &compiled[..BATTLE_RECORD_BYTES * 2],
        &data_bd[..BATTLE_RECORD_BYTES * 2]
    );
    assert_eq!(
        i16::from_be_bytes([compiled[row + 84 * 2], compiled[row + 84 * 2 + 1]]),
        -1
    );
    assert_eq!(compiled[row + 338], 8);
    assert_eq!(compiled[row + 339], 0);
    assert_eq!(
        i16::from_be_bytes([compiled[row + 340], compiled[row + 341]]),
        4
    );
    assert_eq!(
        i16::from_be_bytes([compiled[row + 344], compiled[row + 345]]),
        -6
    );
    assert_eq!(&compiled[BATTLE_RECORD_BYTES * 3..], &[0xde, 0xad]);
}
