use super::*;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use crate::transport::serve_io;
use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::codecs::MAP_LEVEL_BYTES;
use providence_core::codecs::RANDOM_LEVEL_RECORD_BYTES;
use providence_core::codecs::decode_dungeon_action_points;
use providence_core::codecs::decode_dungeon_maps;
use providence_core::codecs::decode_dungeon_random_levels;
use providence_core::model::CLASSIC_MAP_SIZE;
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
use std::path::Path;

#[test]
fn classic_dungeon_import_reopens_lists_and_recompiles_every_source_byte() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source");
    fs::create_dir(&source).expect("create source directory");
    let fixtures = controlled_dungeon_sources();
    for (name, bytes) in &fixtures {
        fs::write(source.join(name), bytes).expect("write controlled dungeon source");
    }
    let (store, mut reopened) = import_dungeon_source(
        &source,
        &temporary.path().join("project"),
        dungeon_reference_targets(),
    );
    assert_imported_dungeon_shape(&reopened);
    assert_dungeon_action_point_projection(&mut reopened);
    assert_random_rectangle_projection(&mut reopened);
    edit_and_repair_dungeon_action(&mut reopened);
    repair_random_door(&mut reopened);
    repair_signed_region_fields(&mut reopened);
    allocate_random_region(&mut reopened);
    remove_random_region_with_history(&mut reopened);
    assert_dungeon_cell_projection(&mut reopened);
    reject_note_marker_edit(&mut reopened);
    edit_dungeon_primitive(&mut reopened);
    checkpoint_dungeon_primitive_history(&mut reopened, &store);
    let (store, mut reopened) =
        ProjectStore::open_session(store.root()).expect("reopen edited dungeon project");
    assert_reopened_dungeon_edits(&reopened);
    assert_rebuilt_world_and_validation(&mut reopened);
    compile_dungeon_twice(&mut reopened, &store, temporary.path());
    assert_compiled_bytes(temporary.path(), fixtures);
    assert_decoded_dungeon_edits(temporary.path());
}

fn controlled_dungeon_sources() -> [(&'static str, Vec<u8>); 3] {
    let mut data_dl = vec![0u8; MAP_LEVEL_BYTES];
    data_dl[..2].copy_from_slice(&0x1234_i16.to_be_bytes());
    let mut data_ddd = vec![0u8; ACTION_POINT_LEVEL_BYTES];
    let action_offset = 7 * 40;
    data_ddd[action_offset..action_offset + 4].copy_from_slice(&712_i32.to_be_bytes());
    data_ddd[action_offset + 7] = 100;
    data_ddd[action_offset + 8..action_offset + 10].copy_from_slice(&1_i16.to_be_bytes());
    data_ddd[action_offset + 24..action_offset + 26].copy_from_slice(&99_i16.to_be_bytes());
    let mut data_rdd = vec![0u8; RANDOM_LEVEL_RECORD_BYTES];
    let rectangle_offset = 2 * 8;
    data_rdd[rectangle_offset..rectangle_offset + 2].copy_from_slice(&3_i16.to_be_bytes());
    data_rdd[rectangle_offset + 2..rectangle_offset + 4].copy_from_slice(&4_i16.to_be_bytes());
    data_rdd[rectangle_offset + 4..rectangle_offset + 6].copy_from_slice(&8_i16.to_be_bytes());
    data_rdd[rectangle_offset + 6..rectangle_offset + 8].copy_from_slice(&9_i16.to_be_bytes());
    data_rdd[160 + 2 * 2..160 + 2 * 2 + 2].copy_from_slice(&750_i16.to_be_bytes());
    data_rdd[280 + 2 * 6..280 + 2 * 6 + 2].copy_from_slice(&99_i16.to_be_bytes());
    data_rdd[400 + 2 * 6..400 + 2 * 6 + 2].copy_from_slice(&25_i16.to_be_bytes());
    data_rdd[520] = 0xff;
    data_rdd[521] = 0xa5;
    data_rdd[522] = 0x80;
    data_rdd[523 + 2] = 0xfe;
    data_rdd[543 + 2] = 0xfe;
    data_rdd[563] = 0x5a;
    data_rdd[564 + 2 * 2..564 + 2 * 2 + 2].copy_from_slice(&(-82_i16).to_be_bytes());
    data_rdd[604 + 2 * 2..604 + 2 * 2 + 2].copy_from_slice(&(-99_i16).to_be_bytes());
    [
        ("Data DL", data_dl),
        ("Data DDD", data_ddd),
        ("Data RDD", data_rdd),
    ]
}

fn dungeon_reference_targets() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-import".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:1".into()),
        native_id: NativeRecordId(1),
        text: "The vault answers.".into(),
        authored: true,
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot
}

