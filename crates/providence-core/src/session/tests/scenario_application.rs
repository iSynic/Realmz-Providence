use super::*;

#[test]
fn scenario_application_is_revisioned_and_exposes_typed_hook_references() {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:5".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 5,
        classic_door_id: 0,
        coordinate: Some(crate::model::MapCoordinate { x: 2, y: 7 }),
        post_action_level: 0,
        post_action_x: 2,
        post_action_y: 7,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 1,
        }],
    });
    let mut session = EditorSession::new(snapshot);
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetScenarioApplication {
                contract: crate::model::ScenarioApplicationContract {
                    hooks: crate::model::ScenarioApplicationHooks {
                        start_game: Some(StableId("trigger:action-point:land:0:5".into())),
                        ..Default::default()
                    },
                },
            },
        })
        .expect("set scenario application");

    assert_eq!(projection.changed_entities, [StableId("fixture".into())]);
    let reference = session
        .references()
        .into_iter()
        .find(|reference| reference.target_kind == TargetKind::ScenarioProgram)
        .expect("typed application hook reference");
    assert_eq!(reference.resolution, ResolutionState::Resolved);
    assert_eq!(reference.field.0, "scenarioApplication.hooks.startGame");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo application contract");
    assert!(session.snapshot().scenario_application.is_none());
}

#[test]
fn global_macro_hook_update_is_narrow_byte_provenanced_and_undoable() {
    let snapshot = snapshot_with_global_hook_target();
    let mut session = EditorSession::new(snapshot);
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetGlobalMacroHook {
                hook: GlobalMacroHook::Start,
                target: Some(StableId("extra-action-point:7".into())),
            },
        })
        .expect("set one Global hook");
    assert_eq!(projection.changed_entities, [StableId("fixture".into())]);
    let reference = projection
        .reference_changes
        .iter()
        .find(|reference| reference.field.0 == "scenarioApplication.hooks.startGame")
        .expect("changed Global hook reference");
    assert_eq!(reference.target_kind, TargetKind::ExtraActionPoint);
    assert_eq!(reference.target_id, "7");
    assert_eq!(reference.resolution, ResolutionState::Resolved);
    assert_eq!(
        reference.byte_provenance,
        Some(ByteProvenance {
            native_path: "Global".into(),
            record_index: 0,
            byte_start: 0,
            byte_end: 2,
        })
    );
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::SetGlobalMacroHook {
                hook: GlobalMacroHook::Death,
                target: Some(StableId("trigger:action-point:land:0:5".into())),
            },
        }),
        Err(SessionError::InvalidGlobalMacroTarget(_))
    ));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo Global hook");
    assert!(session.snapshot().scenario_application.is_none());
}

fn snapshot_with_global_hook_target() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:7".into()),
        native_id: NativeRecordId(7),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 1,
        }],
    });
    snapshot
}
