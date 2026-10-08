//! Atomic record-wide Action Point drafts and safe settings-row ownership.

use super::action_draft_semantics::validate_unresolved_settings;
use super::action_point_commands::replace_action_point;
use super::action_step_commands::{PointKind, install_action, owner_actions, upsert_row};
use super::settings_write_policy;
use super::{
    ActionPointRecordDraft, ActionSettingsWriteScope, ActionStepDraft, ActionStepEdit,
    EditorSession, ExtraActionPointRecordDraft, SessionError, TypedActionSettings,
};
use crate::action_authoring::{
    ActionDefinition, ActionStorage, action_definition, encode_form_values, form_definition,
};
use crate::model::{ExtraCodeRow, NativeRecordId, ProjectSnapshot, ScriptDescriptor, StableId};
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn apply_action_point_draft(
        &mut self,
        draft: ActionPointRecordDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut staged = self.snapshot.clone();
        apply_descriptor(&mut staged, &draft.source, draft.descriptor)?;
        let mut changed =
            apply_record_steps(&mut staged, PointKind::Placed, &draft.source, draft.steps)?;
        let mut row = staged
            .world
            .action_points
            .iter()
            .find(|row| row.identity == draft.source)
            .cloned()
            .ok_or_else(|| SessionError::ActionPointNotFound(draft.source.clone()))?;
        if row.coordinate != draft.header.coordinate {
            row.coordinate = draft.header.coordinate;
            row.classic_door_id = classic_door_id(&row)?;
        }
        row.post_action_level = draft.header.post_action_level;
        row.post_action_x = draft.header.post_action_x;
        row.post_action_y = draft.header.post_action_y;
        row.chance_percent = draft.header.chance_percent;
        changed.extend(replace_action_point(&mut staged, row)?);
        finish(&mut self.snapshot, staged, changed)
    }

    pub(super) fn apply_extra_action_point_draft(
        &mut self,
        draft: ExtraActionPointRecordDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut staged = self.snapshot.clone();
        apply_descriptor(&mut staged, &draft.source, draft.descriptor)?;
        let mut changed =
            apply_record_steps(&mut staged, PointKind::Extra, &draft.source, draft.steps)?;
        let row = staged
            .extra_action_points
            .iter_mut()
            .find(|row| row.identity == draft.source)
            .ok_or_else(|| SessionError::ExtraActionPointNotFound(draft.source.clone()))?;
        row.classic_door_id = draft.header.classic_door_id;
        row.post_action_level = draft.header.post_action_level;
        row.post_action_x = draft.header.post_action_x;
        row.post_action_y = draft.header.post_action_y;
        row.chance_percent = draft.header.chance_percent;
        changed.push(row.identity.clone());
        self.snapshot = staged;
        Ok(unique_changed(changed))
    }
}

fn apply_descriptor(
    snapshot: &mut ProjectSnapshot,
    source: &StableId,
    descriptor: String,
) -> Result<(), SessionError> {
    let descriptor = descriptor.trim().to_owned();
    if descriptor.chars().count() > 80 || descriptor.contains(['\r', '\n']) {
        return Err(invalid(
            source,
            0,
            "the descriptor must be one line of at most 80 characters",
        ));
    }
    snapshot
        .script_descriptors
        .retain(|item| item.source != *source);
    if !descriptor.is_empty() {
        snapshot.script_descriptors.push(ScriptDescriptor {
            source: source.clone(),
            text: descriptor,
        });
    }
    Ok(())
}

pub(super) fn apply_record_steps(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    source: &StableId,
    drafts: Vec<ActionStepDraft>,
) -> Result<Vec<StableId>, SessionError> {
    let previous_rows = snapshot
        .extra_codes
        .iter()
        .map(|row| (row.native_id, row.values))
        .collect::<BTreeSet<_>>();
    let prepared = prepare_record_steps(snapshot, kind, source, drafts)?;
    let mut changed = vec![source.clone()];
    for step in &prepared.steps {
        let impact = settings_write_policy::confirm(
            snapshot,
            source,
            step.slot,
            &step.rows,
            &prepared.writes,
            &step.scope,
        )
        .map_err(|reason| invalid(source, step.slot, reason))?;
        changed.extend(impact.into_iter().map(|caller| caller.source));
    }
    for row in prepared.writes {
        upsert_row(snapshot, row, &mut changed);
    }
    changed.extend(
        snapshot
            .extra_codes
            .iter()
            .filter(|row| !previous_rows.contains(&(row.native_id, row.values)))
            .map(|row| StableId(format!("extra-code:{}", row.native_id.0))),
    );
    Ok(unique_changed(changed))
}

