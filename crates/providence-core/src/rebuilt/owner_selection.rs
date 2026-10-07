mod catalogs;
mod contracts;
mod references;

use super::RebuiltV3ScenarioDocument;
use crate::model::ProjectSnapshot;
use catalogs::CatalogInputs;
pub use contracts::{
    RebuiltV3ReachableOwnerError, RebuiltV3ReachableOwnerSelection, RebuiltV3RuntimeCatalogKind,
    RebuiltV3RuntimeCatalogReference,
};
use references::derive_catalog_references;
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_reachable_owners(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
) -> Result<RebuiltV3ReachableOwnerSelection, RebuiltV3ReachableOwnerError> {
    // Keep failure precedence: instruction operands, timed rows, Treasure, Shop.
    let references = derive_catalog_references(scenario)?;
    let program_ids = scenario
        .programs
        .iter()
        .map(|program| program.id.clone())
        .collect::<BTreeSet<_>>();
    let timed =
        super::encounters::project_rebuilt_v3_selected_timed_encounters(snapshot, &program_ids)
            .map_err(RebuiltV3ReachableOwnerError::TimedEncounter)?;
    let inputs = CatalogInputs::new(snapshot, &references);
    let treasures = super::treasures::project_rebuilt_v3_selected_treasures(
        snapshot,
        &inputs.item_ids,
        &inputs.reachable_treasure_ids,
    )
    .map_err(RebuiltV3ReachableOwnerError::Treasure)?;
    let shops = super::shops::project_rebuilt_v3_selected_shops(
        snapshot,
        &inputs.item_ids,
        &inputs.reachable_shop_ids,
    )
    .map_err(RebuiltV3ReachableOwnerError::Shop)?;

    Ok(RebuiltV3ReachableOwnerSelection {
        reachable_treasure_ids: inputs.reachable_treasure_ids.into_iter().collect(),
        reachable_shop_ids: inputs.reachable_shop_ids.into_iter().collect(),
        references,
        timed_encounters: timed.timed_encounters,
        excluded_timed_encounter_ids: timed.excluded_native_ids,
        quarantined_timed_encounter_ids: timed.quarantined_native_ids,
        treasures,
        shops,
    })
}
#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod tests;
