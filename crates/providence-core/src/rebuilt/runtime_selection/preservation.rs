//! Physical imported records are package roots; diagnostic reachability stays separate.
use super::RebuiltV3ReachableRuntimeError;
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::{
    RebuiltV3ReachabilityReport, RebuiltV3ReachableCombatError, RebuiltV3ReachableCombatSelection,
};
use std::collections::BTreeSet;

pub(super) fn expand(snapshot: &ProjectSnapshot, reachability: &mut RebuiltV3ReachabilityReport) {
    let mut programs = snapshot
        .world
        .action_points
        .iter()
        .map(crate::rebuilt::runtime_ids::action_point_program_id)
        .chain(
            snapshot
                .extra_action_points
                .iter()
                .map(|row| StableId(format!("xap:{}", row.native_id.0))),
        )
        .collect::<BTreeSet<_>>();
    for (kind, ids) in [
        (
            "simple",
            snapshot
                .simple_encounters
                .iter()
                .map(|row| row.native_id.0)
                .collect::<Vec<_>>(),
        ),
        (
            "complex",
            snapshot
                .complex_encounters
                .iter()
                .map(|row| row.native_id.0)
                .collect::<Vec<_>>(),
        ),
    ] {
        for id in ids {
            for result in 0..4 {
                programs.insert(StableId(format!("{kind}:{id}:result:{result}")));
            }
        }
    }
    reachability.reachable_program_ids = programs.into_iter().collect();
    reachability.reachable_simple_encounter_ids = snapshot
        .simple_encounters
        .iter()
        .map(|row| row.native_id.0)
        .collect();
    reachability.reachable_complex_encounter_ids = snapshot
        .complex_encounters
        .iter()
        .map(|row| row.native_id.0)
        .collect();
    reachability.reachable_battle_ids =
        snapshot.battles.iter().map(|row| row.native_id.0).collect();
}

pub(super) fn retain_monsters(
    snapshot: &ProjectSnapshot,
    diagnostic: &RebuiltV3ReachabilityReport,
    combat: &mut RebuiltV3ReachableCombatSelection,
) -> Result<(), RebuiltV3ReachableRuntimeError> {
    let ids = diagnostic.reachable_monster_ids.iter().copied().collect();
    let (catalog, _) =
        crate::rebuilt::monsters::project_rebuilt_v3_package_monster_catalog(snapshot, &ids)
            .map_err(RebuiltV3ReachableCombatError::Monsters)
            .map_err(RebuiltV3ReachableRuntimeError::Combat)?;
    combat.monsters = catalog.monsters;
    combat.monster_sets = catalog.monster_sets;
    combat.monster_descriptions = catalog.monster_descriptions;
    Ok(())
}
