use super::action_step_fixtures::*;
use super::*;

fn caller(source: &str, slot: u8) -> ActionSettingsCallerConfirmation {
    ActionSettingsCallerConfirmation {
        source: StableId(source.into()),
        slot,
    }
}

fn confirmed(callers: Vec<ActionSettingsCallerConfirmation>) -> ActionSettingsWriteScope {
    ActionSettingsWriteScope::UpdateAffected {
        confirmed_callers: callers,
    }
}

fn paired_overlap_snapshot() -> ProjectSnapshot {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes.extend([
        ExtraCodeRow {
            native_id: NativeRecordId(12),
            values: [0, 0, 0, 0, 0],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(13),
            values: [1, 2, 3, 4, 5],
        },
    ]);
    snapshot.world.action_points[0].actions.extend([
        ClassicAction {
            slot: 0,
            raw_opcode: 92,
            target_native_id: 12,
        },
        ClassicAction {
            slot: 1,
            raw_opcode: 19,
            target_native_id: 13,
        },
    ]);
    snapshot
}

fn shape_step(companion: [i16; 4]) -> ActionStepDraft {
    ActionStepDraft {
        slot: 0,
        action_identity: "realmz.action.92".into(),
        gosub: false,
        target_native_id: 12,
        settings: Some(ActionStepDraftSettings {
            values: typed(&[
                ("level", 0),
                ("rect", 0),
                ("isDungeon", 0),
                ("percentDelta", 0),
                ("shapeMode", 0),
            ]),
            secondary_values: Some(typed(&[
                ("shapeX1", companion[0]),
                ("shapeY1", companion[1]),
                ("shapeX2", companion[2]),
                ("shapeY2", companion[3]),
            ])),
            scope: Default::default(),
        }),
    }
}

fn overlap_message_step(low: i16, scope: ActionSettingsWriteScope) -> ActionStepDraft {
    let mut step = random_message_step(1, low, 2, scope);
    step.target_native_id = 13;
    step
}

#[test]
fn default_scope_preserves_references_and_rejects_unconfirmed_effects_atomically() {
    let before = shared_random_message_snapshot();
    let mut session = EditorSession::new(before.clone());
    let error = apply_action_draft(
        &mut session,
        vec![random_message_step(1, 8, 9, Default::default())],
    )
    .unwrap_err();
    assert!(error.to_string().contains("confirm every affected action"));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.undo_history().is_empty());
    apply_action_draft(
        &mut session,
        vec![random_message_step(1, 1, 2, Default::default())],
    )
    .unwrap();
    assert_eq!(session.snapshot().extra_codes, before.extra_codes);
    assert_eq!(
        session.snapshot().world.action_points[0].actions[0].target_native_id,
        12
    );
}

#[test]
fn confirmed_mixed_layout_edit_changes_shared_words_without_repointing() {
    let mut before = shared_random_message_snapshot();
    before.world.action_points[1].actions[0].raw_opcode = 2;
    let mut session = EditorSession::new(before.clone());
    apply_action_draft(
        &mut session,
        vec![random_message_step(
            1,
            8,
            9,
            confirmed(vec![caller("action-point:land:0:1", 2)]),
        )],
    )
    .unwrap();
    assert_eq!(session.snapshot().extra_codes.len(), 1);
    assert_eq!(session.snapshot().extra_codes[0].values, [8, 9, -7, -8, -9]);
    assert_eq!(
        session.snapshot().world.action_points[0].actions[0].target_native_id,
        12
    );
    assert_eq!(
        session.snapshot().world.action_points[1],
        before.world.action_points[1]
    );
}

#[test]
fn confirmation_must_be_complete_exact_and_not_duplicated() {
    for callers in [
        vec![],
        vec![caller("wrong", 2)],
        vec![
            caller("action-point:land:0:1", 2),
            caller("action-point:land:0:1", 2),
        ],
        vec![caller("action-point:land:0:1", 2), caller("wrong", 1)],
    ] {
        let before = shared_random_message_snapshot();
        let mut session = EditorSession::new(before.clone());
        assert!(
            apply_action_draft(
                &mut session,
                vec![random_message_step(1, 8, 9, confirmed(callers))]
            )
            .is_err()
        );
        assert_eq!(session.snapshot(), &before);
        assert!(session.undo_history().is_empty());
    }
}

#[test]
fn unchanged_sibling_does_not_undo_confirmed_shared_edit() {
    let mut before = shared_random_message_snapshot();
    let mut copy = before.world.action_points[0].actions[1].clone();
    copy.slot = 3;
    before.world.action_points[0].actions.push(copy);
    let mut session = EditorSession::new(before);
    apply_action_draft(
        &mut session,
        vec![
            random_message_step(
                1,
                8,
                9,
                confirmed(vec![
                    caller("action-point:land:0:0", 3),
                    caller("action-point:land:0:1", 2),
                ]),
            ),
            random_message_step(3, 1, 2, Default::default()),
        ],
    )
    .unwrap();
    assert_eq!(session.snapshot().extra_codes[0].values, [8, 9, -7, -8, -9]);
    assert!(
        session.snapshot().world.action_points[0]
            .actions
            .iter()
            .all(|a| a.target_native_id == 12)
    );
}

