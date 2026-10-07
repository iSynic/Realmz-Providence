//! Guards semantic fields that the authoring inventory intentionally keeps read-only.

use super::{ActionStepDraftSettings, SessionError};
use crate::action_authoring::{
    ActionDefinition, ActionFormContext, ActionFormDescribeQuery, FormRow, SemanticEvidenceKind,
    describe_action_form,
};
use crate::model::{ClassicAction, ExtraCodeRow, ProjectSnapshot, StableId};

pub(super) fn validate_unresolved_settings(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
    script_kind: &str,
    current: Option<&ClassicAction>,
    definition: &ActionDefinition,
    settings: &ActionStepDraftSettings,
) -> Result<(), SessionError> {
    let description = describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: definition.identity.clone(),
            target_native_id: current.map_or(0, |action| action.target_native_id),
            values: settings.values.clone(),
            secondary_values: settings.secondary_values.clone().unwrap_or_default(),
            context: ActionFormContext {
                script_kind: Some(script_kind.into()),
                ..Default::default()
            },
        },
    )
    .map_err(|reason| invalid(source, slot, reason))?;
    let unresolved = description
        .fields
        .iter()
        .filter(|field| field.evidence.kind == SemanticEvidenceKind::Unresolved)
        .collect::<Vec<_>>();
    if unresolved.is_empty() {
        return Ok(());
    }
    let current = current
        .filter(|action| action.opcode() == definition.opcode)
        .ok_or_else(|| unresolved_error(source, slot))?;
    let native_id =
        u32::try_from(current.target_native_id).map_err(|_| unresolved_error(source, slot))?;
    for field in unresolved {
        let requested = requested_value(settings, field.row, &field.key)
            .ok_or_else(|| unresolved_error(source, slot))?;
        let row_id = native_id
            .checked_add(u32::from(field.row == FormRow::Secondary))
            .ok_or_else(|| unresolved_error(source, slot))?;
        let existing =
            unique_row(snapshot, row_id).ok_or_else(|| unresolved_error(source, slot))?;
        let index = usize::from(field.index.ok_or_else(|| unresolved_error(source, slot))?);
        if existing.values[index] != requested {
            return Err(unresolved_error(source, slot));
        }
    }
    Ok(())
}

fn requested_value(settings: &ActionStepDraftSettings, row: FormRow, key: &str) -> Option<i16> {
    match row {
        FormRow::Primary => settings.values.get(key).copied(),
        FormRow::Secondary => settings
            .secondary_values
            .as_ref()
            .and_then(|values| values.get(key))
            .copied(),
        FormRow::Action => None,
    }
}

fn unique_row(snapshot: &ProjectSnapshot, native_id: u32) -> Option<&ExtraCodeRow> {
    let mut rows = snapshot
        .extra_codes
        .iter()
        .filter(|row| row.native_id.0 == native_id);
    let row = rows.next()?;
    rows.next().is_none().then_some(row)
}

fn unresolved_error(source: &StableId, slot: u8) -> SessionError {
    invalid(
        source,
        slot,
        "unresolved settings are read-only and require an unchanged imported value",
    )
}

fn invalid(source: &StableId, slot: u8, reason: impl Into<String>) -> SessionError {
    SessionError::InvalidActionSettings {
        source: source.clone(),
        slot,
        reason: reason.into(),
    }
}
