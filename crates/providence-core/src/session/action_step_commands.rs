use super::settings_write_policy;
use crate::action_authoring::{
    ActionStorage, action_definition, encode_form_values, form_definition,
};
use crate::model::{ClassicAction, ExtraCodeRow, NativeRecordId, ProjectSnapshot, StableId};
use crate::session::{ActionStepEdit, EditorSession, SessionError};

#[derive(Clone, Copy)]
pub(super) enum PointKind {
    Placed,
    Extra,
    SimpleEncounter,
    ComplexEncounter,
}

impl EditorSession {
    pub(super) fn apply_action_point_step(
        &mut self,
        edit: ActionStepEdit,
    ) -> Result<Vec<StableId>, SessionError> {
        apply_step(&mut self.snapshot, PointKind::Placed, edit)
    }

    pub(super) fn move_action_point_step(
        &mut self,
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    ) -> Result<Vec<StableId>, SessionError> {
        change_slots(
            &mut self.snapshot,
            PointKind::Placed,
            source,
            from_slot,
            to_slot,
            true,
        )
    }

    pub(super) fn duplicate_action_point_step(
        &mut self,
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    ) -> Result<Vec<StableId>, SessionError> {
        change_slots(
            &mut self.snapshot,
            PointKind::Placed,
            source,
            from_slot,
            to_slot,
            false,
        )
    }

    pub(super) fn clear_action_point_step(
        &mut self,
        source: StableId,
        slot: u8,
    ) -> Result<Vec<StableId>, SessionError> {
        clear_step(&mut self.snapshot, PointKind::Placed, source, slot)
    }

    pub(super) fn apply_extra_action_point_step(
        &mut self,
        edit: ActionStepEdit,
    ) -> Result<Vec<StableId>, SessionError> {
        apply_step(&mut self.snapshot, PointKind::Extra, edit)
    }

    pub(super) fn move_extra_action_point_step(
        &mut self,
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    ) -> Result<Vec<StableId>, SessionError> {
        change_slots(
            &mut self.snapshot,
            PointKind::Extra,
            source,
            from_slot,
            to_slot,
            true,
        )
    }

    pub(super) fn duplicate_extra_action_point_step(
        &mut self,
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    ) -> Result<Vec<StableId>, SessionError> {
        change_slots(
            &mut self.snapshot,
            PointKind::Extra,
            source,
            from_slot,
            to_slot,
            false,
        )
    }

    pub(super) fn clear_extra_action_point_step(
        &mut self,
        source: StableId,
        slot: u8,
    ) -> Result<Vec<StableId>, SessionError> {
        clear_step(&mut self.snapshot, PointKind::Extra, source, slot)
    }
}

pub(super) fn apply_step(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    edit: ActionStepEdit,
) -> Result<Vec<StableId>, SessionError> {
    let prepared = prepare_step(snapshot, kind, edit)?;
    let mut next = snapshot.clone();
    install_action(&mut next, kind, &prepared)?;
    let impact = settings_write_policy::confirm(
        &next,
        &prepared.source,
        prepared.slot,
        &prepared.rows,
        &prepared.rows,
        &prepared.scope,
    )
    .map_err(|reason| invalid(&prepared.source, prepared.slot, reason))?;
    let mut changed = vec![prepared.source];
    changed.extend(impact.into_iter().map(|caller| caller.source));
    for row in prepared.rows {
        upsert_row(&mut next, row, &mut changed);
    }
    *snapshot = next;
    Ok(changed)
}

pub(super) struct PreparedStep {
    pub source: StableId,
    pub slot: u8,
    pub action: Option<ClassicAction>,
    pub rows: Vec<ExtraCodeRow>,
    pub scope: super::ActionSettingsWriteScope,
}

pub(super) fn prepare_step(
    snapshot: &ProjectSnapshot,
    kind: PointKind,
    edit: ActionStepEdit,
) -> Result<PreparedStep, SessionError> {
    prepare_step_with_target(snapshot, kind, edit, false)
}

pub(super) fn prepare_resolved_step(
    snapshot: &ProjectSnapshot,
    kind: PointKind,
    edit: ActionStepEdit,
) -> Result<PreparedStep, SessionError> {
    prepare_step_with_target(snapshot, kind, edit, true)
}

