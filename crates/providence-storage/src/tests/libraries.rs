use super::*;

#[test]
fn reference_catalog_round_trips_both_sources_without_overwriting_content() {
    let temporary = tempfile::tempdir().expect("temporary parent");
    let root = temporary.path().join("reference-catalog");
    let store = ReferenceCatalogStore::create(&root).expect("create catalog store");

    let catalog = reference_catalog_fixture(&store);
    let first_digest = store.save_catalog(&catalog).expect("save catalog");
    let (reopened_store, reopened) = ReferenceCatalogStore::open(&root).expect("reopen catalog");
    assert_eq!(reopened, catalog);
    assert_eq!(
        reopened_store
            .save_catalog(&reopened)
            .expect("repeat deterministic save"),
        first_digest
    );
    assert_eq!(
        reopened_store
            .read_blob(
                &reopened.assets[0]
                    .descriptor
                    .classic_payload_blob
                    .clone()
                    .unwrap()
            )
            .expect("read native payload"),
        b"controlled bag cicn"
    );

    let result = ReferenceCatalogStore::create(&root);
    assert!(matches!(
        result,
        Err(StoreError::ReferenceCatalogDirectoryNotEmpty(path)) if path == root
    ));
}

#[test]
fn monster_library_create_refuses_to_replace_existing_content() {
    let temporary = tempfile::tempdir().expect("temporary parent");
    let occupied = temporary.path().join("library");
    fs::create_dir_all(&occupied).expect("create occupied root");
    fs::write(occupied.join("keep.txt"), b"user content").expect("seed occupied root");

    let result = MonsterLibraryStore::create(
        &occupied,
        StableId("monster-library:must-not-overwrite".into()),
    );
    assert!(matches!(
        result,
        Err(StoreError::MonsterLibraryDirectoryNotEmpty(path)) if path == occupied
    ));
    assert_eq!(
        fs::read(occupied.join("keep.txt")).expect("existing content remains"),
        b"user content"
    );
}

#[test]
fn monster_library_portable_truth_survives_deleted_local_history() {
    let temporary = tempfile::tempdir().expect("temporary library");
    let (store, mut session) = MonsterLibraryStore::create(
        temporary.path(),
        StableId("monster-library:portable-test".into()),
    )
    .expect("create Monster Library");
    let mut bytes = vec![0; MONSTER_SCRAPBOOK_RECORD_BYTES];
    bytes[0] = 8;
    bytes[170..181].copy_from_slice(b"Bell Keeper");
    bytes[MONSTER_RECORD_BYTES] = 14;
    bytes[MONSTER_RECORD_BYTES + 1..MONSTER_RECORD_BYTES + 15].copy_from_slice(b"Guards a bell.");
    let decoded = decode_monster_scrapbook(
        &bytes,
        "Monster Scrap Book",
        "56ac232c22fc321a99cb819f1e2d8c3985ad479a",
        "public/bundled-libraries/divinity/Divinity Data/Monster Scrap Book",
    );
    assert_eq!(store.put_blob(&bytes).unwrap(), decoded.source.blob);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: MonsterLibraryCommand::ImportBuiltIns {
                source: decoded.source,
                entries: decoded.entries,
            },
        })
        .expect("import protected built-ins");
    let first_digest = store
        .checkpoint_session(&session)
        .expect("checkpoint Monster Library");
    assert_eq!(session.catalog().built_ins.len(), 1);

    fs::remove_dir_all(temporary.path().join(LOCAL_DIRECTORY))
        .expect("delete rebuildable local history");
    let (reopened_store, reopened) =
        MonsterLibraryStore::open_session(temporary.path()).expect("reopen portable library");
    assert_eq!(reopened.catalog(), session.catalog());
    assert!(!reopened.can_undo());
    let second_digest = reopened_store
        .save_catalog(reopened.catalog())
        .expect("repeat deterministic catalog save");
    assert_eq!(first_digest, second_digest);
    assert_eq!(
        reopened_store
            .read_blob(&reopened.catalog().sources[0].blob)
            .unwrap(),
        bytes
    );
}

fn reference_catalog_fixture(store: &ReferenceCatalogStore) -> ReferenceCatalog {
    let bag_source_bytes = b"controlled Bag of Holding source";
    let vault_source_bytes = b"controlled Vault of Arcana source";
    let bag_preview = b"controlled bag PNG";
    let vault_preview = b"controlled vault PNG";
    let bag_native = b"controlled bag cicn";
    let vault_native = b"controlled vault cicn";
    let bag_source_blob = store.put_blob(bag_source_bytes).expect("store bag source");
    let vault_source_blob = store
        .put_blob(vault_source_bytes)
        .expect("store vault source");
    let bag_preview_blob = store.put_blob(bag_preview).expect("store bag preview");
    let vault_preview_blob = store.put_blob(vault_preview).expect("store vault preview");
    let bag_native_blob = store.put_blob(bag_native).expect("store bag payload");
    let vault_native_blob = store.put_blob(vault_native).expect("store vault payload");

    ReferenceCatalog {
        format_version: REFERENCE_CATALOG_FORMAT_VERSION,
        library_id: StableId("reference-library:divinity".into()),
        sources: vec![
            ReferenceCatalogSource {
                identity: StableId("reference-source:bag-of-holding".into()),
                kind: ReferenceSourceKind::BagOfHolding,
                native_name: "Divinity Data/Bag of Holding.rsrc".into(),
                blob: bag_source_blob,
                byte_length: bag_source_bytes.len() as u64,
            },
            ReferenceCatalogSource {
                identity: StableId("reference-source:vault-of-arcana".into()),
                kind: ReferenceSourceKind::VaultOfArcana,
                native_name: "Divinity Data/Vault of Arcana.rsrc".into(),
                blob: vault_source_blob,
                byte_length: vault_source_bytes.len() as u64,
            },
        ],
        assets: vec![
            bag_asset(bag_preview_blob, bag_native_blob),
            vault_asset(vault_preview_blob, vault_native_blob),
        ],
    }
}

fn bag_asset(preview_blob: BlobId, native_blob: BlobId) -> ReferenceCatalogAsset {
    ReferenceCatalogAsset {
        source: StableId("reference-source:bag-of-holding".into()),
        descriptor: AssetDescriptor {
            identity: StableId("divinity:bag-item:31116".into()),
            label: "Bag item 31116".into(),
            kind: "bag-item".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: 31116,
            }),
            scenario_music_slot: None,
            blob: preview_blob,
            byte_length: b"controlled bag PNG".len() as u64,
            classic_payload_blob: Some(native_blob),
            classic_payload_byte_length: Some(b"controlled bag cicn".len() as u64),
            extension: Some("png".into()),
            width: Some(64),
            height: Some(64),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "Divinity Data/Bag of Holding.rsrc".into(),
        },
    }
}

fn vault_asset(preview_blob: BlobId, native_blob: BlobId) -> ReferenceCatalogAsset {
    ReferenceCatalogAsset {
        source: StableId("reference-source:vault-of-arcana".into()),
        descriptor: AssetDescriptor {
            identity: StableId("divinity:vault-icon:9000".into()),
            label: "Vault icon 9000".into(),
            kind: "vault-icon".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: 9000,
            }),
            scenario_music_slot: None,
            blob: preview_blob,
            byte_length: b"controlled vault PNG".len() as u64,
            classic_payload_blob: Some(native_blob),
            classic_payload_byte_length: Some(b"controlled vault cicn".len() as u64),
            extension: Some("png".into()),
            width: Some(32),
            height: Some(32),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "Divinity Data/Vault of Arcana.rsrc".into(),
        },
    }
}
