use super::*;

#[test]
fn dungeon_action_points_and_random_rectangles_are_bounded_typed_and_repairable() {
    let snapshot = dungeon_door_repair_snapshot();
    let mut session = EditorSession::new(snapshot);

    assert_dungeon_door_provenance(&session);
    repair_dungeon_action_and_random_doors(&mut session);
    let allocated = signed_outside_map_rectangle();
    assert_inverted_rectangle_rejected(&mut session, &allocated);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::UpsertMapRandomRectangle {
                map: StableId("dungeon:0".into()),
                rectangle: Box::new(allocated),
            },
        })
        .expect("allocate a stable random-region slot");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(4),
            command: EditorCommand::RemoveMapRandomRectangle {
                map: StableId("dungeon:0".into()),
                slot: 3,
            },
        })
        .expect("remove one random-region slot");
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles
            .len(),
        1
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(5),
            command: EditorCommand::Undo,
        })
        .expect("undo random-region removal");
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles
            .len(),
        2
    );
}

#[test]
fn random_rectangle_runtime_references_are_typed_provenanced_and_sign_preserving() {
    let snapshot = signed_random_links_snapshot();
    let mut session = EditorSession::new(snapshot);

    assert_signed_random_link_provenance(&session);
    let range_repair = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetRandomRectangleBattleRange {
                source: StableId("dungeon:0:rect:2".into()),
                low_id: 2,
                high_id: 2,
            },
        })
        .expect("repair both signed Battle-range endpoints atomically");
    assert_eq!(
        range_repair.changed_entities,
        [
            StableId("dungeon:0".into()),
            StableId("dungeon:0:rect:2".into())
        ]
    );
    for (revision, field, target) in [(1, "text", 1), (2, "sound", 83)] {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(revision),
                command: EditorCommand::RetargetRandomRectangleReference {
                    source: StableId("dungeon:0:rect:2".into()),
                    field: field.into(),
                    target_native_id: target,
                },
            })
            .unwrap_or_else(|error| panic!("repair {field}: {error}"));
    }
    let rectangle = &session.snapshot().world.maps[0]
        .runtime
        .as_ref()
        .unwrap()
        .random_rectangles[0];
    assert_eq!(rectangle.battle_range, [-2, -2]);
    assert_eq!(rectangle.text_id, -1);
    assert_eq!(rectangle.sound_id, -83);
    assert!(session.references().iter().all(|reference| !matches!(
        reference.resolution,
        ResolutionState::Missing | ResolutionState::Ambiguous
    )));

    assert_signed_sound_repair_history(&mut session);
}

fn dungeon_with_missing_random_door() -> MapLevel {
    MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Ashen Vault".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "Data RDD".into(),
            source_blob: None,
            dark: true,
            uses_los: true,
            landlook: Some(-1),
            base_scale: None,
            tileset_id: StableId("dungeon-top-down-302".into()),
            base_tile: None,
            random_rectangles: vec![RandomRectangle {
                identity: StableId("dungeon:0:rect:2".into()),
                top: 3,
                left: 4,
                bottom: 8,
                right: 9,
                chance_ten_thousand: 750,
                battle_range: [0; 2],
                random_doors: [99, 0, 0],
                random_door_percent: [25, 0, 0],
                only: false,
                option: 0,
                sound_id: 0,
                text_id: 0,
            }],
        }),
    }
}

fn dungeon_door_repair_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-workflow".into()));
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:1".into()),
        native_id: NativeRecordId(1),
        actions: Vec::new(),
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot.world.maps.push(dungeon_with_missing_random_door());
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:dungeon:0:7".into()),
        level_type: LevelType::Dungeon,
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
            raw_opcode: 4,
            target_native_id: 99,
        }],
    });
    snapshot
}

fn signed_random_links_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("random-runtime-links".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:1".into()),
        native_id: NativeRecordId(1),
        text: "The vault answers.".into(),
        authored: true,
    });
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:2".into()),
        native_id: NativeRecordId(2),
        grid: vec![0; BATTLE_GRID_SLOTS],
        distance: 0,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    snapshot.world.maps.push(MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Ashen Vault".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "Data RDD".into(),
            source_blob: None,
            dark: true,
            uses_los: true,
            landlook: Some(-1),
            base_scale: None,
            tileset_id: StableId("dungeon-top-down-302".into()),
            base_tile: None,
            random_rectangles: vec![RandomRectangle {
                identity: StableId("dungeon:0:rect:2".into()),
                top: 3,
                left: 4,
                bottom: 8,
                right: 9,
                chance_ten_thousand: 750,
                battle_range: [-99, -99],
                random_doors: [0; 3],
                random_door_percent: [0; 3],
                only: false,
                option: 0,
                sound_id: -82,
                text_id: -99,
            }],
        }),
    });
    snapshot
}