fn import_dungeon_source(
    source: &Path,
    project: &Path,
    snapshot: ProjectSnapshot,
) -> (ProjectStore, EditorSession) {
    let store = ProjectStore::create(project, &snapshot).expect("create project store");
    let request = json!({
        "id": 1,
        "method": "project.import-classic-dungeon-slice",
        "params": {
            "expectedRevision": 0,
            "directory": source
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
    assert_eq!(response["result"]["revision"], 1);
    assert_eq!(response["result"]["changedEntitiesTotal"], 102);
    assert_eq!(response["result"]["counts"]["maps"], 1);
    assert_eq!(response["result"]["counts"]["actionPoints"], 100);
    assert_eq!(response["result"]["counts"]["randomLevelRecords"], 1);

    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen imported project");
    (store, reopened)
}

fn assert_imported_dungeon_shape(reopened: &EditorSession) {
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.snapshot().classic_sources.len(), 3);
    assert_eq!(
        reopened.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .landlook,
        Some(-1)
    );
    assert!(
        reopened.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .source_blob
            .is_some()
    );
}

fn assert_dungeon_action_point_projection(reopened: &mut EditorSession) {
    let maps = dispatch_result(reopened, "map.list", json!({})).expect("list maps");
    assert_eq!(maps[0]["identity"], "dungeon:0");
    assert_eq!(maps[0]["levelType"], "dungeon");
    let action_points = dispatch_result(
        reopened,
        "action-point.list",
        json!({"mapIdentity": "dungeon:0", "limit": 8}),
    )
    .expect("list dungeon Action Points");
    assert_eq!(action_points["total"], 100);
    assert_eq!(action_points["items"].as_array().unwrap().len(), 8);
    assert_eq!(action_points["items"][7]["active"], true);

    let opened_action = dispatch_result(
        reopened,
        "action-point.open",
        json!({"identity": "action-point:dungeon:0:7"}),
    )
    .expect("open dungeon Action Point");
    let action_reference = opened_action["references"]
        .as_array()
        .unwrap()
        .iter()
        .find(|reference| reference["field"] == "actions[0].target")
        .expect("typed dungeon Action Point target");
    assert_eq!(action_reference["targetKind"], "message");
    assert_eq!(action_reference["resolution"], "missing");
    assert_eq!(action_reference["byteProvenance"]["nativePath"], "Data DDD");
    assert_eq!(action_reference["byteProvenance"]["byteStart"], 304);
}

fn assert_random_rectangle_projection(reopened: &mut EditorSession) {
    let random_rectangles = dispatch_result(
        reopened,
        "random-rectangle.list",
        json!({"mapIdentity": "dungeon:0"}),
    )
    .expect("list bounded dungeon random rectangles");
    assert_eq!(random_rectangles["total"], 1);
    assert_eq!(random_rectangles["limit"], 20);
    let opened_rectangle = dispatch_result(
        reopened,
        "random-rectangle.open",
        json!({"identity": "dungeon:0:rect:2"}),
    )
    .expect("open bounded random rectangle");
    assert_eq!(opened_rectangle["randomRectangle"]["top"], 3);
    let door_reference = opened_rectangle["references"]
        .as_array()
        .unwrap()
        .iter()
        .find(|reference| reference["field"] == "randomDoors[0]")
        .expect("typed random-door target");
    assert_eq!(door_reference["targetKind"], "extra-action-point");
    assert_eq!(door_reference["resolution"], "missing");
    assert_eq!(door_reference["byteProvenance"]["nativePath"], "Data RDD");
    assert_eq!(door_reference["byteProvenance"]["byteStart"], 292);
    let sound_reference = opened_rectangle["references"]
        .as_array()
        .unwrap()
        .iter()
        .find(|reference| reference["field"] == "sound")
        .expect("typed random-region sound target");
    assert_eq!(sound_reference["targetKind"], "sound");
    assert_eq!(sound_reference["resolution"], "stock-fallback");
    assert_eq!(sound_reference["byteProvenance"]["byteStart"], 568);
    let text_reference = opened_rectangle["references"]
        .as_array()
        .unwrap()
        .iter()
        .find(|reference| reference["field"] == "text")
        .expect("typed random-region message target");
    assert_eq!(text_reference["targetKind"], "message");
    assert_eq!(text_reference["resolution"], "missing");
    assert_eq!(text_reference["byteProvenance"]["byteStart"], 608);
}

fn edit_and_repair_dungeon_action(reopened: &mut EditorSession) {
    let mut edited_action = reopened.snapshot().world.action_points[7].clone();
    edited_action.chance_percent = 75;
    let action_update = dispatch_result(
        reopened,
        "action-point.update",
        json!({"expectedRevision": 1, "actionPoint": edited_action}),
    )
    .expect("edit one fixed Data DDD row");
    assert_eq!(
        action_update["changedEntities"],
        json!(["action-point:dungeon:0:7", "dungeon:0"])
    );
    assert!(action_update.get("snapshot").is_none());
    let action_repair = dispatch_result(
        reopened,
        "action-reference.retarget",
        json!({
            "expectedRevision": 2,
            "source": "action-point:dungeon:0:7",
            "slot": 0,
            "targetNativeId": 1
        }),
    )
    .expect("repair dungeon Action Point message target");
    assert!(
        action_repair["referenceChanges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| reference["field"] == "actions[0].target"
                && reference["resolution"] == "resolved")
    );
}

fn repair_random_door(reopened: &mut EditorSession) {
    let rectangle_repair = dispatch_result(
        reopened,
        "random-rectangle.reference.retarget",
        json!({
            "expectedRevision": 3,
            "source": "dungeon:0:rect:2",
            "doorSlot": 0,
            "targetNativeId": 1
        }),
    )
    .expect("repair random-door Extra Action Point target");
    assert!(
        rectangle_repair["referenceChanges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| reference["field"] == "randomDoors[0]"
                && reference["resolution"] == "resolved")
    );
}

fn repair_signed_region_fields(reopened: &mut EditorSession) {
    let text_repair = dispatch_result(
        reopened,
        "random-rectangle.field.retarget",
        json!({
            "expectedRevision": 4,
            "source": "dungeon:0:rect:2",
            "field": "text",
            "targetNativeId": 1
        }),
    )
    .expect("repair random-region message target");
    assert!(
        text_repair["referenceChanges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| reference["field"] == "text" && reference["resolution"] == "resolved")
    );
    dispatch_result(
        reopened,
        "random-rectangle.field.retarget",
        json!({
            "expectedRevision": 5,
            "source": "dungeon:0:rect:2",
            "field": "sound",
            "targetNativeId": 83
        }),
    )
    .expect("retarget random-region sound while preserving Classic timing sign");
}

fn allocate_random_region(reopened: &mut EditorSession) {
    let allocated = json!({
        "identity": "dungeon:0:rect:3",
        "top": 10,
        "left": 11,
        "bottom": 12,
        "right": 13,
        "chanceTenThousand": 500,
        "battleRange": [0, 0],
        "randomDoors": [0, 0, 0],
        "randomDoorPercent": [0, 0, 0],
        "only": false,
        "option": 0,
        "soundId": 0,
        "textId": 0
    });
    dispatch_result(
        reopened,
        "random-rectangle.upsert",
        json!({
            "expectedRevision": 6,
            "mapIdentity": "dungeon:0",
            "randomRectangle": allocated
        }),
    )
    .expect("allocate a stable random-region slot");
}

fn remove_random_region_with_history(reopened: &mut EditorSession) {
    dispatch_result(
        reopened,
        "random-rectangle.remove",
        json!({"expectedRevision": 7, "mapIdentity": "dungeon:0", "slot": 3}),
    )
    .expect("remove the allocated random-region slot");
    dispatch_result(reopened, "history.undo", json!({"expectedRevision": 8}))
        .expect("undo random-region removal");
    assert_eq!(
        dispatch_result(
            reopened,
            "random-rectangle.list",
            json!({"mapIdentity": "dungeon:0"}),
        )
        .unwrap()["total"],
        2
    );
    dispatch_result(reopened, "history.redo", json!({"expectedRevision": 9}))
        .expect("redo random-region removal");
}

fn assert_dungeon_cell_projection(reopened: &mut EditorSession) {
    let opened_cell = dispatch_result(
        reopened,
        "dungeon-cell.open",
        json!({"identity": "dungeon:0", "x": 0, "y": 0}),
    )
    .expect("open bounded dungeon cell");
    assert_eq!(opened_cell["profile"]["rawMask"], 0x1234);
    assert_eq!(opened_cell["byteProvenance"]["nativePath"], "Data DL");
    assert_eq!(opened_cell["byteProvenance"]["byteStart"], 0);
    assert_eq!(opened_cell["byteProvenance"]["byteEnd"], 2);
    assert_eq!(
        opened_cell["primitivePolicies"].as_array().unwrap().len(),
        15
    );
}

fn reject_note_marker_edit(reopened: &mut EditorSession) {
    let rejected = dispatch_result(
        reopened,
        "dungeon-cell.update-primitive",
        json!({
            "expectedRevision": 10,
            "identity": "dungeon:0",
            "x": 0,
            "y": 0,
            "primitive": "note-marker",
            "enabled": false
        }),
    )
    .expect_err("note marker must remain note-workflow owned");
    assert!(rejected.contains("not directly writable"));
    assert_eq!(reopened.revision(), Revision(10));
}

fn edit_dungeon_primitive(reopened: &mut EditorSession) {
    let updated = dispatch_result(
        reopened,
        "dungeon-cell.update-primitive",
        json!({
            "expectedRevision": 10,
            "identity": "dungeon:0",
            "x": 0,
            "y": 0,
            "primitive": "no-wall-in-battle",
            "enabled": true
        }),
    )
    .expect("edit writer-safe dungeon primitive");
    assert_eq!(updated["changedEntities"], json!(["dungeon:0"]));
    assert!(updated.get("snapshot").is_none());
    let changed = dispatch_result(
        reopened,
        "dungeon-cell.open",
        json!({"identity": "dungeon:0", "x": 0, "y": 0}),
    )
    .expect("reopen edited dungeon cell");
    assert_eq!(changed["profile"]["rawMask"], 0x5234);
}

fn checkpoint_dungeon_primitive_history(reopened: &mut EditorSession, store: &ProjectStore) {
    dispatch_result(reopened, "history.undo", json!({"expectedRevision": 11}))
        .expect("undo dungeon primitive");
    assert_eq!(
        dispatch_result(
            reopened,
            "dungeon-cell.open",
            json!({"identity": "dungeon:0", "x": 0, "y": 0}),
        )
        .unwrap()["profile"]["rawMask"],
        0x1234
    );
    dispatch_result(reopened, "history.redo", json!({"expectedRevision": 12}))
        .expect("redo dungeon primitive");
    store
        .checkpoint_session(
            reopened,
            &json!({"method": "dungeon-cell.update-primitive"}),
        )
        .expect("checkpoint dungeon primitive edit");
}

fn assert_reopened_dungeon_edits(reopened: &EditorSession) {
    assert_eq!(reopened.revision(), Revision(13));
    assert_eq!(reopened.snapshot().world.maps[0].tiles[0] as u16, 0x5234);
    assert_eq!(
        reopened.snapshot().world.action_points[7].chance_percent,
        75
    );
    assert_eq!(
        reopened.snapshot().world.action_points[7].actions[0].target_native_id,
        1
    );
    assert_eq!(
        reopened.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0]
            .random_doors[0],
        1
    );
    assert_eq!(
        reopened.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0]
            .text_id,
        -1
    );
    assert_eq!(
        reopened.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0]
            .sound_id,
        -83
    );
}

