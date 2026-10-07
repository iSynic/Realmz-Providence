use super::*;
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result;
use crate::transport::serve_io;
use providence_core::codecs::MONSTER_DESCRIPTION_RECORD_BYTES;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::codecs::decode_monster_descriptions;
use providence_core::codecs::decode_monster_set;
use providence_core::model::BattleRecord;
use providence_core::model::ExtraActionPoint;
use providence_core::model::MonsterDescription;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;
use std::path::Path;

#[test]
fn classic_monster_import_edit_repair_compile_and_reopen_is_bounded_and_exact() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source");
    let fixtures = write_monster_source(&source);
    let snapshot = imported_monster_snapshot();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    import_monsters(&mut session, &store, &source);
    repair_monster_reference(&mut session, &store);
    edit_imported_monster(&mut session, &store);
    let (store, mut reopened) =
        ProjectStore::open_session(store.root()).expect("reopen monster project");
    assert_eq!(reopened.revision(), Revision(3));
    assert_eq!(reopened.snapshot().monster_sets.len(), 3);
    assert_eq!(reopened.snapshot().monster_descriptions[0].text, "Lore");
    assert_eq!(reopened.snapshot().classic_sources.len(), 4);
    for source_record in &reopened.snapshot().classic_sources {
        let expected = fixtures
            .iter()
            .find(|(name, _)| *name == source_record.native_path)
            .expect("known monster source");
        assert_eq!(store.read_blob(&source_record.blob).unwrap(), expected.1);
    }
    let compiled_md = compile_monster_outputs(temporary.path(), &reopened, &store, &fixtures);
    assert_edited_monster_bytes(temporary.path(), &compiled_md, &fixtures);
    edit_monster_lifecycle(&mut reopened);
    let lifecycle_md = compile_lifecycle_outputs(temporary.path(), &reopened, &store);
    assert_lifecycle_bytes(temporary.path(), &lifecycle_md, &fixtures);
}

fn write_monster_source(source: &Path) -> [(&'static str, Vec<u8>); 4] {
    fs::create_dir(source).expect("create source directory");
    let mut data_md = vec![0u8; MONSTER_RECORD_BYTES * 2];
    data_md[166..168].copy_from_slice(&99_i16.to_be_bytes());
    data_md.extend_from_slice(&[0xde, 0xad]);
    let data_md1 = vec![0u8; MONSTER_RECORD_BYTES];
    let data_md_minus_1 = vec![0u8; MONSTER_RECORD_BYTES];
    let mut data_des = vec![0u8; MONSTER_DESCRIPTION_RECORD_BYTES];
    data_des[0] = 4;
    data_des[1..5].copy_from_slice(b"Lore");
    data_des.push(0xfa);
    let fixtures = [
        ("Data MD", data_md.clone()),
        ("Data MD1", data_md1.clone()),
        ("Data MD-1", data_md_minus_1.clone()),
        ("Data DES", data_des.clone()),
    ];
    for (name, bytes) in &fixtures {
        fs::write(source.join(name), bytes).expect("write controlled monster source");
    }
    fixtures
}

fn imported_monster_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-import".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:77".into()),
        native_id: NativeRecordId(77),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot
}

fn import_monsters(session: &mut EditorSession, store: &ProjectStore, source: &Path) {
    let import = json!({
        "id": 1,
        "method": "project.import-classic-monsters",
        "params": {"expectedRevision": 0, "directory": source}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&import).unwrap())),
        &mut output,
    )
    .expect("import monsters through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("import response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["counts"]["sets"], 3);
    assert_eq!(response["result"]["counts"]["monsters"], 4);
    assert_eq!(response["result"]["counts"]["descriptions"], 1);
    assert!(response["result"].get("snapshot").is_none());

    let opened = dispatch_result(session, "monster.open", json!({"setId": 0, "nativeId": 0}))
        .expect("open bounded monster document");
    assert!(opened.get("snapshot").is_none());
    assert!(
        opened["diagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|diagnostic| { diagnostic["code"] == "reference.extra-action-point.missing" })
    );
}

fn repair_monster_reference(session: &mut EditorSession, store: &ProjectStore) {
    let repair = json!({
        "id": 2,
        "method": "monster-reference.retarget",
        "params": {
            "expectedRevision": 1,
            "source": "monster:0:0",
            "field": "deathMacro",
            "targetId": 77
        }
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&repair).unwrap())),
        &mut output,
    )
    .expect("repair monster reference");
    let response: Value = serde_json::from_slice(&output).expect("repair response");
    assert_eq!(response["ok"], true, "Monster repair failed: {response}");
    assert!(
        response["result"]["referenceChanges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| reference["field"] == "deathMacro"
                && reference["resolution"] == "resolved")
    );
}

fn edit_imported_monster(session: &mut EditorSession, store: &ProjectStore) {
    let mut edited = session.snapshot().monster_sets[1].monsters[0].clone();
    assert_eq!(session.snapshot().monster_sets[1].set_id, 0);
    edited.display_name = "Drowned Captain".into();
    edited.hit_dice = 9;
    let update = json!({
        "id": 3,
        "method": "monster.update",
        "params": {"expectedRevision": 2, "setId": 0, "monster": edited}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&update).unwrap())),
        &mut output,
    )
    .expect("update monster through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("update response");
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["changedEntities"],
        json!(["monster:0:0"])
    );
}

