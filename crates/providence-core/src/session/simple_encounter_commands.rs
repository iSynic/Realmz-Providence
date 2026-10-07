use super::action_step_commands::PointKind;
use crate::model::SimpleEncounter;
use crate::model::StableId;
use crate::session::errors::SessionError;
use crate::session::{EditorSession, SimpleEncounterRecordDraft};
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn create_simple_encounter(
        &mut self,
        source: Option<StableId>,
    ) -> Result<Vec<StableId>, SessionError> {
        let native_id = (0..=i16::MAX as u32)
            .find(|candidate| {
                !self
                    .snapshot
                    .simple_encounters
                    .iter()
                    .any(|encounter| encounter.native_id.0 == *candidate)
            })
            .ok_or_else(|| SessionError::InvalidSimpleEncounter {
                identity: StableId("simple-encounter:new".into()),
                reason: "no Classic Simple Encounter record ID is available".into(),
            })?;
        let identity = StableId(format!("simple-encounter:{native_id}"));
        let mut encounter = if let Some(source) = source {
            self.snapshot
                .simple_encounters
                .iter()
                .find(|candidate| candidate.identity == source)
                .cloned()
                .ok_or(SessionError::SimpleEncounterNotFound(source))?
        } else {
            SimpleEncounter {
                identity: identity.clone(),
                native_id: crate::model::NativeRecordId(native_id),
                actions: Vec::new(),
                choice_results: [0; 4],
                can_back_out: true,
                max_times: 1,
                caste_success: 0,
                prompt_message_native_id: 0,
                texts: std::array::from_fn(|_| String::new()),
                authored: true,
            }
        };
        encounter.identity = identity.clone();
        encounter.native_id = crate::model::NativeRecordId(native_id);
        encounter.authored = true;
        self.snapshot.simple_encounters.push(encounter);
        self.snapshot
            .simple_encounters
            .sort_by_key(|encounter| encounter.native_id);
        Ok(vec![identity])
    }

    pub(super) fn apply_simple_encounter_draft(
        &mut self,
        draft: SimpleEncounterRecordDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        let existing = self
            .snapshot
            .simple_encounters
            .iter()
            .find(|candidate| candidate.identity == draft.source)
            .cloned()
            .ok_or_else(|| SessionError::SimpleEncounterNotFound(draft.source.clone()))?;
        if existing.native_id != draft.native_id {
            return Err(SessionError::InvalidSimpleEncounter {
                identity: draft.source,
                reason: format!(
                    "native ID {} cannot replace native ID {}",
                    draft.native_id.0, existing.native_id.0
                ),
            });
        }

        let mut staged = self.snapshot.clone();
        let changed = super::action_draft_commands::apply_record_steps(
            &mut staged,
            PointKind::SimpleEncounter,
            &draft.source,
            draft.steps,
        )?;
        let actions = staged
            .simple_encounters
            .iter()
            .find(|candidate| candidate.identity == draft.source)
            .map(|candidate| candidate.actions.clone())
            .expect("validated encounter remains in staged snapshot");
        let encounter = SimpleEncounter {
            identity: draft.source.clone(),
            native_id: draft.native_id,
            actions,
            choice_results: draft.choice_results,
            can_back_out: draft.can_back_out,
            max_times: draft.max_times,
            caste_success: draft.caste_success,
            prompt_message_native_id: draft.prompt_message_native_id,
            texts: draft.texts,
            authored: true,
        };
        validate_simple_encounter_draft(&encounter)?;
        *staged
            .simple_encounters
            .iter_mut()
            .find(|candidate| candidate.identity == draft.source)
            .expect("validated encounter remains in staged snapshot") = encounter;
        self.snapshot = staged;
        Ok(changed)
    }

    pub(super) fn retarget_simple_encounter_prompt(
        &mut self,
        source: StableId,
        target_native_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let encounter = self
            .snapshot
            .simple_encounters
            .iter_mut()
            .find(|encounter| encounter.identity == source)
            .ok_or_else(|| SessionError::SimpleEncounterNotFound(source.clone()))?;
        encounter.prompt_message_native_id = target_native_id;
        encounter.authored = true;
        Ok(vec![source])
    }

    pub(super) fn update_simple_encounter(
        &mut self,
        mut encounter: Box<SimpleEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_simple_encounter_draft(&encounter)?;
        let identity = encounter.identity.clone();
        let existing = self
            .snapshot
            .simple_encounters
            .iter_mut()
            .find(|candidate| candidate.identity == identity)
            .ok_or_else(|| SessionError::SimpleEncounterNotFound(identity.clone()))?;
        if existing.native_id != encounter.native_id {
            return Err(SessionError::InvalidSimpleEncounter {
                identity,
                reason: format!(
                    "native ID {} cannot replace native ID {}",
                    encounter.native_id.0, existing.native_id.0
                ),
            });
        }
        encounter.authored = true;
        *existing = *encounter;
        Ok(vec![identity])
    }
}

