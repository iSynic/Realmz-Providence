use crate::{dispatch_result_with_store, transport::serve_io};
use providence_core::{codecs::*, model::*, session::EditorSession};
use providence_rebuilt_package::inspect_rebuilt_v3_archive;
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::{fs, io::Cursor, path::Path};

mod player_maps;

fn stored_request(
    session: &mut EditorSession,
    store: &ProjectStore,
    method: &str,
    params: Value,
) -> Value {
    let request = json!({"id":1,"method":method,"params":params}).to_string() + "\n";
    let mut output = Vec::new();
    serve_io(session, Some(store), Cursor::new(request), &mut output).unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true, "{response}");
    response["result"].clone()
}

fn source_fixture(root: &Path, include_xap: bool) -> (ProjectStore, EditorSession, Vec<u8>) {
    let source = root.join("source");
    fs::create_dir(&source).unwrap();
    let mut xap = vec![0; 40];
    xap.extend_from_slice(&[0xde, 0xad, 0xbe]);
    let mut rd = vec![0; RANDOM_LEVEL_RECORD_BYTES];
    rd[520] = 5;
    for (path, bytes) in [
        ("Data LD", vec![0; MAP_LEVEL_BYTES]),
        ("Data DD", vec![0; ACTION_POINT_LEVEL_BYTES]),
        ("Data ED", vec![0; SIMPLE_ENCOUNTER_RECORD_BYTES]),
        ("Data SD2", vec![0; 256]),
        ("Data RD", rd),
        ("Data ED3", xap.clone()),
    ] {
        if path != "Data ED3" || include_xap {
            fs::write(source.join(path), bytes).unwrap();
        }
    }
    let reference = root.join("Data Desert BD");
    fs::write(&reference, vec![0; MAPSTATS_REFERENCE_BYTES]).unwrap();
    let mut baseline = providence_storage::AuthoredProjectBaseline::read(
        "native-preservation",
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../../godot/bundled/realmz-reference"),
    )
    .unwrap();
    baseline.snapshot.campaign = Some(CampaignMetadata::neutral());
    baseline.snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 0, y: 0 },
    });
    baseline.snapshot.standard_spells =
        decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
    for spell in &mut baseline.snapshot.standard_spells {
        spell.definition.name = format!("Fixture spell {}", spell.definition.classic_id);
    }
    for item in &mut baseline.snapshot.item_rules {
        item.definition.special[4] = 0;
    }
    let mut snapshot = baseline.snapshot.clone();
    let store = baseline
        .create(root.join("project").to_str().unwrap())
        .unwrap();
    add_fixture_atlas(&mut snapshot, &store);
    let mut session = EditorSession::new(snapshot);
    stored_request(
        &mut session,
        &store,
        "terrain.import-mapstats-reference",
        json!({"expectedRevision":0,"landlook":5,"path":reference}),
    );
    stored_request(
        &mut session,
        &store,
        "project.import-classic-land-slice",
        json!({"expectedRevision":1,"directory":source}),
    );
    (store, session, xap)
}

fn add_fixture_atlas(snapshot: &mut ProjectSnapshot, store: &ProjectStore) {
    let bytes = encode_runtime_rgba_png(&[10, 20, 30, 255].repeat(320 * 320), 320, 320).unwrap();
    let blob = store.put_blob(&bytes).unwrap();
    snapshot.assets.push(AssetDescriptor {
        identity: StableId("classic.landlook.5".into()),
        label: "Fixture land atlas".into(),
        kind: "tileset".into(),
        mime_type: Some("image/png".into()),
        classic_resource: None,
        scenario_music_slot: None,
        blob,
        byte_length: bytes.len() as u64,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(320),
        height: Some(320),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: Some(32),
        tile_height: Some(32),
        columns: Some(10),
        rows: Some(10),
        landlook: Some(5),
        base_tile: Some(0),
        source: "generated fixture atlas".into(),
    });
    add_fixture_appearances(snapshot, store);
}

fn add_fixture_appearances(snapshot: &mut ProjectSnapshot, store: &ProjectStore) {
    let bytes = encode_runtime_rgba_png(&[10, 20, 30, 255].repeat(32 * 32), 32, 32).unwrap();
    let blob = store.put_blob(&bytes).unwrap();
    let atlas = snapshot.assets[0].clone();
    for (kind, ids) in [("portrait", 257..377), ("combat-icon", 9000..9120)] {
        for id in ids {
            let mut asset = atlas.clone();
            asset.identity = StableId(format!("fixture.{kind}.{id}"));
            asset.label = format!("Fixture {kind} {id}");
            asset.kind = kind.into();
            asset.classic_resource = Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: id,
            });
            asset.blob = blob.clone();
            asset.byte_length = bytes.len() as u64;
            asset.width = Some(32);
            asset.height = Some(32);
            asset.tile_width = None;
            asset.tile_height = None;
            asset.columns = None;
            asset.rows = None;
            asset.landlook = None;
            asset.base_tile = None;
            snapshot.assets.push(asset);
        }
    }
}