fn assert_dungeon_door_provenance(session: &EditorSession) {
    let references = session.references();
    let action = references
        .iter()
        .find(|reference| reference.source.0 == "action-point:dungeon:0:7")
        .expect("dungeon Action Point reference");
    assert_eq!(action.target_kind, TargetKind::SimpleEncounter);
    assert_eq!(action.resolution, ResolutionState::Missing);
    let provenance = action.byte_provenance.as_ref().unwrap();
    assert_eq!(provenance.native_path, "Data DDD");
    assert_eq!(provenance.record_index, 7);
    assert_eq!(provenance.byte_start, 304);
    let random_door = references
        .iter()
        .find(|reference| reference.source.0 == "dungeon:0:rect:2")
        .expect("random-door reference");
    assert_eq!(random_door.target_kind, TargetKind::ExtraActionPoint);
    assert_eq!(random_door.resolution, ResolutionState::Missing);
    let provenance = random_door.byte_provenance.as_ref().unwrap();
    assert_eq!(provenance.native_path, "Data RDD");
    assert_eq!(provenance.byte_start, 292);
}

fn repair_dungeon_action_and_random_doors(session: &mut EditorSession) {
    let mut edited = session.snapshot().world.action_points[0].clone();
    edited.chance_percent = 75;
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateActionPoint {
                action_point: Box::new(edited),
            },
        })
        .expect("edit one fixed Data DDD row");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetActionReference {
                source: StableId("action-point:dungeon:0:7".into()),
                slot: 0,
                target_native_id: 1,
            },
        })
        .expect("repair dungeon Action Point encounter target");
    let repaired = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::RetargetRandomRectangleDoor {
                source: StableId("dungeon:0:rect:2".into()),
                door_slot: 0,
                target_native_id: 1,
            },
        })
        .expect("repair random-door Extra Action Point target");
    assert!(repaired.affected_diagnostics.is_empty());
    assert!(
        session
            .references()
            .iter()
            .filter(|reference| matches!(
                reference.source.0.as_str(),
                "action-point:dungeon:0:7" | "dungeon:0:rect:2"
            ))
            .all(|reference| reference.resolution == ResolutionState::Resolved)
    );
}

fn assert_signed_random_link_provenance(session: &EditorSession) {
    let references = session.references();
    for (field, kind, offset, resolution) in [
        (
            "battleRange[0]",
            TargetKind::Battle,
            208,
            ResolutionState::Missing,
        ),
        (
            "battleRange[1]",
            TargetKind::Battle,
            210,
            ResolutionState::Missing,
        ),
        (
            "sound",
            TargetKind::Sound,
            568,
            ResolutionState::StockFallback,
        ),
        ("text", TargetKind::Message, 608, ResolutionState::Missing),
    ] {
        let reference = references
            .iter()
            .find(|reference| reference.field.0 == field)
            .unwrap_or_else(|| panic!("missing {field} reference"));
        assert_eq!(reference.target_kind, kind);
        assert_eq!(reference.resolution, resolution);
        let provenance = reference.byte_provenance.as_ref().unwrap();
        assert_eq!(provenance.native_path, "Data RDD");
        assert_eq!(provenance.byte_start, offset);
        assert_eq!(provenance.byte_end, offset + 2);
    }
}

fn assert_signed_sound_repair_history(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::Undo,
        })
        .expect("undo signed sound repair");
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0]
            .sound_id,
        -82
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(4),
            command: EditorCommand::Redo,
        })
        .expect("redo signed sound repair");
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles[0]
            .sound_id,
        -83
    );
}

fn signed_outside_map_rectangle() -> RandomRectangle {
    RandomRectangle {
        identity: StableId("dungeon:0:rect:3".into()),
        top: -7,
        left: -23,
        bottom: 90,
        right: 99,
        chance_ten_thousand: 500,
        battle_range: [0; 2],
        random_doors: [0; 3],
        random_door_percent: [0; 3],
        only: false,
        option: 0,
        sound_id: 0,
        text_id: 0,
    }
}

fn assert_inverted_rectangle_rejected(session: &mut EditorSession, allocated: &RandomRectangle) {
    let mut invalid = allocated.clone();
    invalid.bottom = -8;
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::UpsertMapRandomRectangle {
                map: StableId("dungeon:0".into()),
                rectangle: Box::new(invalid),
            },
        }),
        Err(SessionError::InvalidRandomRectangle { .. })
    ));
    assert_eq!(session.revision(), Revision(3));
}
