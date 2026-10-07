use super::*;

#[test]
fn mapstats_catalog_import_is_atomic_hydrates_matching_land_maps_and_is_undoable() {
    let snapshot = desert_map_snapshot();
    let mut session = EditorSession::new(snapshot);
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: desert_mapstats_import(),
        })
        .expect("import read-only Map Stats catalog");

    assert_eq!(projection.changed_entities_total, 203);
    assert!(projection.truncated);
    assert_eq!(session.snapshot().landlook_catalogs.len(), 1);
    assert_eq!(session.snapshot().terrain_catalog.len(), 202);
    assert_eq!(session.snapshot().terrain_catalog[0].source, "preserved");
    let runtime = session.snapshot().world.maps[0].runtime.as_ref().unwrap();
    assert_eq!(runtime.base_tile, Some(156));
    assert_eq!(runtime.base_scale, Some(4));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo Map Stats import");
    assert!(session.snapshot().landlook_catalogs.is_empty());
    assert_eq!(session.snapshot().terrain_catalog.len(), 1);
    let runtime = session.snapshot().world.maps[0].runtime.as_ref().unwrap();
    assert_eq!(runtime.base_tile, None);
    assert_eq!(runtime.base_scale, None);
}

#[test]
fn custom_landlook_import_resolves_map_reference_and_supports_bounded_undoable_edits() {
    let snapshot = custom_landlook_map_snapshot();
    let mut session = EditorSession::new(snapshot);
    import_and_resolve_custom_landlook(&mut session);

    let base_projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::SetLandlookCatalogBase {
                landlook: 6,
                base_tile: 191,
                base_scale: 4,
            },
        })
        .unwrap();
    assert_eq!(base_projection.changed_entities_total, 2);
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .base_tile,
        Some(191)
    );

    let range_projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::SetLandlookRangeSlot {
                landlook: 6,
                slot: 0,
                first_tile: 60,
                last_tile: 90,
            },
        })
        .unwrap();
    assert_eq!(range_projection.changed_entities_total, 1);
    assert_eq!(
        session.snapshot().landlook_catalogs[0].range_slots[0].last_tile,
        90
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(
        session.snapshot().landlook_catalogs[0].range_slots[0].last_tile,
        85
    );
}

#[test]
fn special_land_solidity_catalog_is_revisioned_bounded_and_undoable() {
    let mut session = EditorSession::new(sample_snapshot());
    let mut solid = vec![false; SPECIAL_LAND_SOLIDITY_BYTES];
    solid[13] = true;
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetSpecialLandSolidityCatalog {
                catalog: Box::new(SpecialLandSolidityCatalog {
                    source: "Data Solids".into(),
                    source_blob: BlobId(format!("sha256:{}", "d".repeat(64))),
                    solid,
                }),
            },
        })
        .expect("set Data Solids catalog");
    assert_eq!(projection.revision, Revision(1));
    assert_eq!(projection.changed_entities.len(), 1);
    assert!(
        session
            .snapshot()
            .world
            .special_land_solidity
            .as_ref()
            .unwrap()
            .solid[13]
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo Data Solids catalog");
    assert!(session.snapshot().world.special_land_solidity.is_none());

    let before = session.persisted_state();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::SetSpecialLandSolidityCatalog {
                catalog: Box::new(SpecialLandSolidityCatalog {
                    source: "Data Solids".into(),
                    source_blob: BlobId(format!("sha256:{}", "e".repeat(64))),
                    solid: vec![false; SPECIAL_LAND_SOLIDITY_BYTES - 1],
                }),
            },
        })
        .expect_err("truncated Data Solids catalog must fail");
    assert!(matches!(error, SessionError::InvalidClassicImport(_)));
    assert_eq!(session.persisted_state(), before);
}

fn desert_map_snapshot() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Desert March".into(),
        tiles: vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(5),
            base_scale: None,
            tileset_id: StableId("classic.landlook.5".into()),
            base_tile: None,
            random_rectangles: Vec::new(),
        }),
    });
    snapshot.terrain_catalog.push(TerrainProfile {
        source: "preserved".into(),
        source_blob: None,
        tile: 0,
        landlook: Some(0),
        movement_sound_id: Some(0),
        movement_cost: 1,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[0; 3]; 3],
    });
    snapshot
}

fn custom_landlook_map_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("custom-landlook-session".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Custom Coast".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: true,
            landlook: Some(6),
            base_scale: None,
            tileset_id: StableId("classic.landlook.6".into()),
            base_tile: None,
            random_rectangles: Vec::new(),
        }),
    });
    snapshot
}

fn desert_mapstats_import() -> EditorCommand {
    let blob = BlobId("d".repeat(64));
    let catalog = LandlookCatalogMetadata {
        landlook: 5,
        source: "Data Desert BD".into(),
        source_blob: blob.clone(),
        byte_length: crate::codecs::MAPSTATS_CORE_BYTES as u64,
        base_tile: 156,
        base_scale: 4,
        range_slots: Vec::new(),
    };
    let profiles = (0..crate::codecs::MAPSTATS_RECORDS)
        .map(|tile| TerrainProfile {
            source: catalog.source.clone(),
            source_blob: Some(blob.clone()),
            tile: tile as i16,
            landlook: Some(5),
            movement_sound_id: Some(tile as i16),
            movement_cost: 1,
            solid_type: 0,
            walkable: true,
            shore: false,
            boat_requirement: 0,
            path: false,
            blocks_los: false,
            fly_float: false,
            forest_type: 0,
            combat_build: [[tile as i16; 3]; 3],
        })
        .collect();

    EditorCommand::ImportLandlookMapstatsCatalog {
        catalog: Box::new(catalog),
        profiles,
    }
}

fn import_and_resolve_custom_landlook(session: &mut EditorSession) {
    let mut source = vec![0u8; crate::codecs::MAPSTATS_REFERENCE_BYTES];
    let base = crate::codecs::MAPSTATS_RECORD_BYTES * crate::codecs::MAPSTATS_RECORDS;
    source[base..base + 2].copy_from_slice(&156_i16.to_be_bytes());
    source[base + 2..base + 4].copy_from_slice(&1_i16.to_be_bytes());
    source[crate::codecs::MAPSTATS_CORE_BYTES..crate::codecs::MAPSTATS_CORE_BYTES + 2]
        .copy_from_slice(&62_i16.to_be_bytes());
    source[crate::codecs::MAPSTATS_CORE_BYTES + 2..crate::codecs::MAPSTATS_CORE_BYTES + 4]
        .copy_from_slice(&85_i16.to_be_bytes());
    let decoded = crate::codecs::decode_custom_landlook_mapstats(
        &source,
        6,
        BlobId(format!("sha256:{}", "d".repeat(64))),
    )
    .unwrap();
    let before = session
        .references()
        .into_iter()
        .find(|reference| reference.field.0 == "runtime.landlook")
        .unwrap();
    assert_eq!(before.target_kind, TargetKind::Landlook);
    assert_eq!(before.resolution, ResolutionState::Missing);
    assert_eq!(before.repair_actions[0], RepairAction::ImportTarget);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ImportLandlookMapstatsCatalog {
                catalog: Box::new(decoded.catalog),
                profiles: decoded.profiles,
            },
        })
        .unwrap();
    let resolved = session
        .references()
        .into_iter()
        .find(|reference| reference.field.0 == "runtime.landlook")
        .unwrap();
    assert_eq!(resolved.resolution, ResolutionState::Resolved);
}
