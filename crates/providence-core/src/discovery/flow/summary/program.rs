use super::*;
use crate::{
    action_authoring::{
        self as authoring, ActionFormContext, ActionFormDescribeQuery, ActionValuePreview,
    },
    model::ClassicAction,
};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowStep {
    pub position: u8,
    pub slot: u8,
    pub in_range: bool,
    pub status: String,
    pub title: String,
    pub card_summary: String,
    pub summary: String,
    pub condition: String,
    pub warning: String,
    pub source: String,
    pub field: String,
    pub caller_context: Option<String>,
    pub fields: Vec<FlowField>,
    pub links: Vec<DiscoveryLink>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowField {
    pub label: String,
    pub value: i16,
    pub explanation: String,
    pub preview: Option<ActionValuePreview>,
    pub preview_truncated: bool,
}

pub(super) fn steps(
    s: &ProjectSnapshot,
    index: &DiscoveryIndex,
    app: Option<&ApplicationMediaCatalog>,
    selected: &FlowSelection,
) -> Result<Vec<FlowStep>, String> {
    let (owner, result) = match selected.identity.split_once(":result:") {
        Some((owner, result)) => (
            owner,
            Some(
                result
                    .parse::<u8>()
                    .map_err(|_| "Invalid result identity")?,
            ),
        ),
        None => (selected.identity.as_str(), None),
    };
    if result.is_some_and(|r| r > 3) {
        return Err("Result identity must name Result 1–4.".into());
    }
    let program = find_program(s, owner);
    let Some((_, actions, kind)) = program else {
        return Ok(Vec::new());
    };
    if kind.ends_with("encounter") && result.is_none() {
        return Ok(Vec::new());
    }
    if !kind.ends_with("encounter")
        && (result.is_some()
            || selected.entry_position.is_some()
            || selected.through_position.is_some())
    {
        return Err("Step bounds belong to an encounter result.".into());
    }
    let context = ProgramContext {
        snapshot: s,
        index,
        application: app,
        selected,
        owner,
        kind,
        result,
    };
    (0..8)
        .map(|position| {
            let slot = result.unwrap_or(0) * 8 + position;
            let action = actions.iter().find(|a| a.slot == slot);
            context.describe_step(position, action)
        })
        .collect()
}

#[derive(Clone, Copy)]
struct ProgramContext<'a> {
    snapshot: &'a ProjectSnapshot,
    index: &'a DiscoveryIndex,
    application: Option<&'a ApplicationMediaCatalog>,
    selected: &'a FlowSelection,
    owner: &'a str,
    kind: &'a str,
    result: Option<u8>,
}

impl ProgramContext<'_> {
    fn describe_step(
        &self,
        position: u8,
        action: Option<&ClassicAction>,
    ) -> Result<FlowStep, String> {
        let Self {
            snapshot: s,
            index,
            application: app,
            selected,
            owner,
            kind,
            result,
        } = *self;
        let slot = result.unwrap_or(0) * 8 + position;
        let mut step = FlowStep {
            position,
            slot,
            in_range: i16::from(position) >= selected.entry_position.unwrap_or(0)
                && i16::from(position) <= selected.through_position.unwrap_or(7),
            status: "empty".into(),
            title: "Unused slot".into(),
            card_summary: String::new(),
            summary: String::new(),
            condition: String::new(),
            warning: String::new(),
            source: owner.into(),
            field: format!("actions[{slot}].targetNativeId"),
            caller_context: selected.caller_context.clone(),
            fields: Vec::new(),
            links: Vec::new(),
        };
        let Some(action) = action.filter(|a| a.raw_opcode != 0) else {
            return Ok(step);
        };
        step.links = super::step_links(index, owner, slot, selected);
        apply_meaning(
            &mut step,
            action,
            describe_form(s, app, owner, kind, result, position, action),
        );
        apply_control_flow(&mut step, action, index);
        Ok(step)
    }
}

fn apply_meaning(
    step: &mut FlowStep,
    action: &ClassicAction,
    form: Result<authoring::ActionFormDescription, String>,
) {
    match form {
        Ok(form) => {
            step.status = "known".into();
            step.title = form.title;
            step.summary = form.summary;
            step.warning = form.availability_reason.unwrap_or_default();
            step.fields = form
                .fields
                .into_iter()
                .filter(|field| field.visible && !field.preserved)
                .take(16)
                .map(project_field)
                .collect();
            if step.summary.is_empty() {
                step.summary = step
                    .fields
                    .iter()
                    .filter_map(|f| f.preview.as_ref().map(|p| p.label.as_str()))
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(" · ");
            }
        }
        Err(error) => {
            step.status = if authoring::action_definition_for_opcode(action.raw_opcode).is_some() {
                "unavailable"
            } else {
                "unknown"
            }
            .into();
            step.title = authoring::action_definition_for_opcode(action.raw_opcode)
                .map(|d| d.label)
                .unwrap_or_else(|| "Unrecognized imported instruction".into());
            step.warning = error;
        }
    }
}

