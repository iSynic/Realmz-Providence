use super::*;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use crate::transport::serve_io;
use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::codecs::MAP_LEVEL_BYTES;
use providence_core::codecs::MAPSTATS_CORE_BYTES;
use providence_core::codecs::MAPSTATS_REFERENCE_BYTES;
use providence_core::codecs::RANDOM_LEVEL_RECORD_BYTES;
use providence_core::codecs::SIMPLE_ENCOUNTER_RECORD_BYTES;
use providence_core::model::ProjectSnapshot;
use providence_core::model::SNAPSHOT_FORMAT_VERSION;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

#[test]
fn mapstats_reference_reopens_hydrates_later_land_import_and_never_becomes_compiler_input() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mapstats_path = temporary.path().join("Data Desert BD");
    let mapstats = write_mapstats_reference(&mapstats_path);

    let source = temporary.path().join("source");
    fs::create_dir(&source).expect("create source directory");
    let mut data_rd = vec![0u8; RANDOM_LEVEL_RECORD_BYTES];
    data_rd[520] = 5;
    let fixtures = [
        ("Data LD", vec![0u8; MAP_LEVEL_BYTES]),
        ("Data DD", vec![0u8; ACTION_POINT_LEVEL_BYTES]),
        ("Data RD", data_rd),
        ("Data SD2", vec![0u8; 256]),
        ("Data ED", vec![0u8; SIMPLE_ENCOUNTER_RECORD_BYTES]),
    ];
    for (name, bytes) in &fixtures {
        fs::write(source.join(name), bytes).expect("write controlled Classic source");
    }

    let snapshot = ProjectSnapshot::new_authored(StableId("mapstats-import".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    import_reference_then_land(&mut session, &store, &mapstats_path, &source);

    let (store, mut reopened) =
        ProjectStore::open_session(store.root()).expect("reopen imported project");
    assert_eq!(reopened.snapshot().format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(reopened.snapshot().landlook_catalogs.len(), 1);
    assert_eq!(reopened.snapshot().terrain_catalog.len(), 201);
    assert_eq!(reopened.snapshot().classic_sources.len(), fixtures.len());
    assert!(
        reopened
            .snapshot()
            .classic_sources
            .iter()
            .all(|source| source.native_path != "Data Desert BD")
    );
    let catalog = &reopened.snapshot().landlook_catalogs[0];
    assert_eq!(catalog.source, "Data Desert BD");
    assert_eq!(store.read_blob(&catalog.source_blob).unwrap(), mapstats);
    let runtime = reopened.snapshot().world.maps[0].runtime.as_ref().unwrap();
    assert_eq!(runtime.base_tile, Some(156));
    assert_eq!(runtime.base_scale, Some(4));
    assert_mapstats_is_reference_only(&mut reopened, &store, temporary.path(), fixtures.len());
}

#[test]
fn classic_land_slice_import_reopens_and_recompiles_every_source_byte() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source");
    fs::create_dir(&source).expect("create source directory");
    let fixtures = write_owned_land_slice(&source);
    let snapshot = ProjectSnapshot::new_authored(StableId("classic-import".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    import_stored_land_slice(&mut session, &store, &source);

    let (store, mut reopened) =
        ProjectStore::open_session(store.root()).expect("reopen imported project");
    assert_eq!(reopened.revision(), Revision(1));
    assert!(reopened.can_undo());
    assert!(matches!(
        reopened.snapshot().origin,
        providence_core::model::ProjectOrigin::Imported { .. }
    ));
    assert_eq!(reopened.snapshot().classic_sources.len(), 6);
    let runtime = reopened.snapshot().world.maps[0]
        .runtime
        .as_ref()
        .expect("Data RD runtime metadata");
    assert_eq!(runtime.landlook, Some(5));
    assert_eq!(runtime.tileset_id.0, "classic.landlook.5");
    assert!(runtime.source_blob.is_some());
    for source_record in &reopened.snapshot().classic_sources {
        let expected = fixtures
            .iter()
            .find(|(name, _)| *name == source_record.native_path)
            .expect("known source");
        assert_eq!(store.read_blob(&source_record.blob).unwrap(), expected.1);
    }
    assert_imported_land_layout(&mut reopened);

    assert_owned_land_compile(&mut reopened, &store, temporary.path(), &fixtures);
}

fn write_mapstats_reference(mapstats_path: &std::path::Path) -> Vec<u8> {
    let mut mapstats = vec![0u8; MAPSTATS_REFERENCE_BYTES];
    mapstats[0..2].copy_from_slice(&82_i16.to_be_bytes());
    mapstats[2..4].copy_from_slice(&3_i16.to_be_bytes());
    let base_offset = MAPSTATS_CORE_BYTES - 4;
    mapstats[base_offset..base_offset + 2].copy_from_slice(&156_i16.to_be_bytes());
    mapstats[base_offset + 2..base_offset + 4].copy_from_slice(&4_i16.to_be_bytes());
    mapstats[MAPSTATS_CORE_BYTES..].fill(0xa5);
    fs::write(mapstats_path, &mapstats).expect("write controlled Map Stats");
    mapstats
}

fn import_reference_then_land(
    session: &mut EditorSession,
    store: &ProjectStore,
    mapstats_path: &std::path::Path,
    source: &std::path::Path,
) {
    let mapstats_request = json!({
        "id": 1,
        "method": "terrain.import-mapstats-reference",
        "params": {
            "expectedRevision": 0,
            "landlook": 5,
            "path": mapstats_path
        }
    });
    let land_request = json!({
        "id": 2,
        "method": "project.import-classic-land-slice",
        "params": {
            "expectedRevision": 1,
            "directory": source
        }
    });
    let input = format!(
        "{}\n{}\n",
        serde_json::to_string(&mapstats_request).unwrap(),
        serde_json::to_string(&land_request).unwrap()
    );
    let mut output = Vec::new();
    serve_io(session, Some(store), Cursor::new(input), &mut output)
        .expect("import reference and land through stored adapter");
    let responses = output
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[0]["ok"], true);
    assert_eq!(responses[0]["result"]["profileCount"], 201);
    assert_eq!(responses[0]["result"]["changedEntitiesTotal"], 202);
    assert_eq!(responses[0]["result"]["truncated"], true);
    assert_eq!(responses[0]["result"]["baseTile"], 156);
    assert_eq!(responses[0]["result"]["baseScale"], 4);
    assert!(responses[0]["result"].get("snapshot").is_none());
    assert_eq!(responses[1]["ok"], true);
    assert_eq!(responses[1]["result"]["revision"], 2);
}

fn write_owned_land_slice(source: &std::path::Path) -> [(&'static str, Vec<u8>); 6] {
    let mut data_rd = vec![0u8; RANDOM_LEVEL_RECORD_BYTES];
    data_rd[520] = 5;
    data_rd[521] = 0xa5;
    data_rd[522] = 0x80;
    data_rd[563] = 0x5a;
    let mut layout = vec![0u8; providence_core::codecs::LAND_LAYOUT_BYTES + 256];
    layout[0..2].copy_from_slice(&(-1_i16).to_be_bytes());
    layout[providence_core::codecs::LAND_LAYOUT_BYTES..].fill(0xa5);
    let mut messages = vec![0u8; 256];
    messages.extend_from_slice(&[0xde, 0xad, 0xbe]);
    let fixtures = [
        ("Data LD", vec![0u8; MAP_LEVEL_BYTES]),
        ("Data DD", vec![0u8; ACTION_POINT_LEVEL_BYTES]),
        ("Data RD", data_rd),
        ("Data SD2", messages),
        ("Data ED", vec![0u8; SIMPLE_ENCOUNTER_RECORD_BYTES]),
        ("Layout", layout),
    ];
    for (name, bytes) in &fixtures {
        fs::write(source.join(name), bytes).expect("write controlled Classic source");
    }
    fixtures
}

fn assert_imported_land_layout(reopened: &mut EditorSession) {
    let opened_layout =
        dispatch_result(reopened, "land-layout.open", json!({})).expect("open bounded land Layout");
    assert_eq!(opened_layout["rows"], 8);
    assert_eq!(opened_layout["columns"], 16);
    assert_eq!(opened_layout["layout"]["cells"][0], -1);
    assert_eq!(opened_layout["references"][0]["targetId"], "land:0");
    assert_eq!(
        opened_layout["references"][0]["byteProvenance"]["nativePath"],
        "Layout"
    );
}

fn assert_owned_land_compile(
    reopened: &mut EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    fixtures: &[(&str, Vec<u8>)],
) {
    let compiled_directory = root.join("compiled");
    let compiled = dispatch_result_with_store(
        reopened,
        Some(store),
        "project.compile-classic-slice",
        json!({"directory": compiled_directory}),
    )
    .expect("compile reopened project from durable sources");
    assert_eq!(
        compiled["files"].as_array().unwrap().len(),
        fixtures.len(),
        "unexpected compiled Classic source files: {:?}",
        compiled["files"]
    );
    for (name, expected) in fixtures {
        assert_eq!(
            fs::read(root.join("compiled").join(name)).unwrap(),
            *expected,
            "no-edit compile changed {name}"
        );
    }
    assert_absent_global_preserved(root);
}

fn assert_mapstats_is_reference_only(
    reopened: &mut EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    source_count: usize,
) {
    let rebuilt = dispatch_result(reopened, "project.inspect-rebuilt-map-inputs", json!({}))
        .expect("project complete Rebuilt map inputs");
    assert_eq!(rebuilt["maps"][0]["baseTile"], 156);
    assert_eq!(rebuilt["maps"][0]["metadata"]["baseScale"], 4);
    assert_eq!(
        rebuilt["terrainSets"][0]["tiles"].as_array().unwrap().len(),
        201
    );

    let compiled_directory = root.join("compiled");
    let compiled = dispatch_result_with_store(
        reopened,
        Some(store),
        "project.compile-classic-slice",
        json!({"directory": compiled_directory}),
    )
    .expect("compile scenario-owned Classic sources only");
    assert_eq!(
        compiled["files"].as_array().unwrap().len(),
        source_count,
        "unexpected compiled Classic source files: {:?}",
        compiled["files"]
    );
    assert_absent_global_preserved(root);
    assert!(!root.join("compiled").join("Data Desert BD").exists());
}

fn assert_absent_global_preserved(root: &std::path::Path) {
    assert!(
        !root.join("compiled").join("Global").exists(),
        "the derived empty hook contract must not invent an absent native file"
    );
}

fn import_stored_land_slice(
    session: &mut EditorSession,
    store: &ProjectStore,
    source: &std::path::Path,
) {
    let request = json!({
        "id": 1,
        "method": "project.import-classic-land-slice",
        "params": {
            "expectedRevision": 0,
            "directory": source
        }
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .expect("import through stored adapter");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true, "import response: {response}");
    assert_eq!(response["result"]["revision"], 1);
    assert_eq!(response["result"]["changedEntitiesTotal"], 104);
    assert_eq!(response["result"]["changedEntities"][0], "classic-import");
    assert_eq!(response["result"]["counts"]["maps"], 1);
    assert_eq!(response["result"]["counts"]["actionPoints"], 100);
    assert_eq!(response["result"]["counts"]["landLayout"], true);
}
