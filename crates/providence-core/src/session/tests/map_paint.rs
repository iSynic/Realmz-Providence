use super::*;
use crate::session::map_lifecycle_commands::new_map_level;

#[test]
fn bounded_land_paint_preserves_marker_ownership_and_is_one_undo_step() {
    let snapshot = marked_land_snapshot();
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();

    let result = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::PaintLandMapCells {
                identity: StableId("land:0".into()),
                cells: marker_paint_gesture(),
            },
        })
        .expect("paint one bounded land gesture");
    assert_eq!(result.changed_entities, vec![StableId("land:0".into())]);
    assert!(result.references_unchanged);
    assert!(result.reference_changes.is_empty());
    let tiles = &session.snapshot().world.maps[0].tiles;
    assert_eq!(tiles[CLASSIC_MAP_SIZE + 1], 1090);
    assert_eq!(tiles[CLASSIC_MAP_SIZE * 2 + 2], 2090);
    assert_eq!(tiles[CLASSIC_MAP_SIZE * 3 + 3], 3090);
    assert_eq!(tiles[CLASSIC_MAP_SIZE * 4 + 4] as u16, 0x6000 | 90);

    let undone = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo the complete paint gesture");
    assert!(undone.references_unchanged);
    assert_eq!(session.snapshot(), &before);

    let duplicate = vec![
        LandMapCellPaint {
            x: 8,
            y: 9,
            tile: 1,
        },
        LandMapCellPaint {
            x: 8,
            y: 9,
            tile: 2,
        },
    ];
    let before = session.snapshot().clone();
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::PaintLandMapCells {
                identity: StableId("land:0".into()),
                cells: duplicate,
            },
        }),
        Err(SessionError::InvalidMapPaint { .. })
    ));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(2));
}

#[test]
fn land_cell_edit_is_revisioned_and_undoable() {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Ashen Coast".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateLandMapCell {
                identity: StableId("land:0".into()),
                x: 12,
                y: 7,
                tile: 321,
            },
        })
        .expect("map edit");
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12],
        321
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo map edit");
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12],
        0
    );
}

#[test]
fn dungeon_cell_edits_are_primitive_scoped_revisioned_and_undoable() {
    let raw = (crate::codecs::DUNGEON_PRESERVED_HIGH_SIGN_MASK
        | crate::codecs::DUNGEON_NOTE_MARKER_MASK
        | crate::codecs::DUNGEON_WALL_MASK) as i16;
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Ashen Vault".into(),
        tiles: vec![raw; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut session = EditorSession::new(snapshot);

    assert_land_command_rejects_dungeon(&mut session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateDungeonMapPrimitive {
                identity: StableId("dungeon:0".into()),
                x: 12,
                y: 7,
                primitive: crate::codecs::DungeonPrimitive::VerticalDoor,
                enabled: true,
            },
        })
        .expect("edit one writer-safe dungeon primitive");
    let changed = session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12];
    let profile = crate::codecs::decode_dungeon_cell(changed);
    assert!(profile.vertical_door);
    assert!(profile.wall);
    assert!(profile.note_marker);
    assert_eq!(
        profile.preserved_high_sign_bits,
        crate::codecs::DUNGEON_PRESERVED_HIGH_SIGN_MASK
    );

    assert_note_marker_remains_workflow_owned(&mut session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo dungeon primitive edit");
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12],
        raw
    );
}

