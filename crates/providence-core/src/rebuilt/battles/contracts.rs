use crate::model::StableId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3BattleMonsterSlot {
    pub x: u8,
    pub y: u8,
    pub monster_id: StableId,
    pub invert_traitor: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3BattleDefinition {
    pub id: StableId,
    pub classic_id: u32,
    pub monster_slots: Vec<RebuiltV3BattleMonsterSlot>,
    pub distance: i8,
    pub message_before_id: i16,
    pub message_after_id: i16,
    pub macro_id: i16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3BattleError {
    MissingSelectedClassicId(u32),
    DuplicateClassicId(u32),
    InvalidIdentity {
        expected: StableId,
        actual: StableId,
    },
    InvalidRecord {
        battle: StableId,
        reason: String,
    },
    AmbiguousNormalMonsterSet,
    DuplicateNormalMonsterId(u32),
    MissingMonster {
        battle: StableId,
        slot: usize,
        monster_id: u32,
    },
    MissingMessage {
        battle: StableId,
        field: &'static str,
        message_id: u32,
    },
    MissingMacro {
        battle: StableId,
        macro_id: u32,
    },
}

impl std::fmt::Display for RebuiltV3BattleError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingSelectedClassicId(id) => {
                write!(formatter, "referenced Classic battle {id} is unavailable")
            }
            Self::DuplicateClassicId(id) => {
                write!(formatter, "Classic battle ID {id} is duplicated")
            }
            Self::InvalidIdentity { expected, actual } => write!(
                formatter,
                "battle identity '{}' must match its native identity '{}'",
                actual.0, expected.0
            ),
            Self::InvalidRecord { battle, reason } => {
                write!(formatter, "battle '{}' is invalid: {reason}", battle.0)
            }
            Self::AmbiguousNormalMonsterSet => write!(
                formatter,
                "battle projection requires at most one normal Data MD monster set"
            ),
            Self::DuplicateNormalMonsterId(id) => {
                write!(formatter, "normal Data MD monster ID {id} is duplicated")
            }
            Self::MissingMonster {
                battle,
                slot,
                monster_id,
            } => write!(
                formatter,
                "battle '{}' grid slot {slot} references unavailable normal monster {monster_id}",
                battle.0
            ),
            Self::MissingMessage {
                battle,
                field,
                message_id,
            } => write!(
                formatter,
                "battle '{}' {field} references unavailable message {message_id}",
                battle.0
            ),
            Self::MissingMacro { battle, macro_id } => write!(
                formatter,
                "battle '{}' references unavailable Extra Action Point {macro_id}",
                battle.0
            ),
        }
    }
}

impl std::error::Error for RebuiltV3BattleError {}
