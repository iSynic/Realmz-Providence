use super::*;
use crate::{
    model::{BlobId, LevelType, NativeRecordId, ProjectOrigin},
    session::{ExpectedRevisionCommand, Revision},
};

fn execute(
    session: &mut EditorSession,
    command: EditorCommand,
) -> Result<ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command,
    })
}

#[test]
fn staging_matches_normal_domain_writes_and_defers_only_history_and_views() {
    let id = StableId("import-staging".into());
    let mut normal = EditorSession::new(ProjectSnapshot::new_authored(id.clone()));
    let commands = vec![
        EditorCommand::CreateMap {
            level_type: LevelType::Land,
        },
        EditorCommand::CreateMessage {
            native_id: NativeRecordId(17),
            text: "Preserved text".into(),
        },
    ];
    for command in &commands {
        execute(&mut normal, command.clone()).unwrap();
    }
    let (staged, ()) = EditorSession::stage_classic_import(id, |session| {
        for command in commands {
            let projection = execute(session, command)?;
            assert!(projection.truncated && !projection.references_unchanged);
            assert!(!session.can_undo() && !session.can_redo());
        }
        // A requested read still derives current truth; only unsolicited views defer.
        assert_eq!(session.references(), normal.references());
        assert_eq!(session.diagnostics(), normal.diagnostics());
        Ok::<_, SessionError>(())
    })
    .unwrap();
    assert_eq!(staged, *normal.snapshot());
}

#[test]
fn late_staging_failure_and_stale_revision_never_change_the_live_session() {
    let live = EditorSession::new(ProjectSnapshot::new_authored(StableId("retained".into())));
    let before = live.persisted_state();
    let result =
        EditorSession::stage_classic_import(before.snapshot.project_id.clone(), |session| {
            execute(
                session,
                EditorCommand::CreateMap {
                    level_type: LevelType::Land,
                },
            )?;
            let stale = session.execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::CreateMessage {
                    native_id: NativeRecordId(3),
                    text: "Stale".into(),
                },
            });
            assert!(matches!(stale, Err(SessionError::RevisionConflict { .. })));
            execute(
                session,
                EditorCommand::UpdateMessageText {
                    identity: StableId("missing-message".into()),
                    text: "Invalid".into(),
                },
            )
        });
    assert!(matches!(result, Err(SessionError::MessageNotFound(_))));
    assert_eq!(live.persisted_state(), before);
}

#[test]
fn complete_staging_commits_once_and_normal_edit_history_resumes() {
    let id = StableId("completed-import".into());
    let (mut imported, ()) = EditorSession::stage_classic_import(id.clone(), |session| {
        execute(
            session,
            EditorCommand::CreateMessage {
                native_id: NativeRecordId(3),
                text: "Imported".into(),
            },
        )?;
        Ok::<_, SessionError>(())
    })
    .unwrap();
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let message = imported.messages[0].identity.clone();
    let mut live = EditorSession::new(ProjectSnapshot::new_authored(id));
    let commit = live
        .commit_classic_scenario_import(Revision(0), imported)
        .unwrap();
    assert_eq!(commit.revision, Revision(1));
    assert!(!live.can_undo());
    execute(
        &mut live,
        EditorCommand::UpdateMessageText {
            identity: message,
            text: "Edited".into(),
        },
    )
    .unwrap();
    assert!(live.can_undo());
    execute(&mut live, EditorCommand::Undo).unwrap();
    assert_eq!(live.snapshot().messages[0].text, "Imported");
    execute(&mut live, EditorCommand::Redo).unwrap();
    assert_eq!(live.snapshot().messages[0].text, "Edited");
}
