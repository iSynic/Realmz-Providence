use super::result_programs::{ResultFamily, ResultPrograms};
use super::{
    RebuiltV3Message, RebuiltV3SimpleEncounter, RebuiltV3SimpleEncounterProjection,
    RebuiltV3SimpleEncounterResponse, project_rebuilt_v3_messages,
};
use crate::model::{ProjectOrigin, ProjectSnapshot, SimpleEncounter, StableId};
use crate::rebuilt::scenario::{RebuiltV3ScenarioError, extra_code_index};
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_simple_encounters(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3SimpleEncounterProjection, RebuiltV3ScenarioError> {
    project_rebuilt_v3_simple_encounters_filtered(snapshot, None)
}

pub(crate) fn project_rebuilt_v3_selected_simple_encounters(
    snapshot: &ProjectSnapshot,
    encounter_ids: &BTreeSet<u32>,
    program_ids: &BTreeSet<StableId>,
) -> Result<RebuiltV3SimpleEncounterProjection, RebuiltV3ScenarioError> {
    project_rebuilt_v3_simple_encounters_filtered(snapshot, Some((encounter_ids, program_ids)))
}

fn project_rebuilt_v3_simple_encounters_filtered(
    snapshot: &ProjectSnapshot,
    selection: Option<(&BTreeSet<u32>, &BTreeSet<StableId>)>,
) -> Result<RebuiltV3SimpleEncounterProjection, RebuiltV3ScenarioError> {
    let (messages, message_ids) = message_catalog(snapshot, selection.is_some())?;
    let extra_codes = extra_code_index(&snapshot.extra_codes)?;
    let imported = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let results = ResultPrograms {
        extra_codes: &extra_codes,
        defer_missing_extra_code: selection.is_some() && imported,
        selected_programs: selection.map(|(_, ids)| ids),
    };
    let mut records = snapshot
        .simple_encounters
        .iter()
        .filter(|encounter| selection.is_none_or(|(ids, _)| ids.contains(&encounter.native_id.0)))
        .collect::<Vec<_>>();
    records.sort_by_key(|encounter| encounter.native_id);
    let mut ids = BTreeSet::new();
    let mut simple_encounters = Vec::with_capacity(records.len());
    let mut programs = Vec::with_capacity(records.len() * 4);
    let mut excluded_native_ids = Vec::new();
    for encounter in records {
        validate_identity(encounter, &mut ids)?;
        if !simple_encounter_is_runtime_representable(encounter) {
            excluded_native_ids.push(encounter.native_id.0);
            continue;
        }
        validate_record(encounter, &message_ids, imported)?;
        let responses = responses(encounter, imported)?;
        simple_encounters.push(project_record(encounter, responses));
        results.append(
            &mut programs,
            ResultFamily::Simple,
            encounter.native_id.0,
            &encounter.actions,
        )?;
    }
    Ok(RebuiltV3SimpleEncounterProjection {
        messages,
        simple_encounters,
        programs,
        excluded_native_ids,
    })
}

fn message_catalog(
    snapshot: &ProjectSnapshot,
    selected: bool,
) -> Result<(Vec<RebuiltV3Message>, BTreeSet<u32>), RebuiltV3ScenarioError> {
    let messages = if selected {
        Vec::new()
    } else {
        project_rebuilt_v3_messages(snapshot)?
    };
    let ids = if selected {
        snapshot
            .messages
            .iter()
            .map(|message| message.native_id.0)
            .collect()
    } else {
        messages.iter().map(|message| message.id).collect()
    };
    Ok((messages, ids))
}

fn validate_identity(
    encounter: &SimpleEncounter,
    ids: &mut BTreeSet<u32>,
) -> Result<(), RebuiltV3ScenarioError> {
    if !ids.insert(encounter.native_id.0) {
        return Err(RebuiltV3ScenarioError::DuplicateSimpleEncounterId(
            encounter.native_id.0,
        ));
    }
    if encounter.identity.0 != format!("simple-encounter:{}", encounter.native_id.0) {
        return Err(RebuiltV3ScenarioError::InvalidSimpleEncounterIdentity {
            encounter: encounter.identity.clone(),
            native_id: encounter.native_id.0,
        });
    }
    Ok(())
}

fn validate_record(
    encounter: &SimpleEncounter,
    message_ids: &BTreeSet<u32>,
    imported: bool,
) -> Result<(), RebuiltV3ScenarioError> {
    if let Some(action) = encounter.actions.iter().find(|action| action.slot > 31) {
        return Err(
            RebuiltV3ScenarioError::SimpleEncounterActionSlotOutOfRange {
                encounter: encounter.identity.clone(),
                slot: action.slot,
            },
        );
    }
    if !imported
        && !message_ids.contains(&u32::from(
            encounter.prompt_message_native_id.unsigned_abs(),
        ))
    {
        return Err(RebuiltV3ScenarioError::MissingSimpleEncounterMessage {
            encounter: encounter.identity.clone(),
            message_id: encounter.prompt_message_native_id,
        });
    }

    Ok(())
}

fn responses(
    encounter: &SimpleEncounter,
    imported: bool,
) -> Result<Vec<RebuiltV3SimpleEncounterResponse>, RebuiltV3ScenarioError> {
    let mut responses = Vec::new();
    for (choice, label) in encounter.texts.iter().enumerate() {
        if label.trim().is_empty() {
            continue;
        }
        let result = encounter.choice_results[choice];
        if !imported && !(1..=4).contains(&result) {
            return Err(RebuiltV3ScenarioError::InvalidSimpleEncounterResult {
                encounter: encounter.identity.clone(),
                choice,
                result,
            });
        }
        let result_index = i16::from(result) - 1;
        responses.push(RebuiltV3SimpleEncounterResponse {
            id: StableId(format!("simple:{}:choice:{choice}", encounter.native_id.0)),
            label: label.clone(),
            result_program_id: StableId(format!(
                "simple:{}:result:{result_index}",
                encounter.native_id.0
            )),
        });
    }
    if responses.is_empty() {
        return Err(RebuiltV3ScenarioError::MissingSimpleEncounterResponse(
            encounter.identity.clone(),
        ));
    }
    Ok(responses)
}

fn project_record(
    encounter: &SimpleEncounter,
    responses: Vec<RebuiltV3SimpleEncounterResponse>,
) -> RebuiltV3SimpleEncounter {
    RebuiltV3SimpleEncounter {
        id: encounter.native_id.0,
        prompt_message_id: encounter.prompt_message_native_id,
        responses,
        can_back_out: encounter.can_back_out,
        max_times: encounter.max_times,
        caste_success: encounter.caste_success,
    }
}

pub(crate) fn simple_encounter_is_runtime_representable(encounter: &SimpleEncounter) -> bool {
    encounter.has_semantics()
}
