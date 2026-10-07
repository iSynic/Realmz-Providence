#[test]
fn classic_player_map_import_open_update_compile_and_reopen_is_bounded() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("source-player-maps");
    fs::create_dir(&source).expect("create source directory");
    let data_md2 = write_player_map_source(&source);

    let (store, mut session) = player_map_project(temporary.path());
    import_and_check_player_map_sources(&mut session, &store, &source);

    assert_combined_player_map_update_rejected(&mut session);

    update_and_checkpoint_player_map(&mut session, &store);

    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen player-map project");
    assert_reopened_player_map(&reopened, &store, &data_md2);

    assert_compiled_player_map(temporary.path(), &reopened, &store);
}
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result;
use crate::player_map_import::import_classic_player_map_names;
use crate::player_map_import::import_classic_player_maps;
use providence_core::codecs::PLAYER_MAP_RECORD_BYTES;
use providence_core::codecs::ResourceEntry;
use providence_core::codecs::decode_player_map_name_catalog;
use providence_core::codecs::decode_player_maps;
use providence_core::codecs::encode_player_map_name_resources;
use providence_core::codecs::parse_resource_entries;
use providence_core::codecs::write_resource_fork;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::PlayerMapNameCatalog;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

fn write_player_map_source(source: &std::path::Path) -> Vec<u8> {
    let mut data_md2 = vec![0u8; PLAYER_MAP_RECORD_BYTES];
    data_md2[68..70].copy_from_slice(&16_i16.to_be_bytes());
    data_md2[70..72].copy_from_slice(&(-200_i16).to_be_bytes());
    data_md2[74..76].copy_from_slice(&[0xca, 0xfe]);
    data_md2[84] = 4;
    data_md2[85..89].copy_from_slice(b"Road");
    data_md2.extend_from_slice(&[0xde]);
    fs::write(source.join("Data MD2"), &data_md2).expect("write controlled player-map source");
    let original_names = PlayerMapNameCatalog {
        source_blob: None,
        available_names: (1..=20).map(|index| format!("Known Map {index}")).collect(),
        unavailable_names: (1..=20)
            .map(|index| format!("Unknown Map {index}"))
            .collect(),
    };
    let scenario_resources =
        encode_player_map_name_resources(&original_names, None).expect("encode name resources");
    let scenario_resources = providence_core::codecs::merge_resource_entries(
        &scenario_resources,
        vec![providence_core::codecs::ResourceEntry {
            resource_type: *b"TEXT",
            id: -200,
            name: "Road journal".into(),
            attributes: 0,
            data: b"Road journal".to_vec(),
        }],
    )
    .expect("add controlled TEXT resource");
    fs::write(source.join("Scenario.rsrc"), &scenario_resources)
        .expect("write controlled Player Map names");

    data_md2
}

fn player_map_project(root: &std::path::Path) -> (ProjectStore, EditorSession) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("player-map-import".into()));
    let store = ProjectStore::create(root.join("project-player-maps"), &snapshot)
        .expect("create project store");
    let text_blob = store
        .put_blob(b"Road journal")
        .expect("store text resource");
    snapshot.assets.push(AssetDescriptor {
        identity: StableId("classic-resource:TEXT:-200".into()),
        label: "Road journal".into(),
        kind: "text-resource".into(),
        mime_type: Some("text/plain".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "TEXT".into(),
            resource_id: -200,
        }),
        scenario_music_slot: None,
        blob: text_blob.clone(),
        byte_length: 12,
        classic_payload_blob: Some(text_blob),
        classic_payload_byte_length: Some(12),
        extension: Some("txt".into()),
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled player-map fixture".into(),
    });
    let session = EditorSession::new(snapshot);
    (store, session)
}

