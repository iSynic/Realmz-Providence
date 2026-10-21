use super::*;

fn native_rows() -> Vec<u8> {
    let mut bytes = vec![0; PLAYER_MAP_RECORD_BYTES * 22];
    for id in [0, 20] {
        bytes[id * 340 + 68..id * 340 + 70].copy_from_slice(&16_i16.to_be_bytes());
    }
    for (offset, value) in [(64, -7_i16), (68, i16::MIN), (70, -301), (74, -12345)] {
        bytes[19 * 340 + offset..19 * 340 + offset + 2].copy_from_slice(&value.to_be_bytes());
    }
    bytes[21 * 340 + 84] = 0;
    bytes[21 * 340 + 85..22 * 340].fill(0x80);
    bytes.extend_from_slice(&[0xde, 0xad, 0x80]);
    bytes
}

fn import_rows(root: &Path, extra_code_tail: bool) -> (ProjectStore, EditorSession, Vec<u8>) {
    let (store, mut session, _) = source_fixture(root, true);
    let directory = root.join("source");
    let resources = write_resource_fork(&[ResourceEntry {
        resource_type: *b"TEXT",
        id: -301,
        name: "MD2 fixture".into(),
        attributes: 0,
        data: b"Generated Player Map fixture".to_vec(),
    }])
    .unwrap();
    fs::write(directory.join("Scenario.rsrc"), resources).unwrap();
    let revision = session.revision();
    stored_request(
        &mut session,
        &store,
        "project.import-classic-media",
        json!({"expectedRevision":revision,"directory":directory}),
    );
    if extra_code_tail {
        fs::write(directory.join("Data EDCD"), [0xab, 0xcd, 0xef]).unwrap();
        let revision = session.revision();
        stored_request(
            &mut session,
            &store,
            "project.import-classic-land-slice",
            json!({"expectedRevision":revision,"directory":directory}),
        );
    }
    let bytes = native_rows();
    fs::write(directory.join("Data MD2"), &bytes).unwrap();
    let revision = session.revision();
    stored_request(
        &mut session,
        &store,
        "project.import-classic-player-maps",
        json!({"expectedRevision":revision,"directory":directory}),
    );
    (store, session, bytes)
}

#[test]
fn md2_all_rows_and_operational_catalog_survive_native_save_reopen_and_current_export() {
    for extra_code_tail in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let (store, mut session, original) = import_rows(root.path(), extra_code_tail);
        assert_eq!(session.snapshot().world.player_maps.len(), 22);
        dispatch_result_with_store(&mut session, Some(&store), "project.save", json!({})).unwrap();
        let project = store.root().to_path_buf();
        drop(session);
        drop(store);
        let (store, mut reopened) = ProjectStore::open_session(&project).unwrap();
        let source = reopened
            .snapshot()
            .classic_sources
            .iter()
            .find(|source| source.native_path == "Data MD2")
            .unwrap();
        assert_eq!(store.read_blob(&source.blob).unwrap(), original);
        let path = root.path().join("md2.realmz2");
        dispatch_result_with_store(
            &mut reopened,
            Some(&store),
            "project.compile-rebuilt-package",
            json!({"path":path,"minimumEngineVersion":"0.1.0"}),
        )
        .unwrap();
        let inspected = inspect_rebuilt_v3_archive(Cursor::new(fs::read(path).unwrap())).unwrap();
        assert_eq!(inspected.manifest.schema_version, 7);
        assert_eq!(
            inspected
                .world
                .player_maps
                .iter()
                .map(|row| row.classic_id)
                .collect::<Vec<_>>(),
            [0, 19]
        );
        assert_eq!(inspected.world.player_maps[1].icon_size, i16::MIN);
        assert_eq!(inspected.world.player_maps[1].mode, "scrolling-text");
        let facts = inspected.content.classic_records.unwrap();
        assert_eq!(facts.player_maps.len(), 22);
        assert_eq!(facts.player_maps[19].words[35], -301);
        assert_eq!(facts.player_maps[19].words[37], -12345);
        assert_eq!(facts.player_maps[21].note_bytes[0], 0);
        assert_eq!(facts.player_maps[21].note_bytes[255], 128);
        let source = facts
            .sources
            .iter()
            .find(|source| source.native_path == "Data MD2")
            .unwrap();
        assert_eq!(source.layouts[0].complete_records, 22);
        assert_eq!(source.layouts[0].trailing_bytes, 3);
        assert!(source.edits.is_empty());
        assert_eq!(source.sha256, source.effective_sha256);
    }
}
