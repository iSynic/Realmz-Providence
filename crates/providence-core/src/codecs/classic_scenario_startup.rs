mod decode;
mod encode;
use crate::model::{CampaignMetadata, StartLocation};
pub use decode::decode_scenario_startup;
pub use encode::encode_scenario_startup;

pub const SCENARIO_STARTUP_BYTES: usize = 316;
pub const SCENARIO_RESTRICTIONS_BYTES: usize = 320;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedScenarioStartup {
    pub campaign: CampaignMetadata,
    pub start_location: StartLocation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenarioStartupCodecError {
    StartupLength {
        expected: usize,
        actual: usize,
    },
    RestrictionsLength {
        expected: usize,
        actual: usize,
    },
    NegativeValue {
        field: &'static str,
        value: i32,
    },
    StartCoordinateOutOfRange {
        x: i32,
        y: i32,
    },
    PartySizeOutOfRange(i16),
    IncompleteSourcePair,
    ScenarioNameMismatch {
        expected: String,
        actual: String,
    },
    UnsupportedCampaignField(&'static str),
    NumericValueOutOfRange {
        field: &'static str,
        value: u32,
    },
    InvalidStartMap(String),
    InvalidScenarioName(String),
    TextTooLong {
        field: &'static str,
        bytes: usize,
    },
    UnencodableText {
        field: &'static str,
    },
    InvalidRuleId {
        kind: &'static str,
        identity: String,
    },
}

impl std::fmt::Display for ScenarioStartupCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::StartupLength { expected, actual } => write!(
                formatter,
                "scenario startup file must contain at least {expected} bytes; found {actual}"
            ),
            Self::RestrictionsLength { expected, actual } => write!(
                formatter,
                "Data RI must contain exactly {expected} bytes; found {actual}"
            ),
            Self::NegativeValue { field, value } => {
                write!(
                    formatter,
                    "scenario startup {field} cannot be negative; found {value}"
                )
            }
            Self::StartCoordinateOutOfRange { x, y } => write!(
                formatter,
                "scenario startup coordinate ({x},{y}) is outside the 90 by 90 land map"
            ),
            Self::PartySizeOutOfRange(value) => write!(
                formatter,
                "Data RI maximum party size must be zero (Classic default) or 1 through 6; found {value}"
            ),
            Self::IncompleteSourcePair => write!(
                formatter,
                "scenario startup compilation requires both the scenario startup file and Data RI, or neither"
            ),
            Self::ScenarioNameMismatch { expected, actual } => write!(
                formatter,
                "scenario startup source is named '{expected}', but campaign metadata is named '{actual}'"
            ),
            Self::UnsupportedCampaignField(field) => write!(
                formatter,
                "campaign field '{field}' belongs to an uncertified Classic source and cannot be silently dropped"
            ),
            Self::NumericValueOutOfRange { field, value } => write!(
                formatter,
                "scenario startup {field} is outside the Classic numeric range: {value}"
            ),
            Self::InvalidStartMap(identity) => write!(
                formatter,
                "scenario startup map '{identity}' is not a Classic land map identity"
            ),
            Self::InvalidScenarioName(name) => write!(
                formatter,
                "scenario startup name '{name}' is not a portable single-file name"
            ),
            Self::TextTooLong { field, bytes } => write!(
                formatter,
                "scenario startup {field} needs {bytes} Classic bytes; the limit is 255"
            ),
            Self::UnencodableText { field } => write!(
                formatter,
                "scenario startup {field} contains text that MacRoman cannot represent"
            ),
            Self::InvalidRuleId { kind, identity } => write!(
                formatter,
                "Data RI {kind} restriction '{identity}' is not a Classic {kind} identity from 1 through 30"
            ),
        }
    }
}

impl std::error::Error for ScenarioStartupCodecError {}

#[cfg(test)]
mod tests;
