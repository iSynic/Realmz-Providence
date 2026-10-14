use super::ActionPointActivation;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChanceFilter {
    #[default]
    All,
    Positive,
    Nonpositive,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MarkerFilter {
    #[default]
    All,
    Present,
    Absent,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PrecedenceFilter {
    #[default]
    All,
    Shadowed,
    First,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChecksFilter {
    #[default]
    All,
    Detected,
    Unknown,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct ActivationFilter {
    pub chance: ChanceFilter,
    pub marker: MarkerFilter,
    pub precedence: PrecedenceFilter,
    pub checks: ChecksFilter,
}

impl ActivationFilter {
    pub fn matches(&self, status: &ActionPointActivation) -> bool {
        let chance = match self.chance {
            ChanceFilter::All => true,
            ChanceFilter::Positive => status.chance_positive,
            ChanceFilter::Nonpositive => !status.chance_positive,
        };
        let marker = match self.marker {
            MarkerFilter::All => true,
            MarkerFilter::Present => status.entry_marker == Some(true),
            MarkerFilter::Absent => status.entry_marker == Some(false),
            MarkerFilter::Unavailable => status.entry_marker.is_none(),
        };
        let precedence = match self.precedence {
            PrecedenceFilter::All => true,
            PrecedenceFilter::Shadowed => status.shadowed_by.is_some(),
            PrecedenceFilter::First => status.placed && status.shadowed_by.is_none(),
        };
        let checks = match self.checks {
            ChecksFilter::All => true,
            ChecksFilter::Detected => !status.check_slots.is_empty(),
            ChecksFilter::Unknown => !status.unknown_slots.is_empty(),
        };
        chance && marker && precedence && checks
    }
}
