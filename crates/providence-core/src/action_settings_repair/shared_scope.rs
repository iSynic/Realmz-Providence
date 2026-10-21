//! A repair confirms changed-word consumers, never the obsolete shared-write flag.

use std::collections::BTreeSet;

use super::{RepairDraft, RepairInput, RepairIntent, SettingsValues, context};
use crate::model::{ClassicAction, ExtraCodeRow, NativeRecordId, ProjectSnapshot};
use crate::session::{
    ActionSettingsCallerConfirmation, ActionSettingsEdit, ActionSettingsGuard,
    ActionSettingsWriteScope, Revision, action_settings_commands::inspect_caller,
};

pub(super) fn confirmation<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    draft: &RepairDraft<Input>,
) -> Result<Vec<ActionSettingsCallerConfirmation>, String> {
    if Input::OPCODE != 19 || draft.original_action.opcode() != 19 {
        return Err("Confirmed shared repair is unavailable for this action.".into());
    }
    let action =
        inspect_caller(snapshot, &draft.source, draft.slot).map_err(|error| error.to_string())?;
    let id = u32::try_from(action.target_native_id)
        .map_err(|_| "Create independent settings before sharing this action.")?;
    if context::words(snapshot, id).1 != 1 {
        return Err("Shared repair requires one unambiguous existing settings row.".into());
    }
    for usage in context::affected_uses(snapshot, &draft.source, &action) {
        let caller = inspect_caller(snapshot, &usage.source, usage.slot)
            .map_err(|error| error.to_string())?;
        if caller.opcode() != 19 || caller.target_native_id != action.target_native_id {
            return Err(
                "These settings have incompatible shared uses. Repair only this action.".into(),
            );
        }
    }
    let values = draft.input.values(snapshot).map_err(|_| {
        "Complete and resolve the message range before confirming shared actions.".to_owned()
    })?;
    let selected = BTreeSet::from([ActionSettingsCallerConfirmation {
        source: draft.source.clone(),
        slot: draft.slot,
    }]);
    crate::action_settings_effects::impacted_callers(
        snapshot,
        &[ExtraCodeRow {
            native_id: NativeRecordId(id),
            values: values.primary,
        }],
        &selected,
    )
}

pub(super) fn plan<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<Input>,
    action: &ClassicAction,
    values: SettingsValues,
) -> Result<(ActionSettingsEdit, RepairIntent), String> {
    let confirmed = confirmation(snapshot, draft)?;
    if confirmed != draft.confirmed_callers {
        return Err(
            "The affected actions changed. Review and confirm the shared repair again.".into(),
        );
    }
    let edit = ActionSettingsEdit {
        source: draft.source.clone(),
        slot: draft.slot,
        target_native_id: action.target_native_id,
        values: values.primary,
        secondary_values: values.companion,
        allow_shared_updates: false,
        scope: ActionSettingsWriteScope::UpdateAffected {
            confirmed_callers: confirmed,
        },
        guard: Some(ActionSettingsGuard {
            caller: action.clone(),
            context_fingerprint: draft.context_fingerprint.clone(),
            require_available_rows: false,
        }),
    };
    let intent = super::repair_intent(snapshot, revision, action, &edit)?;
    Ok((edit, intent))
}
