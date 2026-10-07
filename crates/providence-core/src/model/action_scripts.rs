use super::{LevelType, MapCoordinate, NativeRecordId, QuestLabel, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicAction {
    pub slot: u8,
    pub raw_opcode: i16,
    pub target_native_id: i16,
}

impl ClassicAction {
    pub fn opcode(&self) -> i16 {
        if self.raw_opcode < 0 && !matches!(self.raw_opcode, -14 | -23) {
            self.raw_opcode.checked_neg().unwrap_or(self.raw_opcode)
        } else {
            self.raw_opcode
        }
    }

    pub fn gosub(&self) -> bool {
        self.raw_opcode < 0 && !matches!(self.raw_opcode, -14 | -23)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionPoint {
    pub identity: StableId,
    pub level_type: LevelType,
    pub level_index: u32,
    pub record_index: u8,
    pub classic_door_id: i32,
    pub coordinate: Option<MapCoordinate>,
    pub post_action_level: u8,
    pub post_action_x: u8,
    pub post_action_y: u8,
    pub chance_percent: i8,
    pub actions: Vec<ClassicAction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraActionPoint {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub classic_door_id: i32,
    pub post_action_level: u8,
    pub post_action_x: u8,
    pub post_action_y: u8,
    pub chance_percent: i8,
    pub actions: Vec<ClassicAction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDescriptor {
    pub source: StableId,
    pub text: String,
}

pub(super) fn normalize_editor_metadata(
    quest_labels: &mut [QuestLabel],
    script_descriptors: &mut [ScriptDescriptor],
) {
    quest_labels.sort_by_key(|label| label.id);
    script_descriptors.sort_by(|left, right| left.source.cmp(&right.source));
}
