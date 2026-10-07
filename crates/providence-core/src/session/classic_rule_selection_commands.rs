use super::{EditorSession, SessionError};
use crate::model::{
    ClassicRuleSelectionContextV1, ProjectOrigin, StableId, classic_source_set_sha256,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub enum ClassicRuleSelectionCommand {
    Set {
        context: ClassicRuleSelectionContextV1,
        expected_previous_identity: Option<String>,
        expected_source_set_sha256: String,
    },
    Clear {
        expected_previous_identity: Option<String>,
        expected_source_set_sha256: String,
    },
}

impl EditorSession {
    pub(super) fn apply_classic_rule_selection(
        &mut self,
        command: ClassicRuleSelectionCommand,
    ) -> Result<Vec<StableId>, SessionError> {
        match command {
            ClassicRuleSelectionCommand::Set {
                context,
                expected_previous_identity,
                expected_source_set_sha256,
            } => self.set_classic_rule_selection(
                Some(context),
                expected_previous_identity,
                expected_source_set_sha256,
            ),
            ClassicRuleSelectionCommand::Clear {
                expected_previous_identity,
                expected_source_set_sha256,
            } => self.set_classic_rule_selection(
                None,
                expected_previous_identity,
                expected_source_set_sha256,
            ),
        }
    }

    pub(super) fn set_classic_rule_selection(
        &mut self,
        context: Option<ClassicRuleSelectionContextV1>,
        expected_previous_identity: Option<String>,
        expected_source_set_sha256: String,
    ) -> Result<Vec<StableId>, SessionError> {
        let invalid = SessionError::InvalidScenarioDraft;
        if !matches!(self.snapshot.origin, ProjectOrigin::Imported { .. }) {
            return Err(invalid(
                "Classic rule selection belongs only to imported projects".into(),
            ));
        }
        let current_identity = self
            .snapshot
            .classic_rule_selection
            .as_ref()
            .map(|value| value.identity());
        if current_identity != expected_previous_identity {
            return Err(invalid(
                "Classic rule selection changed; reopen its draft".into(),
            ));
        }
        if classic_source_set_sha256(&self.snapshot).map_err(invalid)? != expected_source_set_sha256
        {
            return Err(invalid(
                "captured Classic sources changed; reopen rule selection".into(),
            ));
        }
        if let Some(context) = &context {
            context.validate_binding(&self.snapshot).map_err(invalid)?;
            // No runtime capture channel is installed yet. A menu mapping alone is not a capture.
            if !matches!(
                context.evidence_origin,
                crate::model::ClassicRuleSelectionEvidence::OwnerConfigured
            ) {
                return Err(invalid("captured native selection requires a verified runtime capture channel; configure the intended selection explicitly".into()));
            }
        }
        if self.snapshot.classic_rule_selection == context {
            return Ok(Vec::new());
        }
        self.snapshot.classic_rule_selection = context;
        Ok(vec![self.snapshot.project_id.clone()])
    }
}