pub(super) struct PreparedRecord {
    pub steps: Vec<super::action_step_commands::PreparedStep>,
    pub writes: Vec<ExtraCodeRow>,
}

/// Resolves the complete final reference graph without committing settings writes.
pub(super) fn prepare_record_steps(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    source: &StableId,
    drafts: Vec<ActionStepDraft>,
) -> Result<PreparedRecord, SessionError> {
    validate_record_draft(kind, source, &drafts)?;
    owner_actions(snapshot, kind, source)?;
    let mut edits = Vec::with_capacity(drafts.len());
    let mut retained = Vec::new();
    let mut allocator = settings_write_policy::SettingsAllocator::new(snapshot);
    for draft in drafts {
        if let Some(step) =
            super::action_draft_preservation::preserved_step(snapshot, kind, source, &draft)?
        {
            retained.push(step);
            continue;
        }
        edits.push(resolve_step_edit(
            snapshot,
            kind,
            source,
            draft,
            &mut allocator,
        )?);
    }
    let mut prepared = edits
        .into_iter()
        .map(|edit| super::action_step_commands::prepare_resolved_step(snapshot, kind, edit))
        .collect::<Result<Vec<_>, _>>()?;
    prepared.extend(retained);
    let requests = prepared
        .iter()
        .map(|step| step.rows.clone())
        .collect::<Vec<_>>();
    let writes = crate::action_settings_effects::merge_writes(snapshot, &requests)
        .map_err(|reason| invalid(source, 0, reason))?;
    replace_actions(snapshot, kind, source, Vec::new())?;
    for step in &prepared {
        install_action(snapshot, kind, step)?;
    }
    Ok(PreparedRecord {
        steps: prepared,
        writes,
    })
}

fn validate_record_draft(
    kind: PointKind,
    source: &StableId,
    drafts: &[ActionStepDraft],
) -> Result<(), SessionError> {
    let slot_count = match kind {
        PointKind::Placed | PointKind::Extra => 8,
        PointKind::SimpleEncounter | PointKind::ComplexEncounter => 32,
    };
    if drafts.len() > slot_count {
        return Err(invalid(
            source,
            0,
            format!("this script record contains at most {slot_count} steps"),
        ));
    }
    let mut slots = BTreeSet::new();
    for draft in drafts {
        if usize::from(draft.slot) >= slot_count {
            return Err(invalid(
                source,
                draft.slot,
                format!("step slot is outside 0 through {}", slot_count - 1),
            ));
        }
        if !slots.insert(draft.slot) {
            return Err(invalid(
                source,
                draft.slot,
                "the record draft repeats this step slot",
            ));
        }
    }
    Ok(())
}

fn resolve_step_edit(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    source: &StableId,
    draft: ActionStepDraft,
    allocator: &mut settings_write_policy::SettingsAllocator,
) -> Result<ActionStepEdit, SessionError> {
    let definition = action_definition(&draft.action_identity)
        .filter(|definition| definition.selectable)
        .ok_or_else(|| invalid(source, draft.slot, "the selected action is not authorable"))?;
    let script_kind = match kind {
        PointKind::Placed => "action-point",
        PointKind::Extra => "extra-action-point",
        PointKind::SimpleEncounter => "simple-encounter",
        PointKind::ComplexEncounter => "complex-encounter",
    };
    if let Some(reason) =
        crate::action_authoring::action_availability_reason(definition.opcode, script_kind)
    {
        return Err(invalid(source, draft.slot, &reason));
    }
    if definition.storage == ActionStorage::Empty {
        return Err(invalid(
            source,
            draft.slot,
            "empty steps must be omitted from the record draft",
        ));
    }
    let current = owner_actions(snapshot, kind, source)?
        .iter()
        .find(|action| {
            action.opcode() == definition.opcode
                && action.target_native_id == draft.target_native_id
        })
        .cloned();
    let target_native_id = resolve_settings_target(
        snapshot,
        source,
        script_kind,
        current.as_ref(),
        &definition,
        &draft,
        allocator,
    )?;
    let settings = draft.settings.map(|settings| TypedActionSettings {
        values: settings.values,
        secondary_values: settings.secondary_values,
        allow_shared_updates: false,
        scope: settings.scope,
    });
    Ok(ActionStepEdit {
        source: source.clone(),
        slot: draft.slot,
        action_identity: draft.action_identity,
        gosub: draft.gosub,
        target_native_id: target_native_id.unwrap_or(draft.target_native_id),
        settings,
    })
}

