use serde::{Deserialize, Serialize};

use super::{
    RebuiltV3AssetError, RebuiltV3AssetIndex, RebuiltV3ComplexEncounter,
    RebuiltV3DeferredReference, RebuiltV3Message, RebuiltV3ReachabilityError,
    RebuiltV3ReachabilityReport, RebuiltV3ReachableCombatError, RebuiltV3ReachableCombatSelection,
    RebuiltV3ReachableItemSpellError, RebuiltV3ReachableItemSpellSelection,
    RebuiltV3ReachableMessageError, RebuiltV3ReachableOwnerError, RebuiltV3RogueEncounter,
    RebuiltV3RogueEncounterError, RebuiltV3RuntimeCatalogReference,
    RebuiltV3RuntimeMessageReference, RebuiltV3ScenarioDocument, RebuiltV3ScenarioError,
    RebuiltV3ShopDefinition, RebuiltV3SimpleEncounter, RebuiltV3TimedEncounter,
    RebuiltV3TreasureDefinition, derive_rebuilt_v3_reachability,
};
use crate::model::{ProjectSnapshot, StableId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachableRuntimeSelection {
    pub reachable_program_ids: Vec<StableId>,
    pub reachable_simple_encounter_ids: Vec<u32>,
    pub reachable_complex_encounter_ids: Vec<u32>,
    pub reachable_rogue_encounter_ids: Vec<u32>,
    pub reachable_message_ids: Vec<u32>,
    pub reachable_treasure_ids: Vec<u32>,
    pub reachable_shop_ids: Vec<u32>,
    pub reachable_text_resource_ids: Vec<i32>,
    pub reachable_style_resource_ids: Vec<i32>,
    pub message_references: Vec<RebuiltV3RuntimeMessageReference>,
    pub catalog_references: Vec<RebuiltV3RuntimeCatalogReference>,
    pub deferred_references: Vec<RebuiltV3DeferredReference>,
    pub item_spells: RebuiltV3ReachableItemSpellSelection,
    pub messages: Vec<RebuiltV3Message>,
    pub timed_encounters: Vec<RebuiltV3TimedEncounter>,
    pub excluded_timed_encounter_ids: Vec<u32>,
    pub treasures: Vec<RebuiltV3TreasureDefinition>,
    pub shops: Vec<RebuiltV3ShopDefinition>,
    pub scenario: RebuiltV3ScenarioDocument,
    pub simple_encounters: Vec<RebuiltV3SimpleEncounter>,
    pub complex_encounters: Vec<RebuiltV3ComplexEncounter>,
    pub rogue_encounters: Vec<RebuiltV3RogueEncounter>,
    pub combat: RebuiltV3ReachableCombatSelection,
    pub assets: RebuiltV3AssetIndex,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ReachableRuntimeError {
    Reachability(RebuiltV3ReachabilityError),
    Combat(RebuiltV3ReachableCombatError),
    Scenario(RebuiltV3ScenarioError),
    Rogue(RebuiltV3RogueEncounterError),
    Message(RebuiltV3ReachableMessageError),
    Owner(RebuiltV3ReachableOwnerError),
    ItemSpell(RebuiltV3ReachableItemSpellError),
    Asset(RebuiltV3AssetError),
    SelectionMismatch {
        kind: &'static str,
        expected: Vec<String>,
        actual: Vec<String>,
    },
    DanglingSimpleResponse {
        encounter_id: u32,
        program_id: StableId,
    },
    DanglingComplexResult {
        encounter_id: u32,
        result: u8,
        program_id: StableId,
    },
}

impl std::fmt::Display for RebuiltV3ReachableRuntimeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Reachability(error) => write!(formatter, "reachability failed: {error}"),
            Self::Combat(error) => write!(formatter, "reachable combat selection failed: {error}"),
            Self::Scenario(error) => {
                write!(formatter, "reachable scenario selection failed: {error}")
            }
            Self::Rogue(error) => write!(formatter, "reachable Rogue selection failed: {error}"),
            Self::Message(error) => {
                write!(formatter, "reachable message selection failed: {error}")
            }
            Self::Owner(error) => write!(formatter, "reachable owner selection failed: {error}"),
            Self::ItemSpell(error) => write!(formatter, "{error}"),
            Self::Asset(error) => write!(formatter, "reachable asset selection failed: {error}"),
            Self::SelectionMismatch {
                kind,
                expected,
                actual,
            } => write!(
                formatter,
                "reachable {kind} selection differs from the fixed-point IDs: expected {expected:?}, got {actual:?}"
            ),
            Self::DanglingSimpleResponse {
                encounter_id,
                program_id,
            } => write!(
                formatter,
                "reachable Simple Encounter {encounter_id} response targets omitted program '{}'",
                program_id.0
            ),
            Self::DanglingComplexResult {
                encounter_id,
                result,
                program_id,
            } => write!(
                formatter,
                "reachable Complex Encounter {encounter_id} result {} omitted structural program '{}'",
                result + 1,
                program_id.0
            ),
        }
    }
}

