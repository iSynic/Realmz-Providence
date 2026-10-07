use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::model::WorldModel;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

#[test]
fn scenario_icon_import_resizes_compiles_and_reopens_source_preview() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("ashen-gate-sigil.png");
    fs::write(&source, b"controlled icon PNG source bytes").expect("write icon source");
    let snapshot = ProjectSnapshot::new_authored(StableId("icons".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    let rgba = [
        255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 255,
    ];
    let imported = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "icon.import",
        json!({
            "expectedRevision": 0,
            "path": source,
            "label": "Ashen Gate Sigil With A Very Long Corpus Name",
            "resourceId": 30126,
            "width": 2,
            "height": 2,
            "rgbaBase64": BASE64.encode(rgba)
        }),
    )
    .expect("import Scenario Icon");
    assert_eq!(imported["resourceType"], "cicn");
    assert_eq!(imported["sourceWidth"], 2);
    assert_eq!(imported["width"], 32);
    store
        .checkpoint_session(&session, &json!({"method": "icon.import"}))
        .expect("checkpoint icon import");

    let (_, reopened) = ProjectStore::open_session(store.root()).expect("reopen icon project");
    let icon = &reopened.snapshot().assets[0];
    assert_eq!(icon.identity.0, "icon:30126");
    assert_eq!(icon.width, Some(32));
    assert_eq!(icon.height, Some(32));
    let preview = dispatch_result_with_store(
        &mut reopened.clone(),
        Some(&store),
        "icon.preview",
        json!({"identity": "icon:30126"}),
    )
    .expect("read selected icon source preview");
    assert_eq!(
        BASE64.decode(preview["base64"].as_str().unwrap()).unwrap(),
        b"controlled icon PNG source bytes"
    );

    assert_icon_resource_compile(
        &reopened,
        &store,
        temporary.path(),
        icon.classic_payload_byte_length.unwrap(),
    );
}

#[test]
fn special_land_import_repairs_map_reference_and_compiles_raw_map_plus_negative_cicn() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("western-moon-gate.png");
    fs::write(&source, b"controlled transparent tile PNG source")
        .expect("write Special Land source");
    let snapshot = map_with_missing_special_land();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    let missing = dispatch_result(&mut session, "special-land.list", json!({}))
        .expect("list missing tile references");
    assert_eq!(missing["missingTargets"][0]["targetId"], "-91");

    let rgba = [
        0, 0, 0, 0, 213, 169, 75, 255, 123, 183, 200, 255, 0, 0, 0, 0,
    ];
    let imported = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "special-land.import",
        json!({
            "expectedRevision": 0,
            "path": source,
            "label": "Western Moon Gate With Broken Portcullis",
            "resourceId": -91,
            "width": 2,
            "height": 2,
            "rgbaBase64": BASE64.encode(rgba),
            "landlook": 0,
            "baseTile": 7
        }),
    )
    .expect("import Special Land Tile");
    assert_eq!(imported["resourceType"], "cicn");
    assert_eq!(imported["resourceId"], -91);
    assert_eq!(imported["width"], 32);
    let listed =
        dispatch_result(&mut session, "special-land.list", json!({})).expect("list resolved tiles");
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["uses"], 1);
    assert_eq!(listed["missingTargets"], json!([]));
    store
        .checkpoint_session(&session, &json!({"method": "special-land.import"}))
        .expect("checkpoint Special Land import");

    assert_special_land_compile_and_reopen(&session, &store, temporary.path());
}

fn assert_icon_resource_compile(
    reopened: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    expected_payload_bytes: u64,
) {
    let first = root.join("icon-compile-first");
    let second = root.join("icon-compile-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile first icon resource fork");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("compile second icon resource fork");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    let first_bytes = fs::read(first.join("Scenario.rsrc")).unwrap();
    let second_bytes = fs::read(second.join("Scenario.rsrc")).unwrap();
    assert_eq!(first_bytes, second_bytes);
    let entries = providence_core::codecs::parse_resource_entries(&first_bytes).unwrap();
    let cicn = entries
        .iter()
        .find(|entry| entry.resource_type == *b"cicn" && entry.id == 30_126)
        .expect("owned cicn resource");
    assert_eq!(cicn.name, "Ashen Gate Sigil With A Very Long Corpus Name");
    assert_eq!(&cicn.data[6..14], &[0, 0, 0, 0, 0, 32, 0, 32]);
    assert_eq!(cicn.data.len() as u64, expected_payload_bytes);
}

fn map_with_missing_special_land() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("special-land".into()));
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[7 * CLASSIC_MAP_SIZE + 12] = -1091;
    snapshot.world = WorldModel {
        maps: vec![MapLevel {
            identity: StableId("land:0".into()),
            level_type: LevelType::Land,
            native_index: 0,
            name: "Ashen Coast".into(),
            tiles,
            runtime: None,
        }],
        action_points: Vec::new(),
        land_layout: None,
        player_maps: Vec::new(),
        special_land_solidity: None,
    };
    snapshot
}

fn assert_special_land_compile_and_reopen(
    session: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
) {
    let first = root.join("special-land-compile-first");
    let first_result = compile_project_classic_slice(session, store, json!({"directory": first}))
        .expect("compile map and Special Land Tile");
    let data_ld = fs::read(first.join("Data LD")).expect("compiled Data LD");
    let native_offset = (12 * CLASSIC_MAP_SIZE + 7) * 2;
    assert_eq!(
        i16::from_be_bytes([data_ld[native_offset], data_ld[native_offset + 1]]),
        -1091
    );
    let resources = fs::read(first.join("Scenario.rsrc")).expect("compiled resource fork");
    let entries = providence_core::codecs::parse_resource_entries(&resources).unwrap();
    let cicn = entries
        .iter()
        .find(|entry| entry.resource_type == *b"cicn" && entry.id == -91)
        .expect("negative cicn resource");
    assert_eq!(cicn.name, "Western Moon Gate With Broken Portcullis");
    assert_eq!(&cicn.data[6..14], &[0, 0, 0, 0, 0, 32, 0, 32]);

    let (_, reopened) = ProjectStore::open_session(store.root()).expect("reopen project");
    let preview = dispatch_result_with_store(
        &mut reopened.clone(),
        Some(store),
        "special-land.preview",
        json!({"identity": "special-land.-91"}),
    )
    .expect("reopen source preview");
    assert_eq!(
        BASE64.decode(preview["base64"].as_str().unwrap()).unwrap(),
        b"controlled transparent tile PNG source"
    );
    let second = root.join("special-land-compile-second");
    let second_result =
        compile_project_classic_slice(&reopened, store, json!({"directory": second}))
            .expect("recompile reopened project");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    assert_eq!(resources, fs::read(second.join("Scenario.rsrc")).unwrap());
    assert_eq!(data_ld, fs::read(second.join("Data LD")).unwrap());
}
