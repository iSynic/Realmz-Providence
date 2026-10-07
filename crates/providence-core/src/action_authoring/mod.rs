//! Semantic authoring metadata for Realmz action slots and their settings rows.
//!
//! This module describes editor controls without depending on a UI toolkit. The canonical
//! project model remains `ClassicAction` plus fixed five-word `ExtraCodeRow` records.

mod ability_check_presentation;
#[cfg(test)]
mod ability_check_tests;
mod action_bounds;
mod action_metadata;
mod action_patch_control;
#[cfg(test)]
mod action_patch_tests;
mod action_summary;
mod action_units;
mod actions;
mod authoring_controls;
mod authoring_flow;
#[cfg(test)]
mod authoring_flow_tests;
mod battle_macro_presentation;
mod battle_selection_control;
#[cfg(test)]
mod battle_selection_tests;
#[cfg(test)]
mod boat_camp_tests;
mod character_selection_control;
mod choice_presentation;
#[cfg(test)]
mod classic_choice_tests;
mod classic_choices;
mod combat_monster_control;
#[cfg(test)]
mod combat_monster_tests;
mod companion_description;
mod condition_duration_control;
#[cfg(test)]
mod condition_duration_tests;
mod current_shop_control;
mod described_field_builder;
mod destroy_related_control;
#[cfg(test)]
mod destroy_related_tests;
#[cfg(test)]
mod direct_value_tests;
mod dungeon_move_presentation;
#[cfg(test)]
mod dungeon_move_tests;
mod execution_targets;
mod field_availability;
mod field_label_cleanup;
#[cfg(test)]
mod field_label_cleanup_tests;
mod field_uses;
mod form_description;
#[cfg(test)]
mod form_integrity_tests;
mod form_presentation;
mod forms;
#[cfg(test)]
mod item_mutation_tests;
#[cfg(test)]
mod map_coordinate_tests;
mod map_tile_control;
#[cfg(test)]
mod map_tile_tests;
mod map_tiles;
mod misc_character_control;
#[cfg(test)]
mod misc_character_tests;
mod misc_condition_control;
#[cfg(test)]
mod misc_condition_tests;
mod monster_name_tag_control;
#[cfg(test)]
mod monster_name_tag_tests;
mod optional_branch_control;
#[cfg(test)]
mod optional_branch_tests;
#[cfg(test)]
mod party_state_tests;
mod payment_control;
#[cfg(test)]
mod payment_tests;
mod pick_count_control;
#[cfg(test)]
mod pick_count_tests;
mod quest_value_control;
#[cfg(test)]
mod quest_value_tests;
mod random_item_control;
#[cfg(test)]
mod random_item_tests;
mod random_region_control;
#[cfg(test)]
mod random_region_tests;
#[cfg(test)]
mod random_shape_tests;
#[cfg(test)]
mod raw_control_disposition_tests;
mod restricted_shop_presentation;
mod rule_targets;
mod semantic_inventory;
mod shift_position_control;
mod spell_points_control;
#[cfg(test)]
mod spell_points_tests;
mod stamina_change_control;
#[cfg(test)]
mod stamina_change_tests;
mod target_context;
mod target_rules;
mod targets;
mod teleport_control;
#[cfg(test)]
mod teleport_tests;
mod time_branch_control;
#[cfg(test)]
mod time_branch_tests;
mod time_mutation_control;
#[cfg(test)]
mod time_mutation_tests;
mod timed_encounter_control;
#[cfg(test)]
mod timed_encounter_tests;
mod trigger_mutation_control;
#[cfg(test)]
mod trigger_mutation_tests;

use crate::model::StableId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub(crate) use authoring_controls::option_labels_present;
pub use authoring_controls::{
    ActionAuthoringInput, ActionAuthoringProjection, AuthoringModeControl,
};
pub(crate) use execution_targets::execution_target_fields;
pub(crate) use form_description::settings_target_fields;
pub use form_description::{
    action_availability_reason, action_semantic_coverage, describe_action_form,
    describe_action_form_with_application,
};
pub use semantic_inventory::semantic_inventory;
pub(crate) use target_context::settings_context;
pub(crate) use target_rules::direct_target_kind;
pub(crate) use targets::target_preview;
pub use targets::{
    ActionTarget, ActionTargetContext, ActionTargetKind, ActionTargetPage, ActionTargetQuery,
    ActionTargetStatus, list_targets, list_targets_with_application,
};