fn prepare_step_with_target(
    snapshot: &ProjectSnapshot,
    kind: PointKind,
    mut edit: ActionStepEdit,
    target_resolved: bool,
) -> Result<PreparedStep, SessionError> {
    settings_write_policy::check_scope(
        edit.settings
            .as_ref()
            .is_some_and(|s| s.allow_shared_updates),
    )
    .map_err(|reason| invalid_edit(&edit, &reason))?;
    validate_slot(kind, &edit.source, edit.slot)?;
    owner_actions(snapshot, kind, &edit.source)?;
    let definition = authorable_definition(&edit)?;
    let existing = owner_actions(snapshot, kind, &edit.source)?
        .iter()
        .find(|action| action.slot == edit.slot);
    let raw_opcode = authored_opcode(definition.opcode, edit.gosub, existing)
        .map_err(|reason| invalid(&edit.source, edit.slot, reason))?;
    let settings_target = if target_resolved && definition.form_id.is_some() {
        let id = u32::try_from(edit.target_native_id)
            .map_err(|_| invalid_edit(&edit, "the resolved settings ID is invalid"))?;
        Some((id, true))
    } else {
        resolve_settings_target(snapshot, existing, &definition)
            .map_err(|reason| invalid_edit(&edit, &reason))?
    };
    let mut requested_rows = requested_rows(snapshot, &edit, &definition, settings_target)?;
    let scope = edit
        .settings
        .as_ref()
        .map(|settings| settings.scope.clone())
        .unwrap_or_default();
    settings_write_policy::validate_scope(&scope).map_err(|reason| invalid_edit(&edit, reason))?;
    if scope == super::ActionSettingsWriteScope::Isolate {
        settings_write_policy::isolate_rows(snapshot, &edit.source, edit.slot, &mut requested_rows)
            .map_err(|reason| invalid_edit(&edit, &reason))?;
    }
    if let Some(row) = requested_rows.first() {
        edit.target_native_id = i16::try_from(row.native_id.0)
            .map_err(|_| invalid_edit(&edit, "settings ID is outside Classic range"))?;
    }

    Ok(PreparedStep {
        source: edit.source,
        slot: edit.slot,
        action: (definition.storage != ActionStorage::Empty).then_some(ClassicAction {
            slot: edit.slot,
            raw_opcode,
            target_native_id: edit.target_native_id,
        }),
        rows: requested_rows,
        scope,
    })
}

fn authorable_definition(
    edit: &ActionStepEdit,
) -> Result<crate::action_authoring::ActionDefinition, SessionError> {
    action_definition(&edit.action_identity)
        .filter(|definition| definition.selectable)
        .ok_or_else(|| {
            invalid(
                &edit.source,
                edit.slot,
                "the selected action is not authorable",
            )
        })
}

pub(super) fn install_action(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    step: &PreparedStep,
) -> Result<(), SessionError> {
    let actions = owner_actions_mut(snapshot, kind, &step.source)?;
    actions.retain(|action| action.slot != step.slot);
    if let Some(action) = &step.action {
        actions.push(action.clone());
        actions.sort_by_key(|action| action.slot);
    }
    Ok(())
}

fn requested_rows(
    snapshot: &ProjectSnapshot,
    edit: &ActionStepEdit,
    definition: &crate::action_authoring::ActionDefinition,
    settings_target: Option<(u32, bool)>,
) -> Result<Vec<ExtraCodeRow>, SessionError> {
    let Some(form_id) = definition.form_id.as_deref() else {
        if edit.settings.is_some() {
            return Err(invalid_edit(edit, "this action does not use settings rows"));
        }
        return Ok(Vec::new());
    };
    let settings = edit
        .settings
        .as_ref()
        .ok_or_else(|| invalid_edit(edit, "this action requires complete typed settings"))?;
    let (native_id, preserve_existing) = settings_target
        .ok_or_else(|| invalid_edit(edit, "the core did not assign settings storage"))?;
    let primary = typed_row(
        snapshot,
        native_id,
        form_id,
        &settings.values,
        preserve_existing,
    )
    .map_err(|reason| invalid(&edit.source, edit.slot, reason))?;
    let mut rows = vec![primary];
    let form = form_definition(form_id).expect("action definitions reference known forms");
    if let Some(companion) = form.companion_form_id.as_deref() {
        let secondary_id = native_id.checked_add(1).ok_or_else(|| {
            invalid(
                &edit.source,
                edit.slot,
                "the companion settings row ID overflows",
            )
        })?;
        let values = settings.secondary_values.as_ref().ok_or_else(|| {
            invalid(
                &edit.source,
                edit.slot,
                "this action requires complete companion settings",
            )
        })?;
        let secondary = typed_row(snapshot, secondary_id, companion, values, preserve_existing)
            .map_err(|reason| invalid(&edit.source, edit.slot, reason))?;
        rows.push(secondary);
    } else if settings.secondary_values.is_some() {
        return Err(invalid(
            &edit.source,
            edit.slot,
            "this action does not use companion settings",
        ));
    }
    Ok(rows)
}