pub(super) fn validate_simple_encounter_draft(
    encounter: &SimpleEncounter,
) -> Result<(), SessionError> {
    validate_simple_encounter_identity(encounter)?;
    validate_simple_encounter_texts(encounter)?;
    validate_simple_encounter_results(encounter)?;
    validate_simple_encounter_actions(encounter)
}

fn validate_simple_encounter_identity(encounter: &SimpleEncounter) -> Result<(), SessionError> {
    let expected_identity = StableId(format!("simple-encounter:{}", encounter.native_id.0));
    if encounter.identity != expected_identity {
        return Err(SessionError::InvalidSimpleEncounter {
            identity: encounter.identity.clone(),
            reason: format!(
                "native ID {} requires identity {}",
                encounter.native_id.0, expected_identity.0
            ),
        });
    }
    Ok(())
}

fn validate_simple_encounter_texts(encounter: &SimpleEncounter) -> Result<(), SessionError> {
    for (slot, text) in encounter.texts.iter().enumerate() {
        if !text.is_ascii() {
            return Err(SessionError::InvalidSimpleEncounter {
                identity: encounter.identity.clone(),
                reason: format!(
                    "response {slot} contains text outside the currently certified ASCII subset"
                ),
            });
        }
        if text.len() > 79 {
            return Err(SessionError::InvalidSimpleEncounter {
                identity: encounter.identity.clone(),
                reason: format!(
                    "response {slot} uses {} bytes; Classic maximum is 79",
                    text.len()
                ),
            });
        }
    }
    Ok(())
}

fn validate_simple_encounter_results(encounter: &SimpleEncounter) -> Result<(), SessionError> {
    for (slot, result) in encounter.choice_results.iter().copied().enumerate() {
        let supported = (0..=4).contains(&result) || (slot == 0 && result == -4);
        if !supported {
            return Err(SessionError::InvalidSimpleEncounter {
                identity: encounter.identity.clone(),
                reason: format!(
                    "choice {slot} result {result} is unsupported; choose no result, Result 1 through 4, or auto-run Result 4 for the first choice"
                ),
            });
        }
    }
    Ok(())
}

fn validate_simple_encounter_actions(encounter: &SimpleEncounter) -> Result<(), SessionError> {
    let mut slots = BTreeSet::new();
    for action in &encounter.actions {
        if action.slot >= 32 {
            return Err(SessionError::InvalidSimpleEncounter {
                identity: encounter.identity.clone(),
                reason: format!("action slot {} is outside 0 through 31", action.slot),
            });
        }
        if !slots.insert(action.slot) {
            return Err(SessionError::InvalidSimpleEncounter {
                identity: encounter.identity.clone(),
                reason: format!("action slot {} is duplicated", action.slot),
            });
        }
        if !(i8::MIN as i16..=i8::MAX as i16).contains(&action.raw_opcode) {
            return Err(SessionError::InvalidSimpleEncounter {
                identity: encounter.identity.clone(),
                reason: format!(
                    "action opcode {} is outside signed-byte range",
                    action.raw_opcode
                ),
            });
        }
    }
    Ok(())
}
