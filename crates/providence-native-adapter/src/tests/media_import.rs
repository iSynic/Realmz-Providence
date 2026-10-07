use super::*;
use crate::classic_compilation::compile_project_classic_slice;
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::media_problems::inspect_rebuilt_media_projection;
use crate::transport::serve_io;
use providence_core::codecs::MAPSTATS_REFERENCE_BYTES;
use providence_core::codecs::decode_custom_landlook_mapstats;
use providence_core::codecs::{
    ResourceEntry, encode_scenario_icon_cicn, encode_scenario_picture_pict,
    encode_scenario_sound_snd, write_resource_fork,
};
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::MapRuntimeMetadata;
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
fn project_asset_import_hashes_payload_and_checkpoints_only_metadata() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("moon-gate.png");
    fs::write(&source, b"fixture").expect("write controlled asset payload");
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let request = json!({
        "id": 1,
        "method": "asset.import",
        "params": {
            "expectedRevision": 0,
            "path": source,
            "asset": {
                "identity": "special-land.-99",
                "label": "Moon Gate",
                "kind": "special-land-tile",
                "mimeType": "image/png",
                "classicResource": { "resourceType": "cicn", "resourceId": -99 },
                "width": 32,
                "height": 32,
                "source": "controlled decoded CICN fixture"
            }
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
    let (_, reopened) = ProjectStore::open_session(store.root()).expect("reopen asset project");
    let asset = &reopened.snapshot().assets[0];
    assert_eq!(asset.identity.0, "special-land.-99");
    assert_eq!(asset.byte_length, 7);
    assert_eq!(asset.extension.as_deref(), Some("png"));
    assert_eq!(store.read_blob(&asset.blob).unwrap(), b"fixture");
    let index = dispatch_result(
        &mut EditorSession::new(reopened.snapshot().clone()),
        "project.inspect-rebuilt-assets",
        json!({}),
    )
    .expect("inspect deterministic asset index");
    assert_eq!(index["assets"][0]["resourceId"], -99);
    assert_eq!(
        index["assets"][0]["path"],
        "assets/media/f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d.png"
    );
}

#[test]
fn classic_media_import_is_atomic_durable_and_exact_after_sqlite_loss() {
    let temporary = tempdir().expect("temporary root");
    let source_directory = temporary.path().join("classic-scenario");
    let scenario_resources = write_classic_media_fixture(&source_directory);
    let project_root = temporary.path().join("project");
    let mut snapshot = media_import_snapshot();
    let store = ProjectStore::create(&project_root, &snapshot).unwrap();
    seed_custom_landlook(&store, &mut snapshot);
    let mut session = EditorSession::new(snapshot);
    store
        .checkpoint_session(&session, &json!({"method": "test.seed-custom-landlook"}))
        .unwrap();
    import_classic_media(&mut session, &store, &source_directory);
    assert_reachable_media_report(&session);
    let (_, reopened) = ProjectStore::open_session(&project_root).unwrap();
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.snapshot().assets.len(), 6);
    let source = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Scenario.rsrc")
        .unwrap();
    assert_eq!(store.read_blob(&source.blob).unwrap(), scenario_resources);
    assert_decoded_pictures(&store, &reopened);
    assert_decoded_sound_and_text(&store, &reopened);
    let first_result =
        assert_repeat_media_compile(temporary.path(), &store, &reopened, &scenario_resources);
    assert_media_index_rebuild(
        temporary.path(),
        &store,
        &reopened,
        source,
        &scenario_resources,
        &first_result,
    );
}

#[test]
fn absent_scenario_resource_fork_imports_empty_scenario_media_without_inventing_source() {
    let temporary = tempfile::tempdir().expect("temporary root");
    let source_directory = temporary.path().join("classic-scenario-without-fork");
    fs::create_dir(&source_directory).expect("create scenario directory");
    let project_root = temporary.path().join("project-without-fork");
    let snapshot = media_import_snapshot();
    let store = ProjectStore::create(&project_root, &snapshot).expect("create project");
    let mut session = EditorSession::new(snapshot);
    let request = json!({
        "id": 2,
        "method": "project.import-classic-media",
        "params": {
            "expectedRevision": 0,
            "directory": source_directory,
        }
    });
    let mut output = Vec::new();

    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .expect("handle absent optional resource fork");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["sourcePresent"], false);
    assert_eq!(response["result"]["decoded"], 0);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().classic_sources.is_empty());
}