fn assert_rebuilt_world_and_validation(reopened: &mut EditorSession) {
    let first_world = dispatch_result(reopened, "project.inspect-rebuilt-world", json!({}))
        .expect("compile bounded Rebuilt world after repairs");
    let second_world = dispatch_result(reopened, "project.inspect-rebuilt-world", json!({}))
        .expect("repeat bounded Rebuilt world compile");
    assert_eq!(first_world["sha256"], second_world["sha256"]);
    assert_eq!(first_world["counts"]["maps"], 1);
    assert_eq!(first_world["counts"]["triggers"], 1);
    let diagnostics = dispatch_result(reopened, "validation.run", json!({}))
        .expect("validate repaired dungeon project");
    assert_eq!(diagnostics, json!([]), "{diagnostics:#}");
}

fn compile_dungeon_twice(reopened: &mut EditorSession, store: &ProjectStore, output: &Path) {
    let first_directory = output.join("compiled-first");
    let second_directory = output.join("compiled-second");
    let first = dispatch_result_with_store(
        reopened,
        Some(store),
        "project.compile-classic-slice",
        json!({"directory": first_directory}),
    )
    .expect("compile reopened dungeon project from durable sources");
    let second = dispatch_result_with_store(
        reopened,
        Some(store),
        "project.compile-classic-slice",
        json!({"directory": second_directory}),
    )
    .expect("repeat dungeon compile");
    assert_eq!(first["manifestSha256"], second["manifestSha256"]);
    assert_eq!(first["files"].as_array().unwrap().len(), 5);
}

