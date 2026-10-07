use super::action_step_fixtures::*;
use super::*;

fn mixed_snapshot() -> ProjectSnapshot {
    let mut snapshot = shared_random_message_snapshot();
    snapshot.world.action_points[1].actions[0].raw_opcode = 2;
    snapshot.world.action_points[0]
        .actions
        .retain(|action| action.slot == 1);
    snapshot
}

#[test]
fn mixed_layout_noop_and_descriptor_edit_preserve_all_native_bytes() {
    let before = mixed_snapshot();
    let mut session = EditorSession::new(before.clone());
    let draft = ActionPointRecordDraft {
        source: before.world.action_points[0].identity.clone(),
        descriptor: "Signpost".into(),
        header: header(),
        steps: vec![random_message_step(
            1,
            1,
            2,
            ActionSettingsWriteScope::Isolate,
        )],
    };
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointDraft { draft },
        })
        .unwrap();
    assert_eq!(
        session.snapshot().world.action_points,
        before.world.action_points
    );
    assert_eq!(session.snapshot().extra_codes, before.extra_codes);
    assert_eq!(
        crate::codecs::encode_extra_codes(&session.snapshot().extra_codes, None).unwrap(),
        crate::codecs::encode_extra_codes(&before.extra_codes, None).unwrap()
    );
}

#[test]
fn move_and_duplicate_keep_unedited_settings_and_isolate_later_edits() {
    let before = mixed_snapshot();
    let mut session = EditorSession::new(before.clone());
    apply_action_draft(
        &mut session,
        vec![
            random_message_step(3, 1, 2, ActionSettingsWriteScope::Isolate),
            random_message_step(5, 1, 2, ActionSettingsWriteScope::Isolate),
        ],
    )
    .unwrap();
    assert_eq!(session.snapshot().extra_codes, before.extra_codes);
    assert!(
        session.snapshot().world.action_points[0]
            .actions
            .iter()
            .all(|a| a.target_native_id == 12)
    );
    let draft = ActionPointRecordDraft {
        source: before.world.action_points[0].identity.clone(),
        descriptor: String::new(),
        header: header(),
        steps: vec![
            random_message_step(3, 8, 9, ActionSettingsWriteScope::Isolate),
            random_message_step(5, 1, 2, ActionSettingsWriteScope::Isolate),
        ],
    };
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplyActionPointDraft { draft },
        })
        .unwrap();
    let actions = &session.snapshot().world.action_points[0].actions;
    assert_ne!(actions[0].target_native_id, 12);
    assert_eq!(actions[1].target_native_id, 12);
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
}

#[test]
fn two_new_settings_actions_reserve_distinct_rows_in_one_atomic_draft() {
    let mut session = EditorSession::new(placed_snapshot());
    apply_action_draft(
        &mut session,
        vec![
            random_message_step(0, 1, 2, ActionSettingsWriteScope::Isolate),
            random_message_step(1, 8, 9, ActionSettingsWriteScope::Isolate),
        ],
    )
    .unwrap();
    let snapshot = session.snapshot();
    assert_ne!(
        snapshot.world.action_points[0].actions[0].target_native_id,
        snapshot.world.action_points[0].actions[1].target_native_id
    );
    assert_eq!(
        snapshot
            .extra_codes
            .iter()
            .map(|r| r.values[..2].to_vec())
            .collect::<Vec<_>>(),
        vec![vec![1, 2], vec![8, 9]]
    );
}

#[test]
fn mixed_layout_xap_noop_and_move_preserve_rows() {
    let mut before = mixed_snapshot();
    before.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: -1,
        post_action_level: 2,
        post_action_x: 3,
        post_action_y: 4,
        chance_percent: 50,
        actions: vec![ClassicAction {
            slot: 1,
            raw_opcode: 19,
            target_native_id: 12,
        }],
    });
    let mut session = EditorSession::new(before.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyExtraActionPointDraft {
                draft: ExtraActionPointRecordDraft {
                    source: before.extra_action_points[0].identity.clone(),
                    descriptor: String::new(),
                    header: ExtraActionPointHeaderDraft {
                        classic_door_id: -1,
                        post_action_level: 2,
                        post_action_x: 3,
                        post_action_y: 4,
                        chance_percent: 50,
                    },
                    steps: vec![random_message_step(
                        4,
                        1,
                        2,
                        ActionSettingsWriteScope::Isolate,
                    )],
                },
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().extra_codes, before.extra_codes);
    assert_eq!(
        session.snapshot().extra_action_points[0].actions[0].target_native_id,
        12
    );
    assert_eq!(session.snapshot().extra_action_points[0].actions[0].slot, 4);
}

#[test]
fn failed_later_step_discards_reserved_rows_and_keeps_history() {
    let before = placed_snapshot();
    let mut session = EditorSession::new(before.clone());
    let mut invalid = random_message_step(1, 8, 9, ActionSettingsWriteScope::Isolate);
    invalid.action_identity = "unknown".into();
    assert!(
        apply_action_draft(
            &mut session,
            vec![
                random_message_step(0, 1, 2, ActionSettingsWriteScope::Isolate),
                invalid,
            ]
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert!(session.undo_history().is_empty());
}
