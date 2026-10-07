use super::*;

#[test]
fn placed_action_point_reference_repair_is_typed_and_byte_provenanced() {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.clear();
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:7".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 7,
        classic_door_id: 712,
        coordinate: Some(crate::model::MapCoordinate { x: 12, y: 7 }),
        post_action_level: 0,
        post_action_x: 12,
        post_action_y: 7,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 3,
            raw_opcode: 1,
            target_native_id: 99,
        }],
    });
    let mut session = EditorSession::new(snapshot);
    let missing = &session.references()[0];
    assert_eq!(missing.target_kind, TargetKind::Message);
    assert_eq!(missing.resolution, ResolutionState::Missing);
    assert_eq!(
        missing.byte_provenance.as_ref().unwrap().native_path,
        "Data DD"
    );
    assert_eq!(missing.byte_provenance.as_ref().unwrap().byte_start, 310);

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetActionReference {
                source: StableId("action-point:land:0:7".into()),
                slot: 3,
                target_native_id: 1,
            },
        })
        .expect("repair action target");
    assert!(projection.affected_diagnostics.is_empty());
    assert_eq!(
        projection.reference_changes[0].resolution,
        ResolutionState::Resolved
    );
}

#[test]
fn scrolling_text_actions_use_signed_resource_ids_and_exact_byte_provenance() {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.clear();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 2,
            raw_opcode: 62,
            target_native_id: -201,
        }],
    });
    let mut session = EditorSession::new(snapshot);
    let missing = session
        .references()
        .into_iter()
        .find(|reference| reference.source.0 == "extra-action-point:0")
        .expect("scrolling-text reference");
    assert_eq!(missing.target_kind, TargetKind::TextResource);
    assert_eq!(missing.target_id, "-201");
    assert_eq!(missing.resolution, ResolutionState::Missing);
    assert_eq!(
        missing.byte_provenance,
        Some(ByteProvenance {
            native_path: "Data ED3".into(),
            record_index: 0,
            byte_start: 28,
            byte_end: 30,
        })
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertAsset {
                asset: Box::new(scrolling_text_asset()),
            },
        })
        .expect("add exact TEXT resource");
    let resolved = session
        .references()
        .into_iter()
        .find(|reference| reference.source.0 == "extra-action-point:0")
        .expect("resolved scrolling-text reference");
    assert_eq!(resolved.resolution, ResolutionState::Resolved);
}

#[test]
fn action_point_update_is_identity_preserving_collision_checked_and_undoable() {
    let snapshot = adjacent_action_points_snapshot();
    let mut session = EditorSession::new(snapshot);
    let mut edited = session.snapshot().world.action_points[0].clone();
    edited.classic_door_id = 714;
    edited.coordinate = Some(crate::model::MapCoordinate { x: 14, y: 7 });
    edited.chance_percent = 75;

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateActionPoint {
                action_point: Box::new(edited),
            },
        })
        .expect("update one fixed Data DD row");
    assert_eq!(projection.revision, Revision(1));
    assert_eq!(
        projection.changed_entities,
        [
            StableId("action-point:land:0:7".into()),
            StableId("land:0".into())
        ]
    );
    assert_eq!(session.snapshot().world.action_points[0].chance_percent, 75);
    assert_eq!(
        session.snapshot().world.action_points[0].coordinate,
        Some(crate::model::MapCoordinate { x: 14, y: 7 })
    );
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12],
        112
    );
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 14],
        1000
    );

    assert_action_point_collision_rejected(&mut session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo Action Point update");
    assert_eq!(
        session.snapshot().world.action_points[0].chance_percent,
        100
    );
    assert_eq!(
        session.snapshot().world.action_points[0].classic_door_id,
        712
    );
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12],
        1112
    );
}

#[test]
fn action_point_create_duplicate_clear_and_history_keep_fixed_slots_and_map_markers_in_sync() {
    let snapshot = action_point_placeholders_snapshot();
    let mut session = EditorSession::new(snapshot);

    assert_creation_reuses_lowest_placeholder(&mut session);

    assert_duplication_uses_next_slot_and_copies_actions(&mut session);

    let cleared = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::ClearActionPoint {
                source: StableId("action-point:land:0:0".into()),
            },
        })
        .expect("clear one fixed row without shifting identities");
    assert_eq!(
        cleared.changed_entities,
        [
            StableId("action-point:land:0:0".into()),
            StableId("land:0".into())
        ]
    );
    assert!(action_point_is_reusable(
        &session.snapshot().world.action_points[0]
    ));
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12],
        112
    );
    assert!(
        !session
            .references()
            .iter()
            .any(|reference| { reference.source == StableId("action-point:land:0:0".into()) })
    );

    assert_cleared_row_history_restores_its_marker(&mut session);
}

