use super::{MonsterLibraryCommand, MonsterLibraryError, MonsterLibrarySession};
use crate::{
    model::StableId,
    session::{ExpectedRevisionCommand, MonsterDraftChange, Revision},
};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

#[cfg(test)]
#[path = "operation_tests.rs"]
mod tests;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibraryOperationReview {
    pub review_hash: String,
    pub changes: Vec<MonsterDraftChange>,
    pub selected_identity: Option<StableId>,
}

impl MonsterLibrarySession {
    pub fn review_operation(
        &self,
        command: &MonsterLibraryCommand,
    ) -> Result<MonsterLibraryOperationReview, MonsterLibraryError> {
        if !matches!(
            command,
            MonsterLibraryCommand::CreateCustom { .. }
                | MonsterLibraryCommand::Duplicate { .. }
                | MonsterLibraryCommand::CustomizeBuiltIn { .. }
                | MonsterLibraryCommand::DeleteCustom { .. }
                | MonsterLibraryCommand::RestoreBuiltIn { .. }
        ) {
            return Err(MonsterLibraryError::InvalidCatalog(
                "This command is not a Library record operation.".into(),
            ));
        }
        let mut candidate = Self::new(self.catalog.clone())?;
        let projection = candidate.execute(ExpectedRevisionCommand {
            expected_revision: self.revision(),
            command: command.clone(),
        })?;
        let mut changes = Vec::new();
        for identity in &projection.changed_entries {
            let before = self
                .catalog
                .entry(identity)
                .map(serde_json::to_value)
                .transpose()
                .expect("typed Library entry")
                .unwrap_or(Value::Null);
            let after = candidate
                .catalog
                .entry(identity)
                .map(serde_json::to_value)
                .transpose()
                .expect("typed Library entry")
                .unwrap_or(Value::Null);
            changes.extend(crate::session::monster_operation_diff::record_changes(
                identity, &before, &after,
            ));
        }
        let selected_identity = projection
            .changed_entries
            .iter()
            .find(|identity| candidate.catalog.entry(identity).is_some())
            .cloned();
        let bytes = serde_json::to_vec(&(command, &changes, &selected_identity))
            .expect("typed Library review");
        Ok(MonsterLibraryOperationReview {
            review_hash: format!("{:x}", Sha256::digest(bytes)),
            changes,
            selected_identity,
        })
    }

    pub fn execute_reviewed(
        &mut self,
        expected_revision: Revision,
        command: MonsterLibraryCommand,
        review_hash: &str,
    ) -> Result<super::MonsterLibraryChangeProjection, MonsterLibraryError> {
        if expected_revision != self.revision() {
            return Err(MonsterLibraryError::RevisionConflict {
                expected: expected_revision,
                actual: self.revision(),
            });
        }
        if self.review_operation(&command)?.review_hash != review_hash {
            return Err(MonsterLibraryError::InvalidCatalog(
                "The reviewed Library effects changed. Review the operation again.".into(),
            ));
        }
        self.execute(ExpectedRevisionCommand {
            expected_revision,
            command,
        })
    }
}
