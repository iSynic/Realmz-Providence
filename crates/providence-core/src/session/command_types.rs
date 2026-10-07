use crate::model::{MapCoordinate, NativeRecordId, StableId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Revision(pub u64);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedRevisionCommand<T> {
    pub expected_revision: Revision,
    pub command: T,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandMapCellPaint {
    pub x: u8,
    pub y: u8,
    pub tile: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TypedActionSettings {
    pub values: BTreeMap<String, i16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary_values: Option<BTreeMap<String, i16>>,
    #[serde(default)]
    pub allow_shared_updates: bool,
    #[serde(default)]
    pub scope: ActionSettingsWriteScope,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionStepEdit {
    pub source: StableId,
    pub slot: u8,
    pub action_identity: String,
    #[serde(default)]
    pub gosub: bool,
    pub target_native_id: i16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<TypedActionSettings>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionSettingsCallerConfirmation {
    pub source: StableId,
    pub slot: u8,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum ActionSettingsWriteScope {
    #[default]
    PreserveReferences,
    Isolate,
    UpdateAffected {
        confirmed_callers: Vec<ActionSettingsCallerConfirmation>,
    },
    // Retained only to reject obsolete form-layout-based confirmations explicitly.
    UpdateAllCompatible {
        confirmed_callers: Vec<ActionSettingsCallerConfirmation>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionStepDraftSettings {
    pub values: BTreeMap<String, i16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary_values: Option<BTreeMap<String, i16>>,
    #[serde(default)]
    pub scope: ActionSettingsWriteScope,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionStepDraft {
    pub slot: u8,
    pub action_identity: String,
    #[serde(default)]
    pub gosub: bool,
    #[serde(default)]
    pub target_native_id: i16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<ActionStepDraftSettings>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionPointHeaderDraft {
    pub coordinate: Option<MapCoordinate>,
    pub post_action_level: u8,
    pub post_action_x: u8,
    pub post_action_y: u8,
    pub chance_percent: i8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionPointRecordDraft {
    pub source: StableId,
    #[serde(default)]
    pub descriptor: String,
    pub header: ActionPointHeaderDraft,
    pub steps: Vec<ActionStepDraft>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraActionPointHeaderDraft {
    pub classic_door_id: i32,
    pub post_action_level: u8,
    pub post_action_x: u8,
    pub post_action_y: u8,
    pub chance_percent: i8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraActionPointRecordDraft {
    pub source: StableId,
    #[serde(default)]
    pub descriptor: String,
    pub header: ExtraActionPointHeaderDraft,
    pub steps: Vec<ActionStepDraft>,
}

/// One complete Simple Encounter edit, including all thirty-two action slots.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimpleEncounterRecordDraft {
    pub source: StableId,
    pub native_id: NativeRecordId,
    pub prompt_message_native_id: i16,
    pub can_back_out: bool,
    pub max_times: i8,
    pub caste_success: i8,
    pub texts: [String; 4],
    pub choice_results: [i8; 4],
    pub steps: Vec<ActionStepDraft>,
}

/// One complete Complex Encounter edit, including all thirty-two result slots.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComplexEncounterRecordDraft {
    pub source: StableId,
    pub native_id: NativeRecordId,
    pub prompt_message_native_id: i16,
    pub can_back_out: bool,
    pub max_times: i8,
    pub action_result: i8,
    pub word_result: i8,
    pub groups: [i8; 8],
    pub spell_ids: [i16; 10],
    pub spell_results: [i8; 10],
    pub item_ids: [i16; 5],
    pub item_results: [i8; 5],
    pub thief: bool,
    pub caste_success: i8,
    pub thief_success: i8,
    pub thief_fail: i8,
    pub texts: [String; 9],
    pub steps: Vec<ActionStepDraft>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExtraCodeBranchLayout {
    Choice,
    Force,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "mode",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum BattleMonsterReferenceRewrite {
    Clear { monster_id: u32 },
    Replace { from_id: u32, to_id: u32 },
    Swap { from_id: u32, to_id: u32 },
}