#[test]
fn negative_land_cells_are_typed_references_to_normalized_cicn_assets() {
    let mut snapshot = sample_snapshot();
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[7 * CLASSIC_MAP_SIZE + 12] = -1091;
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Ashen Coast".into(),
        tiles,
        runtime: None,
    });
    let mut session = EditorSession::new(snapshot);
    assert_missing_special_land_reference(&session);

    let asset = special_land_asset();
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertAsset {
                asset: Box::new(asset.clone()),
            },
        })
        .expect("import missing special land tile");
    let resolved = projection
        .reference_changes
        .iter()
        .find(|reference| reference.target_kind == TargetKind::SpecialLandTile)
        .expect("asset import must return the affected map reference");
    assert_eq!(resolved.resolution, ResolutionState::Resolved);
    assert_eq!(resolved.target_id, "-91");

    let mut renumbered = asset;
    renumbered
        .classic_resource
        .as_mut()
        .expect("Special Land resource")
        .resource_id = -92;
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpsertAsset {
                asset: Box::new(renumbered),
            },
        })
        .expect("renumber Special Land Tile without changing its stable identity");
    let missing = projection
        .reference_changes
        .iter()
        .find(|reference| reference.target_kind == TargetKind::SpecialLandTile)
        .expect("resource ID edit must return the newly dangling map reference");
    assert_eq!(missing.resolution, ResolutionState::Missing);
    assert_eq!(missing.target_id, "-91");
}

fn marked_land_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("land-paint".into()));
    let mut map = new_map_level(LevelType::Land, 0, None);
    map.tiles[CLASSIC_MAP_SIZE + 1] = 1112;
    map.tiles[CLASSIC_MAP_SIZE * 2 + 2] = 2112;
    map.tiles[CLASSIC_MAP_SIZE * 3 + 3] = 3112;
    map.tiles[CLASSIC_MAP_SIZE * 4 + 4] = (0x6000_u16 | 1112) as i16;
    snapshot.world.maps.push(map);
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 0,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot
}

fn marker_paint_gesture() -> Vec<LandMapCellPaint> {
    vec![
        LandMapCellPaint {
            x: 1,
            y: 1,
            tile: 90,
        },
        LandMapCellPaint {
            x: 2,
            y: 2,
            tile: 90,
        },
        LandMapCellPaint {
            x: 3,
            y: 3,
            tile: 90,
        },
        LandMapCellPaint {
            x: 4,
            y: 4,
            tile: (0x6000_u16 | 90) as i16,
        },
    ]
}

fn assert_land_command_rejects_dungeon(session: &mut EditorSession) {
    let wrong_owner = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateLandMapCell {
                identity: StableId("dungeon:0".into()),
                x: 12,
                y: 7,
                tile: 0,
            },
        })
        .expect_err("land command must not overwrite a dungeon bitfield");
    assert!(matches!(
        wrong_owner,
        SessionError::InvalidMapKind {
            expected: LevelType::Land,
            ..
        }
    ));
    assert_eq!(session.revision(), Revision(0));
}

fn assert_note_marker_remains_workflow_owned(session: &mut EditorSession) {
    let routed = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpdateDungeonMapPrimitive {
                identity: StableId("dungeon:0".into()),
                x: 12,
                y: 7,
                primitive: crate::codecs::DungeonPrimitive::NoteMarker,
                enabled: false,
            },
        })
        .expect_err("note markers must remain note-workflow owned");
    assert!(matches!(
        routed,
        SessionError::InvalidDungeonPrimitive {
            primitive: crate::codecs::DungeonPrimitive::NoteMarker,
            ..
        }
    ));
    assert_eq!(session.revision(), Revision(1));
}

fn special_land_asset() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("special-land.-91".into()),
        label: "Western Moon Gate".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -91,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 64,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
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
        landlook: Some(0),
        base_tile: Some(7),
        source: "controlled tile fixture".into(),
    }
}

fn assert_missing_special_land_reference(session: &EditorSession) {
    let missing = session
        .references()
        .into_iter()
        .find(|reference| reference.target_kind == TargetKind::SpecialLandTile)
        .expect("negative map word must create a typed resource reference");
    assert_eq!(missing.source, StableId("land:0".into()));
    assert_eq!(missing.field, FieldPath("tiles[7][12].specialLand".into()));
    assert_eq!(missing.target_id, "-91");
    assert_eq!(missing.resolution, ResolutionState::Missing);
    assert_eq!(
        missing.repair_actions,
        [RepairAction::ImportTarget, RepairAction::Retarget]
    );
    assert_eq!(
        missing.byte_provenance,
        Some(ByteProvenance {
            native_path: "Data LD".into(),
            record_index: 0,
            byte_start: 2174,
            byte_end: 2176,
        })
    );
}