fn assert_compiled_bytes(output: &Path, fixtures: [(&str, Vec<u8>); 3]) {
    let mut expected_data_dl = fixtures[0].1.clone();
    expected_data_dl[..2].copy_from_slice(&0x5234_i16.to_be_bytes());
    let action_map_offset = (7 * CLASSIC_MAP_SIZE + 12) * 2;
    expected_data_dl[action_map_offset..action_map_offset + 2]
        .copy_from_slice(&0x1000_i16.to_be_bytes());
    let mut expected_data_ddd = fixtures[1].1.clone();
    expected_data_ddd[(7 * 40) + 7] = 75;
    expected_data_ddd[(7 * 40) + 24..(7 * 40) + 26].copy_from_slice(&1_i16.to_be_bytes());
    let mut expected_data_rdd = fixtures[2].1.clone();
    expected_data_rdd[280 + 2 * 6..280 + 2 * 6 + 2].copy_from_slice(&1_i16.to_be_bytes());
    expected_data_rdd[564 + 2 * 2..564 + 2 * 2 + 2].copy_from_slice(&(-83_i16).to_be_bytes());
    expected_data_rdd[604 + 2 * 2..604 + 2 * 2 + 2].copy_from_slice(&(-1_i16).to_be_bytes());
    for (name, expected) in fixtures {
        let expected = match name {
            "Data DL" => &expected_data_dl,
            "Data DDD" => &expected_data_ddd,
            "Data RDD" => &expected_data_rdd,
            _ => &expected,
        };
        assert_eq!(
            fs::read(output.join("compiled-first").join(name)).unwrap(),
            *expected,
            "dungeon compile changed bytes outside the declared cell word in {name}"
        );
        assert_eq!(
            fs::read(output.join("compiled-second").join(name)).unwrap(),
            *expected,
            "repeated dungeon compile diverged for {name}"
        );
    }
}

fn assert_decoded_dungeon_edits(output: &Path) {
    assert_eq!(
        decode_dungeon_maps(&fs::read(output.join("compiled-first").join("Data DL")).unwrap())
            .records[0]
            .tiles[0] as u16,
        0x5234
    );
    let compiled_action_points = decode_dungeon_action_points(
        &fs::read(output.join("compiled-first").join("Data DDD")).unwrap(),
    );
    assert_eq!(compiled_action_points.records[7].chance_percent, 75);
    assert_eq!(
        compiled_action_points.records[7].actions[0].target_native_id,
        1
    );
    let compiled_runtime = decode_dungeon_random_levels(
        &fs::read(output.join("compiled-first").join("Data RDD")).unwrap(),
    );
    assert_eq!(
        compiled_runtime.records[0].runtime.random_rectangles[0].random_doors[0],
        1
    );
    assert_eq!(
        compiled_runtime.records[0].runtime.random_rectangles[0].sound_id,
        -83
    );
    assert_eq!(
        compiled_runtime.records[0].runtime.random_rectangles[0].text_id,
        -1
    );
}