impl std::error::Error for RebuiltV3ReachableRuntimeError {}

mod deferred;
mod instructions;
mod integrity;
mod sources;

pub fn project_rebuilt_v3_reachable_runtime(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3ReachableRuntimeSelection, RebuiltV3ReachableRuntimeError> {
    // Stage order preserves the first reported failure as well as output ordering.
    let reachability = derive_rebuilt_v3_reachability(snapshot)
        .map_err(RebuiltV3ReachableRuntimeError::Reachability)?;
    let combat = super::combat_selection::project_rebuilt_v3_reachable_combat_from_report(
        snapshot,
        &reachability,
    )
    .map_err(RebuiltV3ReachableRuntimeError::Combat)?;
    let encounters = sources::select_encounters(snapshot, &reachability)?;
    let catalogs = sources::select_catalogs(snapshot, &encounters, &combat)?;
    let text = sources::select_text_resources(snapshot, &encounters.scenario)?;
    let mut deferred = deferred::collect(snapshot, &reachability, &encounters, &catalogs, &combat);
    integrity::validate(snapshot, &reachability, &encounters, &mut deferred)?;
    let mut selection = assemble_selection(reachability, encounters, catalogs, combat, text);
    selection.deferred_references = deferred.into_iter().collect();
    Ok(selection)
}

fn assemble_selection(
    reachability: RebuiltV3ReachabilityReport,
    encounters: sources::SelectedEncounters,
    catalogs: sources::SelectedCatalogs,
    combat: RebuiltV3ReachableCombatSelection,
    text: sources::SelectedTextResources,
) -> RebuiltV3ReachableRuntimeSelection {
    RebuiltV3ReachableRuntimeSelection {
        reachable_program_ids: reachability.reachable_program_ids,
        reachable_simple_encounter_ids: reachability.reachable_simple_encounter_ids,
        reachable_complex_encounter_ids: reachability.reachable_complex_encounter_ids,
        reachable_rogue_encounter_ids: encounters.rogue_ids.into_iter().collect(),
        reachable_message_ids: catalogs.messages.reachable_message_ids,
        reachable_treasure_ids: catalogs.owners.reachable_treasure_ids,
        reachable_shop_ids: catalogs.owners.reachable_shop_ids,
        reachable_text_resource_ids: text.text_ids,
        reachable_style_resource_ids: text.style_ids,
        message_references: catalogs.messages.references,
        catalog_references: catalogs.owners.references,
        deferred_references: Vec::new(),
        item_spells: catalogs.item_spells,
        messages: catalogs.messages.messages,
        timed_encounters: catalogs.owners.timed_encounters,
        excluded_timed_encounter_ids: catalogs.owners.excluded_timed_encounter_ids,
        treasures: catalogs.owners.treasures,
        shops: catalogs.owners.shops,
        scenario: encounters.scenario,
        simple_encounters: encounters.simple,
        complex_encounters: encounters.complex,
        rogue_encounters: encounters.rogue,
        combat,
        assets: text.assets,
    }
}

#[cfg(test)]
mod tests;
