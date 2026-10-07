use super::action_step_fixtures::*;
use super::*;

#[test]
fn placed_steps_apply_move_duplicate_and_clear_without_replacing_the_record() {
    let mut session = EditorSession::new(placed_snapshot());
    let identity = StableId("action-point:land:0:0".into());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: identity.clone(),
                    slot: 2,
                    action_identity: "realmz.action.1".into(),
                    gosub: false,
                    target_native_id: 1,
                    settings: None,
                },
            },
        })
        .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::MoveActionPointStep {
                source: identity.clone(),
                from_slot: 2,
                to_slot: 3,
            },
        })
        .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::DuplicateActionPointStep {
                source: identity.clone(),
                from_slot: 3,
                to_slot: 4,
            },
        })
        .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::ClearActionPointStep {
                source: identity,
                slot: 3,
            },
        })
        .unwrap();
    let row = &session.snapshot().world.action_points[0];
    assert!(
        row.actions
            .iter()
            .any(|action| action.slot == 4 && action.raw_opcode == 1)
    );
    assert!(
        row.actions
            .iter()
            .any(|action| action.slot == 7 && action.target_native_id == 44)
    );
    assert!(!row.actions.iter().any(|action| action.slot == 3));
}

#[test]
fn record_draft_rejects_a_combat_only_action_without_partial_mutation() {
    let snapshot = placed_snapshot();
    let before = snapshot.clone();
    let mut session = EditorSession::new(snapshot);

    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointDraft {
                draft: ActionPointRecordDraft {
                    source: StableId("action-point:land:0:0".into()),
                    descriptor: String::new(),
                    header: header(),
                    steps: vec![ActionStepDraft {
                        slot: 0,
                        action_identity: "realmz.action.120".into(),
                        gosub: false,
                        target_native_id: 0,
                        settings: None,
                    }],
                },
            },
        })
        .unwrap_err();

    assert!(error.to_string().contains("battle or monster macro"));
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn new_typed_step_uses_core_allocation_and_zeroes_inactive_words() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: [1, 2, -7, -8, -9],
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: StableId("action-point:land:0:0".into()),
                    slot: 1,
                    action_identity: "realmz.action.19".into(),
                    gosub: false,
                    target_native_id: 12,
                    settings: Some(TypedActionSettings {
                        values: typed(&[("messageLow", -4), ("messageHigh", 9)]),
                        secondary_values: None,
                        allow_shared_updates: false,
                        scope: ActionSettingsWriteScope::Isolate,
                    }),
                },
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().extra_codes[0].values, [-4, 9, 0, 0, 0]);
    let action = session.snapshot().world.action_points[0]
        .actions
        .iter()
        .find(|action| action.slot == 1)
        .unwrap();
    assert_eq!(action.raw_opcode, 19);
    assert_eq!(action.target_native_id, 0);
    assert_eq!(session.snapshot().extra_codes[1].values, [1, 2, -7, -8, -9]);
}

#[test]
fn direct_action_rejects_new_gosub_semantics() {
    let snapshot = placed_snapshot();
    let before = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: StableId("action-point:land:0:0".into()),
                    slot: 0,
                    action_identity: "realmz.action.1".into(),
                    gosub: true,
                    target_native_id: 1,
                    settings: None,
                },
            },
        })
        .unwrap_err();
    assert!(
        error
            .to_string()
            .contains("does not support GOSUB return behavior")
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn unchanged_imported_negative_direct_action_preserves_its_raw_opcode() {
    let mut snapshot = placed_snapshot();
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 0,
        raw_opcode: -1,
        target_native_id: 42,
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: StableId("action-point:land:0:0".into()),
                    slot: 0,
                    action_identity: "realmz.action.1".into(),
                    gosub: true,
                    target_native_id: 42,
                    settings: None,
                },
            },
        })
        .unwrap();
    let action = session.snapshot().world.action_points[0]
        .actions
        .iter()
        .find(|action| action.slot == 0)
        .unwrap();
    assert_eq!(action.raw_opcode, -1);
}

#[test]
fn existing_typed_step_preserves_its_reference_and_inactive_words() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: [1, 2, -7, -8, -9],
    });
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 1,
        raw_opcode: 19,
        target_native_id: 12,
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: StableId("action-point:land:0:0".into()),
                    slot: 1,
                    action_identity: "realmz.action.19".into(),
                    gosub: false,
                    target_native_id: 3,
                    settings: Some(TypedActionSettings {
                        values: typed(&[("messageLow", 8), ("messageHigh", 9)]),
                        secondary_values: None,
                        allow_shared_updates: false,
                        scope: Default::default(),
                    }),
                },
            },
        })
        .unwrap();
    let action = session.snapshot().world.action_points[0]
        .actions
        .iter()
        .find(|action| action.slot == 1)
        .unwrap();
    assert_eq!(
        action.target_native_id, 12,
        "the client row hint is not authority"
    );
    assert_eq!(session.snapshot().extra_codes[0].values, [8, 9, -7, -8, -9]);
}

