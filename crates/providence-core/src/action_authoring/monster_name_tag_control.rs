use super::{ActionTargetKind, ActionValuePreview, DescribedActionField};
use crate::model::ProjectSnapshot;

pub(super) fn decorate(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    fields: &mut [DescribedActionField],
) {
    let index = match opcode {
        87 | 125 => Some(0),
        120 => Some(1),
        88 | 127 => None,
        _ => return,
    };
    let Some(field) = fields.iter_mut().find(|field| field.index == index) else {
        return;
    };
    field.value_picker_kind = Some(ActionTargetKind::MonsterNameTag);
    field.value_picker_preview = super::targets::target_preview(
        snapshot,
        ActionTargetKind::MonsterNameTag,
        field.value,
        &field.target_context,
    )
    .map(|target| ActionValuePreview {
        kind: ActionTargetKind::MonsterNameTag,
        identity: target.identity,
        value: field.value,
        label: target.label,
        detail: target.detail,
        status: target.status,
    });
}
