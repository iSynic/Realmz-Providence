use crate::model::{ProjectOrigin, ProjectSnapshot, StableId};
use crate::references::ReferenceDescriptor;
use crate::session::media_commands::monster_appearance_pair_base;
use crate::validation::Diagnostic;
use crate::validation::action_settings;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

mod action_draft_commands;
mod action_draft_semantics;
mod action_point_commands;
mod action_point_records;
mod action_reference_commands;
mod action_references;
pub(crate) mod action_settings_commands;
mod action_step_commands;
mod asset_commands;
pub mod battle_authoring;
mod battle_commands;
mod change_projection;
mod classic_rule_selection_commands;
mod combat_references;
mod command_dispatch;
mod command_effects;
mod command_types;
mod commands;
mod complex_encounter_commands;
mod custom_landlook_commands;
mod diagnostics;
mod dungeon_feature_commands;
mod economy_commands;
mod economy_references;
mod encounter_authoring;
mod encounter_references;
mod errors;
mod extra_action_point_commands;
mod extra_code_commands;
mod field_paths;
mod import_history;
mod import_staging;
pub mod item_authoring;
mod item_commands;
mod label_commands;
mod land_cell_behavior_commands;
mod land_layout_commands;
mod level_settings_commands;
mod map_lifecycle_commands;
mod map_paint_commands;
mod map_stamp_commands;
mod media_commands;
mod message_commands;
mod monster_commands;
pub(crate) mod monster_draft;
pub(crate) mod monster_draft_fields;
mod monster_library_transfers;
pub(crate) mod monster_operation_diff;
mod monster_operations;
mod monster_records;
mod player_map_authoring;
mod player_map_commands;
mod projections;
mod quest_references;
mod random_rectangle_commands;
mod reference_targets;
mod rogue_encounter_commands;
pub mod rule_authoring;
mod rule_commands;
mod scenario_authoring;
mod scenario_commands;
mod string_drafts;
pub use scenario_authoring::{ScenarioAuthoringEdit, ScenarioContactDraft, ScenarioStartupDraft};
mod settings_impact;
pub(crate) mod settings_write_policy;
mod simple_encounter_commands;
pub mod spell_authoring;
mod spell_commands;
mod spell_references;
pub use spell_authoring::{
    SpellAllocation, SpellAllocationGuard, SpellCopySource, SpellRecordDraft,
};
mod terrain_commands;
mod timed_encounter_commands;
mod world_import_commands;
mod world_references;

pub use battle_authoring::{BattleAllocation, BattleCopySource};
pub use diagnostics::diagnostics_for;
pub(crate) use diagnostics::imported_runtime_diagnostics;
pub use errors::SessionError;
pub use item_authoring::{ItemAllocation, ItemAllocationGuard, ItemCopySource, ItemRecordDraft};
pub use projections::references_for;

pub use action_settings_commands::{ActionSettingsEdit, ActionSettingsGuard};
pub use classic_rule_selection_commands::ClassicRuleSelectionCommand;
pub use command_types::{
    ActionPointHeaderDraft, ActionPointRecordDraft, ActionSettingsCallerConfirmation,
    ActionSettingsWriteScope, ActionStepDraft, ActionStepDraftSettings, ActionStepEdit,
    BattleMonsterReferenceRewrite, ComplexEncounterRecordDraft, ExpectedRevisionCommand,
    ExtraActionPointHeaderDraft, ExtraActionPointRecordDraft, ExtraCodeBranchLayout,
    LandMapCellPaint, Revision, SimpleEncounterRecordDraft, TypedActionSettings,
};
pub use commands::EditorCommand;
pub use monster_draft::{MonsterDraftChange, MonsterDraftIssue, MonsterRecordDraft};
pub use monster_library_transfers::MonsterLibraryTransferReview;
pub use monster_operations::{
    MonsterOperation, MonsterOperationReview, MonsterRecordOperation, MonsterUseEdit,
};
pub use player_map_authoring::PlayerMapNamesDraft;

