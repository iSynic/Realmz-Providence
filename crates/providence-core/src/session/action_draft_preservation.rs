use super::action_step_commands::{PointKind, PreparedStep, owner_actions};
use super::{ActionSettingsWriteScope, ActionStepDraft, SessionError};
use crate::action_authoring::{action_definition, decode_form_values, form_definition};
use crate::model::{ProjectOrigin, ProjectSnapshot, StableId};

// Retain source instructions that the editor cannot reconstruct from editable values.
pub(super) fn preserved_step(
    snapshot: &ProjectSnapshot,
    kind: PointKind,
    source: &StableId,
    draft: &ActionStepDraft,
) -> Result<Option<PreparedStep>, SessionError> {
    let definition = action_definition(&draft.action_identity);
    let original = owner_actions(snapshot, kind, source)?
        .iter()
        .find(|action| action.slot == draft.slot);
    let retained = original.filter(|action| {
        matches!(snapshot.origin, ProjectOrigin::Imported { .. })
            && draft.action_identity == format!("realmz.action.{}", action.opcode())
            && draft.target_native_id == action.target_native_id
            && draft.gosub == (action.raw_opcode < 0 && !matches!(action.raw_opcode, -14 | -23))
            && (draft.settings.is_none() || definition.is_some())
    });
    if let Some(definition) = definition {
        let Some(_) = retained else {
            return Ok(None);
        };
        let Some(form_id) = definition.form_id else {
            return Ok(None);
        };
        if !unchanged_missing_settings(snapshot, draft, &form_id) {
            return Ok(None);
        }
    }
    let action = retained.ok_or_else(|| SessionError::InvalidActionSettings {
        source: source.clone(),
        slot: draft.slot,
        reason: "unrecognized imported instructions must remain unchanged or be replaced with a known action".into(),
    })?;
    Ok(Some(PreparedStep {
        source: source.clone(),
        slot: draft.slot,
        action: Some(action.clone()),
        rows: Vec::new(),
        scope: ActionSettingsWriteScope::PreserveReferences,
    }))
}

fn unchanged_missing_settings(
    snapshot: &ProjectSnapshot,
    draft: &ActionStepDraft,
    form_id: &str,
) -> bool {
    let Some(settings) = draft.settings.as_ref() else {
        return false;
    };
    let form = form_definition(form_id).expect("catalog form exists");
    // A missing single-row form projects zero defaults, not source values.
    // Unrelated edits must not turn that projection into a fabricated row.
    if form.companion_form_id.is_some()
        || settings.secondary_values.is_some()
        || settings.scope != ActionSettingsWriteScope::PreserveReferences
        || snapshot
            .extra_codes
            .iter()
            .any(|row| i64::from(row.native_id.0) == i64::from(draft.target_native_id))
    {
        return false;
    }
    let mut defaults = decode_form_values(form_id, [0; 5]).expect("catalog form exists");
    for field in form.fields.iter().filter(|field| field.preserved) {
        let key = if form
            .fields
            .iter()
            .filter(|other| other.name == field.name)
            .count()
            > 1
        {
            format!("{}{}", field.name, field.index)
        } else {
            field.name.clone()
        };
        defaults.remove(&key);
    }
    settings.values == defaults
}
