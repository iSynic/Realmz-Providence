use crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use crate::codecs::validate_timed_encounter_shape;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::ProjectOrigin;
use crate::model::StableId;
use crate::model::TimedEncounter;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_timed_encounter_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        timed_encounters: Vec<TimedEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_timed_encounter_import(&sources, &timed_encounters)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .timed_encounters
                    .iter()
                    .chain(timed_encounters.iter())
                    .map(|encounter| encounter.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.timed_encounters = timed_encounters;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_timed_encounter(
        &mut self,
        mut encounter: Box<TimedEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        encounter.authored = true;
        validate_timed_encounter_shape(&encounter).map_err(|error| {
            SessionError::InvalidTimedEncounter {
                identity: encounter.identity.clone(),
                reason: error.to_string(),
            }
        })?;
        let existing = self
            .snapshot
            .timed_encounters
            .iter_mut()
            .find(|candidate| candidate.identity == encounter.identity)
            .ok_or_else(|| SessionError::TimedEncounterNotFound(encounter.identity.clone()))?;
        if existing.native_id != encounter.native_id {
            return Err(SessionError::InvalidTimedEncounter {
                identity: encounter.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = encounter.identity.clone();
        *existing = *encounter;
        Ok(vec![identity])
    }

    pub(super) fn retarget_timed_encounter_reference(
        &mut self,
        source: StableId,
        field: String,
        target_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let encounter = self
            .snapshot
            .timed_encounters
            .iter_mut()
            .find(|candidate| candidate.identity == source)
            .ok_or_else(|| SessionError::TimedEncounterNotFound(source.clone()))?;
        match field.as_str() {
            "door" => encounter.door = target_id,
            "requiredItem" => encounter.required_item = target_id,
            _ => {
                return Err(SessionError::InvalidTimedEncounterReference { source, field });
            }
        }
        encounter.authored = true;
        Ok(vec![source])
    }
}

pub(super) fn validate_classic_timed_encounter_import(
    sources: &[ClassicSourceBlob],
    encounters: &[TimedEncounter],
) -> Result<(), SessionError> {
    let source = sources
        .iter()
        .find(|source| source.native_path == "Data TD3")
        .ok_or_else(|| {
            SessionError::InvalidClassicImport(
                "decoded Timed Encounters require Data TD3 provenance".into(),
            )
        })?;
    if source.byte_length as usize / TIMED_ENCOUNTER_RECORD_BYTES != encounters.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data TD3 complete-row count does not match the decoded Timed Encounter count".into(),
        ));
    }
    for (index, encounter) in encounters.iter().enumerate() {
        validate_timed_encounter_shape(encounter)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
        if encounter.native_id.0 != index as u32 || encounter.authored {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data TD3 row {index} does not have canonical imported identity and state"
            )));
        }
    }
    Ok(())
}