fn write_classic_media_fixture(source_directory: &Path) -> Vec<u8> {
    fs::create_dir_all(source_directory).unwrap();
    let rgba = vec![255; 32 * 32 * 4];
    let pict = encode_scenario_picture_pict(&rgba, 32, 32, false).unwrap();
    let landlook_pict =
        encode_scenario_picture_pict(&vec![127; 640 * 320 * 4], 640, 320, false).unwrap();
    let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
    let snd = encode_scenario_sound_snd(&[0, 64, 128, 255], 11_025, 1).unwrap();
    let scenario_resources = write_resource_fork(&[
        media_resource(*b"PICT", 30_000, "Western Moon Gate", 4, pict),
        media_resource(*b"PICT", 306, "Moonlit Vale Landlook", 0, landlook_pict),
        media_resource(*b"cicn", 257, "Captain Maelis Portrait", 2, cicn),
        media_resource(*b"snd ", 200, "Gate Opens", 8, snd),
        media_resource(
            *b"TEXT",
            -201,
            "Moon Gate Chronicle",
            5,
            b"Chronicle\rSecond page".to_vec(),
        ),
        media_resource(*b"styl", -201, "", 3, vec![0, 0]),
    ])
    .unwrap();
    fs::write(source_directory.join("Scenario.rsrc"), &scenario_resources).unwrap();
    scenario_resources
}

fn media_resource(
    resource_type: [u8; 4],
    id: i16,
    name: &str,
    attributes: u8,
    data: Vec<u8>,
) -> ResourceEntry {
    ResourceEntry {
        resource_type,
        id,
        name: name.into(),
        attributes,
        data,
    }
}

fn media_import_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("media-import".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Moonlit Vale".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "controlled".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(6),
            base_scale: Some(1),
            tileset_id: StableId("classic.landlook.6".into()),
            base_tile: Some(0),
            random_rectangles: Vec::new(),
        }),
    });
    snapshot
}

fn seed_custom_landlook(store: &ProjectStore, snapshot: &mut ProjectSnapshot) {
    let mut custom_landlook = vec![0u8; MAPSTATS_REFERENCE_BYTES];
    let custom_base =
        providence_core::codecs::MAPSTATS_RECORD_BYTES * providence_core::codecs::MAPSTATS_RECORDS;
    custom_landlook[custom_base..custom_base + 2].copy_from_slice(&0_i16.to_be_bytes());
    custom_landlook[custom_base + 2..custom_base + 4].copy_from_slice(&1_i16.to_be_bytes());
    let custom_blob = store.put_blob(&custom_landlook).unwrap();
    let decoded = decode_custom_landlook_mapstats(&custom_landlook, 6, custom_blob.clone())
        .expect("decode controlled custom landlook");
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Custom 1 BD".into(),
        blob: custom_blob,
        byte_length: MAPSTATS_REFERENCE_BYTES as u64,
    });
    snapshot.landlook_catalogs.push(decoded.catalog);
    snapshot.terrain_catalog = decoded.profiles;
}

fn import_classic_media(
    session: &mut EditorSession,
    store: &ProjectStore,
    source_directory: &Path,
) {
    let request = json!({
        "id": 1,
        "method": "project.import-classic-media",
        "params": {
            "expectedRevision": 0,
            "directory": source_directory,
        }
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&request).unwrap())),
        &mut output,
    )
    .unwrap();

    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["decoded"], 6);
    assert_eq!(response["result"]["counts"]["picture"], 1);
    assert_eq!(response["result"]["counts"]["portrait"], 1);
    assert_eq!(response["result"]["counts"]["sound"], 1);
    assert_eq!(response["result"]["counts"]["text-resource"], 1);
    assert_eq!(response["result"]["counts"]["text-style-resource"], 1);
    assert_eq!(response["result"]["counts"]["tileset"], 1);
    assert_eq!(response["result"]["failures"], json!([]));
    assert_eq!(response["result"]["ambiguousResources"], json!([]));
    assert_eq!(session.revision(), Revision(1));
}

