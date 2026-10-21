use serde::Serialize;

use super::{
    FieldError, MessageRangePage, RandomMessageInput, RepairDraft, RepairIntent, RepairScope,
    RepairUse, context, current_action, destination, message_range, plan, prepare_random_message,
    shared_scope,
};
use crate::model::ProjectSnapshot;
use crate::session::{Revision, action_settings_commands::inspect_caller};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRepairView {
    pub draft: RepairDraft<RandomMessageInput>,
    pub phase: String,
    pub source_label: String,
    pub notice_title: String,
    pub notice_body: String,
    pub shared_count: usize,
    pub shared_uses: Vec<RepairUse>,
    pub share_allowed: bool,
    pub isolated: bool,
    pub allocation_unavailable: bool,
    pub scope_help: String,
    pub outcome_help: String,
    pub errors: Vec<FieldError>,
    pub range: Option<MessageRangePage>,
    pub can_apply: bool,
    pub apply_label: String,
    pub dirty: bool,
    pub intent: Option<RepairIntent>,
}

pub fn preview_random_message(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<RandomMessageInput>,
    offset: usize,
) -> MessageRepairView {
    let phase = phase(snapshot, revision, draft);
    let uses = context::affected_uses(snapshot, &draft.source, &draft.original_action);
    let range = message_range(snapshot, &draft.input, offset, 4);
    let errors = range
        .as_ref()
        .map_or_else(Clone::clone, |page| page.errors.clone());
    let planned = plan(snapshot, revision, draft).ok();
    let target = destination(
        snapshot,
        &draft.source,
        &draft.original_action,
        RepairScope::OnlyThisAction,
    );
    let missing = draft.original_action.target_native_id < 0
        || context::words(snapshot, draft.original_action.target_native_id as u32).1 == 0;
    let confirmed = draft.scope == RepairScope::ConfirmedActions;
    let allocation_unavailable = phase == "editing" && !confirmed && target.is_err();
    let (notice_title, notice_body) =
        notice(phase, missing, allocation_unavailable, errors.is_empty());
    MessageRepairView {
        draft: draft.clone(),
        phase: phase.into(),
        source_label: context::source_label(snapshot, &draft.source, draft.slot),
        notice_title: notice_title.into(),
        notice_body: notice_body.into(),
        shared_count: uses.len(),
        shared_uses: uses.iter().take(3).cloned().collect(),
        share_allowed: phase == "editing"
            && uses.len() > 1
            && shared_scope::confirmation(snapshot, draft).is_ok(),
        isolated: !confirmed && target.is_ok_and(|(_, isolated)| isolated),
        allocation_unavailable,
        scope_help: scope_help(snapshot, draft, uses.len()),
        outcome_help: outcome_help(confirmed, missing, uses.len()),
        errors,
        range: range.ok(),
        can_apply: planned.is_some(),
        apply_label: if confirmed {
            format!("Apply to {} & Return", draft.confirmed_callers.len() + 1)
        } else if missing {
            "Create & Return".into()
        } else {
            "Apply & Return".into()
        },
        dirty: phase == "stale"
            || draft.input != draft.initial_input
            || draft.scope != RepairScope::OnlyThisAction,
        intent: planned.map(|(_, intent)| intent),
    }
}

fn scope_help(
    snapshot: &ProjectSnapshot,
    draft: &RepairDraft<RandomMessageInput>,
    count: usize,
) -> String {
    if draft.scope == RepairScope::ConfirmedActions {
        return "Every affected action is confirmed. Editing a value resets this choice.".into();
    }
    if count > 1
        && let Err(reason) = shared_scope::confirmation(snapshot, draft)
    {
        return format!("{reason} Separate settings preserve other actions.");
    }
    "Separate settings preserve other actions. Save remains explicit.".into()
}

fn outcome_help(confirmed: bool, missing: bool, count: usize) -> String {
    if confirmed {
        "Updates every confirmed affected action.".into()
    } else if count > 1 {
        "Creates separate settings for this action. Other actions remain unchanged.".into()
    } else if missing {
        "Creates settings for this action. Other actions remain unchanged.".into()
    } else {
        "Updates settings for this action. Other actions remain unchanged.".into()
    }
}

fn phase(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<RandomMessageInput>,
) -> &'static str {
    match inspect_caller(snapshot, &draft.source, draft.slot) {
        _ if draft.project != snapshot.project_id => "source-gone",
        Err(_) => "source-gone",
        Ok(action) if action.opcode() != 19 => "unsupported",
        _ if current_action(snapshot, revision, draft).is_err() => "stale",
        _ => "editing",
    }
}

fn notice(
    phase: &str,
    missing: bool,
    allocation_unavailable: bool,
    valid: bool,
) -> (&'static str, &'static str) {
    match phase {
        "source-gone" => (
            "This step no longer exists",
            "Copy your draft and return to Issues. No other step is selected.",
        ),
        "unsupported" => (
            "This step now performs a different action",
            "The old repair cannot be applied. Copy your draft and return to Issues.",
        ),
        "stale" => (
            "This action has changed",
            "Your draft is kept. Compare the current action before applying.",
        ),
        _ if allocation_unavailable => (
            "No separate settings available",
            "Your draft is kept. Existing settings will not be replaced.",
        ),
        _ if !valid => (
            "Check the message range",
            "Complete both endpoints and resolve every possible message before applying.",
        ),
        _ if missing => (
            "Ready to create the settings",
            "Review the possible messages, then create the settings and return to Issues.",
        ),
        _ => (
            "Review this repair",
            "Apply updates the open scenario. Save when you are ready.",
        ),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRepairComparison {
    pub can_rebase: bool,
    pub current: Option<RepairDraft<RandomMessageInput>>,
    pub changes: Vec<[String; 3]>,
    pub context_message: String,
}

pub fn compare_random_message(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft<RandomMessageInput>,
) -> MessageRepairComparison {
    let current = prepare_random_message(snapshot, revision, draft.source.clone(), draft.slot).ok();
    let can_rebase = current.as_ref().is_some_and(|current| {
        current.project == draft.project
            && current.original_action.raw_opcode == draft.original_action.raw_opcode
    });
    let mut changes = Vec::new();
    let mut context_message = "This step is unavailable or performs a different action. Copy your draft and return to Issues.".to_string();
    if let Some(current) = &current {
        for (label, before, after) in [
            (
                "First message",
                &current.input.first_message,
                &draft.input.first_message,
            ),
            (
                "Last message",
                &current.input.last_message,
                &draft.input.last_message,
            ),
        ] {
            if before != after {
                changes.push([label.into(), before.clone(), after.clone()]);
            }
        }
        if can_rebase {
            context_message = format!(
                "Current sharing: {} actions (previously {}). Review My Draft resets the sharing confirmation. Nothing is applied.",
                current.original_use_count, draft.original_use_count
            );
            if current.input.retained != draft.input.retained {
                context_message
                    .push_str(" Other settings changed; their current values will be preserved.");
            }
            if current.original_action.target_native_id != draft.original_action.target_native_id {
                context_message.push_str(" This step now uses different settings.");
            }
        }
    }
    MessageRepairComparison {
        can_rebase,
        current,
        changes,
        context_message,
    }
}
