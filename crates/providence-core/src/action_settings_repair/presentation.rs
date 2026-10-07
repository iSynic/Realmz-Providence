use serde::Serialize;

use super::{
    FieldError, RepairDraft, RepairIntent, RepairScope, RepairUse, choices, context,
    current_action, destination, plan, random_area,
};
use crate::model::ProjectSnapshot;
use crate::session::{Revision, action_settings_commands::inspect_caller};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairView {
    pub draft: RepairDraft,
    pub phase: String,
    pub source_label: String,
    pub notice_title: String,
    pub notice_body: String,
    pub map_label: String,
    pub area_label: String,
    pub shape_help: String,
    pub chance_help: String,
    pub bound_count: usize,
    pub bound_labels: Vec<String>,
    pub shared_count: usize,
    pub shared_uses: Vec<RepairUse>,
    pub share_allowed: bool,
    pub isolated: bool,
    pub allocation_unavailable: bool,
    pub scope_help: String,
    pub outcome_help: String,
    pub bounds_help: String,
    pub errors: Vec<FieldError>,
    pub can_apply: bool,
    pub apply_label: String,
    pub dirty: bool,
    pub intent: Option<RepairIntent>,
}

pub fn preview(snapshot: &ProjectSnapshot, revision: Revision, draft: &RepairDraft) -> RepairView {
    let context = PreviewContext::inspect(snapshot, revision, draft);
    let PreviewContext {
        phase,
        missing,
        primary_present,
        share_allowed,
        isolated,
        ref target,
        ref uses,
        ..
    } = context;
    let initial = random_area::initial(snapshot, &context.action);
    let errors = random_area::validate(snapshot, &draft.input)
        .err()
        .unwrap_or_default();
    let planned = plan(snapshot, revision, draft).ok();
    let (title, body) = context.notice(draft, errors.is_empty());
    let (map_label, area_label) = target_labels(snapshot, draft);
    let apply_label = apply_label(draft.scope, missing, uses.len());
    RepairView {
        draft: draft.clone(),
        phase: phase.into(),
        source_label: context::source_label(snapshot, &draft.source, draft.slot),
        notice_title: title,
        notice_body: body,
        map_label,
        area_label,
        shape_help: random_area::shape_help(&draft.input).into(),
        chance_help: chance_help(&draft.input),
        bound_count: random_area::bound_count(&draft.input),
        bound_labels: random_area::bound_labels(&draft.input)
            .map(String::from)
            .to_vec(),
        shared_count: uses.len(),
        shared_uses: uses.iter().take(3).cloned().collect(),
        share_allowed,
        isolated,
        allocation_unavailable: phase == "editing"
            && draft.scope == RepairScope::OnlyThisAction
            && target.is_err(),
        scope_help: scope_help(draft.scope, isolated, uses.len()),
        outcome_help: outcome_help(draft.scope, missing, primary_present, uses.len()),
        bounds_help: bounds_help(&draft.input),
        errors,
        can_apply: planned.is_some(),
        apply_label,
        dirty: phase == "stale"
            || draft.input != draft.initial_input
            || draft.scope != RepairScope::OnlyThisAction
            || draft.input.retained_spare != initial.retained_spare,
        intent: planned.map(|(_, intent)| intent),
    }
}

struct PreviewContext {
    action: crate::model::ClassicAction,
    phase: &'static str,
    uses: Vec<RepairUse>,
    missing: bool,
    ambiguous: bool,
    primary_present: bool,
    share_allowed: bool,
    isolated: bool,
    target: Result<(i16, bool), String>,
}

impl PreviewContext {
    fn inspect(snapshot: &ProjectSnapshot, revision: Revision, draft: &RepairDraft) -> Self {
        let inspected = inspect_caller(snapshot, &draft.source, draft.slot).ok();
        let action = inspected.as_ref().unwrap_or(&draft.original_action);
        let uses = context::affected_uses(snapshot, &draft.source, action);
        let phase = if inspected.is_none() || draft.project != snapshot.project_id {
            "source-gone"
        } else if action.opcode() != 92 {
            "unsupported"
        } else if current_action(snapshot, revision, draft).is_err() {
            "stale"
        } else {
            "editing"
        };
        let missing = action.target_native_id < 0
            || context::row_ids(action)
                .iter()
                .any(|id| context::words(snapshot, *id).1 == 0);
        let ambiguous = context::row_ids(action)
            .iter()
            .any(|id| context::words(snapshot, *id).1 > 1);
        let primary_present = action.target_native_id >= 0
            && context::words(snapshot, action.target_native_id as u32).1 == 1;
        let share_allowed = false;
        let target = destination(snapshot, &draft.source, action, draft.scope);
        let isolated = target.as_ref().is_ok_and(|(_, isolated)| *isolated);
        Self {
            action: action.clone(),
            phase,
            uses,
            missing,
            ambiguous,
            primary_present,
            share_allowed,
            isolated,
            target,
        }
    }

