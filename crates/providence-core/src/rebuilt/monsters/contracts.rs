use crate::model::StableId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MonsterAttack {
    pub damage_min: i8,
    pub damage_max: i8,
    pub sound_or_type: i8,
    pub special: i8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MonsterDefinition {
    pub id: StableId,
    pub classic_id: u32,
    pub classic_name_id: u8,
    pub name: String,
    pub description: String,
    pub not_on_menu: bool,
    pub hit_dice: u8,
    pub stamina_bonus: u8,
    pub agility: u8,
    pub movement_maximum: u8,
    pub armor: i8,
    pub magic_resistance: i8,
    pub required_weapon: i8,
    pub magic_to_hit: i8,
    pub traitor: bool,
    pub size: i8,
    pub type_flags: Vec<i8>,
    pub attack_count: i8,
    pub magic_attack_count: i8,
    pub attacks: Vec<RebuiltV3MonsterAttack>,
    pub damage_bonus: i8,
    pub cast_percent: i8,
    pub run_percent: i8,
    pub surrender_percent: i8,
    pub missile_percent: i8,
    pub can_summon: i8,
    pub saves: Vec<i8>,
    pub spell_immunities: Vec<i8>,
    pub conditions: Vec<i8>,
    pub money: Vec<i16>,
    pub spell_ids: Vec<String>,
    pub item_ids: Vec<String>,
    pub weapon_id: String,
    pub random_weapon_table: u32,
    pub icon_id: i16,
    pub spell_points: i16,
    pub experience: i16,
    pub death_macro: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MonsterSetDefinition {
    pub set_id: i16,
    pub name: String,
    pub monsters: Vec<RebuiltV3MonsterDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MonsterDescription {
    pub id: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3MonsterCatalog {
    pub monsters: Vec<RebuiltV3MonsterDefinition>,
    pub monster_sets: Vec<RebuiltV3MonsterSetDefinition>,
    pub monster_descriptions: Vec<RebuiltV3MonsterDescription>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3MonsterOmission {
    pub native_path: String,
    pub set_id: i16,
    pub native_id: u32,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3NormalMonsterSelection {
    pub monsters: Vec<RebuiltV3MonsterDefinition>,
    pub monster_descriptions: Vec<RebuiltV3MonsterDescription>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3MonsterError {
    MissingSelectedClassicId(u32),
    InvalidSet {
        set_id: i16,
        native_path: String,
    },
    DuplicateSet(i16),
    DuplicateClassicId {
        set_id: i16,
        classic_id: u32,
    },
    InvalidIdentity {
        expected: StableId,
        actual: StableId,
    },
    InvalidRecord {
        monster: StableId,
        reason: String,
    },
    DuplicateDescription(u32),
    InvalidDescriptionIdentity {
        expected: StableId,
        actual: StableId,
    },
    MissingDeathMacro {
        monster: StableId,
        macro_id: u32,
    },
    IncompleteSetCoverage {
        set_id: i16,
        classic_id: u32,
    },
}

impl std::fmt::Display for RebuiltV3MonsterError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingSelectedClassicId(id) => {
                write!(formatter, "referenced Classic monster {id} is unavailable")
            }
            Self::InvalidSet {
                set_id,
                native_path,
            } => write!(
                formatter,
                "monster set {set_id} cannot project from uncertified path '{native_path}'"
            ),
            Self::DuplicateSet(set_id) => write!(formatter, "monster set {set_id} is duplicated"),
            Self::DuplicateClassicId { set_id, classic_id } => write!(
                formatter,
                "monster set {set_id} contains duplicate Classic ID {classic_id}"
            ),
            Self::InvalidIdentity { expected, actual } => write!(
                formatter,
                "monster identity '{}' must match its native identity '{}'",
                actual.0, expected.0
            ),
            Self::InvalidRecord { monster, reason } => {
                write!(formatter, "monster '{}' is invalid: {reason}", monster.0)
            }
            Self::DuplicateDescription(id) => {
                write!(formatter, "monster description {id} is duplicated")
            }
            Self::InvalidDescriptionIdentity { expected, actual } => write!(
                formatter,
                "monster description identity '{}' must match '{}'",
                actual.0, expected.0
            ),
            Self::MissingDeathMacro { monster, macro_id } => write!(
                formatter,
                "monster '{}' references unavailable Extra Action Point {macro_id}",
                monster.0
            ),
            Self::IncompleteSetCoverage { set_id, classic_id } => write!(
                formatter,
                "monster set {set_id} cannot omit Classic ID {classic_id}: referenced, authored, or absent from another source set"
            ),
        }
    }
}

impl std::error::Error for RebuiltV3MonsterError {}
