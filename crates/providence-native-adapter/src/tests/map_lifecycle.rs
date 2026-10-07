use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use crate::map_overlays::action_point_overlay_kind;
use providence_core::codecs::LAND_LAYOUT_COLUMNS;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::ClassicAction;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::ScenarioMessage;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeSet;

#[test]
fn map_open_is_a_document_projection_and_classic_slice_has_six_files() {
    let temp = tempfile::tempdir().expect("temporary directory");
    let output = temp.path().join("classic-slice");
    let mut session = EditorSession::new(demo_snapshot());
    let catalog = dispatch_result(
        &mut session,
        "map.catalog",
        json!({"levelType": "land", "query": "thorn", "limit": 1}),
    )
    .expect("list bounded map catalog");
    assert_eq!(catalog["total"], 1);
    assert_eq!(catalog["items"].as_array().unwrap().len(), 1);
    assert_eq!(catalog["items"][0]["identity"], "land:0");
    assert_eq!(catalog["items"][0]["actionPoints"], 1);
    assert!(catalog.get("project").is_none());
    assert!(catalog.get("snapshot").is_none());
    let opened =
        dispatch_result(&mut session, "map.open", json!({"identity": "land:0"})).expect("open map");
    assert_eq!(opened["map"]["tiles"].as_array().unwrap().len(), 8100);
    assert_eq!(opened["actionPoints"].as_array().unwrap().len(), 1);
    assert_eq!(opened["actionPoints"][0]["overlayKind"], "encounter");
    assert!(opened.get("messages").is_none());

    dispatch_result(
        &mut session,
        "action-reference.retarget",
        json!({
            "expectedRevision": 0,
            "source": "action-point:land:0:17",
            "slot": 0,
            "targetNativeId": 47
        }),
    )
    .expect("repair before certification compile");

    let compiled = dispatch_result(
        &mut session,
        "project.compile-classic-slice",
        json!({"directory": output}),
    )
    .expect("compile Classic slice");
    assert_eq!(compiled["files"].as_array().unwrap().len(), 6);
    for name in [
        "Data DD",
        "Data ED",
        "Data ED3",
        "Data EDCD",
        "Data LD",
        "Data SD2",
    ] {
        assert!(output.join(name).is_file(), "missing {name}");
    }
}

#[test]
fn action_point_overlay_kind_matches_the_donor_category_priority() {
    let action = |slot, raw_opcode| ClassicAction {
        slot,
        raw_opcode,
        target_native_id: 0,
    };

    assert_eq!(action_point_overlay_kind(&[]), "trigger");
    assert_eq!(action_point_overlay_kind(&[action(0, 9)]), "trigger");
    assert_eq!(action_point_overlay_kind(&[action(0, 47)]), "quest");
    assert_eq!(action_point_overlay_kind(&[action(0, 1)]), "text");
    assert_eq!(action_point_overlay_kind(&[action(0, 20)]), "map");
    assert_eq!(action_point_overlay_kind(&[action(0, -23)]), "encounter");
    assert_eq!(action_point_overlay_kind(&[action(0, -48)]), "battle");
    assert_eq!(
        action_point_overlay_kind(&[
            action(0, 47),
            action(1, 1),
            action(2, 20),
            action(3, 4),
            action(4, 2),
        ]),
        "battle"
    );
}

#[test]
fn map_lifecycle_commands_checkpoint_reopen_and_compile_both_native_families() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let project_root = temporary.path().join("project");
    let output = temporary.path().join("classic-output");
    let mut snapshot = ProjectSnapshot::new_authored(StableId("map-lifecycle-adapter".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:47".into()),
        native_id: NativeRecordId(47),
        text: "The new road reaches the old story.".into(),
        authored: true,
    });
    let store = ProjectStore::create(&project_root, &snapshot).expect("create project store");
    let mut session = EditorSession::new(snapshot);
    create_land_cell(&mut session, &store);
    attach_message_action_point(&mut session, &store);
    paint_duplicate_and_create_dungeon(&mut session, &store);

    assert_compiled_map_families(&mut session, &store, &output);

    let (_, reopened) = ProjectStore::open_session(&project_root).expect("reopen project");
    assert_eq!(reopened.revision(), Revision(8));
    assert_eq!(reopened.snapshot().world.maps.len(), 3);
    assert_eq!(reopened.snapshot().world.action_points.len(), 1);
    assert_eq!(
        reopened.snapshot().world.action_points[0].actions,
        vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 47,
        }]
    );
    let duplicate = reopened
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == "land:1")
        .expect("durable duplicate");
    assert_eq!(duplicate.tiles[5 * CLASSIC_MAP_SIZE + 4], 156);
    let source = reopened
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == "land:0")
        .expect("durable source map");
    assert_eq!(source.tiles[5 * CLASSIC_MAP_SIZE + 4], 1156);
    assert!(
        duplicate
            .runtime
            .as_ref()
            .expect("duplicate runtime")
            .random_rectangles
            .is_empty()
    );
}