#[test]
fn action_point_creation_refuses_a_full_classic_slot_table() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("full-action-points".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Full Coast".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.world.action_points = (0..ACTION_POINTS_PER_LEVEL)
        .map(|record_index| {
            let packed = record_index as u32 + 1;
            let coordinate = MapCoordinate {
                x: (packed % 90) as u8,
                y: (packed / 90) as u8,
            };
            ActionPoint {
                identity: action_point_identity(LevelType::Land, 0, record_index as u8),
                level_type: LevelType::Land,
                level_index: 0,
                record_index: record_index as u8,
                classic_door_id: i32::from(coordinate.y) * 100 + i32::from(coordinate.x),
                coordinate: Some(coordinate),
                post_action_level: 0,
                post_action_x: coordinate.x,
                post_action_y: coordinate.y,
                chance_percent: 100,
                actions: Vec::new(),
            }
        })
        .collect();
    let mut session = EditorSession::new(snapshot);
    assert!(matches!(
        session.action_point_creation_candidate(&StableId("land:0".into()), MapCoordinate { x:50, y:50 }),
        Err(SessionError::InvalidActionPoint { reason, .. }) if reason.contains("all 100")
    ));
    let result = session.execute(ExpectedRevisionCommand {
        expected_revision: Revision(0),
        command: EditorCommand::CreateActionPoint {
            map: StableId("land:0".into()),
            coordinate: MapCoordinate { x: 50, y: 50 },
        },
    });
    assert!(
        matches!(result, Err(SessionError::InvalidActionPoint { reason, .. }) if reason.contains("all 100"))
    );
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn action_point_creation_review_is_read_only_and_matches_both_map_families() {
    for level_type in [LevelType::Land, LevelType::Dungeon] {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("ap-placement".into()));
        let map = StableId(
            if level_type == LevelType::Land {
                "land:0"
            } else {
                "dungeon:0"
            }
            .into(),
        );
        snapshot.world.maps.push(MapLevel {
            identity: map.clone(),
            level_type,
            native_index: 0,
            name: "Placement".into(),
            tiles: vec![156; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
            runtime: None,
        });
        let mut session = EditorSession::new(snapshot);
        let before = session.snapshot().clone();
        let coordinate = MapCoordinate { x: 17, y: 23 };
        let candidate = session
            .action_point_creation_candidate(&map, coordinate)
            .expect("review placement");
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision(), Revision(0));
        assert!(!session.can_undo());
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::CreateActionPoint {
                    map: map.clone(),
                    coordinate,
                },
            })
            .expect("create reviewed placement");
        assert_eq!(session.snapshot().world.action_points[0], candidate);
        assert!(
            session
                .action_point_creation_candidate(&map, coordinate)
                .is_err()
        );
        assert_eq!(session.revision(), Revision(1));
    }
}

#[test]
fn action_point_marker_failure_does_not_partially_mutate_the_session() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("missing-map".into()));
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 712,
        coordinate: Some(MapCoordinate { x: 12, y: 7 }),
        post_action_level: 0,
        post_action_x: 12,
        post_action_y: 7,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let mut edited = session.snapshot().world.action_points[0].clone();
    edited.classic_door_id = 713;
    edited.coordinate = Some(MapCoordinate { x: 13, y: 7 });
    assert_eq!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateActionPoint {
                action_point: Box::new(edited),
            },
        }),
        Err(SessionError::MapNotFound(StableId("land:0".into())))
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(!session.can_undo());
}

fn scrolling_text_asset() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("classic-resource:TEXT:-201".into()),
        label: "Moon Gate Chronicle".into(),
        kind: "text-resource".into(),
        mime_type: Some("text/plain".into()),
        classic_resource: Some(crate::model::ClassicResourceKey {
            resource_type: "TEXT".into(),
            resource_id: -201,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 9,
        classic_payload_blob: Some(BlobId(format!("sha256:{}", "b".repeat(64)))),
        classic_payload_byte_length: Some(9),
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
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}

fn adjacent_action_points_snapshot() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.clear();
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[7 * CLASSIC_MAP_SIZE + 12] = 1112;
    tiles[7 * CLASSIC_MAP_SIZE + 13] = 1113;
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Lifecycle Coast".into(),
        tiles,
        runtime: None,
    });
    snapshot.world.action_points = vec![
        ActionPoint {
            identity: StableId("action-point:land:0:7".into()),
            level_type: LevelType::Land,
            level_index: 0,
            record_index: 7,
            classic_door_id: 712,
            coordinate: Some(crate::model::MapCoordinate { x: 12, y: 7 }),
            post_action_level: 0,
            post_action_x: 12,
            post_action_y: 7,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 1,
            }],
        },
        ActionPoint {
            identity: StableId("action-point:land:0:8".into()),
            level_type: LevelType::Land,
            level_index: 0,
            record_index: 8,
            classic_door_id: 713,
            coordinate: Some(crate::model::MapCoordinate { x: 13, y: 7 }),
            post_action_level: 0,
            post_action_x: 13,
            post_action_y: 7,
            chance_percent: 100,
            actions: Vec::new(),
        },
    ];
    snapshot
}

