//! Private command staging shares domain validation without publishing intermediate history.
use super::*;

pub struct AuthoringStage {
    owner: u64,
    base: Revision,
    session: EditorSession,
}

impl AuthoringStage {
    pub fn session(&self) -> &EditorSession {
        &self.session
    }
    pub fn session_mut(&mut self) -> &mut EditorSession {
        &mut self.session
    }
    pub fn changed_entities(&self) -> Vec<StableId> {
        self.session
            .staged_changes
            .as_ref()
            .into_iter()
            .flatten()
            .cloned()
            .collect()
    }
}

impl EditorSession {
    pub fn begin_authoring_stage(
        &self,
        expected: Revision,
    ) -> Result<AuthoringStage, SessionError> {
        if expected != self.revision {
            return Err(SessionError::RevisionConflict {
                expected,
                actual: self.revision,
            });
        }
        let mut session = Self::new(self.snapshot.clone());
        session.revision = self.revision;
        session.private_staging = true;
        session.staged_changes = Some(BTreeSet::new());
        Ok(AuthoringStage {
            owner: self.instance_id,
            base: self.revision,
            session,
        })
    }

    pub fn commit_authoring_stage(
        &mut self,
        stage: AuthoringStage,
    ) -> Result<ChangeProjection, SessionError> {
        if stage.base != self.revision || stage.owner != self.instance_id {
            return Err(SessionError::RevisionConflict {
                expected: stage.base,
                actual: self.revision,
            });
        }
        let changed = stage.changed_entities();
        if changed.is_empty() || self.snapshot == stage.session.snapshot {
            return Ok(change_projection::build(
                self,
                self.revision,
                Vec::new(),
                true,
                BTreeSet::new(),
            ));
        }
        let before = std::mem::replace(&mut self.snapshot, stage.session.snapshot);
        let affected = action_settings::affected_sources(&before, &self.snapshot, &changed);
        push_history(
            &mut self.undo,
            SessionHistoryEntry {
                attribution: None,
                snapshot: before,
                changed_entities: changed.clone(),
                references_unchanged: false,
            },
        );
        self.redo.clear();
        Ok(self.advance(changed, false, affected))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session() -> EditorSession {
        EditorSession::new(ProjectSnapshot::new_authored(StableId("test".into())))
    }
    fn add(stage: &mut AuthoringStage, id: u32) {
        let revision = stage.session().revision();
        stage
            .session_mut()
            .execute(ExpectedRevisionCommand {
                expected_revision: revision,
                command: EditorCommand::CreateMessage {
                    native_id: crate::model::NativeRecordId(id),
                    text: format!("message {id}"),
                },
            })
            .unwrap();
    }
    #[test]
    fn grouped_edit_has_one_revision_and_history_boundary() {
        let mut live = session();
        let mut staged = live.begin_authoring_stage(Revision(0)).unwrap();
        add(&mut staged, 1);
        add(&mut staged, 2);
        assert!(live.snapshot().messages.is_empty());
        live.commit_authoring_stage(staged).unwrap();
        assert_eq!(live.revision(), Revision(1));
        assert_eq!(live.undo_history().len(), 1);
        live.execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
        assert!(live.snapshot().messages.is_empty());
        live.execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
        assert_eq!(live.snapshot().messages.len(), 2);
    }
    #[test]
    fn a_net_unchanged_group_keeps_revision_redo_and_existing_attribution() {
        let mut live = session();
        let mut first = live.begin_authoring_stage(Revision(0)).unwrap();
        add(&mut first, 1);
        live.commit_authoring_stage(first).unwrap();
        let edit = |session: &mut EditorSession, text: &str| {
            session
                .execute(ExpectedRevisionCommand {
                    expected_revision: session.revision(),
                    command: EditorCommand::UpdateMessageText {
                        identity: StableId("message:1".into()),
                        text: text.into(),
                    },
                })
                .unwrap();
        };
        edit(&mut live, "After");
        live.execute(ExpectedRevisionCommand {
            expected_revision: live.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
        let before = live.persisted_state();
        let mut stage = live.begin_authoring_stage(live.revision()).unwrap();
        edit(stage.session_mut(), "Intermediate");
        edit(stage.session_mut(), "message 1");
        live.commit_authoring_stage(stage).unwrap();
        assert_eq!(live.persisted_state(), before);
        assert!(live.can_redo());
    }
    #[test]
    fn stale_or_foreign_stage_cannot_replace_live_truth() {
        let mut live = session();
        let stale = live.begin_authoring_stage(Revision(0)).unwrap();
        let mut current = live.begin_authoring_stage(Revision(0)).unwrap();
        add(&mut current, 1);
        live.commit_authoring_stage(current).unwrap();
        assert!(live.commit_authoring_stage(stale).is_err());
        let foreign = session().begin_authoring_stage(Revision(0)).unwrap();
        assert!(session().commit_authoring_stage(foreign).is_err());
        assert_eq!(live.snapshot().messages.len(), 1);
    }
}
