use super::{
    MonsterLibraryChangeProjection, MonsterLibraryEntry, MonsterLibraryError,
    MonsterLibrarySession, canonical_template, normalized_label, validate_entry,
    validated_description,
};
use crate::model::{MonsterRecord, NativeRecordId, StableId};
use crate::session::MonsterDraftChange;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[cfg(test)]
#[path = "draft_tests.rs"]
mod tests;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonsterLibraryDraft {
    pub identity: StableId,
    #[serde(default)]
    pub fields: BTreeMap<String, Value>,
    pub preferred_scenario_monster_id: Option<NativeRecordId>,
    pub description: Option<String>,
    pub not_on_menu: Option<bool>,
}

impl MonsterLibrarySession {
    pub fn monster_library_draft_issues(
        &self,
        draft: &MonsterLibraryDraft,
    ) -> Vec<crate::session::MonsterDraftIssue> {
        let mut probes = Vec::new();
        let empty = MonsterLibraryDraft {
            identity: draft.identity.clone(),
            fields: BTreeMap::new(),
            preferred_scenario_monster_id: None,
            description: None,
            not_on_menu: None,
        };
        for (field, value) in &draft.fields {
            let mut probe = empty.clone();
            probe.fields.insert(field.clone(), value.clone());
            probes.push((field.clone(), probe));
        }
        if draft.description.is_some() {
            let mut probe = empty.clone();
            probe.description = draft.description.clone();
            probes.push(("description".into(), probe));
        }
        if draft.preferred_scenario_monster_id.is_some() {
            let mut probe = empty.clone();
            probe.preferred_scenario_monster_id = draft.preferred_scenario_monster_id;
            probes.push(("preferredScenarioMonsterId".into(), probe));
        }
        let mut issues = probes
            .into_iter()
            .take(128)
            .filter_map(|(field, probe)| {
                self.monster_library_draft_changes(&probe)
                    .err()
                    .map(|error| crate::session::MonsterDraftIssue {
                        message: crate::session::monster_draft_fields::issue_message(
                            &field,
                            &error.to_string(),
                        ),
                        field,
                        diagnostic: error.to_string(),
                    })
            })
            .collect::<Vec<_>>();
        if issues.is_empty()
            && let Err(error) = self.monster_library_draft_changes(draft)
        {
            issues.push(crate::session::MonsterDraftIssue {
                field: String::new(),
                message: "The Library draft could not be validated. Check the selected entry and try again.".into(),
                diagnostic: error.to_string(),
            });
        }
        issues
    }

    pub fn monster_library_draft_changes(
        &self,
        draft: &MonsterLibraryDraft,
    ) -> Result<Vec<MonsterDraftChange>, MonsterLibraryError> {
        let entry = self.prepare_record_draft(draft)?;
        let existing = self
            .catalog()
            .entry(&draft.identity)
            .expect("prepared entry exists");
        Ok(crate::session::monster_operation_diff::record_changes(
            &draft.identity,
            &serde_json::to_value(existing).expect("Library entry serialization"),
            &serde_json::to_value(entry).expect("Library entry serialization"),
        ))
    }

    fn prepare_record_draft(
        &self,
        draft: &MonsterLibraryDraft,
    ) -> Result<MonsterLibraryEntry, MonsterLibraryError> {
        let existing = self
            .catalog()
            .custom_entries
            .iter()
            .find(|entry| entry.identity == draft.identity)
            .ok_or_else(|| {
                MonsterLibraryError::ProtectedBuiltIn(
                    "Customize the protected entry before editing it.".into(),
                )
            })?;
        let template =
            crate::session::monster_draft_fields::patch_record(&existing.template, &draft.fields)
                .map_err(|error| MonsterLibraryError::InvalidEntry {
                identity: draft.identity.clone(),
                reason: error.to_string(),
            })?;
        let label = normalized_label(&template.display_name)?;
        let preferred = draft
            .preferred_scenario_monster_id
            .unwrap_or(existing.preferred_scenario_monster_id);
        let mut template = canonical_template(&draft.identity, preferred, template, &label)?;
        if let Some(value) = draft.not_on_menu {
            template.not_on_menu = value;
        }
        let description = draft
            .description
            .as_deref()
            .unwrap_or(&existing.description);
        if draft.description.is_some() {
            crate::session::monster_draft::validate_text(&draft.identity, description, 255)
                .map_err(|error| MonsterLibraryError::InvalidEntry {
                    identity: draft.identity.clone(),
                    reason: error.to_string(),
                })?;
        }
        let mut entry = existing.clone();
        entry.label = label;
        entry.preferred_scenario_monster_id = preferred;
        entry.template = template;
        entry.description = validated_description(description.into())?;
        validate_entry(&entry)?;
        Ok(entry)
    }

    pub(super) fn apply_record_draft(
        &mut self,
        draft: MonsterLibraryDraft,
    ) -> Result<Vec<StableId>, MonsterLibraryError> {
        let entry = self.prepare_record_draft(&draft)?;
        let existing = self
            .catalog
            .custom_entries
            .iter_mut()
            .find(|entry| entry.identity == draft.identity)
            .expect("prepared custom entry exists");
        if existing == &entry {
            return Ok(Vec::new());
        }
        *existing = entry;
        Ok(vec![draft.identity])
    }

    pub(super) fn update_custom_record(
        &mut self,
        identity: StableId,
        label: String,
        preferred: NativeRecordId,
        template: MonsterRecord,
        description: String,
    ) -> Result<Vec<StableId>, MonsterLibraryError> {
        let existing = self
            .catalog
            .custom_entries
            .iter()
            .find(|entry| entry.identity == identity)
            .ok_or_else(|| MonsterLibraryError::EntryNotFound(identity.clone()))?;
        let mut entry = existing.clone();
        entry.label = normalized_label(&label)?;
        entry.preferred_scenario_monster_id = preferred;
        entry.template = canonical_template(&identity, preferred, template, &entry.label)?;
        entry.description = validated_description(description)?;
        validate_entry(&entry)?;
        *self
            .catalog
            .custom_entries
            .iter_mut()
            .find(|entry| entry.identity == identity)
            .expect("validated entry") = entry;
        Ok(vec![identity])
    }

    pub(super) fn unchanged_projection(&self) -> MonsterLibraryChangeProjection {
        MonsterLibraryChangeProjection {
            previous_revision: self.revision(),
            revision: self.revision(),
            changed_entries: Vec::new(),
            changed_entries_total: 0,
            truncated: false,
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
        }
    }
}