fn apply_control_flow(step: &mut FlowStep, action: &ClassicAction, index: &DiscoveryIndex) {
    if step.status == "unknown" {
        step.card_summary = step.title.clone();
        step.condition = "Execution meaning is unavailable; no effect is inferred.".into();
        return;
    }
    let owner = step.source.as_str();
    let slot = step.slot;
    step.condition = index
        .quests
        .iter()
        .filter(|q| q.source == owner && q.field.starts_with(&format!("actions[{slot}]")))
        .map(|q| q.condition.as_str())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
    if step.condition.is_empty() {
        step.condition =
            "Runs if reached; branch behavior is described by the action fields.".into();
    }
    if action.gosub() {
        step.summary.push_str(" · Returns to the following step");
    }
    step.card_summary = match action.opcode() {
        1 => format!("Show String {}", action.target_native_id),
        4 => format!("Open Simple {}", action.target_native_id),
        5 => format!("Open Complex {}", action.target_native_id),
        27 => format!("Show Picture {}", action.target_native_id),
        39 => format!("Run XAP {}", action.target_native_id),
        _ => step.title.clone(),
    };
    if action.opcode() == 47
        && let Some(quest) = index
            .quests
            .iter()
            .find(|q| q.source == owner && q.field.starts_with(&format!("actions[{slot}]")))
    {
        step.title = format!("{} Quest {}", quest.effect, quest.quest_id);
        step.card_summary = step.title.clone();
        step.summary = format!("{} → {}", step.summary, quest.effect);
    }
    if action.opcode() == 46
        && let Some(quest) = index.quests.iter().find(|q| {
            q.source == owner && q.field.starts_with(&format!("actions[{slot}]")) && q.checks
        })
    {
        step.card_summary = format!(
            "If {}: {}",
            quest
                .condition
                .replacen("Quest", &format!("Quest {}", quest.quest_id), 1),
            quest.branch
        );
    }
}

fn project_field(field: authoring::DescribedActionField) -> FlowField {
    let mut preview = field.preview;
    let preview_truncated = preview
        .as_ref()
        .is_some_and(|value| value.detail.chars().count() > 600);
    if let Some(value) = &mut preview {
        value.label = super::super::graph::bounded(&value.label, 180);
        value.detail = super::super::graph::bounded(&value.detail, 600);
    }
    FlowField {
        label: field.label,
        value: field.value,
        explanation: super::super::graph::bounded(&field.explanation, 600),
        preview,
        preview_truncated,
    }
}

fn describe_form(
    s: &ProjectSnapshot,
    app: Option<&ApplicationMediaCatalog>,
    owner: &str,
    kind: &str,
    result: Option<u8>,
    position: u8,
    action: &ClassicAction,
) -> Result<authoring::ActionFormDescription, String> {
    let definition = authoring::action_definition_for_opcode(action.raw_opcode)
        .ok_or("No supported meaning is known; the original instruction is preserved.")?;
    let mut query = ActionFormDescribeQuery {
        action_identity: definition.identity,
        target_native_id: action.target_native_id,
        values: BTreeMap::new(),
        secondary_values: BTreeMap::new(),
        context: ActionFormContext {
            script_kind: Some(kind.into()),
            encounter_identity: result.map(|_| crate::model::StableId(owner.into())),
            encounter_result_index: result,
            encounter_step_index: result.map(|_| position),
            ..Default::default()
        },
    };
    if let Some(ap) = s
        .world
        .action_points
        .iter()
        .find(|ap| ap.identity.0 == owner)
    {
        query.context.target_context.level_type = Some(ap.level_type);
        query.context.target_context.map_identity = Some(crate::model::StableId(format!(
            "{}:{}",
            if ap.level_type == crate::model::LevelType::Land {
                "land"
            } else {
                "dungeon"
            },
            ap.level_index
        )));
    }
    if let Some(form_id) = definition.form_id {
        query.values = settings(s, &form_id, i32::from(action.target_native_id))?;
        if let Some(companion) =
            authoring::form_definition(&form_id).and_then(|form| form.companion_form_id)
        {
            query.secondary_values =
                settings(s, &companion, i32::from(action.target_native_id) + 1)?;
        }
    }
    authoring::describe_action_form_with_application(s, app, &query)
}

fn settings(s: &ProjectSnapshot, form: &str, id: i32) -> Result<BTreeMap<String, i16>, String> {
    let mut rows = s
        .extra_codes
        .iter()
        .filter(|row| i64::from(row.native_id.0) == i64::from(id));
    let row = rows
        .next()
        .ok_or_else(|| format!("Required action settings {id} are missing."))?;
    if rows.next().is_some() {
        return Err(format!("Required action settings {id} are ambiguous."));
    }
    authoring::decode_form_values(form, row.values)
        .ok_or_else(|| "Action settings cannot be described.".into())
}

fn find_program<'a>(
    s: &'a ProjectSnapshot,
    owner: &str,
) -> Option<(&'a str, &'a [ClassicAction], &'static str)> {
    s.world
        .action_points
        .iter()
        .map(|r| (r.identity.0.as_str(), r.actions.as_slice(), "action-point"))
        .chain(s.extra_action_points.iter().map(|r| {
            (
                r.identity.0.as_str(),
                r.actions.as_slice(),
                "extra-action-point",
            )
        }))
        .chain(s.simple_encounters.iter().map(|r| {
            (
                r.identity.0.as_str(),
                r.actions.as_slice(),
                "simple-encounter",
            )
        }))
        .chain(s.complex_encounters.iter().map(|r| {
            (
                r.identity.0.as_str(),
                r.actions.as_slice(),
                "complex-encounter",
            )
        }))
        .find(|(id, _, _)| *id == owner)
}
