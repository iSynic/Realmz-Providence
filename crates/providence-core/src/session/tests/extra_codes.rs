use super::*;

#[test]
fn extra_code_rows_are_revisioned_and_undoable() {
    let mut session = EditorSession::new(sample_snapshot());
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertExtraCode {
                row: ExtraCodeRow {
                    native_id: NativeRecordId(8),
                    values: [1, -2, 3, -4, 5],
                },
            },
        })
        .expect("upsert E-code row");

    assert_eq!(
        projection.changed_entities,
        [StableId("extra-code:8".into())]
    );
    assert_eq!(session.snapshot().extra_codes[0].values, [1, -2, 3, -4, 5]);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo E-code row");
    assert!(session.snapshot().extra_codes.is_empty());
}

#[test]
fn extra_code_value_repair_is_narrow_revisioned_and_undoable() {
    let mut snapshot = sample_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [1, 2, 99, 4, 5],
    });
    let mut session = EditorSession::new(snapshot);

    let repaired = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetExtraCodeValue {
                source: StableId("extra-code:8".into()),
                index: 2,
                target_id: 7,
            },
        })
        .expect("repair one E-code value");
    assert_eq!(repaired.changed_entities, [StableId("extra-code:8".into())]);
    assert_eq!(session.snapshot().extra_codes[0].values, [1, 2, 7, 4, 5]);

    let revision = session.revision();
    let rejected = session
        .execute(ExpectedRevisionCommand {
            expected_revision: revision,
            command: EditorCommand::RetargetExtraCodeValue {
                source: StableId("extra-code:8".into()),
                index: 5,
                target_id: 3,
            },
        })
        .expect_err("out-of-range E-code field must be rejected");
    assert!(matches!(
        rejected,
        SessionError::InvalidExtraCodeReference { index: 5, .. }
    ));
    assert_eq!(session.revision(), revision);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: revision,
            command: EditorCommand::Undo,
        })
        .expect("undo E-code repair");
    assert_eq!(session.snapshot().extra_codes[0].values[2], 99);
}

#[test]
fn extra_code_battle_range_repair_is_atomic_signed_and_undoable() {
    let mut snapshot = sample_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [814, 0, 3, 4, 5],
    });
    let mut session = EditorSession::new(snapshot);

    let repaired = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetExtraCodeBattleRange {
                source: StableId("extra-code:8".into()),
                low_id: 12,
                high_id: 18,
            },
        })
        .expect("repair the complete battle range");
    assert_eq!(repaired.changed_entities, [StableId("extra-code:8".into())]);
    assert_eq!(session.snapshot().extra_codes[0].values, [12, 18, 3, 4, 5]);

    let signed = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetExtraCodeBattleRange {
                source: StableId("extra-code:8".into()),
                low_id: -12,
                high_id: -18,
            },
        })
        .expect("signed Classic battle flags must be preserved");
    assert_eq!(signed.revision, Revision(2));
    assert_eq!(
        session.snapshot().extra_codes[0].values,
        [-12, -18, 3, 4, 5]
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo battle range repair");
    assert_eq!(session.snapshot().extra_codes[0].values, [12, 18, 3, 4, 5]);
}

#[test]
fn extra_code_branch_repair_updates_the_layout_pair_and_is_undoable() {
    let mut snapshot = sample_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [20, 1, 1, 1, 0],
    });
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetExtraCodeBranch {
                source: StableId("extra-code:8".into()),
                layout: ExtraCodeBranchLayout::Force,
                mode: 2,
                target_id: 1,
            },
        })
        .expect("retarget force-branch mode and destination together");
    assert_eq!(session.snapshot().extra_codes[0].values, [20, 1, 2, 1, 0]);

    let rejected = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetExtraCodeBranch {
                source: StableId("extra-code:8".into()),
                layout: ExtraCodeBranchLayout::Choice,
                mode: 5,
                target_id: 0,
            },
        })
        .expect_err("unknown mode is not a repair destination");
    assert!(matches!(
        rejected,
        SessionError::InvalidExtraCodeBranchMode {
            layout: ExtraCodeBranchLayout::Choice,
            mode: 5,
            ..
        }
    ));
    assert_eq!(session.revision(), Revision(1));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo paired branch repair");
    assert_eq!(session.snapshot().extra_codes[0].values, [20, 1, 1, 1, 0]);
}
