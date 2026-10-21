//! Signed resource operands in Classic 491816ad newland.c and misc.c/textbox-time.c.
//! This is presentation metadata; the original signed word remains authored truth.
use super::{ActionFormDescribeQuery, ActionTargetKind, DescribedActionField, FormRow};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceBehavior {
    pub target_kind: ActionTargetKind,
    pub label: String,
    pub checked: bool,
    pub toggle_value: Option<i16>,
    pub selection_multiplier: i16,
    pub current_label: String,
    pub unavailable_reason: Option<String>,
    pub note: Option<String>,
}

use ActionTargetKind::{Message, PlayerMap, Quest, Shop, Sound};

pub(super) fn decorate(
    opcode: i16,
    query: &ActionFormDescribeQuery,
    fields: &mut [DescribedActionField],
) {
    for field in fields {
        let Some(kind) = behavior_kind(opcode, field, query) else {
            continue;
        };
        field.reference_behavior = Some(describe(opcode, kind, field));
    }
}

fn behavior_kind(
    opcode: i16,
    field: &DescribedActionField,
    query: &ActionFormDescribeQuery,
) -> Option<ActionTargetKind> {
    match field.row {
        FormRow::Action => match opcode {
            1 => Some(Message),
            6 => Some(Shop),
            9 => Some(Sound),
            29 => Some(PlayerMap),
            47 => Some(Quest),
            _ => None,
        },
        FormRow::Primary => primary_kind(opcode, field.index?, query),
        FormRow::Secondary => None,
    }
}

fn primary_kind(
    opcode: i16,
    index: u8,
    query: &ActionFormDescribeQuery,
) -> Option<ActionTargetKind> {
    let words = super::semantic_inventory::semantic_entry(opcode)
        .map(|entry| super::target_rules::field_words(entry, &query.values))
        .unwrap_or([0; 5]);
    match (opcode, index) {
        // Raw calls to sound(), including the dual-purpose words in 2 and 74.
        (2 | 48 | 107, 2) | (15 | 16 | 20 | 43 | 45 | 56 | 85 | 124, 3) | (122, 1) => Some(Sound),
        (74, 1) if words[3] != 0 => Some(Sound),
        // 15/16 deliberately call textbox(abs(word4)): its sign has no choice.
        (2 | 48 | 107, 3) | (20 | 45 | 56 | 74 | 85, 4) | (19, 0 | 1) | (122, 0) => Some(Message),
        (21 | 87, 4) if words[2] == 2 => Some(Message),
        (55, 4) if words[1] == 2 => Some(Message),
        (73, 0) => Some(Shop),
        _ => None,
    }
}

fn describe(
    opcode: i16,
    kind: ActionTargetKind,
    field: &DescribedActionField,
) -> ReferenceBehavior {
    let (label, normal) = labels(kind);
    let checked = field.value < 0
        || field.value == 0
            && (field.row == FormRow::Action && matches!(opcode, 9 | 47)
                || kind == Sound && matches!(opcode, 43 | 74));
    let magnitude = i32::from(field.value).abs();
    let toggle = if checked { magnitude } else { -magnitude };
    let toggle = i16::try_from(toggle).ok();
    let reason = unavailable(field, toggle);
    ReferenceBehavior {
        target_kind: kind,
        label: label.into(),
        checked,
        toggle_value: reason.is_none().then_some(toggle).flatten(),
        selection_multiplier: if checked { -1 } else { 1 },
        current_label: if checked { label } else { normal }.into(),
        unavailable_reason: reason,
        note: shared_note(field),
    }
}

fn unavailable(field: &DescribedActionField, toggle: Option<i16>) -> Option<String> {
    if !field.editable {
        return Some("The selected action mode does not allow editing this value.".into());
    }
    if field.value == 0 {
        return Some("Choose a nonzero resource to select between these behaviors. Zero retains this field's native meaning.".into());
    }
    match toggle {
        None => Some("The alternate polarity cannot be represented. Choose another resource to change behavior.".into()),
        Some(value) if value < 0 && has_xap_use(field) => Some(
            "Waiting would make the revive-loss XAP destination negative. Turn off party revival to choose waiting.".into()),
        Some(value) if value < field.minimum || value > field.maximum =>
            Some("Waiting needs a negative value, but Minimum Spell Points must be nonnegative. Playback and the minimum cannot be chosen independently for this action.".into()),
        _ => None,
    }
}

fn has_xap_use(field: &DescribedActionField) -> bool {
    field
        .uses
        .iter()
        .any(|usage| usage.target_kind == Some(ActionTargetKind::ExtraActionPoint))
}

fn shared_note(field: &DescribedActionField) -> Option<String> {
    if has_xap_use(field) {
        return Some(if field.value < 0 {
            "This sound also selects the revive-loss Extra Action Point. The negative value is not a valid XAP destination; choose normal playback or turn off party revival.".into()
        } else {
            format!(
                "This sound also selects revive-loss Extra Action Point {}. Both uses share this setting.",
                field.value
            )
        });
    }
    (field.uses.len() > 1).then(|| {
        format!(
            "This sound is also Minimum Spell Points ({}). Changing it changes the minimum too.",
            field.value
        )
    })
}

fn labels(kind: ActionTargetKind) -> (&'static str, &'static str) {
    match kind {
        Sound => ("Wait for sound to finish", "Continue while sound plays"),
        Message => ("Continue without waiting", "Wait for player input"),
        Shop => ("Open immediately", "Make shop available"),
        PlayerMap => ("Display immediately", "Give map for later viewing"),
        Quest => ("Clear quest flag", "Set quest flag"),
        _ => unreachable!("only source-qualified signed behavior kinds"),
    }
}
