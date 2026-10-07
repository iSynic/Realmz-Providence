use crate::model::{CasteRuleDefinition, RaceRuleDefinition, StableId};
use serde::{Deserialize, Serialize};

pub const CLASSIC_RULE_RECORDS: usize = 30;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3RuleCatalog {
    pub races: Vec<RaceRuleDefinition>,
    pub castes: Vec<CasteRuleDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3RuleCatalogError {
    WrongRaceCount(usize),
    WrongCasteCount(usize),
    InvalidRace { id: StableId, reason: String },
    InvalidCaste { id: StableId, reason: String },
    DuplicateRaceId(StableId),
    DuplicateCasteId(StableId),
    DuplicateRaceClassicId(u8),
    DuplicateCasteClassicId(u8),
    InvalidNameCatalog(String),
    MissingEligibilityTarget { source: StableId, target: StableId },
    AsymmetricEligibility { race: StableId, caste: StableId },
    SemanticallyEmptyRaces,
    SemanticallyEmptyCastes,
    UnresolvedSelection,
}

impl std::fmt::Display for RebuiltV3RuleCatalogError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnresolvedSelection => write!(
                formatter,
                "Classic rule selection requires the pinned application rules resolver"
            ),
            Self::WrongRaceCount(actual) => write!(
                formatter,
                "rule catalog has {actual} races; Rebuilt requires all 30 Classic records"
            ),
            Self::WrongCasteCount(actual) => write!(
                formatter,
                "rule catalog has {actual} castes; Rebuilt requires all 30 Classic records"
            ),
            Self::InvalidRace { id, reason } => {
                write!(formatter, "race '{}' is invalid: {reason}", id.0)
            }
            Self::InvalidCaste { id, reason } => {
                write!(formatter, "caste '{}' is invalid: {reason}", id.0)
            }
            Self::DuplicateRaceId(id) => write!(formatter, "race ID '{}' is duplicated", id.0),
            Self::DuplicateCasteId(id) => write!(formatter, "caste ID '{}' is duplicated", id.0),
            Self::DuplicateRaceClassicId(id) => {
                write!(formatter, "Classic race ID {id} is duplicated")
            }
            Self::DuplicateCasteClassicId(id) => {
                write!(formatter, "Classic caste ID {id} is duplicated")
            }
            Self::InvalidNameCatalog(reason) => {
                write!(formatter, "rule name catalog is invalid: {reason}")
            }
            Self::MissingEligibilityTarget { source, target } => write!(
                formatter,
                "rule '{}' references unavailable eligibility target '{}'",
                source.0, target.0
            ),
            Self::AsymmetricEligibility { race, caste } => write!(
                formatter,
                "race '{}' and caste '{}' disagree about eligibility",
                race.0, caste.0
            ),
            Self::SemanticallyEmptyRaces => {
                write!(
                    formatter,
                    "the 30-race table has no functional Classic rules"
                )
            }
            Self::SemanticallyEmptyCastes => {
                write!(
                    formatter,
                    "the 30-caste table has no functional Classic rules"
                )
            }
        }
    }
}

impl std::error::Error for RebuiltV3RuleCatalogError {}