pub fn new_monster_template(
    native_id: crate::model::NativeRecordId,
) -> Result<crate::model::MonsterRecord, SessionError> {
    monster_records::validate_monster_native_id(
        native_id,
        &monster_records::monster_identity(0, native_id),
    )?;
    Ok(monster_records::authored_monster(native_id, 0))
}
pub use settings_impact::{
    ActionSettingsImpact, ActionSettingsImpactQuery, ActionSettingsStepImpact,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeProjection {
    pub previous_revision: Revision,
    pub revision: Revision,
    pub changed_entities: Vec<StableId>,
    pub changed_entities_total: usize,
    pub affected_entities: Vec<StableId>,
    pub affected_entities_total: usize,
    pub reference_changes: Vec<ReferenceDescriptor>,
    pub affected_diagnostics: Vec<Diagnostic>,
    pub reference_changes_total: usize,
    pub affected_diagnostics_total: usize,
    pub references_unchanged: bool,
    pub truncated: bool,
    pub can_undo: bool,
    pub can_redo: bool,
}

pub const CHANGE_PROJECTION_LIMIT: usize = 128;
pub const SESSION_HISTORY_ENTRY_LIMIT: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProjectionBudget {
    pub changed_entities: usize,
    pub reference_changes: usize,
    pub affected_diagnostics: usize,
}

impl ChangeProjection {
    pub fn fits(&self, budget: ProjectionBudget) -> bool {
        self.changed_entities.len() <= budget.changed_entities
            && self.reference_changes.len() <= budget.reference_changes
            && self.affected_diagnostics.len() <= budget.affected_diagnostics
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistoryEntry {
    pub snapshot: ProjectSnapshot,
    pub changed_entities: Vec<StableId>,
    #[serde(default)]
    pub references_unchanged: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSessionState {
    pub snapshot: ProjectSnapshot,
    pub revision: Revision,
    pub undo: Vec<SessionHistoryEntry>,
    pub redo: Vec<SessionHistoryEntry>,
}

#[derive(Debug, Clone)]
pub struct EditorSession {
    snapshot: ProjectSnapshot,
    revision: Revision,
    undo: Vec<SessionHistoryEntry>,
    redo: Vec<SessionHistoryEntry>,
    projections: projections::SessionProjections,
    staging_import: bool,
}

impl EditorSession {
    pub fn discovery(&self) -> &crate::discovery::DiscoveryIndex {
        self.projections.discovery(&self.snapshot)
    }
    pub fn new(mut snapshot: ProjectSnapshot) -> Self {
        snapshot.normalize();
        Self {
            snapshot,
            revision: Revision(0),
            undo: Vec::new(),
            redo: Vec::new(),
            projections: projections::SessionProjections::default(),
            staging_import: false,
        }
    }

    pub fn revision(&self) -> Revision {
        self.revision
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    pub fn from_persisted_state(mut state: PersistedSessionState) -> Self {
        state.snapshot.normalize();
        for entry in state.undo.iter_mut().chain(state.redo.iter_mut()) {
            entry.snapshot.normalize();
        }
        trim_history(&mut state.undo);
        trim_history(&mut state.redo);
        import_history::retain_post_import_undo(&mut state);
        Self {
            snapshot: state.snapshot,
            revision: state.revision,
            undo: state.undo,
            redo: state.redo,
            projections: projections::SessionProjections::default(),
            staging_import: false,
        }
    }

    pub fn persisted_state(&self) -> PersistedSessionState {
        PersistedSessionState {
            snapshot: self.snapshot.clone(),
            revision: self.revision,
            undo: self.undo.clone(),
            redo: self.redo.clone(),
        }
    }

    pub fn undo_history(&self) -> &[SessionHistoryEntry] {
        &self.undo
    }

    pub fn redo_history(&self) -> &[SessionHistoryEntry] {
        &self.redo
    }

    pub fn check_asset_removal(&self, identity: &StableId) -> Result<(), SessionError> {
        let asset = self
            .snapshot
            .assets
            .iter()
            .find(|asset| &asset.identity == identity)
            .ok_or_else(|| SessionError::AssetNotFound(identity.clone()))?;
        if asset
            .classic_resource
            .as_ref()
            .and_then(|resource| monster_appearance_pair_base(&self.snapshot, resource))
            .is_some()
        {
            return Err(SessionError::InvalidMonsterAppearance(
                "a monster appearance pair must be removed atomically".into(),
            ));
        }
        let typed_use = self
            .references()
            .iter()
            .any(|reference| crate::references::reference_targets_asset(reference, asset));
        if typed_use {
            return Err(SessionError::AssetInUse(identity.clone()));
        }
        Ok(())
    }

    pub fn snapshot(&self) -> &ProjectSnapshot {
        &self.snapshot
    }

    pub fn references(&self) -> Vec<ReferenceDescriptor> {
        self.projections.references(&self.snapshot).to_vec()
    }

    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        self.projections.diagnostics(&self.snapshot).to_vec()
    }

    /// Presentation may show available counts without starting a full validation pass.
    pub fn cached_diagnostics(&self) -> Option<&[Diagnostic]> {
        self.projections.cached_diagnostics()
    }

    /// Navigation may reuse counts without deriving every project relationship.
    pub fn cached_references(&self) -> Option<&[ReferenceDescriptor]> {
        self.projections.cached_references()
    }

    pub fn execute(
        &mut self,
        request: ExpectedRevisionCommand<EditorCommand>,
    ) -> Result<ChangeProjection, SessionError> {
        if request.expected_revision != self.revision {
            return Err(SessionError::RevisionConflict {
                expected: request.expected_revision,
                actual: self.revision,
            });
        }
        match request.command {
            EditorCommand::Undo => self.undo(),
            EditorCommand::Redo => self.redo(),
            command => self.apply(command),
        }
    }

    /// Commits an adapter-decoded whole scenario as a new, non-undoable editing baseline.
    /// The imported snapshot never crosses the host transport; routine commands remain bounded.
    pub fn commit_classic_scenario_import(
        &mut self,
        expected_revision: Revision,
        mut imported: ProjectSnapshot,
    ) -> Result<ChangeProjection, SessionError> {
        if expected_revision != self.revision {
            return Err(SessionError::RevisionConflict {
                expected: expected_revision,
                actual: self.revision,
            });
        }
        if imported.project_id != self.snapshot.project_id {
            return Err(SessionError::InvalidClassicImport(
                "whole-scenario import cannot replace the project identity".into(),
            ));
        }
        if !matches!(imported.origin, ProjectOrigin::Imported { .. }) {
            return Err(SessionError::InvalidClassicImport(
                "whole-scenario import must retain an imported compatibility annex".into(),
            ));
        }
        imported.normalize();
        let before = std::mem::replace(&mut self.snapshot, imported);
        let changed_entities = vec![self.snapshot.project_id.clone()];
        let settings_affected =
            action_settings::affected_sources(&before, &self.snapshot, &changed_entities);
        self.undo.clear();
        self.redo.clear();
        Ok(self.advance(changed_entities, false, settings_affected))
    }

    fn apply(&mut self, command: EditorCommand) -> Result<ChangeProjection, SessionError> {
        if self.staging_import {
            return self.apply_staged_import(command);
        }
        let allows_noop = matches!(
            &command,
            EditorCommand::ApplyMonsterDraft { .. } | EditorCommand::ClassicRuleSelection(_)
        );
        let references_unchanged = self.leaves_references_unchanged(&command);
        let before = self.snapshot.clone();
        let changed_entities = self.apply_domain_command(command)?;
        if allows_noop && changed_entities.is_empty() {
            return Ok(change_projection::build(
                self,
                self.revision,
                Vec::new(),
                true,
                BTreeSet::new(),
            ));
        }

        let settings_affected = if references_unchanged {
            BTreeSet::new()
        } else {
            action_settings::affected_sources(&before, &self.snapshot, &changed_entities)
        };
        push_history(
            &mut self.undo,
            SessionHistoryEntry {
                snapshot: before,
                changed_entities: changed_entities.clone(),
                references_unchanged,
            },
        );
        self.redo.clear();
        Ok(self.advance(changed_entities, references_unchanged, settings_affected))
    }

    fn undo(&mut self) -> Result<ChangeProjection, SessionError> {
        let entry = self.undo.pop().ok_or(SessionError::NothingToUndo)?;
        let settings_affected = if entry.references_unchanged {
            BTreeSet::new()
        } else {
            action_settings::affected_sources(
                &self.snapshot,
                &entry.snapshot,
                &entry.changed_entities,
            )
        };
        let current = std::mem::replace(&mut self.snapshot, entry.snapshot);
        push_history(
            &mut self.redo,
            SessionHistoryEntry {
                snapshot: current,
                changed_entities: entry.changed_entities.clone(),
                references_unchanged: entry.references_unchanged,
            },
        );
        Ok(self.advance(
            entry.changed_entities,
            entry.references_unchanged,
            settings_affected,
        ))
    }

    fn redo(&mut self) -> Result<ChangeProjection, SessionError> {
        let entry = self.redo.pop().ok_or(SessionError::NothingToRedo)?;
        let settings_affected = if entry.references_unchanged {
            BTreeSet::new()
        } else {
            action_settings::affected_sources(
                &self.snapshot,
                &entry.snapshot,
                &entry.changed_entities,
            )
        };
        let legacy_import = import_history::is_legacy_import(
            &self.snapshot,
            &entry.snapshot,
            &entry.changed_entities,
        );
        let current = std::mem::replace(&mut self.snapshot, entry.snapshot);
        if legacy_import {
            self.undo.clear();
        } else {
            push_history(
                &mut self.undo,
                SessionHistoryEntry {
                    snapshot: current,
                    changed_entities: entry.changed_entities.clone(),
                    references_unchanged: entry.references_unchanged,
                },
            );
        }
        Ok(self.advance(
            entry.changed_entities,
            entry.references_unchanged,
            settings_affected,
        ))
    }

    fn advance(
        &mut self,
        changed_entities: Vec<StableId>,
        references_unchanged: bool,
        settings_affected: BTreeSet<StableId>,
    ) -> ChangeProjection {
        self.projections.invalidate_discovery();
        if !references_unchanged {
            self.projections = projections::SessionProjections::default();
        }
        let previous_revision = self.revision;
        self.revision.0 += 1;
        change_projection::build(
            self,
            previous_revision,
            changed_entities,
            references_unchanged,
            settings_affected,
        )
    }
}

fn push_history(history: &mut Vec<SessionHistoryEntry>, entry: SessionHistoryEntry) {
    history.push(entry);
    trim_history(history);
}

fn trim_history(history: &mut Vec<SessionHistoryEntry>) {
    let excess = history.len().saturating_sub(SESSION_HISTORY_ENTRY_LIMIT);
    if excess > 0 {
        history.drain(..excess);
    }
}

#[cfg(test)]
mod tests;