#[test]
fn conflicting_record_writes_reject_before_any_mutation() {
    let before = shared_random_message_snapshot();
    let mut session = EditorSession::new(before.clone());
    let error = apply_action_draft(
        &mut session,
        vec![
            random_message_step(1, 8, 9, Default::default()),
            random_message_step(3, 7, 9, Default::default()),
        ],
    )
    .unwrap_err();
    assert!(error.to_string().contains("conflicting edits"));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn paired_companion_conflict_rejects_the_complete_record_transaction() {
    let before = paired_overlap_snapshot();
    let mut session = EditorSession::new(before.clone());
    let error = apply_action_draft(
        &mut session,
        vec![
            shape_step([7, 2, 3, 4]),
            overlap_message_step(8, Default::default()),
        ],
    )
    .unwrap_err();
    assert!(error.to_string().contains("conflicting edits"));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.undo_history().is_empty());
}

#[test]
fn disjoint_companion_overlap_merges_as_one_undoable_transaction() {
    let before = paired_overlap_snapshot();
    let mut session = EditorSession::new(before.clone());
    apply_action_draft(
        &mut session,
        vec![
            shape_step([1, 2, 9, 4]),
            overlap_message_step(8, confirmed(vec![caller("action-point:land:0:0", 0)])),
        ],
    )
    .unwrap();
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == 13)
            .unwrap()
            .values,
        [8, 2, 9, 4, 5]
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
fn removed_sibling_is_not_an_affected_action_in_the_final_record() {
    let mut before = shared_random_message_snapshot();
    let mut copy = before.world.action_points[0].actions[1].clone();
    copy.slot = 3;
    before.world.action_points[0].actions.push(copy);
    let mut session = EditorSession::new(before);
    apply_action_draft(
        &mut session,
        vec![random_message_step(
            1,
            8,
            9,
            confirmed(vec![caller("action-point:land:0:1", 2)]),
        )],
    )
    .unwrap();
    assert_eq!(session.snapshot().world.action_points[0].actions.len(), 1);
}

#[test]
fn stale_confirmed_command_does_not_mutate_settings() {
    let mut session = EditorSession::new(shared_random_message_snapshot());
    apply_action_draft(
        &mut session,
        vec![random_message_step(1, 1, 2, Default::default())],
    )
    .unwrap();
    let before = session.snapshot().clone();
    let error = apply_action_draft(
        &mut session,
        vec![random_message_step(
            1,
            8,
            9,
            confirmed(vec![caller("action-point:land:0:1", 2)]),
        )],
    )
    .unwrap_err();
    assert!(matches!(error, SessionError::RevisionConflict { .. }));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn independently_created_zero_settings_reserve_distinct_reusable_rows() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes = (0..3)
        .map(|id| ExtraCodeRow {
            native_id: NativeRecordId(id),
            values: [0; 5],
        })
        .collect();
    let mut session = EditorSession::new(snapshot);
    apply_action_draft(
        &mut session,
        vec![
            random_message_step(0, 0, 0, Default::default()),
            random_message_step(1, 0, 0, Default::default()),
        ],
    )
    .unwrap();
    let actions = &session.snapshot().world.action_points[0].actions;
    assert_eq!(actions[0].target_native_id, 0);
    assert_eq!(actions[1].target_native_id, 1);
    assert_eq!(session.snapshot().extra_codes.len(), 3);
}

#[test]
fn preview_and_apply_share_the_same_complete_record_impact() {
    let mut session = EditorSession::new(shared_random_message_snapshot());
    let before = session.persisted_state();
    let mut steps = vec![
        random_message_step(3, 8, 9, Default::default()),
        random_message_step(5, 1, 2, Default::default()),
    ];
    let query = crate::session::ActionSettingsImpactQuery {
        expected_revision: Revision(0),
        source: StableId("action-point:land:0:0".into()),
        steps: steps.clone(),
        offset: 0,
        limit: 128,
    };
    let preview = session.action_settings_impact(query.clone()).unwrap();
    assert_eq!(session.persisted_state(), before);
    assert_eq!(
        preview.steps[0].affected_callers,
        vec![
            caller("action-point:land:0:0", 5),
            caller("action-point:land:0:1", 2),
        ]
    );
    assert!(preview.steps[1].affected_callers.is_empty());
    steps[0].settings.as_mut().unwrap().scope =
        confirmed(preview.steps[0].affected_callers.clone());
    apply_action_draft(&mut session, steps).unwrap();
    assert_eq!(session.snapshot().extra_codes[0].values, [8, 9, -7, -8, -9]);
    assert!(matches!(
        session.action_settings_impact(query),
        Err(SessionError::RevisionConflict { .. })
    ));
}

#[test]
fn impact_preview_pages_all_callers_without_truncating_confirmation_silently() {
    let mut snapshot = shared_random_message_snapshot();
    for id in 0..129 {
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: -1,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: 19,
                target_native_id: 12,
            }],
        });
    }
    let session = EditorSession::new(snapshot);
    let mut query = crate::session::ActionSettingsImpactQuery {
        expected_revision: Revision(0),
        source: StableId("action-point:land:0:0".into()),
        steps: vec![random_message_step(1, 8, 9, Default::default())],
        offset: 0,
        limit: usize::MAX,
    };
    let first = session
        .action_settings_impact(query.clone())
        .unwrap()
        .steps
        .remove(0);
    assert_eq!(first.total, 130);
    assert_eq!(first.affected_callers.len(), 128);
    query.offset = first.next_offset.unwrap();
    let second = session
        .action_settings_impact(query)
        .unwrap()
        .steps
        .remove(0);
    assert_eq!(second.total, 130);
    assert_eq!(second.affected_callers.len(), 2);
    assert_eq!(second.next_offset, None);
    assert_eq!(
        first
            .affected_callers
            .into_iter()
            .chain(second.affected_callers)
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        130
    );
}