#[test]
fn new_single_step_never_allocates_a_referenced_zero_row() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(0),
        values: [0; 5],
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: -1,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 19,
            target_native_id: 0,
        }],
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: StableId("action-point:land:0:0".into()),
                    slot: 1,
                    action_identity: "realmz.action.19".into(),
                    gosub: false,
                    target_native_id: 0,
                    settings: Some(TypedActionSettings {
                        values: typed(&[("messageLow", 8), ("messageHigh", 9)]),
                        secondary_values: None,
                        allow_shared_updates: false,
                        scope: Default::default(),
                    }),
                },
            },
        })
        .unwrap();
    let created = session.snapshot().world.action_points[0]
        .actions
        .iter()
        .find(|action| action.slot == 1)
        .unwrap();
    assert_eq!(created.target_native_id, 1);
    assert_eq!(session.snapshot().extra_codes[0].values, [0; 5]);
}

#[test]
fn direct_opcode_change_allocates_without_reinterpreting_the_old_row() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: [1, 2, -7, -8, -9],
    });
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 1,
        raw_opcode: 19,
        target_native_id: 12,
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: StableId("action-point:land:0:0".into()),
                    slot: 1,
                    action_identity: "realmz.action.2".into(),
                    gosub: false,
                    target_native_id: 12,
                    settings: Some(TypedActionSettings {
                        values: typed(&[
                            ("battleLow", 3),
                            ("battleHigh", 0),
                            ("soundOrReviveLossMacro", 0),
                            ("message", 0),
                            ("revivePartyFlag", 0),
                        ]),
                        secondary_values: None,
                        allow_shared_updates: false,
                        scope: Default::default(),
                    }),
                },
            },
        })
        .unwrap();
    assert_eq!(
        session.snapshot().world.action_points[0].actions[0].target_native_id,
        0
    );
    assert_eq!(session.snapshot().extra_codes[0].values, [3, 0, 0, 0, 0]);
    assert_eq!(session.snapshot().extra_codes[1].values, [1, 2, -7, -8, -9]);
}

#[test]
fn shared_settings_edit_only_the_selected_action() {
    let before = shared_random_message_snapshot();
    let mut session = EditorSession::new(before.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: before.world.action_points[0].identity.clone(),
                    slot: 1,
                    action_identity: "realmz.action.19".into(),
                    gosub: false,
                    target_native_id: 12,
                    settings: Some(TypedActionSettings {
                        values: typed(&[("messageLow", 8), ("messageHigh", 9)]),
                        secondary_values: None,
                        allow_shared_updates: false,
                        scope: ActionSettingsWriteScope::Isolate,
                    }),
                },
            },
        })
        .unwrap();
    assert_eq!(
        session.snapshot().world.action_points[1],
        before.world.action_points[1]
    );
    assert!(
        session
            .snapshot()
            .extra_codes
            .contains(&before.extra_codes[0])
    );
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|r| r.native_id.0 == 0)
            .unwrap()
            .values,
        [8, 9, -7, -8, -9]
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn action_92_requires_and_commits_its_companion_row_once() {
    let mut session = EditorSession::new(placed_snapshot());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointStep {
                edit: ActionStepEdit {
                    source: StableId("action-point:land:0:0".into()),
                    slot: 0,
                    action_identity: "realmz.action.92".into(),
                    gosub: false,
                    target_native_id: 20,
                    settings: Some(TypedActionSettings {
                        values: typed(&[
                            ("level", 0),
                            ("rect", 2),
                            ("isDungeon", 0),
                            ("percentDelta", -250),
                            ("shapeMode", 2),
                        ]),
                        secondary_values: Some(typed(&[
                            ("shapeX1", -2),
                            ("shapeY1", 3),
                            ("shapeX2", 4),
                            ("shapeY2", -5),
                        ])),
                        allow_shared_updates: false,
                        scope: ActionSettingsWriteScope::Isolate,
                    }),
                },
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().extra_codes.len(), 2);
    assert_eq!(session.snapshot().extra_codes[0].values, [0, 2, 0, -250, 2]);
    assert_eq!(session.snapshot().extra_codes[1].values, [-2, 3, 4, -5, 0]);
    assert_eq!(
        session.snapshot().world.action_points[0].actions[0].target_native_id,
        0
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert!(session.snapshot().extra_codes.is_empty());
    assert!(
        !session.snapshot().world.action_points[0]
            .actions
            .iter()
            .any(|action| action.slot == 0)
    );
}

#[test]
fn extra_action_lifecycle_reuses_tombstones_and_keeps_dangling_uses() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_action_points = vec![
        crate::session::extra_action_point_commands::blank_extra_action_point(0),
        ExtraActionPoint {
            identity: StableId("extra-action-point:1".into()),
            native_id: NativeRecordId(1),
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
        },
    ];
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 3,
        raw_opcode: 39,
        target_native_id: 1,
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::DuplicateExtraActionPoint {
                source: StableId("extra-action-point:1".into()),
                native_id: None,
            },
        })
        .unwrap();
    assert_eq!(
        session.snapshot().extra_action_points[0].chance_percent,
        100
    );
    assert_eq!(
        session.snapshot().extra_action_points[0].actions[0].target_native_id,
        1
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::DeleteExtraActionPoint {
                source: StableId("extra-action-point:1".into()),
            },
        })
        .unwrap();
    assert!(session.snapshot().extra_action_points[1].actions.is_empty());
    assert!(session.references().iter().any(|reference| {
        reference.source.0 == "action-point:land:0:0"
            && reference.target_kind == TargetKind::ExtraActionPoint
            && reference.resolution == ResolutionState::Missing
    }));
}