fn import_and_check_player_map_sources(
    session: &mut EditorSession,
    store: &ProjectStore,
    source: &std::path::Path,
) {
    let imported = import_classic_player_maps(
        session,
        Some(store),
        json!({"expectedRevision": 0, "directory": source}),
    )
    .expect("import player maps");
    assert_eq!(imported["count"], 1);
    assert_eq!(imported["trailingBytes"], 1);
    assert!(imported.get("snapshot").is_none());
    let imported_names = import_classic_player_map_names(
        session,
        Some(store),
        json!({"expectedRevision": 1, "directory": source}),
    )
    .expect("import Player Map names");
    assert_eq!(imported_names["availableCount"], 20);
    assert_eq!(imported_names["unavailableCount"], 20);
    let listed =
        dispatch_result(session, "player-map.list", json!({"limit": 1})).expect("list player maps");
    assert_eq!(listed["records"][0]["mode"], "scrolling-text");
    assert_eq!(listed["records"][0]["name"], "Known Map 1");
    let opened = dispatch_result(
        session,
        "player-map.open",
        json!({"identity": "player-map:0"}),
    )
    .expect("open player map");
    assert_eq!(opened["playerMap"]["note"], "Road");
    assert_eq!(opened["names"]["availableName"], "Known Map 1");
    assert_eq!(opened["names"]["unavailableName"], "Unknown Map 1");
    assert_eq!(opened["references"][0]["targetKind"], "text-resource");
    assert_eq!(opened["references"][0]["resolution"], "resolved");
}

fn assert_combined_player_map_update_rejected(session: &mut EditorSession) {
    let mut invalid_combined_update =
        serde_json::to_value(session.snapshot().world.player_maps[0].clone())
            .expect("serialize Player Map body");
    invalid_combined_update
        .as_object_mut()
        .unwrap()
        .insert("name".into(), json!("Wrong owner"));
    let rejected = dispatch_result(
        session,
        "player-map.update",
        json!({
            "expectedRevision": 2,
            "playerMap": invalid_combined_update
        }),
    )
    .expect_err("body command must reject Scenario.rsrc names");
    assert!(rejected.contains("player-map.names.update"));
    assert_eq!(session.revision(), Revision(2));
}

fn update_and_checkpoint_player_map(session: &mut EditorSession, store: &ProjectStore) {
    dispatch_result(
        session,
        "player-map.names.update",
        json!({
            "expectedRevision": 2,
            "nativeId": 0,
            "availableName": "East Road",
            "unavailableName": "Uncharted East"
        }),
    )
    .expect("update Player Map resource names");

    let mut edited = session.snapshot().world.player_maps[0].clone();
    edited.note = "Road closed beyond the old watchtower.".into();
    dispatch_result(
        session,
        "player-map.update",
        json!({"expectedRevision": 3, "playerMap": edited}),
    )
    .expect("update player map");
    store
        .checkpoint_session(session, &json!({"method": "player-map.update"}))
        .expect("checkpoint player-map update");
}

fn assert_reopened_player_map(reopened: &EditorSession, store: &ProjectStore, data_md2: &[u8]) {
    assert_eq!(reopened.revision(), Revision(4));
    assert_eq!(
        reopened.snapshot().world.player_maps[0].note,
        "Road closed beyond the old watchtower."
    );
    assert_eq!(
        reopened
            .snapshot()
            .player_map_names
            .as_ref()
            .unwrap()
            .available_names[0],
        "East Road"
    );
    assert_eq!(
        store
            .read_blob(&reopened.snapshot().classic_sources[0].blob)
            .unwrap(),
        data_md2
    );
}

fn assert_compiled_player_map(
    root: &std::path::Path,
    reopened: &EditorSession,
    store: &ProjectStore,
) {
    let first = root.join("compiled-player-map-first");
    let second = root.join("compiled-player-map-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile player maps");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("repeat player-map compile");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    let compiled = fs::read(root.join("compiled-player-map-first").join("Data MD2"))
        .expect("read compiled Data MD2");
    assert_eq!(&compiled[74..76], &[0xca, 0xfe]);
    assert_eq!(&compiled[PLAYER_MAP_RECORD_BYTES..], &[0xde]);
    assert_eq!(
        decode_player_maps(&compiled).records[0].note,
        "Road closed beyond the old watchtower."
    );
    let compiled_resources = fs::read(root.join("compiled-player-map-first").join("Scenario.rsrc"))
        .expect("read compiled Player Map names");
    let compiled_names = decode_player_map_name_catalog(&compiled_resources, None)
        .expect("decode compiled Player Map names");
    assert_eq!(compiled_names.available_names[0], "East Road");
    assert_eq!(compiled_names.unavailable_names[0], "Uncharted East");
}