#[test]
fn adapter_opens_moves_and_undoes_one_bounded_land_layout_cell() {
    let mut session = EditorSession::new(demo_snapshot());
    let empty =
        dispatch_result(&mut session, "land-layout.open", json!({})).expect("open absent Layout");
    assert!(empty["layout"].is_null());
    assert_eq!(empty["landMaps"][0]["identity"], "land:0");

    let placed = dispatch_result(
        &mut session,
        "land-layout.set-cell",
        json!({
            "expectedRevision": 0,
            "row": 0,
            "column": 0,
            "target": "land:0"
        }),
    )
    .expect("place land map");
    assert_eq!(placed["revision"], 1);
    assert_eq!(placed["changedEntities"], json!(["land-layout", "land:0"]));

    dispatch_result(
        &mut session,
        "land-layout.set-cell",
        json!({
            "expectedRevision": 1,
            "row": 1,
            "column": 1,
            "target": "land:0"
        }),
    )
    .expect("move land map");
    let moved =
        dispatch_result(&mut session, "land-layout.open", json!({})).expect("open moved Layout");
    assert_eq!(moved["layout"]["cells"][0], 0);
    assert_eq!(moved["layout"]["cells"][LAND_LAYOUT_COLUMNS + 1], -1);

    dispatch_result(&mut session, "history.undo", json!({"expectedRevision": 2}))
        .expect("undo Layout move");
    let restored =
        dispatch_result(&mut session, "land-layout.open", json!({})).expect("open restored Layout");
    assert_eq!(restored["layout"]["cells"][0], -1);
    assert_eq!(restored["layout"]["cells"][LAND_LAYOUT_COLUMNS + 1], 0);
}

fn checkpoint_map_command(
    session: &mut EditorSession,
    store: &ProjectStore,
    method: &str,
    params: Value,
) -> Value {
    let result = dispatch_result_with_store(session, Some(store), method, params)
        .unwrap_or_else(|error| panic!("{method} failed: {error}"));
    assert!(result.get("snapshot").is_none());
    store
        .checkpoint_session(session, &json!({"method": method}))
        .unwrap_or_else(|error| panic!("{method} checkpoint failed: {error}"));
    result
}

fn create_land_cell(session: &mut EditorSession, store: &ProjectStore) {
    checkpoint_map_command(
        session,
        store,
        "map.create",
        json!({"expectedRevision": 0, "levelType": "land"}),
    );
    checkpoint_map_command(
        session,
        store,
        "map.update-cell",
        json!({
            "expectedRevision": 1,
            "identity": "land:0",
            "x": 4,
            "y": 5,
            "tile": 112
        }),
    );
}

fn attach_message_action_point(session: &mut EditorSession, store: &ProjectStore) {
    checkpoint_map_command(
        session,
        store,
        "action-point.create",
        json!({
            "expectedRevision": 2,
            "mapIdentity": "land:0",
            "x": 4,
            "y": 5
        }),
    );
    checkpoint_map_command(
        session,
        store,
        "action.set-opcode",
        json!({
            "expectedRevision": 3,
            "source": "action-point:land:0:0",
            "slot": 0,
            "rawOpcode": 1
        }),
    );
    checkpoint_map_command(
        session,
        store,
        "action-reference.retarget",
        json!({
            "expectedRevision": 4,
            "source": "action-point:land:0:0",
            "slot": 0,
            "targetNativeId": 47
        }),
    );
}

fn paint_duplicate_and_create_dungeon(session: &mut EditorSession, store: &ProjectStore) {
    let painted = checkpoint_map_command(
        session,
        store,
        "map.paint-cells",
        json!({
            "expectedRevision": 5,
            "identity": "land:0",
            "cells": [{"x": 4, "y": 5, "tile": 156}]
        }),
    );
    assert_eq!(
        painted["paintedCells"],
        json!([{"x": 4, "y": 5, "tile": 1156}])
    );
    checkpoint_map_command(
        session,
        store,
        "map.duplicate",
        json!({"expectedRevision": 6, "source": "land:0"}),
    );
    checkpoint_map_command(
        session,
        store,
        "map.create",
        json!({"expectedRevision": 7, "levelType": "dungeon"}),
    );
}

fn assert_compiled_map_families(
    session: &mut EditorSession,
    store: &ProjectStore,
    output: &std::path::Path,
) {
    let compiled = dispatch_result_with_store(
        session,
        Some(store),
        "project.compile-classic-slice",
        json!({"directory": output}),
    )
    .expect("compile authored map families");
    let names = compiled["files"]
        .as_array()
        .expect("compiled files")
        .iter()
        .filter_map(|entry| entry["name"].as_str())
        .collect::<BTreeSet<_>>();
    for name in [
        "Data LD", "Data DD", "Data RD", "Data DL", "Data DDD", "Data RDD",
    ] {
        assert!(names.contains(name), "compiled manifest is missing {name}");
        assert!(
            output.join(name).is_file(),
            "compiled output is missing {name}"
        );
    }
}
