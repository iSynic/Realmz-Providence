use super::{
    RebuiltV3ComplexEncounter, RebuiltV3Message, RebuiltV3ReachableCombatSelection,
    RebuiltV3RogueEncounter, RebuiltV3ScenarioDocument, RebuiltV3SimpleEncounter,
};
use crate::model::{ProjectSnapshot, StableId};
use serde::{Deserialize, Serialize};

mod encounters;
mod programs;
mod references;
mod resolution;
#[cfg(test)]
mod tests;
mod world;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3RuntimeMessageReference {
    pub source: StableId,
    pub runtime_opcode: Option<i16>,
    pub field_path: String,
    pub raw_native_id: i16,
    pub message_native_id: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachableMessageSelection {
    pub reachable_message_ids: Vec<u32>,
    pub references: Vec<RebuiltV3RuntimeMessageReference>,
    pub missing_references: Vec<RebuiltV3RuntimeMessageReference>,
    pub messages: Vec<RebuiltV3Message>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ReachableMessageError {
    MissingExtraCode {
        program: StableId,
        slot: u8,
        opcode: i16,
        native_id: i16,
    },
    MissingMessage(RebuiltV3RuntimeMessageReference),
    DuplicateMessageId {
        message_id: u32,
        source: RebuiltV3RuntimeMessageReference,
    },
    InvalidMessageIdentity {
        expected: StableId,
        actual: StableId,
        source: RebuiltV3RuntimeMessageReference,
    },
}

impl std::fmt::Display for RebuiltV3ReachableMessageError {
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
            Self::MissingMessage(reference) => write!(
                formatter,
                "reachable '{}' field '{}' references unavailable Data SD2 message {}",
                reference.source.0,
                format_reference_field(reference),
                reference.message_native_id
            ),
            Self::DuplicateMessageId { message_id, source } => write!(
                formatter,
                "reachable '{}' field '{}' resolves ambiguous duplicate Data SD2 message {message_id}",
                source.source.0,
                format_reference_field(source)
            ),
            Self::InvalidMessageIdentity {
                expected,
                actual,
                source,
            } => write!(
                formatter,
                "reachable '{}' field '{}' resolves Data SD2 message '{}' whose identity must be '{}'",
                source.source.0,
                format_reference_field(source),
                actual.0,
                expected.0
            ),
        }
    }
}

impl std::error::Error for RebuiltV3ReachableMessageError {}

pub fn project_rebuilt_v3_reachable_messages(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
    simple_encounters: &[RebuiltV3SimpleEncounter],
    complex_encounters: &[RebuiltV3ComplexEncounter],
    rogue_encounters: &[RebuiltV3RogueEncounter],
    combat: &RebuiltV3ReachableCombatSelection,
) -> Result<RebuiltV3ReachableMessageSelection, RebuiltV3ReachableMessageError> {
    let mut references = std::collections::BTreeSet::new();
    programs::collect(snapshot, scenario, &mut references)?;
    encounters::collect_prompts(simple_encounters, complex_encounters, &mut references);
    encounters::collect_rogues(rogue_encounters, &mut references);
    encounters::collect_battles(combat, &mut references);
    world::collect(snapshot, &mut references);
    resolution::resolve(snapshot, references.into_iter().collect())
}

fn format_reference_field(reference: &RebuiltV3RuntimeMessageReference) -> String {
    reference.runtime_opcode.map_or_else(
        || reference.field_path.clone(),
        |opcode| format!("{} (opcode {opcode})", reference.field_path),
    )
}
