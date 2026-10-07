//! Allocation is a read; a complete guarded draft is the sole authoring write.
use super::{EditorSession, SessionError};
use crate::codecs::{
    SCENARIO_SPELL_BYTES, SCENARIO_SPELL_RECORDS, SPELL_RECORD_BYTES, decode_scenario_spells,
    validate_scenario_spell_name,
};
use crate::model::{SpellDefinition, StableId};
use crate::references::TargetKind;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpellAllocationGuard {
    pub record_index: u16,
    pub destination_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpellCopySource {
    pub identity: StableId,
    pub scope: String,
    pub catalog_fingerprint: String,
    pub definition_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpellRecordDraft {
    pub record_index: u16,
    pub definition: SpellDefinition,
    pub allocation: Option<SpellAllocationGuard>,
    #[serde(default)]
    pub copy_source: Option<SpellCopySource>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpellAllocation {
    pub draft: SpellRecordDraft,
    pub available_slots: usize,
    pub custom_capacity: usize,
}

pub fn new_scenario_spell(index: u16) -> Result<SpellDefinition, SessionError> {
    let classic_id = crate::codecs::scenario_spell_classic_id(index)
        .ok_or_else(|| invalid(index, "Choose a Custom spell slot from 5101 through 5715."))?;
    let mut row = decode_scenario_spells(&[0; SPELL_RECORD_BYTES], None)
        .spells
        .remove(0)
        .definition;
    row.classic_id = classic_id;
    row.record_index = index;
    row.id = StableId(format!("classic.spell.{classic_id}"));
    row.name = crate::codecs::default_scenario_spell_name(index);
    Ok(row)
}

impl EditorSession {
    pub(super) fn preserves_spell_references(
        &self,
        index: u16,
        definition: &SpellDefinition,
    ) -> bool {
        self.snapshot
            .scenario_spells
            .iter()
            .find(|row| row.definition.record_index == index)
            .is_some_and(|row| {
                super::spell_references::signature(&row.definition)
                    == super::spell_references::signature(definition)
            })
    }

    pub fn scenario_spell_is_vacant(&self, index: u16) -> bool {
        self.spell_destination_vacant(index, None)
    }
    pub fn allocate_scenario_spell(
        &self,
        binary: Option<&[u8]>,
        destination: Option<u16>,
    ) -> Result<SpellAllocation, SessionError> {
        if binary.is_some_and(|bytes| bytes.len() < SCENARIO_SPELL_BYTES) {
            return Err(invalid(
                0,
                "The imported Data Spell table is incomplete; no missing slots are inferred.",
            ));
        }
        let free = (0..SCENARIO_SPELL_RECORDS as u16)
            .filter(|index| self.spell_destination_vacant(*index, binary))
            .collect::<Vec<_>>();
        let index = destination
            .or_else(|| free.first().copied())
            .ok_or_else(|| {
                invalid(
                    0,
                    "All 105 Custom spell slots are occupied. No spell was replaced.",
                )
            })?;
        if !free.contains(&index) {
            return Err(invalid(
                index,
                "Choose an empty Custom slot. Names, retained bytes and callers are protected.",
            ));
        }
        Ok(SpellAllocation {
            draft: SpellRecordDraft {
                record_index: index,
                definition: new_scenario_spell(index)?,
                allocation: Some(SpellAllocationGuard {
                    record_index: index,
                    destination_hash: self.spell_destination_hash(index),
                }),
                copy_source: None,
            },
            available_slots: free.len(),
            custom_capacity: SCENARIO_SPELL_RECORDS,
        })
    }

    pub fn spell_draft_issues(&self, draft: &SpellRecordDraft) -> Vec<String> {
        let Ok(mut row) = new_scenario_spell(draft.record_index) else {
            return vec!["Choose a valid Custom spell slot.".into()];
        };
        if row.id != draft.definition.id
            || row.classic_id != draft.definition.classic_id
            || draft.record_index != draft.definition.record_index
        {
            return vec!["Packed spell identity is immutable.".into()];
        }
        row = draft.definition.clone();
        let mut issues = validate_scenario_spell_name(&row)
            .err()
            .map(|error| vec![error.to_string()])
            .unwrap_or_default();
        let prior = self
            .snapshot
            .scenario_spells
            .iter()
            .find(|source| source.definition.record_index == draft.record_index)
            .map(|source| &source.definition);
        let imported = self.snapshot.origin != crate::model::ProjectOrigin::Authored;
        if row.queue_icon > 200
            && (!imported || prior.is_none_or(|old| old.queue_icon != row.queue_icon))
        {
            issues.push("Queue icons support stored values 0–200.".into());
        }
        for (label, low, high, old) in [
            (
                "Fixed damage",
                row.damage_min,
                row.damage_max,
                prior.map(|s| (s.damage_min, s.damage_max)),
            ),
            (
                "Power damage",
                row.power_damage_min,
                row.power_damage_max,
                prior.map(|s| (s.power_damage_min, s.power_damage_max)),
            ),
            (
                "Fixed duration",
                row.duration_min,
                row.duration_max,
                prior.map(|s| (s.duration_min, s.duration_max)),
            ),
            (
                "Power duration",
                row.power_duration_min,
                row.power_duration_max,
                prior.map(|s| (s.power_duration_min, s.power_duration_max)),
            ),
        ] {
            if low > high && (!imported || old != Some((low, high))) {
                issues.push(format!("{label}: Low must not exceed High."));
            }
        }
        issues
    }

    pub(super) fn apply_spell_draft(
        &mut self,
        draft: SpellRecordDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        self.check_spell_draft(&draft)?;
        if self.snapshot.scenario_spells.is_empty() {
            self.snapshot.scenario_spells =
                decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
        }
        self.update_scenario_spell(draft.record_index, draft.definition)
    }

    pub fn check_spell_draft(&self, draft: &SpellRecordDraft) -> Result<(), SessionError> {
        if let Some(issue) = self.spell_draft_issues(draft).first() {
            return Err(invalid(draft.record_index, issue));
        }
        if let Some(guard) = &draft.allocation {
            if guard.record_index != draft.record_index
                || guard.destination_hash != self.spell_destination_hash(draft.record_index)
                || !self.spell_destination_vacant(draft.record_index, None)
            {
                return Err(invalid(
                    draft.record_index,
                    "The reviewed destination changed. Keep the draft and review another slot.",
                ));
            }
        } else if !self
            .snapshot
            .scenario_spells
            .iter()
            .any(|row| row.definition.record_index == draft.record_index)
        {
            return Err(SessionError::ScenarioSpellNotFound(draft.record_index));
        }
        if let Some(source) = &draft.copy_source {
            if source.scope == "scenario" {
                let row = self
                    .snapshot
                    .scenario_spells
                    .iter()
                    .find(|row| row.definition.id == source.identity)
                    .ok_or_else(|| {
                        invalid(
                            draft.record_index,
                            "The copied spell source is no longer present.",
                        )
                    })?;
                if spell_definition_hash(&row.definition) != source.definition_hash {
                    return Err(invalid(
                        draft.record_index,
                        "The copied spell changed after review.",
                    ));
                }
            } else if source.scope != "standard" {
                return Err(invalid(
                    draft.record_index,
                    "Spell copy source must be Scenario or Stock.",
                ));
            }
        }
        Ok(())
    }

    fn spell_destination_hash(&self, index: u16) -> String {
        let row = self
            .snapshot
            .scenario_spells
            .iter()
            .find(|row| row.definition.record_index == index);
        format!(
            "sha256:{:x}",
            Sha256::digest(serde_json::to_vec(&row).expect("Spell source serializes"))
        )
    }

    fn spell_destination_vacant(&self, index: u16, binary: Option<&[u8]>) -> bool {
        let Ok(blank) = new_scenario_spell(index) else {
            return false;
        };
        if self
            .projections
            .references(&self.snapshot)
            .iter()
            .any(|row| {
                row.target_kind == TargetKind::Spell
                    && (row.target_id == blank.id.0
                        || row.target_id == blank.classic_id.to_string())
            })
        {
            return false;
        }
        let row = self
            .snapshot
            .scenario_spells
            .iter()
            .find(|row| row.definition.record_index == index);
        if let Some(row) = row {
            let mut definition = row.definition.clone();
            let level = index / 15 + 1;
            let slot = index % 15 + 1;
            // Divinity's untouched name rows do not occupy zero-filled custom records.
            if !row.name_authored
                && !definition.authored
                && definition.name == format!("Level {level} Spell {slot}")
            {
                definition.name.clone_from(&blank.name);
            }
            definition.authored = false;
            if definition != blank {
                return false;
            }
            if let Some(bytes) = binary {
                let start = usize::from(index) * SPELL_RECORD_BYTES;
                return bytes
                    .get(start..start + SPELL_RECORD_BYTES)
                    .is_some_and(|bytes| bytes.iter().all(|b| *b == 0));
            }
            return true;
        }
        self.snapshot.scenario_spells.is_empty()
            && !self
                .snapshot
                .classic_sources
                .iter()
                .any(|source| source.native_path == "Data Spell")
    }
}

pub fn spell_definition_hash(definition: &SpellDefinition) -> String {
    format!(
        "sha256:{:x}",
        Sha256::digest(serde_json::to_vec(definition).expect("Spell definition serializes"))
    )
}

fn invalid(index: u16, reason: impl ToString) -> SessionError {
    SessionError::InvalidScenarioSpell {
        record_index: index,
        reason: reason.to_string(),
    }
}

#[cfg(test)]
mod tests;