fn assert_reachable_media_report(session: &EditorSession) {
    let media_report = inspect_rebuilt_media_projection(
        session.snapshot(),
        session.revision(),
        &empty_runtime_selection(),
        None,
        &json!({"limit": 5}),
    )
    .expect("inspect bounded reachable media report");
    assert_eq!(media_report["revision"], 1);
    assert_eq!(media_report["ready"], false);
    assert_eq!(media_report["counts"]["references"], 241);
    assert_eq!(media_report["counts"]["resolvedAssets"], 2);
    assert_eq!(media_report["counts"]["problemUses"], 239);
    assert_eq!(media_report["counts"]["problemTargets"], 239);
    assert_eq!(media_report["counts"]["resolutions"]["resolved"], 2);
    assert_eq!(media_report["counts"]["resolutions"]["missing"], 239);
    assert_eq!(
        media_report["counts"]["requirements"]["application-required"],
        241
    );
    assert_eq!(media_report["problems"].as_array().unwrap().len(), 5);
    assert_eq!(media_report["total"], 239);
    assert_eq!(media_report["truncated"], true);
}

fn assert_decoded_pictures(store: &ProjectStore, reopened: &EditorSession) {
    let picture = reopened
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == "picture:30000")
        .unwrap();
    assert_eq!(
        &store.read_blob(&picture.blob).unwrap()[..8],
        b"\x89PNG\r\n\x1a\n"
    );
    let landlook = reopened
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == "classic.landlook.6")
        .unwrap();
    assert_eq!(landlook.kind, "tileset");
    assert_eq!(landlook.tile_width, Some(32));
    assert_eq!(landlook.columns, Some(20));
    assert_eq!(landlook.rows, Some(10));
    assert_eq!(landlook.landlook, Some(6));
    assert_eq!(landlook.classic_resource.as_ref().unwrap().resource_id, 306);
}

fn assert_decoded_sound_and_text(store: &ProjectStore, reopened: &EditorSession) {
    let sound = reopened
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == "sound:200")
        .unwrap();
    assert_eq!(&store.read_blob(&sound.blob).unwrap()[..4], b"RIFF");
    let text = reopened
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == "classic-resource:TEXT:-201")
        .unwrap();
    assert_eq!(
        store.read_blob(&text.blob).unwrap(),
        b"Chronicle\nSecond page"
    );
    assert_eq!(
        store
            .read_blob(text.classic_payload_blob.as_ref().unwrap())
            .unwrap(),
        b"Chronicle\rSecond page"
    );
}

fn assert_repeat_media_compile(
    temporary: &Path,
    store: &ProjectStore,
    reopened: &EditorSession,
    scenario_resources: &[u8],
) -> Value {
    let first = temporary.join("compile-first");
    let second = temporary.join("compile-second");
    let first_result =
        compile_project_classic_slice(reopened, store, json!({"directory": first})).unwrap();
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second})).unwrap();
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    assert_eq!(
        fs::read(temporary.join("compile-first/Scenario.rsrc")).unwrap(),
        scenario_resources
    );
    first_result
}

fn assert_media_index_rebuild(
    temporary: &Path,
    store: &ProjectStore,
    reopened: &EditorSession,
    source: &ClassicSourceBlob,
    scenario_resources: &[u8],
    first_result: &Value,
) {
    let durable_snapshot = reopened.snapshot().clone();
    fs::remove_file(store.local_database_path()).unwrap();
    let (rebuilt_store, rebuilt_snapshot) = ProjectStore::open(store.root()).unwrap();
    assert_eq!(rebuilt_snapshot, durable_snapshot);
    assert_eq!(rebuilt_snapshot.assets.len(), 6);
    assert_eq!(
        rebuilt_store.read_blob(&source.blob).unwrap(),
        scenario_resources
    );
    let rebuilt_session = EditorSession::new(rebuilt_snapshot);
    let third = temporary.join("compile-after-index-rebuild");
    let third_result = compile_project_classic_slice(
        &rebuilt_session,
        &rebuilt_store,
        json!({"directory": third}),
    )
    .unwrap();
    assert_eq!(
        first_result["manifestSha256"],
        third_result["manifestSha256"]
    );
    assert_eq!(
        fs::read(temporary.join("compile-after-index-rebuild/Scenario.rsrc")).unwrap(),
        scenario_resources
    );
}