    fn notice(&self, draft: &RepairDraft, valid: bool) -> (String, String) {
        let Self {
            phase,
            missing,
            primary_present,
            ambiguous,
            share_allowed,
            ref target,
            ref uses,
            ..
        } = *self;
        let (title, body) = notice(phase, missing, primary_present, ambiguous, valid, target);
        let (title, body) = if phase == "editing"
            && draft.scope == RepairScope::SharedActions
            && share_allowed
        {
            (
                format!(
                    "{} settings for {} shared actions",
                    if missing { "Create" } else { "Update" },
                    uses.len()
                ),
                format!(
                    "All {} actions listed here will use these values. Review the shared repair scope.",
                    uses.len()
                ),
            )
        } else {
            (title.into(), body)
        };
        (title, body)
    }
}

fn target_labels(snapshot: &ProjectSnapshot, draft: &RepairDraft) -> (String, String) {
    let map = choices::resolve_map(snapshot, &draft.input.map_kind, &draft.input.map);
    let map_label = map
        .map(choices::map_label)
        .unwrap_or_else(|| unresolved(&draft.input.map, "map"));
    let area_label = map
        .and_then(|map| choices::resolve_area(map, &draft.input.area))
        .map(|_| format!("Area {}", draft.input.area.index.unwrap()))
        .unwrap_or_else(|| unresolved(&draft.input.area, "area"));
    (map_label, area_label)
}

fn apply_label(scope: RepairScope, missing: bool, use_count: usize) -> String {
    if scope == RepairScope::SharedActions {
        format!(
            "{} for {} & Return",
            if missing { "Create" } else { "Apply" },
            use_count
        )
    } else if missing {
        "Create & Return".into()
    } else {
        "Apply & Return".into()
    }
}

fn chance_help(input: &random_area::RandomAreaInput) -> String {
    random_area::parse_chance(&input.chance_adjustment)
        .map(|value| {
            format!(
                "Adds {} percentage points to the encounter chance when this step runs.",
                random_area::chance_text(value).trim_start_matches('+')
            )
        })
        .unwrap_or_else(|| {
            "Choose a chance adjustment. Enter 0 to keep the chance unchanged.".into()
        })
}

fn scope_help(scope: RepairScope, isolated: bool, use_count: usize) -> String {
    if scope == RepairScope::SharedActions {
        format!(
            "One repair · {} affected actions. Save is still explicit.",
            use_count
        )
    } else if isolated {
        "Separate settings are available. Original values and other actions are kept.".into()
    } else {
        "Only this step changes. Other actions are unchanged.".into()
    }
}

fn outcome_help(
    scope: RepairScope,
    missing: bool,
    primary_present: bool,
    use_count: usize,
) -> String {
    if scope == RepairScope::SharedActions {
        format!(
            "{} for all {} actions below.",
            if missing && primary_present {
                "Creates the missing bounds"
            } else if missing {
                "Creates complete settings"
            } else {
                "Updates complete settings"
            },
            use_count
        )
    } else if use_count > 1 {
        if missing {
            "Creates separate settings. Other actions still need repair."
        } else {
            "Creates separate settings. Other actions keep their settings."
        }
        .into()
    } else if missing && primary_present {
        "Creates the missing boundary settings for this step. Existing map and chance values stay as shown.".into()
    } else if missing {
        "Creates complete settings from the values you choose. No existing version is selected for you.".into()
    } else {
        "Updates the complete settings from the values shown. Inactive settings are preserved."
            .into()
    }
}

fn bounds_help(input: &random_area::RandomAreaInput) -> String {
    match input.shape_mode.as_str() {
        "0" => "Enter whole-tile coordinates for all four edges.",
        "1" => "Enter whole-tile offsets. Positive is right/down; negative is left/up.",
        "2" => "Enter whole-tile offsets for all four edges.",
        _ => "",
    }
    .into()
}

fn unresolved(selection: &choices::TargetSelection, name: &str) -> String {
    selection
        .index
        .map(|index| format!("Unresolved {name} {index} · Choose…"))
        .unwrap_or_else(|| format!("Choose {name}…"))
}

