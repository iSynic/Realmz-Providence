use super::form_description::{availability_reason, control, field_evidence, preservation_policy};
use super::form_presentation::field_context;
use super::target_rules::FieldMeaning;
use super::{
    ActionFormDescribeQuery, ActionSemanticInventoryEntry, ActionSemanticInventoryField,
    ActionTargetKind, ActionValuePreview, DescribedActionField, FormChoice, FormRow,
    SemanticSpecialValue,
};
use std::collections::BTreeMap;

pub(super) fn state(
    entry: &ActionSemanticInventoryEntry,
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
    meaning: FieldMeaning,
    label: &str,
    explanation: &str,
    preserved: bool,
) -> (Option<String>, bool, bool) {
    let conditional = super::field_availability::reason(entry.opcode, field.index, values);
    let unresolved = meaning == FieldMeaning::Unresolved
        || label.trim().is_empty()
        || explanation.trim().is_empty();
    let editable = !preserved && conditional.is_none() && !unresolved;
    (conditional, unresolved, editable)
}

#[allow(clippy::too_many_arguments)]
pub(super) fn build(
    key: &str,
    index: u8,
    label: String,
    explanation: String,
    choices: Vec<FormChoice>,
    target_kind: Option<ActionTargetKind>,
    value: i16,
    units: Option<String>,
    special_values: Vec<SemanticSpecialValue>,
    editable: bool,
    query: &ActionFormDescribeQuery,
    conditional: Option<String>,
    unresolved: bool,
    preserved: bool,
    preview: Option<ActionValuePreview>,
    entry: &ActionSemanticInventoryEntry,
) -> DescribedActionField {
    DescribedActionField {
        key: key.into(),
        index: Some(index),
        row: FormRow::Primary,
        label,
        explanation,
        control: control(preserved, &choices, target_kind),
        value,
        minimum: i16::MIN,
        maximum: i16::MAX,
        units,
        choices,
        special_values,
        target_kind,
        value_picker_kind: None,
        value_picker_preview: None,
        visible: true,
        editable,
        target_context: query.context.target_context.clone(),
        availability_reason: availability_reason(preserved, conditional, unresolved),
        preserved,
        applicable_context: field_context(entry.opcode, index),
        preservation_policy: preservation_policy(preserved),
        preview,
        evidence: field_evidence(entry, unresolved),
        uses: Vec::new(),
    }
}