fn compile_monster_outputs(
    temporary: &Path,
    reopened: &EditorSession,
    store: &ProjectStore,
    fixtures: &[(&str, Vec<u8>)],
) -> Vec<u8> {
    let first = temporary.join("compiled-first");
    let second = temporary.join("compiled-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile edited monster project");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("repeat monster compile");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    for (name, _) in fixtures {
        assert_eq!(
            fs::read(temporary.join("compiled-first").join(name)).unwrap(),
            fs::read(temporary.join("compiled-second").join(name)).unwrap()
        );
    }
    fs::read(temporary.join("compiled-first").join("Data MD")).expect("compiled Data MD")
}

fn assert_edited_monster_bytes(temporary: &Path, compiled_md: &[u8], fixtures: &[(&str, Vec<u8>)]) {
    assert_eq!(
        &compiled_md[MONSTER_RECORD_BYTES..MONSTER_RECORD_BYTES * 2],
        &fixtures[0].1[MONSTER_RECORD_BYTES..MONSTER_RECORD_BYTES * 2]
    );
    assert_eq!(&compiled_md[MONSTER_RECORD_BYTES * 2..], &[0xde, 0xad]);
    assert_eq!(compiled_md[0], 9);
    assert_eq!(i16::from_be_bytes([compiled_md[166], compiled_md[167]]), 77);
    assert_eq!(&compiled_md[170..185], b"Drowned Captain");
    assert_eq!(
        fs::read(temporary.join("compiled-first").join("Data MD1")).unwrap(),
        fixtures[1].1
    );
    assert_eq!(
        fs::read(temporary.join("compiled-first").join("Data MD-1")).unwrap(),
        fixtures[2].1
    );
    assert_eq!(
        fs::read(temporary.join("compiled-first").join("Data DES")).unwrap(),
        fixtures[3].1
    );
}

fn edit_monster_lifecycle(reopened: &mut EditorSession) {
    dispatch_result(
        reopened,
        "monster.create",
        json!({"expectedRevision": 3, "setId": 0, "nativeId": 2}),
    )
    .expect("create lifecycle row");
    dispatch_result(
        reopened,
        "monster.duplicate",
        json!({
            "expectedRevision": 4,
            "setId": 0,
            "sourceNativeId": 0,
            "targetNativeId": 3
        }),
    )
    .expect("duplicate imported row");
    dispatch_result(
        reopened,
        "monster.generate-variants",
        json!({"expectedRevision": 5, "nativeId": 0}),
    )
    .expect("generate variant rows");
    dispatch_result(
        reopened,
        "monster.switch-records",
        json!({
            "expectedRevision": 6,
            "setId": 0,
            "firstNativeId": 0,
            "secondNativeId": 2
        }),
    )
    .expect("switch imported and authored rows");
    dispatch_result(
        reopened,
        "monster.clear",
        json!({"expectedRevision": 7, "setId": 0, "nativeId": 2}),
    )
    .expect("clear switched row");
}

fn compile_lifecycle_outputs(
    temporary: &Path,
    reopened: &EditorSession,
    store: &ProjectStore,
) -> Vec<u8> {
    let lifecycle_first = temporary.join("lifecycle-first");
    let lifecycle_second = temporary.join("lifecycle-second");
    let first_result =
        compile_project_classic_slice(reopened, store, json!({"directory": lifecycle_first}))
            .expect("compile lifecycle result");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": lifecycle_second}))
            .expect("repeat lifecycle compilation");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    for name in ["Data MD", "Data MD1", "Data MD-1", "Data DES"] {
        assert_eq!(
            fs::read(temporary.join("lifecycle-first").join(name)).unwrap(),
            fs::read(temporary.join("lifecycle-second").join(name)).unwrap()
        );
    }
    fs::read(temporary.join("lifecycle-first").join("Data MD")).unwrap()
}

fn assert_lifecycle_bytes(temporary: &Path, lifecycle_md: &[u8], fixtures: &[(&str, Vec<u8>)]) {
    assert_eq!(&lifecycle_md[lifecycle_md.len() - 2..], &[0xde, 0xad]);
    assert_eq!(
        &lifecycle_md[MONSTER_RECORD_BYTES..MONSTER_RECORD_BYTES * 2],
        &fixtures[0].1[MONSTER_RECORD_BYTES..MONSTER_RECORD_BYTES * 2]
    );
    assert_eq!(lifecycle_md[MONSTER_RECORD_BYTES * 2], 0);
    assert_eq!(
        &lifecycle_md[MONSTER_RECORD_BYTES * 2 + 170..MONSTER_RECORD_BYTES * 3],
        &[0; 40]
    );
    assert_eq!(lifecycle_md[MONSTER_RECORD_BYTES * 3], 9);
    assert_eq!(
        &lifecycle_md[MONSTER_RECORD_BYTES * 3 + 170..MONSTER_RECORD_BYTES * 3 + 185],
        b"Drowned Captain"
    );
    let reimported = decode_monster_set(lifecycle_md, "Data MD", 0);
    assert_eq!(reimported.monsters[2].hit_dice, 0);
    assert_eq!(reimported.monsters[3].display_name, "Drowned Captain");
    let lifecycle_variant = fs::read(temporary.join("lifecycle-first").join("Data MD1")).unwrap();
    let lifecycle_mega = fs::read(temporary.join("lifecycle-first").join("Data MD-1")).unwrap();
    assert_eq!(lifecycle_variant[0], 15);
    assert_eq!(lifecycle_mega[0], 24);
    let description_bytes = fs::read(temporary.join("lifecycle-first").join("Data DES")).unwrap();
    assert_eq!(description_bytes.last(), Some(&0xfa));
    let descriptions = decode_monster_descriptions(&description_bytes);
    assert_eq!(descriptions.records[3].text, "Lore");
}