fn action_point_placeholders_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("action-point-lifecycle".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:1".into()),
        native_id: NativeRecordId(1),
        text: "The western gate opens.".into(),
        authored: true,
    });
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Lifecycle Coast".into(),
        tiles: vec![112; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.world.action_points = (0..ACTION_POINTS_PER_LEVEL)
        .map(|record_index| ActionPoint {
            identity: action_point_identity(LevelType::Land, 0, record_index as u8),
            level_type: LevelType::Land,
            level_index: 0,
            record_index: record_index as u8,
            classic_door_id: 0,
            coordinate: None,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
            actions: Vec::new(),
        })
        .collect();
    snapshot.world.action_points[0] = ActionPoint {
        identity: action_point_identity(LevelType::Land, 0, 0),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 712,
        coordinate: Some(MapCoordinate { x: 12, y: 7 }),
        post_action_level: 0,
        post_action_x: 12,
        post_action_y: 7,
        chance_percent: 75,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 1,
        }],
    };
    snapshot.world.action_points[1].classic_door_id = -1;
    snapshot.world.action_points[1].chance_percent = 100;
    snapshot.world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12] = 1112;
    snapshot
}

fn assert_creation_reuses_lowest_placeholder(session: &mut EditorSession) {
    let created = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateActionPoint {
                map: StableId("land:0".into()),
                coordinate: MapCoordinate { x: 20, y: 9 },
            },
        })
        .expect("allocate the lowest canonical placeholder");
    assert_eq!(
        created.changed_entities,
        [
            StableId("action-point:land:0:1".into()),
            StableId("land:0".into())
        ]
    );
    assert_eq!(
        session.snapshot().world.action_points[1].classic_door_id,
        920
    );
    assert_eq!(
        session.snapshot().world.action_points[1].chance_percent,
        100
    );
    assert_eq!(
        session.snapshot().world.maps[0].tiles[9 * CLASSIC_MAP_SIZE + 20],
        1112
    );
}

fn assert_duplication_uses_next_slot_and_copies_actions(session: &mut EditorSession) {
    let duplicated = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::DuplicateActionPoint {
                source: StableId("action-point:land:0:0".into()),
                coordinate: MapCoordinate { x: 21, y: 9 },
            },
        })
        .expect("duplicate into the next free slot and explicit destination");
    assert_eq!(
        duplicated.changed_entities,
        [
            StableId("action-point:land:0:2".into()),
            StableId("land:0".into())
        ]
    );
    let duplicate = &session.snapshot().world.action_points[2];
    assert_eq!(duplicate.classic_door_id, 921);
    assert_eq!((duplicate.post_action_x, duplicate.post_action_y), (21, 9));
    assert_eq!(
        duplicate.actions,
        session.snapshot().world.action_points[0].actions
    );
    assert!(session.references().iter().any(|reference| {
        reference.source == duplicate.identity
            && reference.target_kind == TargetKind::Message
            && reference.resolution == ResolutionState::Resolved
    }));
}

fn assert_action_point_collision_rejected(session: &mut EditorSession) {
    let mut collision = session.snapshot().world.action_points[0].clone();
    collision.classic_door_id = 713;
    collision.coordinate = Some(crate::model::MapCoordinate { x: 13, y: 7 });
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpdateActionPoint {
                action_point: Box::new(collision),
            },
        }),
        Err(SessionError::InvalidActionPoint { .. })
    ));
}

fn assert_cleared_row_history_restores_its_marker(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::Undo,
        })
        .expect("undo clear");
    assert_eq!(
        session.snapshot().world.action_points[0].classic_door_id,
        712
    );
    assert_eq!(
        session.snapshot().world.maps[0].tiles[7 * CLASSIC_MAP_SIZE + 12],
        1112
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(4),
            command: EditorCommand::Redo,
        })
        .expect("redo clear");
    assert!(action_point_is_reusable(
        &session.snapshot().world.action_points[0]
    ));
}