#[test]
fn native_xap_fragment_survives_edit_save_reopen_and_v7_export_inspection() {
    let root = tempfile::tempdir().unwrap();
    let (store, mut session, original) = source_fixture(root.path(), true);
    assert_eq!(session.snapshot().extra_action_points.len(), 1);
    let mut row = serde_json::to_value(&session.snapshot().extra_action_points[0]).unwrap();
    row["chancePercent"] = json!(37);
    stored_request(
        &mut session,
        &store,
        "extra-action-point.update",
        json!({"expectedRevision":2,"extraActionPoint":row}),
    );
    dispatch_result_with_store(&mut session, Some(&store), "project.save", json!({})).unwrap();
    let project = store.root().to_path_buf();
    drop(session);
    drop(store);
    let (store, mut reopened) = ProjectStore::open_session(&project).unwrap();
    assert_eq!(
        reopened.snapshot().extra_action_points[0].chance_percent,
        37
    );
    let source = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|s| s.native_path == "Data ED3")
        .unwrap();
    assert_eq!(store.read_blob(&source.blob).unwrap(), original);
    let path = root.path().join("edited.realmz2");
    dispatch_result_with_store(
        &mut reopened,
        Some(&store),
        "project.compile-rebuilt-package",
        json!({"path":path,"minimumEngineVersion":"0.1.0"}),
    )
    .unwrap();
    let inspected = inspect_rebuilt_v3_archive(Cursor::new(fs::read(&path).unwrap())).unwrap();
    assert_eq!(inspected.manifest.schema_version, 7);
    let records = inspected.content.classic_records.unwrap();
    let source = records
        .sources
        .iter()
        .find(|s| s.native_path == "Data ED3")
        .unwrap();
    assert_eq!(source.layouts[0].trailing_bytes, 3);
    assert_eq!(source.edits.len(), 1);
    assert_eq!(source.edits[0].offset, 7);
    assert_eq!(source.edits[0].before, [0]);
    assert_eq!(source.edits[0].after, [37]);
    assert_eq!(
        records
            .programs
            .iter()
            .find(|r| r.native_path == "Data ED3")
            .unwrap()
            .prefix[7],
        37
    );
}

#[test]
fn imported_v7_export_builds_a_family_the_scenario_never_shipped() {
    let root = tempfile::tempdir().unwrap();
    let (store, mut authored, _) = source_fixture(root.path(), false);
    assert!(authored.snapshot().extra_action_points.is_empty());
    stored_request(
        &mut authored,
        &store,
        "extra-action-point.create",
        json!({"expectedRevision":2,"nativeId":0}),
    );
    dispatch_result_with_store(&mut authored, Some(&store), "project.save", json!({})).unwrap();
    let snapshot = authored.snapshot().clone();
    // Classic export's encounter stage encodes an absent Data ED3 exactly this way.
    let classic_xap = encode_extra_action_points(&snapshot.extra_action_points, None).unwrap();
    let path = root.path().join("built.realmz2");
    let receipt = dispatch_result_with_store(
        &mut authored,
        Some(&store),
        "project.compile-rebuilt-package",
        json!({"path":path,"minimumEngineVersion":"0.1.0"}),
    )
    .unwrap();
    let built = receipt["builtNativeFiles"].as_array().unwrap();
    assert_eq!(built.len(), 1, "{receipt}");
    assert_eq!(built[0]["nativePath"], "Data ED3");
    assert_eq!(
        built[0]["message"],
        "Built Data ED3 from authored records; the original scenario had no Data ED3."
    );
    let inspected = inspect_rebuilt_v3_archive(Cursor::new(fs::read(&path).unwrap())).unwrap();
    assert_eq!(inspected.manifest.schema_version, 7);
    let records = inspected.content.classic_records.unwrap();
    let source = records
        .sources
        .iter()
        .find(|s| s.native_path == "Data ED3")
        .unwrap();
    assert!(source.edits.is_empty());
    assert_eq!(source.byte_length, classic_xap.len() as u64);
    assert_eq!(
        source.sha256,
        format!("{:x}", <sha2::Sha256 as sha2::Digest>::digest(&classic_xap))
    );
    assert_eq!(built[0]["sha256"], source.sha256);
    assert_eq!(authored.snapshot(), &snapshot);
    assert!(
        !store
            .load_snapshot()
            .unwrap()
            .classic_sources
            .iter()
            .any(|s| s.native_path == "Data ED3")
    );
    drop(store);
}
