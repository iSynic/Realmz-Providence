use std::collections::BTreeSet;

use crate::{
    model::{ProjectSnapshot, StableId},
    rebuilt::{project_rebuilt_v3_trigger_programs, runtime_ids::application_program_id},
    references::{
        ByteProvenance, FieldPath, ReferenceDescriptor, RepairAction, ResolutionState, TargetKind,
    },
};

pub(crate) fn references_for_application(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let Some(application) = &snapshot.scenario_application else {
        return Vec::new();
    };
    let program_ids = project_rebuilt_v3_trigger_programs(snapshot)
        .map(|projection| {
            projection
                .programs
                .into_iter()
                .map(|program| program.id)
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default();
    [
        ("startGame", 0, &application.hooks.start_game),
        ("partyDeath", 1, &application.hooks.party_death),
        ("endAdventure", 2, &application.hooks.end_adventure),
        ("shop", 4, &application.hooks.shop),
        ("temple", 5, &application.hooks.temple),
    ]
    .into_iter()
    .filter_map(|(field, slot, target)| {
        target.as_ref().map(|target| {
            let extra_action_point = target.0.strip_prefix("extra-action-point:");
            let (target_kind, target_id, resolved) = if let Some(native_id) = extra_action_point {
                (
                    TargetKind::ExtraActionPoint,
                    native_id.to_owned(),
                    native_id.parse::<u32>().ok().is_some_and(|native_id| {
                        snapshot
                            .extra_action_points
                            .iter()
                            .any(|row| row.native_id.0 == native_id)
                    }),
                )
            } else {
                (
                    TargetKind::ScenarioProgram,
                    target.0.clone(),
                    program_ids.contains(&application_program_id(snapshot, target)),
                )
            };
            application_reference(
                snapshot.project_id.clone(),
                format!("scenarioApplication.hooks.{field}"),
                target_kind,
                target_id,
                resolved,
                slot,
            )
        })
    })
    .collect()
}

fn application_reference(
    source: StableId,
    field: String,
    target_kind: TargetKind,
    target_id: String,
    resolved: bool,
    slot: u32,
) -> ReferenceDescriptor {
    ReferenceDescriptor {
        source,
        field: FieldPath(field),
        target_kind,
        target_id,
        required: true,
        stock_fallback: None,
        resolution: if resolved {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: if resolved {
            vec![RepairAction::Retarget]
        } else {
            vec![RepairAction::Retarget, RepairAction::CreateTarget]
        },
        byte_provenance: Some(ByteProvenance {
            native_path: "Global".into(),
            record_index: 0,
            byte_start: slot * 2,
            byte_end: slot * 2 + 2,
        }),
    }
}