fn resolve_settings_target(
    snapshot: &ProjectSnapshot,
    existing: Option<&ClassicAction>,
    definition: &crate::action_authoring::ActionDefinition,
) -> Result<Option<(u32, bool)>, String> {
    let Some(form_id) = definition.form_id.as_deref() else {
        return Ok(None);
    };
    if let Some(action) = existing.filter(|action| action.opcode() == definition.opcode)
        && let Ok(id) = u32::try_from(action.target_native_id)
    {
        return Ok(Some((id, true)));
    }
    let paired = form_definition(form_id).is_some_and(|form| form.companion_form_id.is_some());
    settings_write_policy::available_id(snapshot, paired).map(|id| Some((id, false)))
}

fn typed_row(
    snapshot: &ProjectSnapshot,
    native_id: u32,
    form_id: &str,
    typed: &std::collections::BTreeMap<String, i16>,
    preserve_existing: bool,
) -> Result<ExtraCodeRow, String> {
    let existing = preserve_existing
        .then(|| unique_row(snapshot, native_id))
        .transpose()?
        .flatten();
    let values = encode_form_values(form_id, typed, existing.map(|row| row.values))?;
    Ok(ExtraCodeRow {
        native_id: NativeRecordId(native_id),
        values,
    })
}

fn unique_row(snapshot: &ProjectSnapshot, native_id: u32) -> Result<Option<&ExtraCodeRow>, String> {
    let mut rows = snapshot
        .extra_codes
        .iter()
        .filter(|row| row.native_id.0 == native_id);
    let row = rows.next();
    if rows.next().is_some() {
        Err(format!("settings #{native_id} are ambiguous"))
    } else {
        Ok(row)
    }
}

fn authored_opcode(
    opcode: i16,
    gosub: bool,
    existing: Option<&ClassicAction>,
) -> Result<i16, &'static str> {
    if gosub && !crate::action_authoring::gosub_applicable(opcode) {
        if existing.is_some_and(|action| action.raw_opcode == -opcode) {
            return Ok(-opcode);
        }
        return Err("this action does not support GOSUB return behavior");
    }
    let raw = if gosub { -opcode } else { opcode };
    (i8::MIN as i16..=i8::MAX as i16)
        .contains(&raw)
        .then_some(raw)
        .ok_or("the action opcode is outside the Classic signed-byte range")
}

fn change_slots(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    source: StableId,
    from_slot: u8,
    to_slot: u8,
    swap: bool,
) -> Result<Vec<StableId>, SessionError> {
    validate_slot(kind, &source, from_slot)?;
    validate_slot(kind, &source, to_slot)?;
    let actions = owner_actions_mut(snapshot, kind, &source)?;
    let original = actions
        .iter()
        .find(|action| action.slot == from_slot)
        .cloned()
        .ok_or_else(|| SessionError::ActionReferenceNotFound {
            source: source.clone(),
            slot: from_slot,
        })?;
    let destination = actions
        .iter()
        .find(|action| action.slot == to_slot)
        .cloned();
    actions.retain(|action| action.slot != to_slot && (!swap || action.slot != from_slot));
    actions.push(ClassicAction {
        slot: to_slot,
        ..original
    });
    if swap && let Some(destination) = destination {
        actions.push(ClassicAction {
            slot: from_slot,
            ..destination
        });
    }
    actions.sort_by_key(|action| action.slot);
    Ok(vec![source])
}

