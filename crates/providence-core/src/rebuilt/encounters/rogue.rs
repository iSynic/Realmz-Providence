use super::{RebuiltV3RogueEncounter, RebuiltV3RogueEncounterError};
use crate::{codecs::validate_rogue_encounter_shape, model::ProjectSnapshot};
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_rogue_encounters(
    snapshot: &ProjectSnapshot,
) -> Result<Vec<RebuiltV3RogueEncounter>, RebuiltV3RogueEncounterError> {
    project_rebuilt_v3_rogue_encounters_filtered(snapshot, None)
}

pub(crate) fn project_rebuilt_v3_selected_rogue_encounters(
    snapshot: &ProjectSnapshot,
    encounter_ids: &BTreeSet<u32>,
) -> Result<Vec<RebuiltV3RogueEncounter>, RebuiltV3RogueEncounterError> {
    project_rebuilt_v3_rogue_encounters_filtered(snapshot, Some(encounter_ids))
}

fn project_rebuilt_v3_rogue_encounters_filtered(
    snapshot: &ProjectSnapshot,
    encounter_ids: Option<&BTreeSet<u32>>,
) -> Result<Vec<RebuiltV3RogueEncounter>, RebuiltV3RogueEncounterError> {
    let mut records = snapshot
        .rogue_encounters
        .iter()
        .filter(|encounter| encounter_ids.is_none_or(|ids| ids.contains(&encounter.native_id.0)))
        .collect::<Vec<_>>();
    records.sort_by_key(|encounter| encounter.native_id);
    let mut ids = BTreeSet::new();
    records
        .into_iter()
        .map(|encounter| {
            if !ids.insert(encounter.native_id.0) {
                return Err(RebuiltV3RogueEncounterError::DuplicateId(
                    encounter.native_id.0,
                ));
            }
            validate_rogue_encounter_shape(encounter).map_err(|error| {
                RebuiltV3RogueEncounterError::InvalidRecord {
                    encounter: encounter.identity.clone(),
                    reason: error.to_string(),
                }
            })?;
            Ok(RebuiltV3RogueEncounter {
                id: encounter.native_id.0,
                type_flags: encounter.type_flags,
                modifiers: encounter.modifiers,
                success_codes: encounter.success_codes,
                failure_codes: encounter.failure_codes,
                success_text: encounter.success_text,
                failure_text: encounter.failure_text,
                success_sounds: encounter.success_sounds,
                failure_sounds: encounter.failure_sounds,
                spell_id: encounter.spell,
                low_damage: encounter.low_damage,
                high_damage: encounter.high_damage,
                tumblers: encounter.tumblers,
                prompts: encounter.prompts,
                prompt_sounds: encounter.prompt_sounds,
            })
        })
        .collect()
}
