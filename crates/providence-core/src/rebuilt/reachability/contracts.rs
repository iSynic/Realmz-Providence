use crate::model::StableId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3ReachabilityRelation {
    Root,
    UsesExtraCode,
    CallsProgram,
    StartsSimpleEncounter,
    StartsComplexEncounter,
    StartsBattle,
    PlacesMonster,
    SpawnsMonster,
    TestsMonsterPresence,
    BattleRoundMacro,
    MonsterDeathMacro,
    RuntimeNoOp,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "kebab-case")]
pub enum RebuiltV3ReachabilityTarget {
    Program(StableId),
    SimpleEncounter(u32),
    ComplexEncounter(u32),
    Battle(u32),
    Monster(u32),
    ExtraCode(u32),
    RuntimeNoOp(String),
    Invalid(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachabilityReference {
    pub source: StableId,
    pub field: String,
    pub relation: RebuiltV3ReachabilityRelation,
    pub target: RebuiltV3ReachabilityTarget,
    pub resolved: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachabilityReport {
    pub reachable_program_ids: Vec<StableId>,
    pub reachable_simple_encounter_ids: Vec<u32>,
    pub reachable_complex_encounter_ids: Vec<u32>,
    pub reachable_battle_ids: Vec<u32>,
    pub reachable_monster_ids: Vec<u32>,
    pub references: Vec<RebuiltV3ReachabilityReference>,
    pub unresolved_references: Vec<RebuiltV3ReachabilityReference>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ReachabilityError {
    DuplicateProgramId(StableId),
    DuplicateExtraCodeId(u32),
    DuplicateBattleId(u32),
    DuplicateMonsterId(u32),
}

impl std::fmt::Display for RebuiltV3ReachabilityError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateProgramId(id) => {
                write!(formatter, "runtime program '{}' is duplicated", id.0)
            }
            Self::DuplicateExtraCodeId(id) => write!(formatter, "Data EDCD row {id} is duplicated"),
            Self::DuplicateBattleId(id) => write!(formatter, "Data BD row {id} is duplicated"),
            Self::DuplicateMonsterId(id) => write!(formatter, "Data MD row {id} is duplicated"),
        }
    }
}

impl std::error::Error for RebuiltV3ReachabilityError {}
