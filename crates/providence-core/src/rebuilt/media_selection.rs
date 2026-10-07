use super::{
    ApplicationMediaCatalog, ApplicationMediaResolution, RebuiltV3AssetError, RebuiltV3AssetIndex,
    RebuiltV3ItemDefinition, RebuiltV3MonsterDefinition, RebuiltV3RogueEncounter,
    RebuiltV3ScenarioDocument, RebuiltV3SpellDefinition,
};
use crate::model::ProjectSnapshot;
#[cfg(test)]
use crate::{model::StableId, references::ResolutionState};
#[cfg(test)]
mod appearance_tests;
mod application_resolution;
#[cfg(test)]
mod battle_atlas_tests;
mod catalogs;
mod contracts;
mod creatures;
#[path = "item_media_selection.rs"]
mod item_media_selection;
mod player_maps;
mod programs;
mod requirements;
mod scenario_resolution;
mod spells;
#[cfg(test)]
mod tests;
mod world;

use application_resolution::resolve_application_reference;
pub use contracts::{
    RebuiltV3MediaOwner, RebuiltV3MediaRelation, RebuiltV3MediaRequirement,
    RebuiltV3ReachableMediaError, RebuiltV3ReachableMediaSelection, RebuiltV3RuntimeMediaReference,
    is_missing_imported_presentation_reference, is_missing_monster_presentation_reference,
};
use requirements::project_rebuilt_v3_reachable_media_from_references;

pub fn project_rebuilt_v3_reachable_media<'a>(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
    items: &[RebuiltV3ItemDefinition],
    spells: &[RebuiltV3SpellDefinition],
    monsters: impl IntoIterator<Item = &'a RebuiltV3MonsterDefinition>,
    rogue_encounters: &[RebuiltV3RogueEncounter],
    has_reachable_battles: bool,
) -> Result<RebuiltV3ReachableMediaSelection, RebuiltV3ReachableMediaError> {
    let references = derive_rebuilt_v3_reachable_media_references(
        snapshot,
        scenario,
        items,
        spells,
        monsters,
        rogue_encounters,
        has_reachable_battles,
    );
    project_rebuilt_v3_reachable_media_from_references(snapshot, references)
}

#[allow(clippy::too_many_arguments)]
pub fn project_rebuilt_v3_reachable_media_with_application<'a>(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    scenario: &RebuiltV3ScenarioDocument,
    items: &[RebuiltV3ItemDefinition],
    spells: &[RebuiltV3SpellDefinition],
    monsters: impl IntoIterator<Item = &'a RebuiltV3MonsterDefinition>,
    rogue_encounters: &[RebuiltV3RogueEncounter],
    has_reachable_battles: bool,
) -> Result<RebuiltV3ReachableMediaSelection, RebuiltV3ReachableMediaError> {
    let references = derive_rebuilt_v3_reachable_media_references_with_application(
        snapshot,
        application_media,
        scenario,
        items,
        spells,
        monsters,
        rogue_encounters,
        has_reachable_battles,
    );
    project_rebuilt_v3_reachable_media_from_references(snapshot, references)
}

#[allow(clippy::too_many_arguments)]
pub fn derive_rebuilt_v3_reachable_media_references<'a>(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
    items: &[RebuiltV3ItemDefinition],
    spells: &[RebuiltV3SpellDefinition],
    monsters: impl IntoIterator<Item = &'a RebuiltV3MonsterDefinition>,
    rogue_encounters: &[RebuiltV3RogueEncounter],
    has_reachable_battles: bool,
) -> Vec<RebuiltV3RuntimeMediaReference> {
    let mut references = Vec::new();
    catalogs::append_appearance(&mut references, snapshot);
    catalogs::append_campaign(&mut references, snapshot, has_reachable_battles);
    world::append_maps(&mut references, snapshot);
    world::append_terrain(&mut references, snapshot);
    player_maps::append(&mut references, snapshot, scenario);
    programs::append(&mut references, snapshot, scenario);
    item_media_selection::append(&mut references, snapshot, items);
    spells::append(&mut references, snapshot, spells);
    creatures::append_monsters(&mut references, snapshot, monsters);
    creatures::append_rogues(&mut references, snapshot, rogue_encounters);
    catalogs::append_music(&mut references, snapshot);
    references.sort_by(|left, right| {
        (
            &left.source,
            &left.field_path,
            left.relation,
            &left.asset_id,
            &left.classic_resource,
        )
            .cmp(&(
                &right.source,
                &right.field_path,
                right.relation,
                &right.asset_id,
                &right.classic_resource,
            ))
    });
    references.dedup();
    references
}

#[allow(clippy::too_many_arguments)]
pub fn derive_rebuilt_v3_reachable_media_references_with_application<'a>(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    scenario: &RebuiltV3ScenarioDocument,
    items: &[RebuiltV3ItemDefinition],
    spells: &[RebuiltV3SpellDefinition],
    monsters: impl IntoIterator<Item = &'a RebuiltV3MonsterDefinition>,
    rogue_encounters: &[RebuiltV3RogueEncounter],
    has_reachable_battles: bool,
) -> Vec<RebuiltV3RuntimeMediaReference> {
    let mut references = derive_rebuilt_v3_reachable_media_references(
        snapshot,
        scenario,
        items,
        spells,
        monsters,
        rogue_encounters,
        has_reachable_battles,
    );
    for reference in &mut references {
        resolve_application_reference(snapshot, application_media, reference);
    }
    references
}