#[test]
fn player_map_names_are_optional_when_the_scenario_fork_or_name_lists_are_absent() {
    let temporary = tempfile::tempdir().expect("temporary root");
    let source = temporary.path().join("source-without-scenario-fork");
    fs::create_dir(&source).expect("create source directory");
    let (store, mut session) = player_map_project(temporary.path());

    let absent = import_classic_player_map_names(
        &mut session,
        Some(&store),
        json!({"expectedRevision": 0, "directory": source}),
    )
    .expect("absent scenario fork is optional");
    assert_eq!(absent["sourcePresent"], false);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().player_map_names.is_none());

    fs::write(source.join("Scenario.rsrc"), [0x01]).expect("write malformed present fork");
    assert!(
        import_classic_player_map_names(
            &mut session,
            Some(&store),
            json!({"expectedRevision": 0, "directory": source}),
        )
        .is_err()
    );
    assert_eq!(session.revision(), Revision(0));

    let resource = ResourceEntry {
        resource_type: *b"STR#",
        id: -102,
        name: "Available Maps".into(),
        attributes: 0,
        data: vec![0, 1, 5, b'A', b'v', b'a', b'i', b'l'],
    };
    fs::write(
        source.join("Scenario.rsrc"),
        write_resource_fork(&[resource]).expect("write partial player-map name fork"),
    )
    .expect("write source fork");
    let partial = import_classic_player_map_names(
        &mut session,
        Some(&store),
        json!({"expectedRevision": 0, "directory": source}),
    )
    .expect("missing one optional name list is supported");
    assert_eq!(partial["availableCount"], 1);
    assert_eq!(partial["unavailableCount"], 0);
    let names = session.snapshot().player_map_names.as_ref().unwrap();
    assert_eq!(names.available_names, ["Avail"]);
    assert!(names.unavailable_names.is_empty());
}

#[test]
fn imported_player_map_name_control_bytes_are_preserved_as_mac_roman() {
    let temporary = tempfile::tempdir().expect("temporary root");
    let source = temporary.path().join("source-with-mac-roman-controls");
    fs::create_dir(&source).expect("create source directory");
    let (store, mut session) = player_map_project(temporary.path());
    let names = PlayerMapNameCatalog {
        source_blob: None,
        available_names: (1..=20).map(|index| format!("Known Map {index}")).collect(),
        unavailable_names: (1..=20)
            .map(|index| format!("Unknown Map {index}"))
            .collect(),
    };
    let encoded = encode_player_map_name_resources(&names, None).expect("encode fixture lists");
    let mut entries = parse_resource_entries(&encoded).expect("parse fixture resources");
    let unavailable = entries
        .iter_mut()
        .find(|entry| entry.resource_type == *b"STR#" && entry.id == -101)
        .expect("unavailable Player Map names");
    let mut data = Vec::new();
    data.extend_from_slice(&20_u16.to_be_bytes());
    for index in 1..=19 {
        let name = format!("Unknown Map {index}").into_bytes();
        data.push(name.len() as u8);
        data.extend_from_slice(&name);
    }
    let native_name = b"Unknown Map 20\x10\0";
    data.push(native_name.len() as u8);
    data.extend_from_slice(native_name);
    unavailable.data = data;
    let scenario_resources = write_resource_fork(&entries).expect("write control-byte fork");
    fs::write(source.join("Scenario.rsrc"), &scenario_resources).expect("write source resources");

    let imported = import_classic_player_map_names(
        &mut session,
        Some(&store),
        json!({"expectedRevision": 0, "directory": source}),
    )
    .expect("all MacRoman byte values other than the mapped NUL remain importable");

    assert_eq!(imported["unavailableCount"], 20);
    let catalog = session.snapshot().player_map_names.as_ref().unwrap();
    assert_eq!(catalog.unavailable_names[19], "Unknown Map 20\u{10} ");
    assert_eq!(
        store
            .read_blob(&session.snapshot().classic_sources[0].blob)
            .unwrap(),
        scenario_resources,
        "the exact no-edit resource fork remains in the source annex"
    );
    assert_eq!(
        encode_player_map_name_resources(catalog, Some(&scenario_resources)).unwrap(),
        scenario_resources
    );
}
