//! Read-only preview of the same record transaction used by Apply.
use super::action_draft_commands::prepare_record_steps;
use super::action_step_commands::PointKind;
use super::{
    ActionSettingsCallerConfirmation, ActionStepDraft, EditorSession, Revision, SessionError,
};
use crate::model::StableId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionSettingsImpactQuery {
    pub expected_revision: Revision,
    pub source: StableId,
    /// Complete record draft, including retained, moved and newly copied steps.
    pub steps: Vec<ActionStepDraft>,
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "impact_page_limit")]
    pub limit: usize,
}

fn impact_page_limit() -> usize {
    128
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSettingsStepImpact {
    pub slot: u8,
    pub edited_action: Option<crate::action_settings_effects::ActionSettingsImpactAction>,
    pub affected_callers: Vec<ActionSettingsCallerConfirmation>,
    pub affected_actions: Vec<crate::action_settings_effects::ActionSettingsImpactAction>,
    pub total: usize,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSettingsImpact {
    pub revision: Revision,
    pub source: StableId,
    pub steps: Vec<ActionSettingsStepImpact>,
}

impl EditorSession {
    pub fn action_settings_impact(
        &self,
        query: ActionSettingsImpactQuery,
    ) -> Result<ActionSettingsImpact, SessionError> {
        if query.expected_revision != self.revision() {
            return Err(SessionError::RevisionConflict {
                expected: query.expected_revision,
                actual: self.revision(),
            });
        }
        let kind = self.settings_owner_kind(&query.source)?;
        let mut staged = self.snapshot.clone();
        let prepared = prepare_record_steps(&mut staged, kind, &query.source, query.steps)?;
        let mut steps = Vec::new();
        for step in prepared.steps {
            let selected = BTreeSet::from([ActionSettingsCallerConfirmation {
                source: query.source.clone(),
                slot: step.slot,
            }]);
            let affected_callers = crate::action_settings_effects::impacted_callers_in_transaction(
                &staged,
                &step.rows,
                &prepared.writes,
                &selected,
            )
            .map_err(|reason| SessionError::InvalidActionSettings {
                source: query.source.clone(),
                slot: step.slot,
                reason,
            })?;
            let mut page = impact_page(step.slot, affected_callers, query.offset, query.limit);
            if page.total > 0 {
                describe_page(&mut page, &staged, &step, &prepared.writes)
                    .map_err(|reason| impact_error(&query.source, step.slot, reason))?;
            }
            steps.push(page);
        }
        Ok(ActionSettingsImpact {
            revision: self.revision(),
            source: query.source,
            steps,
        })
    }

    fn settings_owner_kind(&self, source: &StableId) -> Result<PointKind, SessionError> {
        let placed = self
            .snapshot
            .world
            .action_points
            .iter()
            .filter(|row| row.identity == *source)
            .count();
        let extra = self
            .snapshot
            .extra_action_points
            .iter()
            .filter(|row| row.identity == *source)
            .count();
        let simple = self
            .snapshot
            .simple_encounters
            .iter()
            .filter(|row| row.identity == *source)
            .count();
        let complex = self
            .snapshot
            .complex_encounters
            .iter()
            .filter(|row| row.identity == *source)
            .count();
        match (placed, extra, simple, complex) {
            (1, 0, 0, 0) => Ok(PointKind::Placed),
            (0, 1, 0, 0) => Ok(PointKind::Extra),
            (0, 0, 1, 0) => Ok(PointKind::SimpleEncounter),
            (0, 0, 0, 1) => Ok(PointKind::ComplexEncounter),
            _ => Err(SessionError::InvalidActionSettings {
                source: source.clone(),
                slot: 0,
                reason: "the script record is missing or ambiguous".into(),
            }),
        }
    }
}

fn describe_page(
    page: &mut ActionSettingsStepImpact,
    snapshot: &crate::model::ProjectSnapshot,
    step: &super::action_step_commands::PreparedStep,
    transaction_writes: &[crate::model::ExtraCodeRow],
) -> Result<(), String> {
    let describe = |caller: &ActionSettingsCallerConfirmation| {
        crate::action_settings_effects::describe_impact(
            snapshot,
            &step.rows,
            transaction_writes,
            caller,
        )
    };
    page.edited_action = Some(describe(&ActionSettingsCallerConfirmation {
        source: step.source.clone(),
        slot: step.slot,
    })?);
    page.affected_actions = page
        .affected_callers
        .iter()
        .map(describe)
        .collect::<Result<_, _>>()?;
    Ok(())
}

fn impact_page(
    slot: u8,
    callers: Vec<ActionSettingsCallerConfirmation>,
    offset: usize,
    limit: usize,
) -> ActionSettingsStepImpact {
    let total = callers.len();
    let affected_callers = callers
        .into_iter()
        .skip(offset)
        .take(limit.clamp(1, 128))
        .collect::<Vec<_>>();
    let next_offset = offset
        .checked_add(affected_callers.len())
        .filter(|next| *next < total);
    ActionSettingsStepImpact {
        slot,
        edited_action: None,
        affected_callers,
        affected_actions: Vec::new(),
        total,
        next_offset,
    }
}

fn impact_error(source: &StableId, slot: u8, reason: String) -> SessionError {
    SessionError::InvalidActionSettings {
        source: source.clone(),
        slot,
        reason,
    }
}
