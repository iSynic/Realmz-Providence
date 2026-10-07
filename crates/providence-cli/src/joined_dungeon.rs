use crate::output::report_error;
use providence_core::rebuilt::{ApplicationMediaCatalog, project_rebuilt_v3_reachable_runtime};
use providence_storage::ReferenceLibraryStore;
use serde_json::json;
use std::{path::Path, process::ExitCode};

mod input;
mod inventory;
mod media;
mod projections;
mod reachability;
mod resources;
mod round_trip;
mod rules;
mod sources;
mod world;

struct ProjectionCheck {
    valid: bool,
    report: serde_json::Value,
}

pub(crate) fn inspect_joined_dungeon(
    directory: &str,
    application_library_root: Option<&str>,
) -> ExitCode {
    let application_media = match application_library_root {
        Some(root) => match ReferenceLibraryStore::open(root) {
            Ok((_, catalog)) => Some(catalog),
            Err(error) => {
                return report_error(format!(
                    "could not open application media library {root}: {error}"
                ));
            }
        },
        None => None,
    };
    let directory = Path::new(directory);
    let input = match input::load(directory) {
        Ok(input) => input,
        Err(error) => return report_error(error),
    };
    let report = joined_report(directory, input, application_media.as_ref());
    println!(
        "{}",
        serde_json::to_string_pretty(&report.report).expect("joined dungeon report serializes")
    );
    if report.valid {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn joined_report(
    directory: &Path,
    input: input::JoinedInput,
    application: Option<&ApplicationMediaCatalog>,
) -> ProjectionCheck {
    let snapshot = &input.snapshot;
    let random_references = inventory::random_references(snapshot);
    let topology = projections::topology(snapshot);
    let battles = projections::battles(snapshot);
    let random_battles = projections::random_battles(snapshot);
    let referenced_battles = projections::referenced_battles(snapshot);
    let ranges = projections::random_ranges(snapshot);
    let roots = reachability::reachability(snapshot);
    let combat = projections::reachable_combat(snapshot);
    let runtime = project_rebuilt_v3_reachable_runtime(snapshot);
    let runtime_report = reachability::runtime(snapshot, &runtime);
    let media = media::inspect(snapshot, application, runtime.as_ref().ok());
    let valid = JoinedCertificationChecks {
        sources_exact: input.exact_sources.values().all(|exact| *exact),
        topology_valid: topology.valid,
        battle_projection_valid: battles.valid,
        random_battle_projection_valid: random_battles.valid,
        referenced_battle_projection_valid: referenced_battles.valid,
        random_ranges_valid: ranges.valid,
        root_reachability_valid: roots.valid,
        reachable_combat_valid: combat.valid,
        reachable_runtime_valid: runtime_report.valid,
        reachable_media_valid: media.valid,
    }
    .ready();
    let mut report = inventory::base_report(snapshot, directory);
    report["randomRectangles"] = json!(random_references.rectangles);
    report["exactSourceRoundTrips"] = json!(input.exact_sources);
    report["spellCatalogJoin"] = input.spell_report;
    report["scenarioResourceJoin"] = input.resource_report;
    report["randomReferences"] = random_references.report;
    report["randomRangeValidation"] = ranges.report;
    report["topologyProjection"] = topology.report;
    report["battleProjection"] = battles.report;
    report["randomReachableBattleProjection"] = random_battles.report;
    report["referencedBattleProjection"] = referenced_battles.report;
    report["rootReachability"] = roots.report;
    report["reachableCombatSelection"] = combat.report;
    report["reachableRuntimeSelection"] = runtime_report.report;
    report["reachableMediaSelection"] = media.report;
    report["certificationReady"] = json!(valid);
    ProjectionCheck { valid, report }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct JoinedCertificationChecks {
    pub(crate) sources_exact: bool,
    pub(crate) topology_valid: bool,
    pub(crate) battle_projection_valid: bool,
    pub(crate) random_battle_projection_valid: bool,
    pub(crate) referenced_battle_projection_valid: bool,
    pub(crate) random_ranges_valid: bool,
    pub(crate) root_reachability_valid: bool,
    pub(crate) reachable_combat_valid: bool,
    pub(crate) reachable_runtime_valid: bool,
    pub(crate) reachable_media_valid: bool,
}

impl JoinedCertificationChecks {
    pub(crate) fn ready(self) -> bool {
        self.sources_exact
            && self.topology_valid
            && self.battle_projection_valid
            && self.random_battle_projection_valid
            && self.referenced_battle_projection_valid
            && self.random_ranges_valid
            && self.root_reachability_valid
            && self.reachable_combat_valid
            && self.reachable_runtime_valid
            && self.reachable_media_valid
    }
}
