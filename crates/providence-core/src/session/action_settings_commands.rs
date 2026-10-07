use serde::{Deserialize, Serialize};

use super::settings_write_policy;
use super::{SessionError, extra_code_commands};
use crate::model::{ClassicAction, ExtraCodeRow, NativeRecordId, ProjectSnapshot, StableId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionSettingsEdit {
    pub source: StableId,
    pub slot: u8,
    pub target_native_id: i16,
    pub values: [i16; 5],
    pub secondary_values: Option<[i16; 5]>,
    #[serde(default)]
    pub allow_shared_updates: bool,
    #[serde(default)]
    pub scope: super::ActionSettingsWriteScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guard: Option<ActionSettingsGuard>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionSettingsGuard {
    pub caller: ClassicAction,
    pub context_fingerprint: String,
    #[serde(alias = "requireAbsentRows")]
    pub require_available_rows: bool,
}

impl ActionSettingsEdit {
    fn invalid(&self, reason: impl Into<String>) -> SessionError {
        invalid(&self.source, self.slot, reason)
    }
}

fn invalid(source: &StableId, slot: u8, reason: impl Into<String>) -> SessionError {
    SessionError::InvalidActionSettings {
        source: source.clone(),
        slot,
        reason: reason.into(),
    }
}

#[derive(Clone, Copy)]
enum Owner {
    Placed(usize),
    Extra(usize),
    Simple(usize),
    Complex(usize),
}

fn caller(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
) -> Result<(Owner, usize, ClassicAction), SessionError> {
    let mut owners = Vec::new();
    for (index, row) in snapshot.world.action_points.iter().enumerate() {
        if &row.identity == source {
            owners.push((Owner::Placed(index), row.actions.as_slice(), 8, true));
        }
    }
    for (index, row) in snapshot.extra_action_points.iter().enumerate() {
        if &row.identity == source {
            owners.push((Owner::Extra(index), row.actions.as_slice(), 8, true));
        }
    }
    for (index, row) in snapshot.simple_encounters.iter().enumerate() {
        if &row.identity == source {
            owners.push((
                Owner::Simple(index),
                row.actions.as_slice(),
                32,
                row.has_semantics(),
            ));
        }
    }
    for (index, row) in snapshot.complex_encounters.iter().enumerate() {
        if &row.identity == source {
            owners.push((Owner::Complex(index), row.actions.as_slice(), 32, true));
        }
    }
    let [(owner, actions, limit, has_semantics)] = owners.as_slice() else {
        return Err(invalid(
            source,
            slot,
            "the calling action is missing or ambiguous",
        ));
    };
    if !has_semantics || slot >= *limit {
        return Err(invalid(
            source,
            slot,
            "the calling action is padding or its slot is out of range",
        ));
    }
    let mut matches = actions
        .iter()
        .enumerate()
        .filter(|(_, action)| action.slot == slot);
    let Some((index, action)) = matches.next() else {
        return Err(invalid(
            source,
            slot,
            "the calling action slot does not exist",
        ));
    };
    if matches.next().is_some() {
        return Err(invalid(
            source,
            slot,
            "the calling action slot is ambiguous",
        ));
    }
    Ok((*owner, index, action.clone()))
}

pub(crate) fn inspect_caller(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
) -> Result<ClassicAction, SessionError> {
    caller(snapshot, source, slot).map(|(_, _, action)| action)
}

fn requested_rows(
    edit: &ActionSettingsEdit,
    action: &ClassicAction,
) -> Result<Vec<(ExtraCodeRow, &'static str)>, SessionError> {
    let shape = crate::validation::action_settings::shape(action.opcode())
        .ok_or_else(|| edit.invalid("this action does not use editable settings"))?;
    let target = u32::try_from(edit.target_native_id)
        .map_err(|_| edit.invalid("the settings target must be nonnegative"))?;
    let primary = ExtraCodeRow {
        native_id: NativeRecordId(target),
        values: edit.values,
    };
    let mut rows = vec![(primary, shape)];
    match (action.opcode() == 92, edit.secondary_values) {
        (true, Some(values)) => rows.push((
            ExtraCodeRow {
                native_id: NativeRecordId(target + 1),
                values,
            },
            "random-region-shape-details",
        )),
        (true, None) => {
            return Err(edit.invalid("this action requires complete secondary settings"));
        }
        (false, Some(_)) => return Err(edit.invalid("this action does not use secondary settings")),
        (false, None) => {}
    }
    Ok(rows)
}

pub(super) fn apply(
    snapshot: &mut ProjectSnapshot,
    mut edit: ActionSettingsEdit,
) -> Result<Vec<StableId>, SessionError> {
    settings_write_policy::check_scope(edit.allow_shared_updates)
        .map_err(|reason| edit.invalid(reason))?;
    let (owner, index, action) = caller(snapshot, &edit.source, edit.slot)?;
    let rows = requested_rows(&edit, &action)?;
    validate_guard(snapshot, &edit, &action, &rows)?;
    let mut rows = rows.into_iter().map(|(row, _)| row).collect::<Vec<_>>();
    if edit.scope == super::ActionSettingsWriteScope::Isolate {
        settings_write_policy::isolate_rows(snapshot, &edit.source, edit.slot, &mut rows)
            .map_err(|reason| edit.invalid(reason))?;
    }
    edit.target_native_id = i16::try_from(rows[0].native_id.0)
        .map_err(|_| edit.invalid("settings ID is outside Classic range"))?;
    let mut next = snapshot.clone();
    let actions = match owner {
        Owner::Placed(owner) => &mut next.world.action_points[owner].actions,
        Owner::Extra(owner) => &mut next.extra_action_points[owner].actions,
        Owner::Simple(owner) => {
            next.simple_encounters[owner].authored = true;
            &mut next.simple_encounters[owner].actions
        }
        Owner::Complex(owner) => {
            next.complex_encounters[owner].authored = true;
            &mut next.complex_encounters[owner].actions
        }
    };
    actions[index].target_native_id = edit.target_native_id;
    let impact =
        settings_write_policy::confirm(&next, &edit.source, edit.slot, &rows, &rows, &edit.scope)
            .map_err(|reason| edit.invalid(reason))?;
    let mut changed = vec![edit.source];
    changed.extend(impact.into_iter().map(|caller| caller.source));
    for row in rows {
        if !next.extra_codes.contains(&row) {
            changed.extend(extra_code_commands::upsert(&mut next, row));
        }
    }
    *snapshot = next;
    Ok(changed)
}

fn validate_guard(
    snapshot: &ProjectSnapshot,
    edit: &ActionSettingsEdit,
    action: &ClassicAction,
    rows: &[(ExtraCodeRow, &'static str)],
) -> Result<(), SessionError> {
    if let Some(guard) = &edit.guard {
        if guard.require_available_rows && edit.allow_shared_updates {
            return Err(edit.invalid("separate settings cannot update shared actions"));
        }
        if guard.caller != *action
            || crate::action_settings_repair::context_fingerprint(
                snapshot,
                &edit.source,
                edit.slot,
            )? != guard.context_fingerprint
        {
            return Err(edit.invalid(
                "the action or its complete settings context changed; review the repair again",
            ));
        }
        let allocator = settings_write_policy::SettingsAllocator::new(snapshot);
        if guard.require_available_rows
            && rows
                .iter()
                .any(|(row, _)| allocator.contains(row.native_id.0))
        {
            return Err(edit.invalid(
                "separate settings must use available rows; occupied or referenced settings are never free space",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