fn notice(
    phase: &str,
    missing: bool,
    primary_present: bool,
    ambiguous: bool,
    valid: bool,
    target: &Result<(i16, bool), String>,
) -> (&'static str, String) {
    match phase {
        "source-gone" => ("This step no longer exists", "Your draft is still available to copy. Return to Issues without choosing another step.".into()),
        "unsupported" => ("Guided repair is unavailable", "This action does not yet have a repair form. Its problem remains in Issues.".into()),
        "stale" => ("This action has changed", "Your draft is kept. Review the current action and settings before applying.".into()),
        _ if target.is_err() => ("No separate settings available", target.as_ref().unwrap_err().clone()),
        _ if ambiguous => ("Existing settings are ambiguous", "No version was chosen for you. Review the values, then create separate settings. Originals remain unchanged.".into()),
        _ if missing && primary_present && !valid => ("Boundary settings are missing", "Complete the bounds below. Your existing map and chance settings are kept.".into()),
        _ if missing && !valid => ("Action settings are incomplete", "Complete the missing values. Your existing settings are kept.".into()),
        _ if missing => ("Ready to create the settings", "Review the values, then create the settings and return to Issues.".into()),
        _ => ("Review this repair", "Apply updates the open scenario. Save when you are ready.".into()),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairComparison {
    pub can_rebase: bool,
    pub current: Option<RepairDraft>,
    pub changes: Vec<[String; 3]>,
    pub context_message: String,
}

pub fn compare(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    draft: &RepairDraft,
) -> RepairComparison {
    let current = super::prepare(snapshot, revision, draft.source.clone(), draft.slot).ok();
    let mut changes = Vec::new();
    let mut context_message =
        "The source is unavailable. Copy your draft and return to Issues.".to_string();
    let can_rebase = current.as_ref().is_some_and(|current| {
        current.project == draft.project
            && current.original_action.raw_opcode == draft.original_action.raw_opcode
            && current.original_action.opcode() == 92
    });
    if let Some(current) = &current {
        changes = comparison_rows(current, draft);
        context_message = format!(
            "Current sharing: {} actions (previously {}). Review My Draft returns to the form and resets the sharing choice. Nothing is applied.",
            current.original_use_count, draft.original_use_count
        );
        if current.original_action.target_native_id != draft.original_action.target_native_id {
            context_message.push_str(" This step now uses different settings.");
        }
        if current.input.retained_spare != draft.input.retained_spare {
            context_message.push_str(
                " Additional retained settings changed; their current values will be preserved.",
            );
        }
        if !can_rebase {
            context_message = "This step now performs a different action. The old form cannot be applied. Copy your draft and return to Issues.".into();
        }
    }
    RepairComparison {
        can_rebase,
        current,
        changes,
        context_message,
    }
}

fn selection_label(selection: &choices::TargetSelection) -> String {
    selection
        .index
        .map(|index| {
            format!(
                "{index}{}",
                if selection.identity.is_some() {
                    ""
                } else {
                    " (unresolved)"
                }
            )
        })
        .unwrap_or_else(|| "Not selected".into())
}

pub(super) fn shape_label(value: &str) -> String {
    match value {
        "-1" => "Keep shape".into(),
        "0" => "Set bounds".into(),
        "1" => "Move area".into(),
        "2" => "Adjust each edge".into(),
        "" => "Not selected".into(),
        _ => format!("Unsupported ({value})"),
    }
}

fn comparison_rows(current: &RepairDraft, draft: &RepairDraft) -> Vec<[String; 3]> {
    let rows = [
        (
            "Map type",
            current.input.map_kind.clone(),
            draft.input.map_kind.clone(),
        ),
        (
            "Map",
            selection_label(&current.input.map),
            selection_label(&draft.input.map),
        ),
        (
            "Area",
            selection_label(&current.input.area),
            selection_label(&draft.input.area),
        ),
        (
            "Chance change",
            current.input.chance_adjustment.clone(),
            draft.input.chance_adjustment.clone(),
        ),
        (
            "Shape mode",
            shape_label(&current.input.shape_mode),
            shape_label(&draft.input.shape_mode),
        ),
    ];
    let mut changes: Vec<_> = rows
        .into_iter()
        .filter(|(_, current, draft)| current != draft)
        .map(|(field, current, draft)| [field.into(), current, draft])
        .collect();
    for (index, field) in ["Left / Horizontal", "Right / Vertical", "Top", "Bottom"]
        .into_iter()
        .enumerate()
    {
        if current.input.bounds[index] != draft.input.bounds[index] {
            changes.push([
                field.into(),
                current.input.bounds[index].clone(),
                draft.input.bounds[index].clone(),
            ]);
        }
    }
    changes
}
