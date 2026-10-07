use super::application_hooks::project_application_hooks;
use super::map_references::validate_program_context_and_map_references;
use super::random_rectangles::validate_random_rectangle_references;
use super::references::ProgramReferences;
use super::triggers::{
    project_rebuilt_v3_selected_trigger_programs, project_rebuilt_v3_trigger_programs,
};
use super::{
    RebuiltV3ProgramOwnerKind, RebuiltV3ScenarioDocument, RebuiltV3ScenarioError,
    RebuiltV3ScenarioProgram, imported_extra_code_tail,
};
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::{
    RebuiltV3ComplexEncounterProjection, RebuiltV3ReachabilityReport,
    RebuiltV3SimpleEncounterProjection,
};
use std::collections::BTreeSet;

type ScenarioProjection = (
    RebuiltV3ScenarioDocument,
    RebuiltV3SimpleEncounterProjection,
    RebuiltV3ComplexEncounterProjection,
);

pub fn project_rebuilt_v3_scenario(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3ScenarioDocument, RebuiltV3ScenarioError> {
    project_rebuilt_v3_scenario_filtered(snapshot, None).map(|(document, _, _)| document)
}

struct ScenarioSelection {
    program_ids: BTreeSet<StableId>,
    simple_encounter_ids: BTreeSet<u32>,
    complex_encounter_ids: BTreeSet<u32>,
}

pub(crate) fn project_rebuilt_v3_selected_scenario(
    snapshot: &ProjectSnapshot,
    reachability: &RebuiltV3ReachabilityReport,
) -> Result<ScenarioProjection, RebuiltV3ScenarioError> {
    let selection = ScenarioSelection {
        program_ids: reachability.reachable_program_ids.iter().cloned().collect(),
        simple_encounter_ids: reachability
            .reachable_simple_encounter_ids
            .iter()
            .copied()
            .collect(),
        complex_encounter_ids: reachability
            .reachable_complex_encounter_ids
            .iter()
            .copied()
            .collect(),
    };
    project_rebuilt_v3_scenario_filtered(snapshot, Some(&selection))
}

fn project_rebuilt_v3_scenario_filtered(
    snapshot: &ProjectSnapshot,
    selection: Option<&ScenarioSelection>,
) -> Result<ScenarioProjection, RebuiltV3ScenarioError> {
    let contract = snapshot
        .scenario_application
        .as_ref()
        .ok_or(RebuiltV3ScenarioError::MissingApplicationContract)?;
    let (programs, simple, complex) = project_programs(snapshot, selection)?;
    let program_ids = unique_program_ids(&programs)?;
    let timed = match selection {
        Some(_) => crate::rebuilt::encounters::project_rebuilt_v3_selected_timed_encounters(
            snapshot,
            &program_ids,
        ),
        None => crate::rebuilt::project_rebuilt_v3_timed_encounters(snapshot),
    }
    .map_err(|error| RebuiltV3ScenarioError::InvalidTimedEncounter(error.to_string()))?;
    let references = ProgramReferences::new(
        snapshot,
        &simple,
        &complex,
        program_ids,
        selection.is_some(),
    );
    references.validate(&programs)?;
    validate_timed_programs(&programs, timed.timed_encounters)?;
    if !references.allow_deferred {
        validate_random_rectangle_references(snapshot, &references.program_ids)?;
    }
    validate_program_context_and_map_references(snapshot, &programs, references.allow_deferred)?;
    let application_hooks = project_application_hooks(
        snapshot,
        &contract.hooks,
        &references.program_ids,
        references.allow_deferred,
    )?;
    let document = RebuiltV3ScenarioDocument {
        kind: "realmz2.scenario".into(),
        schema_version: 3,
        application_hooks,
        programs,
        scenario_actions: [],
        state_definitions: [],
        migrations: [],
        extra_code_tail: imported_extra_code_tail(snapshot),
    };
    Ok((document, simple, complex))
}

fn project_programs(
    snapshot: &ProjectSnapshot,
    selection: Option<&ScenarioSelection>,
) -> Result<
    (
        Vec<RebuiltV3ScenarioProgram>,
        RebuiltV3SimpleEncounterProjection,
        RebuiltV3ComplexEncounterProjection,
    ),
    RebuiltV3ScenarioError,
> {
    // Failure order is trigger projection, Simple encounters, then Complex encounters.
    let trigger = match selection {
        Some(selection) => {
            project_rebuilt_v3_selected_trigger_programs(snapshot, &selection.program_ids)?
        }
        None => project_rebuilt_v3_trigger_programs(snapshot)?,
    };
    let simple = match selection {
        Some(selection) => {
            crate::rebuilt::encounters::project_rebuilt_v3_selected_simple_encounters(
                snapshot,
                &selection.simple_encounter_ids,
                &selection.program_ids,
            )?
        }
        None => crate::rebuilt::project_rebuilt_v3_simple_encounters(snapshot)?,
    };
    let complex = match selection {
        Some(selection) => {
            crate::rebuilt::encounters::project_rebuilt_v3_selected_complex_encounters(
                snapshot,
                &selection.complex_encounter_ids,
                &selection.program_ids,
            )?
        }
        None => crate::rebuilt::project_rebuilt_v3_complex_encounters(snapshot)?,
    };
    let mut programs = trigger.programs;
    programs.extend(simple.programs.iter().cloned());
    programs.extend(complex.programs.iter().cloned());
    programs.sort_by_key(|program| program.id.clone());
    Ok((programs, simple, complex))
}

fn unique_program_ids(
    programs: &[RebuiltV3ScenarioProgram],
) -> Result<BTreeSet<StableId>, RebuiltV3ScenarioError> {
    let mut ids = BTreeSet::new();
    for program in programs {
        if !ids.insert(program.id.clone()) {
            return Err(RebuiltV3ScenarioError::DuplicateProgramId(
                program.id.clone(),
            ));
        }
    }
    Ok(ids)
}

fn validate_timed_programs(
    programs: &[RebuiltV3ScenarioProgram],
    encounters: Vec<crate::rebuilt::RebuiltV3TimedEncounter>,
) -> Result<(), RebuiltV3ScenarioError> {
    for encounter in encounters {
        let valid_owner = programs.iter().any(|program| {
            program.id == encounter.program_id
                && program.owner_kind == RebuiltV3ProgramOwnerKind::ExtraActionPoint
        });
        if !valid_owner {
            return Err(RebuiltV3ScenarioError::InvalidTimedEncounterProgram {
                encounter_id: encounter.id,
                program: encounter.program_id,
            });
        }
    }
    Ok(())
}