fn resolve_settings_target(
    snapshot: &mut ProjectSnapshot,
    source: &StableId,
    script_kind: &str,
    current: Option<&crate::model::ClassicAction>,
    definition: &ActionDefinition,
    draft: &ActionStepDraft,
    allocator: &mut settings_write_policy::SettingsAllocator,
) -> Result<Option<i16>, SessionError> {
    let slot = draft.slot;
    let settings = draft.settings.as_ref();
    let Some(form_id) = definition.form_id.as_deref() else {
        if settings.is_some() {
            return Err(invalid(
                source,
                slot,
                "this action does not use settings rows",
            ));
        }
        return Ok(None);
    };
    let settings = settings
        .ok_or_else(|| invalid(source, slot, "this action requires complete typed settings"))?;
    settings_write_policy::validate_scope(&settings.scope)
        .map_err(|reason| invalid(source, slot, reason))?;
    validate_unresolved_settings(
        snapshot,
        source,
        slot,
        script_kind,
        current,
        definition,
        settings,
    )?;
    let same_action = current.is_some_and(|action| action.opcode() == definition.opcode);
    let candidate = if same_action {
        current.and_then(|action| u32::try_from(action.target_native_id).ok())
    } else {
        None
    };
    if let Some(candidate) = candidate
        && reusable_candidate(snapshot, source, slot, candidate, form_id, settings)?
    {
        return i16::try_from(candidate)
            .map(Some)
            .map_err(|_| invalid(source, slot, "the settings row ID is outside Classic range"));
    }
    let paired = form_definition(form_id)
        .and_then(|form| form.companion_form_id)
        .is_some();
    let allocated = allocator
        .allocate(paired)
        .map_err(|reason| invalid(source, slot, reason))?;
    seed_preserved_values(snapshot, candidate, allocated, paired)?;
    Ok(Some(allocated as i16))
}

fn ensure_settings_rows(snapshot: &mut ProjectSnapshot, allocated: u32, paired: bool) {
    for offset in 0..=u32::from(paired) {
        if !snapshot
            .extra_codes
            .iter()
            .any(|row| row.native_id.0 == allocated + offset)
        {
            snapshot.extra_codes.push(ExtraCodeRow {
                native_id: NativeRecordId(allocated + offset),
                values: [0; 5],
            });
        }
    }
    snapshot.extra_codes.sort_by_key(|row| row.native_id);
}

fn reusable_candidate(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
    native_id: u32,
    form_id: &str,
    settings: &super::ActionStepDraftSettings,
) -> Result<bool, SessionError> {
    let requested = requested_candidate_rows(snapshot, source, slot, native_id, form_id, settings)?;
    if requested
        .iter()
        .any(|(_, existing, _, _)| existing.is_none())
    {
        return Ok(false);
    }
    let rows = requested
        .iter()
        .map(|(id, _, values, _)| ExtraCodeRow {
            native_id: NativeRecordId(*id),
            values: *values,
        })
        .collect::<Vec<_>>();
    if settings.scope == ActionSettingsWriteScope::Isolate {
        settings_write_policy::changes_other_action(snapshot, source, slot, &rows)
            .map(|changes| !changes)
            .map_err(|reason| invalid(source, slot, reason))
    } else {
        Ok(true)
    }
}

fn requested_candidate_rows<'a>(
    snapshot: &'a ProjectSnapshot,
    source: &StableId,
    slot: u8,
    native_id: u32,
    form_id: &str,
    settings: &super::ActionStepDraftSettings,
) -> Result<Vec<RequestedRow<'a>>, SessionError> {
    let form = form_definition(form_id).expect("catalog action references a known form");
    let mut requested = vec![requested_row(
        snapshot,
        native_id,
        form_id,
        &settings.values,
    )?];
    let Some(companion) = form.companion_form_id.as_deref() else {
        if settings.secondary_values.is_some() {
            return Err(invalid(
                source,
                slot,
                "this action does not use companion settings",
            ));
        }
        return Ok(requested);
    };
    let values = settings.secondary_values.as_ref().ok_or_else(|| {
        invalid(
            source,
            slot,
            "this action requires complete companion settings",
        )
    })?;
    let id = native_id
        .checked_add(1)
        .ok_or_else(|| invalid(source, slot, "the companion settings row ID overflows"))?;
    requested.push(requested_row(snapshot, id, companion, values)?);
    Ok(requested)
}

type RequestedRow<'a> = (u32, Option<&'a ExtraCodeRow>, [i16; 5], String);

