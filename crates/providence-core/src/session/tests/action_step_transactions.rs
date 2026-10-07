use super::action_step_fixtures::*;
use super::*;

#[test]
fn record_draft_commits_header_and_multiple_steps_as_one_undo_entry() {
    let mut session = EditorSession::new(placed_snapshot());
    let source = StableId("action-point:land:0:0".into());
    let mut changed_header = header();
    changed_header.coordinate = Some(MapCoordinate { x: 2, y: 2 });
    changed_header.post_action_x = 3;
    changed_header.post_action_y = 4;
    changed_header.chance_percent = 75;
    let change = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointDraft {
                draft: ActionPointRecordDraft {
                    source: source.clone(),
                    descriptor: String::new(),
                    header: changed_header,
                    steps: vec![
                        ActionStepDraft {
                            slot: 0,
                            action_identity: "realmz.action.1".into(),
                            gosub: false,
                            target_native_id: 1,
                            settings: None,
                        },
                        random_message_step(1, 1, 4, ActionSettingsWriteScope::Isolate),
                    ],
                },
            },
        })
        .unwrap();
    assert_eq!(change.revision, Revision(1));
    let row = &session.snapshot().world.action_points[0];
    assert_eq!(row.coordinate, Some(MapCoordinate { x: 2, y: 2 }));
    assert_eq!(row.classic_door_id, 202);
    assert_eq!(row.chance_percent, 75);
    assert_eq!(row.actions.len(), 2);
    let settings_id = row
        .actions
        .iter()
        .find(|step| step.slot == 1)
        .unwrap()
        .target_native_id;
    assert_eq!(
        settings_id, 0,
        "the core, not the draft's row hint, allocates settings"
    );
    assert_eq!(session.snapshot().extra_codes[0].values, [1, 4, 0, 0, 0]);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &placed_snapshot());
}

#[test]
fn ordinary_record_draft_isolates_shared_settings_and_preserves_unused_words() {
    let mut session = EditorSession::new(shared_random_message_snapshot());
    apply_action_draft(
        &mut session,
        vec![random_message_step(
            1,
            8,
            9,
            ActionSettingsWriteScope::Isolate,
        )],
    )
    .unwrap();
    let selected = &session.snapshot().world.action_points[0].actions[0];
    let other = &session.snapshot().world.action_points[1].actions[0];
    assert_eq!(selected.target_native_id, 0);
    assert_eq!(other.target_native_id, 12);
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == 0)
            .unwrap()
            .values,
        [8, 9, -7, -8, -9]
    );
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == 12)
            .unwrap()
            .values,
        [1, 2, -7, -8, -9]
    );
}

#[test]
fn shared_update_is_rejected_even_with_complete_confirmation() {
    for confirmed_callers in [
        vec![],
        vec![ActionSettingsCallerConfirmation {
            source: StableId("action-point:land:0:1".into()),
            slot: 2,
        }],
    ] {
        let before = shared_random_message_snapshot();
        let mut session = EditorSession::new(before.clone());
        let error = apply_action_draft(
            &mut session,
            vec![random_message_step(
                1,
                8,
                9,
                ActionSettingsWriteScope::UpdateAllCompatible { confirmed_callers },
            )],
        )
        .unwrap_err();
        assert!(
            error
                .to_string()
                .contains("legacy shared-write request is unsupported")
        );
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision(), Revision(0));
    }
}

#[test]
fn changing_action_kind_allocates_new_settings_instead_of_reinterpreting_old_row() {
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
    let battle = ActionStepDraft {
        slot: 1,
        action_identity: "realmz.action.2".into(),
        gosub: false,
        target_native_id: 12,
        settings: Some(ActionStepDraftSettings {
            values: typed(&[
                ("battleLow", 3),
                ("battleHigh", 0),
                ("soundOrReviveLossMacro", 0),
                ("message", 0),
                ("revivePartyFlag", 0),
            ]),
            secondary_values: None,
            scope: ActionSettingsWriteScope::Isolate,
        }),
    };
    apply_action_draft(&mut session, vec![battle]).unwrap();
    assert_eq!(
        session.snapshot().world.action_points[0].actions[0].target_native_id,
        0
    );
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == 0)
            .unwrap()
            .values,
        [3, 0, 0, 0, 0]
    );
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == 12)
            .unwrap()
            .values,
        [1, 2, -7, -8, -9]
    );
}

#[test]
fn paired_settings_allocation_exhaustion_rejects_the_whole_record_before_mutation() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes = (0..=i16::MAX as u32 + 1)
        .step_by(2)
        .map(|native_id| ExtraCodeRow {
            native_id: NativeRecordId(native_id),
            values: [1; 5],
        })
        .collect();
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
                        action_identity: "realmz.action.92".into(),
                        gosub: false,
                        target_native_id: 0,
                        settings: Some(ActionStepDraftSettings {
                            values: typed(&[
                                ("level", 0),
                                ("rect", 0),
                                ("isDungeon", 0),
                                ("percentDelta", 0),
                                ("shapeMode", 0),
                            ]),
                            secondary_values: Some(typed(&[
                                ("shapeX1", 0),
                                ("shapeY1", 0),
                                ("shapeX2", 1),
                                ("shapeY2", 1),
                            ])),
                            scope: ActionSettingsWriteScope::Isolate,
                        }),
                    }],
                },
            },
        })
        .unwrap_err();
    assert!(error.to_string().contains("no contiguous pair"));
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn clear_retains_nonzero_settings_and_recreation_allocates_elsewhere() {
    let mut session = EditorSession::new(shared_random_message_snapshot());
    let retained = session.snapshot().extra_codes.clone();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ClearActionPoint {
                source: StableId("action-point:land:0:0".into()),
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().extra_codes, retained);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplyActionPointDraft {
                draft: ActionPointRecordDraft {
                    source: StableId("action-point:land:0:0".into()),
                    descriptor: String::new(),
                    header: header(),
                    steps: vec![random_message_step(
                        0,
                        8,
                        9,
                        ActionSettingsWriteScope::Isolate,
                    )],
                },
            },
        })
        .unwrap();
    let action = &session.snapshot().world.action_points[0].actions[0];
    assert_eq!(action.target_native_id, 0);
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == 12)
            .unwrap()
            .values,
        [1, 2, -7, -8, -9]
    );
}