fn clear_step(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    source: StableId,
    slot: u8,
) -> Result<Vec<StableId>, SessionError> {
    validate_slot(kind, &source, slot)?;
    let actions = owner_actions_mut(snapshot, kind, &source)?;
    if !actions.iter().any(|action| action.slot == slot) {
        return Err(SessionError::ActionReferenceNotFound { source, slot });
    }
    actions.retain(|action| action.slot != slot);
    Ok(vec![source])
}

pub(super) fn owner_actions<'a>(
    snapshot: &'a ProjectSnapshot,
    kind: PointKind,
    source: &StableId,
) -> Result<&'a Vec<ClassicAction>, SessionError> {
    match kind {
        PointKind::Placed => snapshot
            .world
            .action_points
            .iter()
            .find(|row| &row.identity == source)
            .map(|row| &row.actions)
            .ok_or_else(|| SessionError::ActionPointNotFound(source.clone())),
        PointKind::Extra => snapshot
            .extra_action_points
            .iter()
            .find(|row| &row.identity == source)
            .map(|row| &row.actions)
            .ok_or_else(|| SessionError::ExtraActionPointNotFound(source.clone())),
        PointKind::SimpleEncounter => snapshot
            .simple_encounters
            .iter()
            .find(|row| &row.identity == source)
            .map(|row| &row.actions)
            .ok_or_else(|| SessionError::SimpleEncounterNotFound(source.clone())),
        PointKind::ComplexEncounter => snapshot
            .complex_encounters
            .iter()
            .find(|row| &row.identity == source)
            .map(|row| &row.actions)
            .ok_or_else(|| SessionError::ComplexEncounterNotFound(source.clone())),
    }
}

fn owner_actions_mut<'a>(
    snapshot: &'a mut ProjectSnapshot,
    kind: PointKind,
    source: &StableId,
) -> Result<&'a mut Vec<ClassicAction>, SessionError> {
    match kind {
        PointKind::Placed => snapshot
            .world
            .action_points
            .iter_mut()
            .find(|row| &row.identity == source)
            .map(|row| &mut row.actions)
            .ok_or_else(|| SessionError::ActionPointNotFound(source.clone())),
        PointKind::Extra => snapshot
            .extra_action_points
            .iter_mut()
            .find(|row| &row.identity == source)
            .map(|row| &mut row.actions)
            .ok_or_else(|| SessionError::ExtraActionPointNotFound(source.clone())),
        PointKind::SimpleEncounter => snapshot
            .simple_encounters
            .iter_mut()
            .find(|row| &row.identity == source)
            .map(|row| &mut row.actions)
            .ok_or_else(|| SessionError::SimpleEncounterNotFound(source.clone())),
        PointKind::ComplexEncounter => snapshot
            .complex_encounters
            .iter_mut()
            .find(|row| &row.identity == source)
            .map(|row| &mut row.actions)
            .ok_or_else(|| SessionError::ComplexEncounterNotFound(source.clone())),
    }
}

pub(super) fn upsert_row(
    snapshot: &mut ProjectSnapshot,
    row: ExtraCodeRow,
    changed: &mut Vec<StableId>,
) {
    let identity = StableId(format!("extra-code:{}", row.native_id.0));
    if let Some(existing) = snapshot
        .extra_codes
        .iter_mut()
        .find(|existing| existing.native_id == row.native_id)
    {
        if existing != &row {
            *existing = row;
            changed.push(identity);
        }
    } else {
        snapshot.extra_codes.push(row);
        snapshot.extra_codes.sort_by_key(|row| row.native_id);
        changed.push(identity);
    }
}

fn validate_slot(kind: PointKind, source: &StableId, slot: u8) -> Result<(), SessionError> {
    let maximum = match kind {
        PointKind::Placed | PointKind::Extra => 7,
        PointKind::SimpleEncounter | PointKind::ComplexEncounter => 31,
    };
    if slot <= maximum {
        Ok(())
    } else {
        Err(invalid(
            source,
            slot,
            format!("step slot is outside 0 through {maximum}"),
        ))
    }
}

fn invalid(source: &StableId, slot: u8, reason: impl Into<String>) -> SessionError {
    SessionError::InvalidActionSettings {
        source: source.clone(),
        slot,
        reason: reason.into(),
    }
}

fn invalid_edit(edit: &ActionStepEdit, reason: impl Into<String>) -> SessionError {
    invalid(&edit.source, edit.slot, reason)
}
