use crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES;
use crate::codecs::validate_rogue_encounter_shape;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::ProjectOrigin;
use crate::model::RogueEncounter;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use crate::session::field_paths::parse_indexed_field;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_rogue_encounter_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        rogue_encounters: Vec<RogueEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_rogue_encounter_import(&sources, &rogue_encounters)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .rogue_encounters
                    .iter()
                    .chain(rogue_encounters.iter())
                    .map(|encounter| encounter.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.rogue_encounters = rogue_encounters;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_rogue_encounter(
        &mut self,
        mut encounter: Box<RogueEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        encounter.authored = true;
        validate_rogue_encounter_shape(&encounter).map_err(|error| {
            SessionError::InvalidRogueEncounter {
                identity: encounter.identity.clone(),
                reason: error.to_string(),
            }
        })?;
        let existing = self
            .snapshot
            .rogue_encounters
            .iter_mut()
            .find(|candidate| candidate.identity == encounter.identity)
            .ok_or_else(|| SessionError::RogueEncounterNotFound(encounter.identity.clone()))?;
        if existing.native_id != encounter.native_id {
            return Err(SessionError::InvalidRogueEncounter {
                identity: encounter.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = encounter.identity.clone();
        *existing = *encounter;
        Ok(vec![identity])
    }

    pub(super) fn retarget_rogue_encounter_reference(
        &mut self,
        source: StableId,
        field: String,
        target_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let encounter_index = self
            .snapshot
            .rogue_encounters
            .iter()
            .position(|encounter| encounter.identity == source)
            .ok_or_else(|| SessionError::RogueEncounterNotFound(source.clone()))?;
        let mut encounter = self.snapshot.rogue_encounters[encounter_index].clone();
        if field == "spell" {
            encounter.spell = target_id;
        } else if field == "prompts[0]" {
            encounter.prompts[0] = target_id;
        } else if field == "prompts[1]" {
            encounter.prompts[1] = target_id;
        } else if field == "promptSounds[0]" {
            encounter.prompt_sounds[0] = target_id;
        } else if let Some(index) = parse_indexed_field(&field, "successText", 8) {
            encounter.success_text[index] = target_id;
        } else if let Some(index) = parse_indexed_field(&field, "failureText", 8) {
            encounter.failure_text[index] = target_id;
        } else if let Some(index) = parse_indexed_field(&field, "successSounds", 8) {
            encounter.success_sounds[index] = target_id;
        } else if let Some(index) = parse_indexed_field(&field, "failureSounds", 8) {
            encounter.failure_sounds[index] = target_id;
        } else {
            return Err(SessionError::InvalidRogueEncounterReference { source, field });
        }
        encounter.authored = true;
        validate_rogue_encounter_shape(&encounter).map_err(|error| {
            SessionError::InvalidRogueEncounter {
                identity: encounter.identity.clone(),
                reason: error.to_string(),
            }
        })?;
        self.snapshot.rogue_encounters[encounter_index] = encounter;
        Ok(vec![source])
    }
}

pub(super) fn validate_classic_rogue_encounter_import(
    sources: &[ClassicSourceBlob],
    encounters: &[RogueEncounter],
) -> Result<(), SessionError> {
    let Some(source) = sources
        .iter()
        .find(|source| source.native_path == "Data TD2")
    else {
        return Err(SessionError::InvalidClassicImport(
            "decoded Rogue encounters require Data TD2 provenance".into(),
        ));
    };
    let complete_rows = source.byte_length as usize / ROGUE_ENCOUNTER_RECORD_BYTES;
    if complete_rows != encounters.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data TD2 complete-row count does not match the decoded Rogue encounter count".into(),
        ));
    }
    for (index, encounter) in encounters.iter().enumerate() {
        validate_rogue_encounter_shape(encounter)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
        if encounter.native_id.0 != index as u32
            || encounter.identity.0 != format!("rogue-encounter:{index}")
            || encounter.authored
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data TD2 row {index} does not have canonical imported identity and state"
            )));
        }
    }
    Ok(())
}
