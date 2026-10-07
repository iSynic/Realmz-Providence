use serde::{Deserialize, Serialize};

mod catalogs;
mod closure;
mod encounters;
mod loadouts;
mod owners;
mod programs;
mod selection;

use super::{
    RebuiltV3ComplexEncounter, RebuiltV3ItemCatalogError, RebuiltV3ItemDefinition,
    RebuiltV3ReachableCombatSelection, RebuiltV3ReachableOwnerSelection, RebuiltV3RogueEncounter,
    RebuiltV3ScenarioDocument, RebuiltV3SpellCatalogError, RebuiltV3SpellDefinition,
};
use crate::model::{ProjectSnapshot, StableId};
use selection::Selection;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3RuntimeDefinitionKind {
    Item,
    Spell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3RuntimeDefinitionRelation {
    ProgramOperand,
    EncounterGate,
    TimedRequirement,
    MonsterLoadout,
    TreasureStock,
    ShopStock,
    CasteStartingItem,
    CursedPresentation,
    ItemSpellEffect,
    IncidentalBattleReward,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3RuntimeDefinitionReference {
    pub source: StableId,
    pub field_path: String,
    pub target_kind: RebuiltV3RuntimeDefinitionKind,
    pub relation: RebuiltV3RuntimeDefinitionRelation,
    pub classic_id: i16,
    pub target_id: StableId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachableItemSpellSelection {
    pub portable_standard_item_count: usize,
    pub portable_standard_spell_count: usize,
    pub reachable_scenario_item_ids: Vec<i16>,
    pub reachable_scenario_spell_ids: Vec<i16>,
    pub references: Vec<RebuiltV3RuntimeDefinitionReference>,
    pub items: Vec<RebuiltV3ItemDefinition>,
    pub spells: Vec<RebuiltV3SpellDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ReachableItemSpellError {
    ItemCatalog(RebuiltV3ItemCatalogError),
    SpellCatalog(RebuiltV3SpellCatalogError),
    MissingExtraCode {
        program: StableId,
        opcode: i16,
    },
    InvalidRandomItemRange {
        program: StableId,
        low: i16,
        high: i16,
    },
    InvalidRandomItemCount {
        program: StableId,
        count: i16,
    },
    InvalidStableTarget {
        source: StableId,
        field_path: String,
        target: StableId,
    },
    MissingDefinition {
        source: StableId,
        field_path: String,
        target_kind: RebuiltV3RuntimeDefinitionKind,
        classic_id: i16,
    },
}

impl std::fmt::Display for RebuiltV3ReachableItemSpellError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ItemCatalog(error) => {
                write!(formatter, "reachable item selection failed: {error}")
            }
            Self::SpellCatalog(error) => {
                write!(formatter, "reachable spell selection failed: {error}")
            }
            Self::MissingExtraCode { program, opcode } => write!(
                formatter,
                "reachable program '{}' opcode {opcode} requires a complete Data EDCD row",
                program.0
            ),
            Self::InvalidRandomItemRange { program, low, high } => write!(
                formatter,
                "reachable program '{}' opcode 65 can generate Classic items outside 1 through 999 from range {low}..={high}",
                program.0
            ),
            Self::InvalidRandomItemCount { program, count } => write!(
                formatter,
                "reachable program '{}' opcode 65 has unsupported item count {count}",
                program.0
            ),
            Self::InvalidStableTarget {
                source,
                field_path,
                target,
            } => write!(
                formatter,
                "runtime source '{}' field {field_path} has malformed Classic target '{}'",
                source.0, target.0
            ),
            Self::MissingDefinition {
                source,
                field_path,
                target_kind,
                classic_id,
            } => write!(
                formatter,
                "runtime source '{}' field {field_path} references unavailable {:?} {classic_id}",
                source.0, target_kind
            ),
        }
    }
}

impl std::error::Error for RebuiltV3ReachableItemSpellError {}

pub fn project_rebuilt_v3_reachable_items_and_spells(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
    complex_encounters: &[RebuiltV3ComplexEncounter],
    rogue_encounters: &[RebuiltV3RogueEncounter],
    owners: &RebuiltV3ReachableOwnerSelection,
    combat: &RebuiltV3ReachableCombatSelection,
) -> Result<RebuiltV3ReachableItemSpellSelection, RebuiltV3ReachableItemSpellError> {
    let mut selection = Selection::new(snapshot)?;
    programs::collect(scenario, &mut selection)?;
    encounters::collect(complex_encounters, rogue_encounters, &mut selection)?;
    owners::collect(snapshot, owners, &mut selection)?;
    loadouts::collect(combat, &mut selection)?;
    selection.reconcile_roots()?;
    let items = closure::collect(snapshot, &mut selection)?;
    // Standard-item effects can introduce spell dependencies after root checking.
    selection.reconcile_effects()?;
    selection.project(snapshot, items)
}

#[cfg(test)]
mod tests;
