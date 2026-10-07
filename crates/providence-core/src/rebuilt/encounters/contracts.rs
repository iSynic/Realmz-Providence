use crate::model::StableId;
use crate::rebuilt::scenario::RebuiltV3ScenarioProgram;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3Message {
    pub id: u32,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3SimpleEncounterResponse {
    pub id: StableId,
    pub label: String,
    pub result_program_id: StableId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3SimpleEncounter {
    pub id: u32,
    pub prompt_message_id: i16,
    pub responses: Vec<RebuiltV3SimpleEncounterResponse>,
    pub can_back_out: bool,
    pub max_times: i8,
    pub caste_success: i8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3SimpleEncounterProjection {
    pub messages: Vec<RebuiltV3Message>,
    pub simple_encounters: Vec<RebuiltV3SimpleEncounter>,
    pub programs: Vec<RebuiltV3ScenarioProgram>,
    pub excluded_native_ids: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ComplexEncounter {
    pub id: u32,
    pub prompt_message_id: i16,
    pub action_result: i8,
    pub word_result: i8,
    pub groups: [i8; 8],
    pub spell_ids: [i16; 10],
    pub spell_results: [i8; 10],
    pub item_ids: [i16; 5],
    pub item_results: [i8; 5],
    pub can_back_out: bool,
    pub thief: bool,
    pub max_times: i8,
    pub caste_success: i8,
    pub thief_success: i8,
    pub thief_fail: i8,
    pub texts: [String; 9],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ComplexEncounterProjection {
    pub complex_encounters: Vec<RebuiltV3ComplexEncounter>,
    pub programs: Vec<RebuiltV3ScenarioProgram>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3RogueEncounter {
    pub id: u32,
    pub type_flags: [bool; 10],
    pub modifiers: [i8; 8],
    pub success_codes: [i8; 8],
    pub failure_codes: [i8; 8],
    pub success_text: [i16; 8],
    pub failure_text: [i16; 8],
    pub success_sounds: [i16; 8],
    pub failure_sounds: [i16; 8],
    pub spell_id: i16,
    pub low_damage: i16,
    pub high_damage: i16,
    pub tumblers: i16,
    pub prompts: [i16; 3],
    pub prompt_sounds: [i16; 3],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3RogueEncounterError {
    DuplicateId(u32),
    InvalidRecord { encounter: StableId, reason: String },
}

impl std::fmt::Display for RebuiltV3RogueEncounterError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateId(id) => write!(formatter, "Rogue Encounter ID {id} is duplicated"),
            Self::InvalidRecord { encounter, reason } => {
                write!(
                    formatter,
                    "Rogue Encounter '{}' is invalid: {reason}",
                    encounter.0
                )
            }
        }
    }
}

impl std::error::Error for RebuiltV3RogueEncounterError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RebuiltV3TimedEncounterLocationKind {
    Any,
    Land,
    Dungeon,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TimedEncounter {
    pub id: u32,
    pub day: i16,
    pub increment: i16,
    pub chance_percent: i16,
    pub classic_macro_id: i16,
    pub program_id: StableId,
    pub required_level: i16,
    pub required_random_rectangle: i16,
    pub required_x: i16,
    pub required_y: i16,
    pub required_item_id: i16,
    pub required_quest_id: i16,
    pub location_kind: RebuiltV3TimedEncounterLocationKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TimedEncounterProjection {
    pub timed_encounters: Vec<RebuiltV3TimedEncounter>,
    pub excluded_native_ids: Vec<u32>,
    pub quarantined_native_ids: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3TimedEncounterError {
    DuplicateId(u32),
    InvalidRecord { encounter: StableId, reason: String },
    NegativeMacro { encounter: StableId, macro_id: i16 },
    MissingMacro { encounter: StableId, macro_id: u32 },
}

impl std::fmt::Display for RebuiltV3TimedEncounterError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateId(id) => write!(formatter, "Timed Encounter ID {id} is duplicated"),
            Self::InvalidRecord { encounter, reason } => {
                write!(
                    formatter,
                    "Timed Encounter '{}' is invalid: {reason}",
                    encounter.0
                )
            }
            Self::NegativeMacro {
                encounter,
                macro_id,
            } => write!(
                formatter,
                "Timed Encounter '{}' references invalid negative Extra Action Point {macro_id}",
                encounter.0
            ),
            Self::MissingMacro {
                encounter,
                macro_id,
            } => write!(
                formatter,
                "Timed Encounter '{}' references unavailable Extra Action Point {macro_id}",
                encounter.0
            ),
        }
    }
}

impl std::error::Error for RebuiltV3TimedEncounterError {}
