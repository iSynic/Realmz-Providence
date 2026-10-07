use super::result_programs::{ResultFamily, ResultPrograms};
use super::{
    RebuiltV3ComplexEncounter, RebuiltV3ComplexEncounterProjection, project_rebuilt_v3_messages,
};
use crate::rebuilt::scenario::{RebuiltV3ScenarioError, extra_code_index};
use crate::{
    codecs::validate_complex_encounter_shape,
    model::{ComplexEncounter, ProjectOrigin, ProjectSnapshot, StableId},
};
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_complex_encounters(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3ComplexEncounterProjection, RebuiltV3ScenarioError> {
    project_rebuilt_v3_complex_encounters_filtered(snapshot, None)
}

pub(crate) fn project_rebuilt_v3_selected_complex_encounters(
    snapshot: &ProjectSnapshot,
    encounter_ids: &BTreeSet<u32>,
    program_ids: &BTreeSet<StableId>,
) -> Result<RebuiltV3ComplexEncounterProjection, RebuiltV3ScenarioError> {
    project_rebuilt_v3_complex_encounters_filtered(snapshot, Some((encounter_ids, program_ids)))
}

fn project_rebuilt_v3_complex_encounters_filtered(
    snapshot: &ProjectSnapshot,
    selection: Option<(&BTreeSet<u32>, &BTreeSet<StableId>)>,
) -> Result<RebuiltV3ComplexEncounterProjection, RebuiltV3ScenarioError> {
    let extra_codes = extra_code_index(&snapshot.extra_codes)?;
    let imported = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let message_ids = if selection.is_some() {
        snapshot
            .messages
            .iter()
            .map(|message| message.native_id.0)
            .collect()
    } else {
        project_rebuilt_v3_messages(snapshot)?
            .into_iter()
            .map(|message| message.id)
            .collect::<BTreeSet<_>>()
    };
    let rogue_ids = snapshot
        .rogue_encounters
        .iter()
        .map(|encounter| i64::from(encounter.native_id.0))
        .collect::<BTreeSet<_>>();
    let results = ResultPrograms {
        extra_codes: &extra_codes,
        defer_missing_extra_code: selection.is_some() && imported,
        selected_programs: None,
    };
    let mut records = snapshot
        .complex_encounters
        .iter()
        .filter(|encounter| selection.is_none_or(|(ids, _)| ids.contains(&encounter.native_id.0)))
        .collect::<Vec<_>>();
    records.sort_by_key(|encounter| encounter.native_id);
    let mut ids = BTreeSet::new();
    let mut complex_encounters = Vec::with_capacity(records.len());
    let mut programs = Vec::with_capacity(records.len() * 4);
    for encounter in records {
        validate_record(encounter, &mut ids, &message_ids, &rogue_ids, imported)?;
        complex_encounters.push(project_record(encounter));
        results.append(
            &mut programs,
            ResultFamily::Complex,
            encounter.native_id.0,
            &encounter.actions,
        )?;
    }
    Ok(RebuiltV3ComplexEncounterProjection {
        complex_encounters,
        programs,
    })
}

fn validate_record(
    encounter: &ComplexEncounter,
    ids: &mut BTreeSet<u32>,
    message_ids: &BTreeSet<u32>,
    rogue_ids: &BTreeSet<i64>,
    imported: bool,
) -> Result<(), RebuiltV3ScenarioError> {
    if !ids.insert(encounter.native_id.0) {
        return Err(RebuiltV3ScenarioError::DuplicateComplexEncounterId(
            encounter.native_id.0,
        ));
    }
    validate_complex_encounter_shape(encounter).map_err(|error| {
        RebuiltV3ScenarioError::InvalidComplexEncounter {
            encounter: encounter.identity.clone(),
            reason: error.to_string(),
        }
    })?;
    if !imported
        && !message_ids.contains(&u32::from(
            encounter.prompt_message_native_id.unsigned_abs(),
        ))
    {
        return Err(RebuiltV3ScenarioError::MissingComplexEncounterMessage {
            encounter: encounter.identity.clone(),
            message_id: encounter.prompt_message_native_id,
        });
    }
    if !imported && encounter.thief && !rogue_ids.contains(&i64::from(encounter.thief_success)) {
        return Err(RebuiltV3ScenarioError::MissingRogueEncounter {
            encounter: encounter.identity.clone(),
            rogue_id: encounter.thief_success,
        });
    }

    Ok(())
}

fn project_record(encounter: &ComplexEncounter) -> RebuiltV3ComplexEncounter {
    RebuiltV3ComplexEncounter {
        id: encounter.native_id.0,
        prompt_message_id: encounter.prompt_message_native_id,
        action_result: encounter.action_result,
        word_result: encounter.word_result,
        groups: encounter.groups,
        spell_ids: encounter.spell_ids,
        spell_results: encounter.spell_results,
        item_ids: encounter.item_ids,
        item_results: encounter.item_results,
        can_back_out: encounter.can_back_out,
        thief: encounter.thief,
        max_times: encounter.max_times,
        caste_success: encounter.caste_success,
        thief_success: encounter.thief_success,
        thief_fail: encounter.thief_fail,
        texts: encounter.texts.clone(),
    }
}