#[test]
fn monster_lifecycle_adapter_methods_checkpoint_bounded_segmented_truth() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let snapshot = lifecycle_snapshot();
    let store = ProjectStore::create(temporary.path(), &snapshot).expect("create store");
    let mut session = EditorSession::new(snapshot);
    {
        let mut apply = |method: &str, params: Value| {
            let result = dispatch_result(&mut session, method, params)
                .unwrap_or_else(|error| panic!("{method} failed: {error}"));
            assert!(result.get("snapshot").is_none());
            store
                .checkpoint_session(&session, &json!({"method": method}))
                .unwrap_or_else(|error| panic!("{method} checkpoint failed: {error}"));
            result
        };

        populate_and_switch_monsters(&mut apply);
        author_description_and_repair_battle(&mut apply);
    }

    let (_, mut reopened) = ProjectStore::open_session(temporary.path()).expect("reopen session");
    assert_eq!(reopened.revision(), Revision(7));
    assert_eq!(reopened.snapshot().battles[0].grid[0], -2);
    assert_eq!(
        reopened
            .snapshot()
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == NativeRecordId(3))
            .unwrap()
            .text,
        "Newly authored creature"
    );
    assert_eq!(
        reopened
            .snapshot()
            .monster_sets
            .iter()
            .map(|set| set.set_id)
            .collect::<Vec<_>>(),
        vec![-1, 0, 1]
    );
    let opened = dispatch_result(
        &mut reopened,
        "monster.open",
        json!({"setId": 0, "nativeId": 2}),
    )
    .expect("open persisted monster");
    assert!(opened.get("snapshot").is_none());
    assert!(opened["slotPreview"]["spells"].is_array());
    assert!(opened["slotPreview"]["items"].is_array());
}

fn lifecycle_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-lifecycle".into()));
    let mut normal = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 3], "Data MD", 0);
    normal.monsters[1].hit_dice = 8;
    normal.monsters[1].display_name = "Ash Tyrant".into();
    normal.monsters[2].hit_dice = 5;
    normal.monsters[2].display_name = "Bog Watcher".into();
    snapshot.monster_sets.push(normal);
    snapshot.monster_descriptions.push(MonsterDescription {
        identity: StableId("monster-description:1".into()),
        native_id: NativeRecordId(1),
        text: "First lore".into(),
        authored: true,
    });
    snapshot.monster_descriptions.push(MonsterDescription {
        identity: StableId("monster-description:2".into()),
        native_id: NativeRecordId(2),
        text: "Second lore".into(),
        authored: true,
    });
    let mut grid = vec![0; providence_core::codecs::BATTLE_GRID_SLOTS];
    grid[0] = -1;
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:0".into()),
        native_id: NativeRecordId(0),
        grid,
        distance: 0,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    snapshot
}

fn populate_and_switch_monsters(apply: &mut impl FnMut(&str, Value) -> Value) {
    apply(
        "monster.create",
        json!({"expectedRevision": 0, "setId": 0, "nativeId": 3}),
    );
    apply(
        "monster.duplicate",
        json!({
            "expectedRevision": 1,
            "setId": 0,
            "sourceNativeId": 1,
            "targetNativeId": 4
        }),
    );
    apply(
        "monster.switch-records",
        json!({
            "expectedRevision": 2,
            "setId": 0,
            "firstNativeId": 1,
            "secondNativeId": 2
        }),
    );
    apply(
        "monster.generate-variants",
        json!({"expectedRevision": 3, "nativeId": 2}),
    );
}

fn author_description_and_repair_battle(apply: &mut impl FnMut(&str, Value) -> Value) {
    apply(
        "monster.update-description",
        json!({
            "expectedRevision": 4,
            "description": {
                "identity": "monster-description:3",
                "nativeId": 3,
                "text": "Newly authored creature",
                "authored": true
            }
        }),
    );
    apply(
        "monster.clear",
        json!({"expectedRevision": 5, "setId": 0, "nativeId": 1}),
    );
    let repaired = apply(
        "battle-monster-reference.repair",
        json!({
            "expectedRevision": 6,
            "rewrite": {"mode": "replace", "fromId": 1, "toId": 2}
        }),
    );
    assert_eq!(repaired["changedEntities"], json!(["battle:0"]));
}
