use super::RebuiltV3WorldError;
use crate::{
    model::ProjectSnapshot,
    rebuilt::{
        RebuiltV3ReachableRuntimeSelection, RebuiltV3ScenarioProgram, RebuiltV3TimedEncounter,
        RebuiltV3Trigger, project_rebuilt_v3_complex_encounters,
        project_rebuilt_v3_simple_encounters, project_rebuilt_v3_timed_encounters,
        project_rebuilt_v3_trigger_programs,
        scenario::project_rebuilt_v3_selected_trigger_programs,
    },
};
use std::collections::BTreeSet;

pub(super) struct WorldPrograms {
    pub triggers: Vec<RebuiltV3Trigger>,
    pub programs: Vec<RebuiltV3ScenarioProgram>,
    pub timed_encounters: Vec<RebuiltV3TimedEncounter>,
}

pub(super) fn project(
    snapshot: &ProjectSnapshot,
    runtime: Option<&RebuiltV3ReachableRuntimeSelection>,
) -> Result<WorldPrograms, RebuiltV3WorldError> {
    if let Some(runtime) = runtime {
        let ids = runtime
            .scenario
            .programs
            .iter()
            .map(|p| p.id.clone())
            .collect::<BTreeSet<_>>();
        let triggers = project_rebuilt_v3_selected_trigger_programs(snapshot, &ids)
            .map_err(RebuiltV3WorldError::Scenario)?;
        Ok(WorldPrograms {
            triggers: triggers.triggers,
            programs: runtime.scenario.programs.clone(),
            timed_encounters: runtime.timed_encounters.clone(),
        })
    } else {
        project_complete(snapshot)
    }
}

fn project_complete(snapshot: &ProjectSnapshot) -> Result<WorldPrograms, RebuiltV3WorldError> {
    let triggers =
        project_rebuilt_v3_trigger_programs(snapshot).map_err(RebuiltV3WorldError::Scenario)?;
    let simple =
        project_rebuilt_v3_simple_encounters(snapshot).map_err(RebuiltV3WorldError::Scenario)?;
    let complex =
        project_rebuilt_v3_complex_encounters(snapshot).map_err(RebuiltV3WorldError::Scenario)?;
    let programs = triggers
        .programs
        .into_iter()
        .chain(simple.programs)
        .chain(complex.programs)
        .collect();
    let timed = project_rebuilt_v3_timed_encounters(snapshot)
        .map_err(RebuiltV3WorldError::TimedEncounter)?;
    Ok(WorldPrograms {
        triggers: triggers.triggers,
        programs,
        timed_encounters: timed.timed_encounters,
    })
}
