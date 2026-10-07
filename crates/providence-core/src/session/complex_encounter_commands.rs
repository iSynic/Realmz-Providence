use crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES;
use crate::codecs::validate_complex_encounter_shape;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::ComplexEncounter;
use crate::model::ProjectOrigin;
use crate::model::StableId;
use crate::session::ComplexEncounterRecordDraft;
use crate::session::EditorSession;
use crate::session::action_step_commands::PointKind;
use crate::session::errors::SessionError;
use crate::session::field_paths::parse_complex_action_field;
use crate::session::field_paths::parse_indexed_field;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn create_complex_encounter(
        &mut self,
        source: Option<StableId>,
    ) -> Result<Vec<StableId>, SessionError> {
        let native_id = (0..=i16::MAX as u32)
            .find(|candidate| {
                !self
                    .snapshot
                    .complex_encounters
                    .iter()
                    .any(|encounter| encounter.native_id.0 == *candidate)
            })
            .ok_or_else(|| SessionError::InvalidComplexEncounter {
                identity: StableId("complex-encounter:new".into()),
                reason: "no Classic Complex Encounter record ID is available".into(),
            })?;
        let identity = StableId(format!("complex-encounter:{native_id}"));
        let mut encounter = if let Some(source) = source {
            self.snapshot
                .complex_encounters
                .iter()
                .find(|candidate| candidate.identity == source)
                .cloned()
                .ok_or(SessionError::ComplexEncounterNotFound(source))?
        } else {
            ComplexEncounter {
                identity: identity.clone(),
                native_id: crate::model::NativeRecordId(native_id),
                actions: Vec::new(),
                action_result: 0,
                word_result: 0,
                groups: [0; 8],
                spell_ids: [0; 10],
                spell_results: [0; 10],
                item_ids: [0; 5],
                item_results: [0; 5],
                can_back_out: true,
                thief: false,
                max_times: 1,
                caste_success: 0,
                thief_success: 0,
                thief_fail: 0,
                prompt_message_native_id: 0,
                texts: std::array::from_fn(|_| String::new()),
                authored: true,
            }
        };
        encounter.identity = identity.clone();
        encounter.native_id = crate::model::NativeRecordId(native_id);
        encounter.authored = true;
        self.snapshot.complex_encounters.push(encounter);
        self.snapshot
            .complex_encounters
            .sort_by_key(|encounter| encounter.native_id);
        Ok(vec![identity])
    }

    pub(super) fn apply_complex_encounter_draft(
        &mut self,
        draft: ComplexEncounterRecordDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        let existing = self
            .snapshot
            .complex_encounters
            .iter()
            .find(|candidate| candidate.identity == draft.source)
            .cloned()
            .ok_or_else(|| SessionError::ComplexEncounterNotFound(draft.source.clone()))?;
        if existing.native_id != draft.native_id {
            return Err(SessionError::InvalidComplexEncounter {
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
            PointKind::ComplexEncounter,
            &draft.source,
            draft.steps.clone(),
        )?;
        let actions = staged
            .complex_encounters
            .iter()
            .find(|candidate| candidate.identity == draft.source)
            .map(|candidate| candidate.actions.clone())
            .expect("validated encounter remains in staged snapshot");
        let encounter = complex_encounter_from_draft(draft, actions);
        let identity = encounter.identity.clone();
        validate_complex_encounter_draft(&encounter, Some(&existing))?;
        *staged
            .complex_encounters
            .iter_mut()
            .find(|candidate| candidate.identity == identity)
            .expect("validated encounter remains in staged snapshot") = encounter;
        self.snapshot = staged;
        Ok(changed)
    }

    pub(super) fn import_classic_complex_encounter_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        complex_encounters: Vec<ComplexEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_complex_encounter_import(&sources, &complex_encounters)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .complex_encounters
                    .iter()
                    .chain(complex_encounters.iter())
                    .map(|encounter| encounter.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.complex_encounters = complex_encounters;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_complex_encounter(
        &mut self,
        mut encounter: Box<ComplexEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        encounter.authored = true;
        let existing_index = self
            .snapshot
            .complex_encounters
            .iter()
            .position(|candidate| candidate.identity == encounter.identity)
            .ok_or_else(|| SessionError::ComplexEncounterNotFound(encounter.identity.clone()))?;
        let original = &self.snapshot.complex_encounters[existing_index];
        validate_complex_encounter_draft(&encounter, Some(original))?;
        let existing = &mut self.snapshot.complex_encounters[existing_index];
        if existing.native_id != encounter.native_id {
            return Err(SessionError::InvalidComplexEncounter {
                identity: encounter.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = encounter.identity.clone();
        *existing = *encounter;
        Ok(vec![identity])
    }

    pub(super) fn retarget_complex_encounter_reference(
        &mut self,
        source: StableId,
        field: String,
        target_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let encounter_index = self
            .snapshot
            .complex_encounters
            .iter()
            .position(|encounter| encounter.identity == source)
            .ok_or_else(|| SessionError::ComplexEncounterNotFound(source.clone()))?;
        let mut encounter = self.snapshot.complex_encounters[encounter_index].clone();
        if field == "promptMessage" {
            encounter.prompt_message_native_id = target_id;
        } else if field == "thiefSuccess" {
            encounter.thief_success = i8::try_from(target_id).map_err(|_| {
                SessionError::InvalidComplexEncounterReference {
                    source: source.clone(),
                    field: field.clone(),
                }
            })?;
        } else if let Some(index) =
            parse_indexed_field(&field, "spellIds", encounter.spell_ids.len())
        {
            encounter.spell_ids[index] = target_id;
        } else if let Some(index) = parse_indexed_field(&field, "itemIds", encounter.item_ids.len())
        {
            encounter.item_ids[index] = target_id;
        } else if let Some(index) = parse_complex_action_field(&field) {
            let action = encounter
                .actions
                .iter_mut()
                .find(|action| action.slot as usize == index)
                .ok_or_else(|| SessionError::InvalidComplexEncounterReference {
                    source: source.clone(),
                    field: field.clone(),
                })?;
            action.target_native_id = target_id;
        } else {
            return Err(SessionError::InvalidComplexEncounterReference { source, field });
        }
        encounter.authored = true;
        validate_complex_encounter_shape(&encounter).map_err(|error| {
            SessionError::InvalidComplexEncounter {
                identity: encounter.identity.clone(),
                reason: error.to_string(),
            }
        })?;
        self.snapshot.complex_encounters[encounter_index] = encounter;
        Ok(vec![source])
    }
}

fn complex_encounter_from_draft(
    draft: ComplexEncounterRecordDraft,
    actions: Vec<crate::model::ClassicAction>,
) -> ComplexEncounter {
    ComplexEncounter {
        identity: draft.source,
        native_id: draft.native_id,
        actions,
        action_result: draft.action_result,
        word_result: draft.word_result,
        groups: draft.groups,
        spell_ids: draft.spell_ids,
        spell_results: draft.spell_results,
        item_ids: draft.item_ids,
        item_results: draft.item_results,
        can_back_out: draft.can_back_out,
        thief: draft.thief,
        max_times: draft.max_times,
        caste_success: draft.caste_success,
        thief_success: draft.thief_success,
        thief_fail: draft.thief_fail,
        prompt_message_native_id: draft.prompt_message_native_id,
        texts: draft.texts,
        authored: true,
    }
}

fn validate_complex_encounter_draft(
    encounter: &ComplexEncounter,
    original: Option<&ComplexEncounter>,
) -> Result<(), SessionError> {
    validate_complex_encounter_shape(encounter).map_err(|error| {
        SessionError::InvalidComplexEncounter {
            identity: encounter.identity.clone(),
            reason: error.to_string(),
        }
    })?;
    validate_results(
        encounter.action_result,
        original.map(|row| row.action_result),
        "physical-action success",
        encounter,
    )?;
    validate_results(
        encounter.word_result,
        original.map(|row| row.word_result),
        "typed-reply success",
        encounter,
    )?;
    for (index, result) in encounter.spell_results.iter().copied().enumerate() {
        validate_results(
            result,
            original.map(|row| row.spell_results[index]),
            &format!("magic response {}", index + 1),
            encounter,
        )?;
    }
    for (index, result) in encounter.item_results.iter().copied().enumerate() {
        validate_results(
            result,
            original.map(|row| row.item_results[index]),
            &format!("item response {}", index + 1),
            encounter,
        )?;
    }
    Ok(())
}

fn validate_results(
    result: i8,
    original: Option<i8>,
    field: &str,
    encounter: &ComplexEncounter,
) -> Result<(), SessionError> {
    if (0..=4).contains(&result) || original == Some(result) {
        return Ok(());
    }
    Err(SessionError::InvalidComplexEncounter {
        identity: encounter.identity.clone(),
        reason: format!(
            "{field} result {result} is unsupported; choose no result or Result 1 through 4"
        ),
    })
}

pub(super) fn validate_classic_complex_encounter_import(
    sources: &[ClassicSourceBlob],
    encounters: &[ComplexEncounter],
) -> Result<(), SessionError> {
    let Some(source) = sources
        .iter()
        .find(|source| source.native_path == "Data ED2")
    else {
        return Err(SessionError::InvalidClassicImport(
            "decoded complex encounters require Data ED2 provenance".into(),
        ));
    };
    let complete_rows = source.byte_length as usize / COMPLEX_ENCOUNTER_RECORD_BYTES;
    if complete_rows != encounters.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data ED2 complete-row count does not match the decoded complex encounter count".into(),
        ));
    }
    for (index, encounter) in encounters.iter().enumerate() {
        validate_complex_encounter_shape(encounter)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
        if encounter.native_id.0 != index as u32
            || encounter.identity.0 != format!("complex-encounter:{index}")
            || encounter.authored
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data ED2 row {index} does not have canonical imported identity and state"
            )));
        }
    }
    Ok(())
}