pub const DONOR_COMMIT: &str = "56ac232c22fc321a99cb819f1e2d8c3985ad479a";
pub const EXTRA_ACTION_POINT_RECORD_BYTES: u16 = 40;
pub const EXTRA_CODE_ROW_BYTES: u16 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionStorage {
    Empty,
    DirectCodeId,
    ExtraCodeRow,
    ExtraActionPoint,
    SameMapActionPoint,
    StepOnly,
    PreserveOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuthoringLevel {
    FirstClass,
    Advanced,
    Empty,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionDefinition {
    pub identity: String,
    pub opcode: i16,
    pub label: String,
    pub category: String,
    pub description: String,
    pub storage: ActionStorage,
    pub target_kind: Option<ActionTargetKind>,
    pub form_id: Option<String>,
    pub selectable: bool,
    pub authoring_level: AuthoringLevel,
    pub gosub_applicable: bool,
}

pub fn gosub_applicable(opcode: i16) -> bool {
    matches!(
        opcode,
        3 | 21 | 31 | 40 | 46 | 55 | 56 | 64 | 67 | 72 | 75 | 76 | 77 | 78 | 81 | 85 | 86 | 87
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FormRow {
    Action,
    Primary,
    Secondary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FormControl {
    Integer,
    Choice,
    Target,
    Preserved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SemanticEvidenceKind {
    SourceSupported,
    FixtureProven,
    Inferred,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEvidence {
    pub kind: SemanticEvidenceKind,
    pub status: String,
    pub sources: Vec<String>,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSpecialValue {
    pub value: i16,
    pub meaning: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionValuePreview {
    pub kind: ActionTargetKind,
    pub identity: StableId,
    pub value: i16,
    pub label: String,
    pub detail: String,
    pub status: ActionTargetStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DescribedActionField {
    pub key: String,
    pub index: Option<u8>,
    pub row: FormRow,
    pub label: String,
    pub explanation: String,
    pub control: FormControl,
    pub value: i16,
    pub minimum: i16,
    pub maximum: i16,
    pub units: Option<String>,
    pub choices: Vec<FormChoice>,
    pub special_values: Vec<SemanticSpecialValue>,
    pub target_kind: Option<ActionTargetKind>,
    pub value_picker_kind: Option<ActionTargetKind>,
    pub value_picker_preview: Option<ActionValuePreview>,
    pub visible: bool,
    pub editable: bool,
    pub target_context: ActionTargetContext,
    pub availability_reason: Option<String>,
    pub preserved: bool,
    pub applicable_context: String,
    pub preservation_policy: String,
    pub preview: Option<ActionValuePreview>,
    pub evidence: SemanticEvidence,
    pub uses: Vec<ActionFieldUse>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionFieldUse {
    pub role: ActionFieldRole,
    pub label: String,
    pub target_kind: Option<ActionTargetKind>,
    pub preview: Option<ActionValuePreview>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionFieldRole {
    Quantity,
    Choice,
    Reference,
    ContextualPosition,
    ContextualReference,
    Inactive,
    Preserved,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SettingsTargetField {
    pub key: String,
    pub index: u8,
    pub kind: ActionTargetKind,
    pub value: i16,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionFormContext {
    #[serde(default)]
    pub target_context: ActionTargetContext,
    #[serde(default)]
    pub script_kind: Option<String>,
    /// Present for a step embedded in a four-result Simple Encounter program.
    /// Result and step are zero-based storage coordinates.
    #[serde(default)]
    pub encounter_identity: Option<StableId>,
    #[serde(default)]
    pub encounter_result_index: Option<u8>,
    #[serde(default)]
    pub encounter_step_index: Option<u8>,
    #[serde(default)]
    pub authoring: ActionAuthoringInput,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionFormDescribeQuery {
    pub action_identity: String,
    #[serde(default)]
    pub target_native_id: i16,
    #[serde(default)]
    pub values: BTreeMap<String, i16>,
    #[serde(default)]
    pub secondary_values: BTreeMap<String, i16>,
    #[serde(default)]
    pub context: ActionFormContext,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionFormDescription {
    pub action: ActionDefinition,
    pub title: String,
    pub available: bool,
    pub availability_reason: Option<String>,
    pub fields: Vec<DescribedActionField>,
    pub evidence: SemanticEvidence,
    pub unresolved_field_count: usize,
    pub editable_field_count: usize,
    pub option_prompt_storage: Option<String>,
    pub authoring: ActionAuthoringProjection,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSemanticInventoryField {
    pub index: u8,
    pub internal_name: String,
    pub label: String,
    pub help: String,
    pub target_family: Option<String>,
    pub preserved: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSemanticInventoryEntry {
    pub opcode: i16,
    pub title: String,
    pub id_label: String,
    pub id_help: String,
    pub target_family: Option<String>,
    pub writer_status: String,
    pub evidence_status: String,
    pub form_id: Option<String>,
    pub fields: Vec<ActionSemanticInventoryField>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSemanticCoverage {
    pub cataloged_actions: usize,
    pub inventory_actions: usize,
    pub settings_actions: usize,
    pub settings_layouts: usize,
    pub inventoried_fields: usize,
    pub editable_fields: usize,
    pub preserved_fields: usize,
    pub unresolved_fields: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormChoice {
    pub value: i16,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionFormField {
    pub index: u8,
    pub row: FormRow,
    pub name: String,
    pub label: String,
    pub help: String,
    pub control: FormControl,
    pub minimum: i16,
    pub maximum: i16,
    pub signed: bool,
    pub required: bool,
    pub preserved: bool,
    pub target_kind: Option<ActionTargetKind>,
    pub target_rule: Option<String>,
    pub choices: Vec<FormChoice>,
    pub byte_offset: u8,
    pub byte_length: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormProvenance {
    pub donor_commit: String,
    pub donor_paths: Vec<String>,
    pub native_family: String,
    pub record_geometry: String,
    pub owned_bytes: String,
    pub fixture_status: String,
    pub confidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionFormDefinition {
    pub identity: String,
    pub fields: Vec<ActionFormField>,
    pub required_rows: Vec<FormRow>,
    pub companion_form_id: Option<String>,
    pub provenance: FormProvenance,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionAuthoringCatalog {
    pub actions: Vec<ActionDefinition>,
    pub forms: Vec<ActionFormDefinition>,
}

pub fn catalog() -> ActionAuthoringCatalog {
    ActionAuthoringCatalog {
        actions: actions::definitions(),
        forms: forms::definitions(),
    }
}

pub fn action_definition(identity: &str) -> Option<ActionDefinition> {
    actions::definitions()
        .into_iter()
        .find(|definition| definition.identity == identity)
}

pub fn action_definition_for_opcode(opcode: i16) -> Option<ActionDefinition> {
    let opcode = normalize_opcode(opcode);
    actions::definitions()
        .into_iter()
        .find(|definition| definition.opcode == opcode)
}

/// Returns the stable settings layout identity without allocating a catalog projection.
pub(crate) fn form_identity_for_opcode(opcode: i16) -> Option<&'static str> {
    actions::form_identity(opcode)
}

pub fn form_definition(identity: &str) -> Option<ActionFormDefinition> {
    forms::definitions()
        .into_iter()
        .find(|definition| definition.identity == identity)
}

pub fn decode_form_values(identity: &str, values: [i16; 5]) -> Option<BTreeMap<String, i16>> {
    let form = form_definition(identity)?;
    Some(
        form.fields
            .iter()
            .map(|field| {
                (
                    canonical_field_key(&form.fields, field),
                    values[usize::from(field.index)],
                )
            })
            .collect(),
    )
}

pub fn encode_form_values(
    identity: &str,
    typed: &BTreeMap<String, i16>,
    preserved_base: Option<[i16; 5]>,
) -> Result<[i16; 5], String> {
    let form = form_definition(identity)
        .ok_or_else(|| format!("action form {identity} is not defined"))?;
    let known = form
        .fields
        .iter()
        .map(|field| canonical_field_key(&form.fields, field))
        .collect::<std::collections::BTreeSet<_>>();
    if let Some(name) = typed.keys().find(|name| !known.contains(*name)) {
        return Err(format!("action form {identity} has no field named {name}"));
    }
    let mut values = preserved_base.unwrap_or([0; 5]);
    for field in &form.fields {
        let key = canonical_field_key(&form.fields, field);
        if field.preserved {
            if typed.contains_key(&key) {
                return Err(format!(
                    "action form {identity} field {key} is preserve-only"
                ));
            }
            continue;
        }
        let value = typed
            .get(&key)
            .copied()
            .ok_or_else(|| format!("action form {identity} requires field {key}"))?;
        if !(field.minimum..=field.maximum).contains(&value) {
            return Err(format!(
                "action form {identity} field {} is outside {} through {}",
                field.name, field.minimum, field.maximum
            ));
        }
        if !field.choices.is_empty() && !field.choices.iter().any(|choice| choice.value == value) {
            return Err(format!(
                "action form {identity} field {} does not accept {value}",
                field.name
            ));
        }
        values[usize::from(field.index)] = value;
    }
    Ok(values)
}

pub(super) fn semantic_field_key(form_id: &str, field_name: &str, field_index: u8) -> String {
    form_definition(form_id)
        .and_then(|form| {
            form.fields
                .iter()
                .find(|field| field.index == field_index)
                .map(|field| canonical_field_key(&form.fields, field))
        })
        .unwrap_or_else(|| field_name.to_owned())
}

fn canonical_field_key(fields: &[ActionFormField], field: &ActionFormField) -> String {
    if fields
        .iter()
        .filter(|other| other.name == field.name)
        .count()
        > 1
    {
        format!("{}{}", field.name, field.index)
    } else {
        field.name.clone()
    }
}

pub fn normalize_opcode(opcode: i16) -> i16 {
    if opcode < 0 && !matches!(opcode, -14 | -23) {
        opcode.checked_neg().unwrap_or(opcode)
    } else {
        opcode
    }
}

#[cfg(test)]
mod battle_macro_tests;
#[cfg(test)]
mod branch_authoring_tests;
#[cfg(test)]
mod branch_charge_semantics_tests;
#[cfg(test)]
mod character_eligibility_tests;
#[cfg(test)]
mod character_selection_tests;
#[cfg(test)]
mod choice_authoring_tests;
#[cfg(test)]
mod current_shop_control_tests;
#[cfg(test)]
mod fatigue_tests;
#[cfg(test)]
mod field_semantics_tests;
#[cfg(test)]
mod media_target_tests;
mod selected_character_presentation;
#[cfg(test)]
mod selected_character_state_tests;
#[cfg(test)]
mod shift_position_tests;
#[cfg(test)]
mod simultaneous_use_tests;
#[cfg(test)]
mod target_context_tests;
#[cfg(test)]
mod tests;