fn requested_row<'a>(
    snapshot: &'a ProjectSnapshot,
    native_id: u32,
    form_id: &str,
    values: &std::collections::BTreeMap<String, i16>,
) -> Result<RequestedRow<'a>, SessionError> {
    let mut rows = snapshot
        .extra_codes
        .iter()
        .filter(|row| row.native_id.0 == native_id);
    let existing = rows.next();
    if rows.next().is_some() {
        return Err(invalid(
            &StableId(format!("extra-code:{native_id}")),
            0,
            "the settings row ID is ambiguous",
        ));
    }
    let encoded = encode_form_values(form_id, values, existing.map(|row| row.values))
        .map_err(|reason| invalid(&StableId(format!("extra-code:{native_id}")), 0, reason))?;
    Ok((native_id, existing, encoded, form_id.to_owned()))
}

fn seed_preserved_values(
    snapshot: &mut ProjectSnapshot,
    source_id: Option<u32>,
    allocated: u32,
    paired: bool,
) -> Result<(), SessionError> {
    let Some(source_id) = source_id else {
        ensure_settings_rows(snapshot, allocated, paired);
        return Ok(());
    };
    for offset in 0..=usize::from(paired) {
        let source = source_id + offset as u32;
        let destination = allocated + offset as u32;
        let rows = snapshot
            .extra_codes
            .iter()
            .filter(|row| row.native_id.0 == source)
            .collect::<Vec<_>>();
        if rows.len() > 1 {
            return Err(invalid(
                &StableId(format!("extra-code:{source}")),
                0,
                "the settings row ID is ambiguous",
            ));
        }
        if let Some(row) = rows.first() {
            let row = ExtraCodeRow {
                native_id: NativeRecordId(destination),
                values: row.values,
            };
            upsert_row(snapshot, row, &mut Vec::new());
        }
    }
    ensure_settings_rows(snapshot, allocated, paired);
    Ok(())
}

fn replace_actions(
    snapshot: &mut ProjectSnapshot,
    kind: PointKind,
    source: &StableId,
    actions: Vec<crate::model::ClassicAction>,
) -> Result<(), SessionError> {
    let destination = match kind {
        PointKind::Placed => snapshot
            .world
            .action_points
            .iter_mut()
            .find(|row| row.identity == *source)
            .map(|row| &mut row.actions),
        PointKind::Extra => snapshot
            .extra_action_points
            .iter_mut()
            .find(|row| row.identity == *source)
            .map(|row| &mut row.actions),
        PointKind::SimpleEncounter => snapshot
            .simple_encounters
            .iter_mut()
            .find(|row| row.identity == *source)
            .map(|row| &mut row.actions),
        PointKind::ComplexEncounter => snapshot
            .complex_encounters
            .iter_mut()
            .find(|row| row.identity == *source)
            .map(|row| &mut row.actions),
    };
    *destination.ok_or_else(|| match kind {
        PointKind::Placed => SessionError::ActionPointNotFound(source.clone()),
        PointKind::Extra => SessionError::ExtraActionPointNotFound(source.clone()),
        PointKind::SimpleEncounter => SessionError::SimpleEncounterNotFound(source.clone()),
        PointKind::ComplexEncounter => SessionError::ComplexEncounterNotFound(source.clone()),
    })? = actions;
    Ok(())
}

fn classic_door_id(row: &crate::model::ActionPoint) -> Result<i32, SessionError> {
    let Some(coordinate) = row.coordinate else {
        return Ok(0);
    };
    row.level_index
        .checked_mul(10_000)
        .and_then(|value| value.checked_add(u32::from(coordinate.y) * 100))
        .and_then(|value| value.checked_add(u32::from(coordinate.x)))
        .and_then(|value| i32::try_from(value).ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| SessionError::InvalidActionPoint {
            identity: row.identity.clone(),
            reason: "the trigger coordinate cannot be represented by a positive Classic door ID"
                .into(),
        })
}

fn finish(
    destination: &mut ProjectSnapshot,
    staged: ProjectSnapshot,
    changed: Vec<StableId>,
) -> Result<Vec<StableId>, SessionError> {
    *destination = staged;
    Ok(unique_changed(changed))
}

fn unique_changed(changed: Vec<StableId>) -> Vec<StableId> {
    changed
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn invalid(source: &StableId, slot: u8, reason: impl Into<String>) -> SessionError {
    SessionError::InvalidActionSettings {
        source: source.clone(),
        slot,
        reason: reason.into(),
    }
}
