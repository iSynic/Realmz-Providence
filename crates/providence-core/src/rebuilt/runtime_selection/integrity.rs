use super::{RebuiltV3ReachableRuntimeError, sources::SelectedEncounters};
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::reachability::RebuiltV3ReachabilityReport;
use crate::rebuilt::{RebuiltV3DeferredDisposition, RebuiltV3DeferredReference};
use std::collections::BTreeSet;

// A selected source record disappearing from output is never a deferred reference.
pub(super) fn validate(
    snapshot: &ProjectSnapshot,
    reachability: &RebuiltV3ReachabilityReport,
    encounters: &SelectedEncounters,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) -> Result<(), RebuiltV3ReachableRuntimeError> {
    validate_program_membership(reachability, encounters)?;
    validate_encounter_membership(reachability, encounters)?;
    validate_simple_results(snapshot, encounters, deferred_references)?;
    validate_complex_results(encounters)
}

fn validate_program_membership(
    reachability: &RebuiltV3ReachabilityReport,
    encounters: &SelectedEncounters,
) -> Result<(), RebuiltV3ReachableRuntimeError> {
    let mut required_program_ids = reachability
        .reachable_program_ids
        .iter()
        .map(|id| id.0.clone())
        .collect::<std::collections::BTreeSet<_>>();
    for encounter in &encounters.complex {
        for result in 0..4 {
            required_program_ids.insert(format!("complex:{}:result:{result}", encounter.id));
        }
    }
    ensure_exact_ids(
        "program",
        required_program_ids.into_iter().collect(),
        encounters
            .scenario
            .programs
            .iter()
            .map(|program| program.id.0.clone())
            .collect(),
    )?;
    Ok(())
}

fn validate_encounter_membership(
    reachability: &RebuiltV3ReachabilityReport,
    encounters: &SelectedEncounters,
) -> Result<(), RebuiltV3ReachableRuntimeError> {
    ensure_exact_ids(
        "Simple Encounter",
        reachability
            .reachable_simple_encounter_ids
            .iter()
            .map(u32::to_string)
            .collect(),
        encounters
            .simple
            .iter()
            .map(|encounter| encounter.id.to_string())
            .collect(),
    )?;
    ensure_exact_ids(
        "Complex Encounter",
        reachability
            .reachable_complex_encounter_ids
            .iter()
            .map(u32::to_string)
            .collect(),
        encounters
            .complex
            .iter()
            .map(|encounter| encounter.id.to_string())
            .collect(),
    )?;
    ensure_exact_ids(
        "Rogue Encounter",
        encounters.rogue_ids.iter().map(u32::to_string).collect(),
        encounters
            .rogue
            .iter()
            .map(|encounter| encounter.id.to_string())
            .collect(),
    )?;

    Ok(())
}

fn validate_simple_results(
    snapshot: &ProjectSnapshot,
    encounters: &SelectedEncounters,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) -> Result<(), RebuiltV3ReachableRuntimeError> {
    let emitted_program_ids = encounters
        .scenario
        .programs
        .iter()
        .map(|program| program.id.clone())
        .collect::<std::collections::BTreeSet<_>>();
    for encounter in &encounters.simple {
        for response in &encounter.responses {
            if !emitted_program_ids.contains(&response.result_program_id) {
                if matches!(
                    snapshot.origin,
                    crate::model::ProjectOrigin::Imported { .. }
                ) {
                    if response.result_program_id.0 != format!("simple:{}:result:-1", encounter.id)
                    {
                        deferred_references.insert(RebuiltV3DeferredReference {
                            source: StableId(format!("simple-encounter:{}", encounter.id)),
                            field: response.id.0.clone(),
                            target_kind: "program".into(),
                            target_id: response.result_program_id.0.clone(),
                            reason: "the imported choice result is unavailable".into(),
                            disposition: RebuiltV3DeferredDisposition::Deferred,
                        });
                    }
                    continue;
                }
                return Err(RebuiltV3ReachableRuntimeError::DanglingSimpleResponse {
                    encounter_id: encounter.id,
                    program_id: response.result_program_id.clone(),
                });
            }
        }
    }
    Ok(())
}

fn validate_complex_results(
    encounters: &SelectedEncounters,
) -> Result<(), RebuiltV3ReachableRuntimeError> {
    let emitted_program_ids = encounters
        .scenario
        .programs
        .iter()
        .map(|program| program.id.clone())
        .collect::<BTreeSet<_>>();
    for encounter in &encounters.complex {
        for result in 0..4u8 {
            let program_id = StableId(format!("complex:{}:result:{result}", encounter.id));
            if !emitted_program_ids.contains(&program_id) {
                return Err(RebuiltV3ReachableRuntimeError::DanglingComplexResult {
                    encounter_id: encounter.id,
                    result,
                    program_id,
                });
            }
        }
    }

    Ok(())
}
fn ensure_exact_ids(
    kind: &'static str,
    expected: Vec<String>,
    actual: Vec<String>,
) -> Result<(), RebuiltV3ReachableRuntimeError> {
    if expected == actual {
        Ok(())
    } else {
        Err(RebuiltV3ReachableRuntimeError::SelectionMismatch {
            kind,
            expected,
            actual,
        })
    }
}
