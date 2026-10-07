//! Whole-import staging validates domain writes without publishing partial views.

use super::{
    CHANGE_PROJECTION_LIMIT, ChangeProjection, EditorCommand, EditorSession, SessionError,
};
use crate::model::{ProjectSnapshot, StableId};

impl EditorSession {
    /// Runs a private import from fresh truth. Intermediate projections require a
    /// refresh and are never an authoring acknowledgement. The live session owns
    /// the final atomic commit, complete projections and durable checkpoint.
    pub fn stage_classic_import<T, E>(
        project_id: StableId,
        decode: impl FnOnce(&mut Self) -> Result<T, E>,
    ) -> Result<(ProjectSnapshot, T), E> {
        let mut staging = Self::new(ProjectSnapshot::new_authored(project_id));
        staging.staging_import = true;
        let result = decode(&mut staging)?;
        Ok((staging.snapshot, result))
    }

    pub(super) fn apply_staged_import(
        &mut self,
        command: EditorCommand,
    ) -> Result<ChangeProjection, SessionError> {
        let mut changed = self.apply_domain_command(command)?;
        self.projections = super::projections::SessionProjections::default();
        let previous_revision = self.revision;
        self.revision.0 += 1;
        let total = changed.len();
        changed.truncate(CHANGE_PROJECTION_LIMIT);
        Ok(ChangeProjection {
            previous_revision,
            revision: self.revision,
            affected_entities: changed.clone(),
            changed_entities: changed,
            changed_entities_total: total,
            affected_entities_total: total,
            reference_changes: Vec::new(),
            affected_diagnostics: Vec::new(),
            reference_changes_total: 0,
            affected_diagnostics_total: 0,
            references_unchanged: false,
            truncated: true,
            can_undo: false,
            can_redo: false,
        })
    }
}

#[cfg(test)]
mod tests;
