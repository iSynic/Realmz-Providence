use crate::model::StableId;
use crate::rebuilt::{
    RebuiltV3ShopDefinition, RebuiltV3ShopError, RebuiltV3TimedEncounter,
    RebuiltV3TimedEncounterError, RebuiltV3TreasureDefinition, RebuiltV3TreasureError,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3RuntimeCatalogKind {
    Treasure,
    Shop,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3RuntimeCatalogReference {
    pub source: StableId,
    pub runtime_opcode: i16,
    pub field_path: String,
    pub target_kind: RebuiltV3RuntimeCatalogKind,
    pub raw_native_id: i16,
    pub target_native_id: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachableOwnerSelection {
    pub reachable_treasure_ids: Vec<u32>,
    pub reachable_shop_ids: Vec<u32>,
    pub references: Vec<RebuiltV3RuntimeCatalogReference>,
    pub timed_encounters: Vec<RebuiltV3TimedEncounter>,
    pub excluded_timed_encounter_ids: Vec<u32>,
    pub quarantined_timed_encounter_ids: Vec<u32>,
    pub treasures: Vec<RebuiltV3TreasureDefinition>,
    pub shops: Vec<RebuiltV3ShopDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ReachableOwnerError {
    MissingExtraCode {
        program: StableId,
        slot: u8,
        opcode: i16,
        native_id: i16,
    },
    TimedEncounter(RebuiltV3TimedEncounterError),
    Treasure(RebuiltV3TreasureError),
    Shop(RebuiltV3ShopError),
}

impl std::fmt::Display for RebuiltV3ReachableOwnerError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingExtraCode {
                program,
                slot,
                opcode,
                native_id,
            } => write!(
                formatter,
                "reachable program '{}' action slot {slot} opcode {opcode} requires unavailable Data EDCD row {native_id}",
                program.0
            ),
            Self::TimedEncounter(error) => write!(formatter, "{error}"),
            Self::Treasure(error) => write!(formatter, "{error}"),
            Self::Shop(error) => write!(formatter, "{error}"),
        }
    }
}

impl std::error::Error for RebuiltV3ReachableOwnerError {}
