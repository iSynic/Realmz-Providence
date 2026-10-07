use super::*;
use crate::session::SessionHistoryEntry;

#[test]
fn expected_revision_rejects_stale_commands() {
    let mut session = EditorSession::new(sample_snapshot());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:1".into()),
                text: "Changed".into(),
            },
        })
        .expect("first edit");

    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::Undo,
        }),
        Err(SessionError::RevisionConflict {
            expected: Revision(0),
            actual: Revision(1)
        })
    ));
}

#[test]
fn dangling_reference_can_be_repaired_and_undo_redo_is_revisioned() {
    let mut session = EditorSession::new(sample_snapshot());
    assert_eq!(session.diagnostics().len(), 1);

    let repaired = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetMessageReference {
                source: StableId("action-point:7".into()),
                field: "outcome.message".into(),
                target_native_id: NativeRecordId(1),
            },
        })
        .expect("repair");
    assert_eq!(repaired.revision, Revision(1));
    assert!(repaired.affected_diagnostics.is_empty());
    assert!(repaired.fits(ProjectionBudget {
        changed_entities: 1,
        reference_changes: 1,
        affected_diagnostics: 1,
    }));

    let undone = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo");
    assert_eq!(undone.affected_diagnostics.len(), 1);
    let redone = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .expect("redo");
    assert!(redone.affected_diagnostics.is_empty());
}

#[test]
fn projection_contains_only_changed_sources_and_reverse_dependents() {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.push(MessageReference {
        source: StableId("action-point:unrelated".into()),
        field: "outcome.message".into(),
        target_native_id: NativeRecordId(404),
        required: true,
    });
    let mut session = EditorSession::new(snapshot);

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMessage {
                native_id: NativeRecordId(99),
                text: "Created target".into(),
            },
        })
        .expect("create referenced message");

    assert_eq!(projection.reference_changes_total, 1);
    assert_eq!(projection.reference_changes[0].source.0, "action-point:7");
    assert!(projection.affected_diagnostics.is_empty());
    assert_eq!(projection.affected_diagnostics_total, 0);
    assert!(!projection.truncated);
    assert!(
        projection
            .affected_entities
            .contains(&StableId("message:99".into()))
    );
    assert!(
        projection
            .affected_entities
            .contains(&StableId("action-point:7".into()))
    );
    assert!(
        !projection
            .affected_entities
            .contains(&StableId("action-point:unrelated".into()))
    );
}

#[test]
fn high_fanout_projection_reports_totals_and_truncates_explicitly() {
    let mut snapshot = sample_snapshot();
    for index in 1..200 {
        snapshot.message_references.push(MessageReference {
            source: StableId(format!("action-point:fanout:{index}")),
            field: "outcome.message".into(),
            target_native_id: NativeRecordId(99),
            required: true,
        });
    }
    let mut session = EditorSession::new(snapshot);

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMessage {
                native_id: NativeRecordId(99),
                text: "Shared target".into(),
            },
        })
        .expect("create high-fanout target");

    assert_eq!(projection.reference_changes_total, 200);
    assert_eq!(projection.reference_changes.len(), CHANGE_PROJECTION_LIMIT);
    assert_eq!(projection.affected_diagnostics_total, 0);
    assert!(projection.truncated);
}

#[test]
fn persisted_session_state_restores_revision_and_undo_stack() {
    let mut session = EditorSession::new(sample_snapshot());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:1".into()),
                text: "Persisted edit".into(),
            },
        })
        .expect("edit");

    let encoded = serde_json::to_string(&session.persisted_state()).expect("serialize state");
    let state: PersistedSessionState = serde_json::from_str(&encoded).expect("deserialize state");
    let mut restored = EditorSession::from_persisted_state(state);
    assert_eq!(restored.revision(), Revision(1));
    assert_eq!(restored.snapshot().messages[0].text, "Persisted edit");

    restored
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo after restart");
    assert_eq!(restored.snapshot().messages[0].text, "Original");
}

#[test]
fn session_history_retains_only_the_most_recent_bounded_entries() {
    let mut session = EditorSession::new(sample_snapshot());
    for edit in 1..=SESSION_HISTORY_ENTRY_LIMIT + 6 {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::UpdateMessageText {
                    identity: StableId("message:1".into()),
                    text: format!("Edit {edit}"),
                },
            })
            .expect("bounded edit");
    }

    assert_eq!(
        session.persisted_state().undo.len(),
        SESSION_HISTORY_ENTRY_LIMIT
    );
    for _ in 0..SESSION_HISTORY_ENTRY_LIMIT {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::Undo,
            })
            .expect("retained undo");
    }
    assert_eq!(session.snapshot().messages[0].text, "Edit 6");
    assert_eq!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::Undo,
            })
            .expect_err("older history must be outside the retention bound"),
        SessionError::NothingToUndo
    );
}

#[test]
fn older_persisted_history_without_effect_metadata_stays_conservative() {
    let mut encoded = serde_json::to_value(SessionHistoryEntry {
        snapshot: sample_snapshot(),
        changed_entities: vec![StableId("message:1".into())],
        references_unchanged: true,
    })
    .expect("serialize history entry");
    encoded
        .as_object_mut()
        .expect("history entry object")
        .remove("referencesUnchanged");
    let decoded: SessionHistoryEntry =
        serde_json::from_value(encoded).expect("read older history entry");
    assert!(!decoded.references_unchanged);
}
