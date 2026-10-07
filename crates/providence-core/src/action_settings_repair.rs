mod choices;
mod context;
mod input;
mod presentation;
mod random_area;
mod random_message;

pub use choices::{Choice, ChoicePage, TargetSelection, area_choices, map_choices};
pub use context::RepairUse;
pub use input::{RepairInput, SettingsValues};
pub use presentation::{RepairComparison, RepairView, compare, preview};
pub use random_area::{FieldError, RandomAreaInput, chance_text, parse_chance};
pub use random_message::{
    MessageRangeEntry, MessageRangePage, MessageRangeStatus, MessageWaitMode, RandomMessageInput,
    message_range,
};

use serde::{Deserialize, Serialize};

use crate::model::{ClassicAction, ProjectSnapshot, StableId};
use crate::session::{
    ActionSettingsEdit, ActionSettingsGuard, Revision, SessionError,
    action_settings_commands::inspect_caller,
};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RepairScope {
    #[default]
    OnlyThisAction,
    SharedActions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepairDraft<Input = RandomAreaInput> {
    pub project: StableId,
    pub source: StableId,
    pub slot: u8,
    pub revision: Revision,
    pub original_action: ClassicAction,
    pub context_fingerprint: String,
    pub initial_input: Input,
    pub input: Input,
    pub scope: RepairScope,
    pub mode_changed: bool,
    pub original_use_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepairIntent {
    pub project: StableId,
    pub source: StableId,
    pub slot: u8,
    pub revision: Revision,
    pub row_ids: Vec<u32>,
    pub before_fingerprint: String,
    pub after_fingerprint: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RepairOutcome {
    MatchesRepair,
    NotApplied,
    Unknown,
    SourceGone,
}

pub fn context_fingerprint(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
) -> Result<String, SessionError> {
    let action = inspect_caller(snapshot, source, slot)?;
    Ok(context::footprint(snapshot, source, slot, &context::row_ids(&action))?.hash())
}

pub fn prepare(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    source: StableId,
    slot: u8,
) -> Result<RepairDraft, String> {
    prepare_input(snapshot, revision, source, slot)
}

pub fn prepare_random_message(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    source: StableId,
    slot: u8,
) -> Result<RepairDraft<RandomMessageInput>, String> {
    let draft = prepare_input(snapshot, revision, source, slot)?;
    current_action(snapshot, revision, &draft)?;
    Ok(draft)
}

fn prepare_input<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    source: StableId,
    slot: u8,
) -> Result<RepairDraft<Input>, String> {
    let action = inspect_caller(snapshot, &source, slot).map_err(|error| error.to_string())?;
    let input = Input::initial(snapshot, &action);
    Ok(RepairDraft {
        project: snapshot.project_id.clone(),
        context_fingerprint: context_fingerprint(snapshot, &source, slot)
            .map_err(|error| error.to_string())?,
        original_use_count: context::affected_uses(snapshot, &source, &action).len(),
        source,
        slot,
        revision,
        original_action: action,
        initial_input: input.clone(),
        input,
        scope: RepairScope::OnlyThisAction,
        mode_changed: false,
    })
}

pub fn change<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    draft: &mut RepairDraft<Input>,
    field: &str,
    value: &str,
) -> Result<(), String> {
    match field {
        "scope" => {
            draft.scope = match value {
                "only-this-action" => RepairScope::OnlyThisAction,
                "shared-actions" => {
                    return Err(
                        crate::session::settings_write_policy::LEGACY_SHARED_WRITE_UNSUPPORTED
                            .into(),
                    );
                }
                _ => {
                    return Err(
                        "Choose whether to repair only this action or its compatible shared uses."
                            .into(),
                    );
                }
            }
        }
        _ => {
            let mode_changed = draft.input.changes_mode(field, value);
            draft.input.change(snapshot, field, value)?;
            draft.mode_changed |= mode_changed;
        }
    }
    Ok(())
}

pub fn rebase<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<Input>,
) -> Result<RepairDraft<Input>, String> {
    if draft.project != snapshot.project_id {
        return Err("This draft belongs to another scenario.".into());
    }
    let mut current = prepare_input::<Input>(snapshot, revision, draft.source.clone(), draft.slot)?;
    if current.original_action.raw_opcode != draft.original_action.raw_opcode
        || current.original_action.opcode() != Input::OPCODE
    {
        return Err(
            "This step now performs a different action. Copy your draft and return to Issues."
                .into(),
        );
    }
    current.input = draft.input.clone();
    current.input.retain_current(&current.initial_input);
    current.mode_changed = draft.mode_changed;
    Ok(current)
}

pub(super) fn current_action<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<Input>,
) -> Result<ClassicAction, String> {
    if snapshot.project_id != draft.project {
        return Err("This draft belongs to another scenario.".into());
    }
    if revision != draft.revision {
        return Err(format!(
            "revision conflict: expected {}, current {}",
            draft.revision.0, revision.0
        ));
    }
    let action =
        inspect_caller(snapshot, &draft.source, draft.slot).map_err(|error| error.to_string())?;
    if action != draft.original_action
        || context_fingerprint(snapshot, &draft.source, draft.slot)
            .map_err(|error| error.to_string())?
            != draft.context_fingerprint
    {
        return Err(
            "The action or its complete settings context changed. Review the repair again.".into(),
        );
    }
    if action.opcode() != Input::OPCODE {
        return Err("Guided repair is not available for this action yet.".into());
    }
    Ok(action)
}

