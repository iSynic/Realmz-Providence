use crate::model::{MapCoordinate, ProjectOrigin, ProjectSnapshot, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TriggerDestination {
    pub map_id: StableId,
    pub coordinate: MapCoordinate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3Trigger {
    pub id: StableId,
    pub program_id: StableId,
    pub classic_record_index: u32,
    pub map_id: Option<StableId>,
    pub coordinate: Option<MapCoordinate>,
    pub active: bool,
    pub chance_percent: i8,
    pub post_action_location: Option<RebuiltV3TriggerDestination>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RebuiltV3InstructionKind {
    ClassicAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3ProgramOwnerKind {
    Trigger,
    ExtraActionPoint,
    SimpleEncounterResult,
    ComplexEncounterResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ClassicInstruction {
    pub kind: RebuiltV3InstructionKind,
    pub slot: u8,
    pub raw_opcode: i16,
    pub opcode: i16,
    pub id: i16,
    pub gosub: bool,
    pub extra_code: Option<Vec<i16>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ScenarioProgram {
    pub id: StableId,
    pub owner_kind: RebuiltV3ProgramOwnerKind,
    pub owner_id: StableId,
    pub instructions: Vec<RebuiltV3ClassicInstruction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TriggerPrograms {
    pub triggers: Vec<RebuiltV3Trigger>,
    pub programs: Vec<RebuiltV3ScenarioProgram>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ApplicationHooks {
    pub start_game: Option<StableId>,
    pub party_death: Option<StableId>,
    pub end_adventure: Option<StableId>,
    pub shop: Option<StableId>,
    pub temple: Option<StableId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuiltV3ScenarioAction {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuiltV3StateDefinition {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuiltV3Migration {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ScenarioDocument {
    pub kind: String,
    pub schema_version: u8,
    pub application_hooks: RebuiltV3ApplicationHooks,
    pub programs: Vec<RebuiltV3ScenarioProgram>,
    pub scenario_actions: [RebuiltV3ScenarioAction; 0],
    pub state_definitions: [RebuiltV3StateDefinition; 0],
    pub migrations: [RebuiltV3Migration; 0],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_code_tail: Option<RebuiltExtraCodeTail>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltExtraCodeTail {
    pub row_id: u64,
    pub available_bytes: u64,
}

impl RebuiltV3ScenarioDocument {
    pub fn incomplete_extra_code_for(
        &self,
        instruction: &RebuiltV3ClassicInstruction,
    ) -> Option<&RebuiltExtraCodeTail> {
        let tail = self.extra_code_tail.as_ref()?;
        // Castle 491816ad newland.c cases that call loadextracode(id).
        if ![
            -23, 2, 3, 7, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 30, 31, 33, 37, 38, 40, 41,
            42, 43, 45, 46, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 63, 64, 65, 67, 68,
            69, 70, 72, 73, 74, 75, 76, 77, 78, 81, 85, 86, 87, 90, 92, 103, 106, 107, 108, 120,
            121, 122, 123, 124, 125, 126,
        ]
        .contains(&instruction.opcode)
        {
            return None;
        }
        let primary = u64::try_from(instruction.id).ok()?;
        (primary == tail.row_id || instruction.opcode == 92 && primary + 1 == tail.row_id)
            .then_some(tail)
    }
}

pub fn imported_extra_code_tail(snapshot: &ProjectSnapshot) -> Option<RebuiltExtraCodeTail> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return None;
    }
    let source = snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data EDCD")?;
    let available_bytes = source.byte_length % 10;
    (available_bytes != 0).then_some(RebuiltExtraCodeTail {
        row_id: source.byte_length / 10,
        available_bytes,
    })
}