pub(super) fn destination(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    action: &ClassicAction,
    scope: RepairScope,
) -> Result<(i16, bool), String> {
    crate::session::settings_write_policy::check_scope(scope == RepairScope::SharedActions)?;
    let uses = context::affected_uses(snapshot, source, action);
    let ambiguous = context::row_ids(action)
        .iter()
        .any(|id| context::words(snapshot, *id).1 > 1);
    if uses.len() > 1 || ambiguous || action.target_native_id < 0 {
        return context::available_rows(snapshot, action.opcode() == 92).map(|target| (target, true)).ok_or_else(|| "No separate settings are available. Your draft is kept; existing settings will not be replaced.".into());
    }
    Ok((action.target_native_id, false))
}

pub fn plan<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<Input>,
) -> Result<(ActionSettingsEdit, RepairIntent), String> {
    let action = current_action(snapshot, revision, draft)?;
    let values = draft.input.values(snapshot).map_err(|errors| {
        errors
            .into_iter()
            .map(|error| error.message)
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    if !draft
        .input
        .retained_matches(&Input::initial(snapshot, &action))
    {
        return Err(
            "The retained settings changed. Review the current repair before applying.".into(),
        );
    }
    crate::session::settings_write_policy::check_scope(draft.scope == RepairScope::SharedActions)?;
    let requested = std::iter::once(values.primary)
        .chain(values.companion)
        .enumerate()
        .map(|(offset, words)| (i64::from(action.target_native_id) + offset as i64, words));
    let unchanged = requested.into_iter().all(|(id, words)| {
        let mut rows = snapshot
            .extra_codes
            .iter()
            .filter(|row| i64::from(row.native_id.0) == id);
        rows.next().is_some_and(|row| row.values == words) && rows.next().is_none()
    });
    let (target_native_id, require_available_rows) = if unchanged {
        (action.target_native_id, false)
    } else {
        destination(snapshot, &draft.source, &action, draft.scope)?
    };
    let edit = ActionSettingsEdit {
        source: draft.source.clone(),
        slot: draft.slot,
        target_native_id,
        values: values.primary,
        secondary_values: values.companion,
        allow_shared_updates: draft.scope == RepairScope::SharedActions,
        scope: crate::session::ActionSettingsWriteScope::Isolate,
        guard: Some(ActionSettingsGuard {
            caller: action.clone(),
            context_fingerprint: draft.context_fingerprint.clone(),
            require_available_rows,
        }),
    };
    let intent = repair_intent(snapshot, revision, &action, &edit)?;
    Ok((edit, intent))
}

fn repair_intent(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    action: &ClassicAction,
    edit: &ActionSettingsEdit,
) -> Result<RepairIntent, String> {
    let mut row_ids = context::row_ids(action);
    row_ids.push(edit.target_native_id as u32);
    if edit.secondary_values.is_some() {
        row_ids.push(edit.target_native_id as u32 + 1);
    }
    row_ids.sort_unstable();
    row_ids.dedup();
    let before = context::footprint(snapshot, &edit.source, edit.slot, &row_ids)
        .map_err(|error| error.to_string())?;
    let before_fingerprint = before.hash();
    let after_fingerprint = before.after(edit).hash();
    Ok(RepairIntent {
        project: snapshot.project_id.clone(),
        source: edit.source.clone(),
        slot: edit.slot,
        revision,
        row_ids,
        before_fingerprint,
        after_fingerprint,
    })
}

pub fn reconcile(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    intent: &RepairIntent,
    same_session: bool,
) -> RepairOutcome {
    if snapshot.project_id != intent.project || intent.row_ids.len() > 4 {
        return RepairOutcome::Unknown;
    }
    let Ok(current) = context::footprint(snapshot, &intent.source, intent.slot, &intent.row_ids)
    else {
        return RepairOutcome::SourceGone;
    };
    let current = current.hash();
    if current == intent.after_fingerprint {
        RepairOutcome::MatchesRepair
    } else if same_session && revision == intent.revision && current == intent.before_fingerprint {
        RepairOutcome::NotApplied
    } else {
        RepairOutcome::Unknown
    }
}

pub fn uses<Input: RepairInput>(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<Input>,
    offset: usize,
    limit: usize,
) -> Result<(Vec<RepairUse>, usize), String> {
    let action = current_action(snapshot, revision, draft)?;
    let uses = context::affected_uses(snapshot, &draft.source, &action);
    let total = uses.len();
    Ok((
        uses.into_iter()
            .skip(offset)
            .take(limit.clamp(1, 128))
            .collect(),
        total,
    ))
}

#[cfg(test)]
mod tests;
