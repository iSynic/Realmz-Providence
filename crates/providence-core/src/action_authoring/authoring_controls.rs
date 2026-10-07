//! Transient author choices project to Classic words without changing snapshot storage.
use super::{ActionFormDescribeQuery, ActionTargetKind, FormChoice};
use crate::model::ProjectSnapshot;
use crate::rebuilt::ApplicationMediaCatalog;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionAuthoringInput {
    #[serde(default)]
    pub modes: BTreeMap<String, i16>,
    #[serde(default)]
    pub selections: BTreeMap<String, i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoringModeControl {
    pub key: String,
    pub label: String,
    pub value: i16,
    pub choices: Vec<FormChoice>,
    pub member_fields: Vec<String>,
    pub active_fields: Vec<String>,
    pub display: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionAuthoringProjection {
    pub controls: Vec<AuthoringModeControl>,
    pub resolved_values: BTreeMap<String, i16>,
    pub errors: Vec<String>,
}

pub(crate) fn option_labels_present(snapshot: &ProjectSnapshot) -> bool {
    !snapshot.option_labels.is_empty()
        || snapshot
            .classic_sources
            .iter()
            .any(|source| source.native_path == "Data OD")
}

pub(super) fn resolve(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    opcode: i16,
) -> Result<ActionAuthoringProjection, String> {
    if let Some(result) = specialized_projection(snapshot, application, query, opcode) {
        return result;
    }
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    let input = &query.context.authoring;
    if opcode != 3 {
        if !input.modes.is_empty() || !input.selections.is_empty() {
            return Err("This action has no grouped authoring choices.".into());
        }
        return Ok(result);
    }
    if input.modes.keys().any(|key| key != "choiceText")
        || input
            .selections
            .keys()
            .any(|key| !matches!(key.as_str(), "promptA" | "promptB"))
    {
        return Err("Unknown Player Option authoring control.".into());
    }
    let imported_custom = query.values.get("promptA").copied().unwrap_or(0) != 0;
    let selected = input
        .modes
        .get("choiceText")
        .copied()
        .unwrap_or(i16::from(imported_custom));
    if !matches!(selected, 0 | 1) {
        return Err("Choice text must be Default Yes/No or Custom labels.".into());
    }
    result.controls.push(choice_text_control(selected));
    if selected == 0 {
        // Only the controlling word changes. The unused right word remains authored data.
        result.resolved_values.insert("promptA".into(), 0);
    } else {
        resolve_custom(snapshot, query, imported_custom, &mut result);
    }
    Ok(result)
}

fn specialized_projection(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    opcode: i16,
) -> Option<Result<ActionAuthoringProjection, String>> {
    Some(match opcode {
        7 => super::action_patch_control::resolve(query),
        12 => super::map_tile_control::resolve(query),
        13 => super::trigger_mutation_control::resolve(query),
        2 | 48 | 56 | 107 => super::battle_selection_control::resolve(query),
        -23 | 23 => super::random_region_control::resolve(query),
        -14 | 14 => super::pick_count_control::resolve(query),
        15 | 16 => super::stamina_change_control::resolve(query),
        20 | 45 => super::teleport_control::resolve(query),
        33 => super::payment_control::resolve(query),
        43 => super::condition_duration_control::resolve(query),
        50 => super::character_selection_control::resolve(snapshot, query),
        51 => super::current_shop_control::resolve(snapshot, query),
        52 => super::misc_character_control::resolve(query),
        54 => super::timed_encounter_control::resolve(query),
        61 => super::shift_position_control::resolve(query),
        63 => super::time_mutation_control::resolve(query),
        64 => super::time_branch_control::resolve(query),
        65 | 124 => super::random_item_control::resolve(query),
        74 => super::spell_points_control::resolve(query),
        76 => super::quest_value_control::resolve(query),
        86 => super::misc_condition_control::resolve(query),
        77 | 78 => super::optional_branch_control::resolve(query),
        120 => super::combat_monster_control::resolve(snapshot, application, query),
        125 => super::destroy_related_control::resolve(query),
        _ => return None,
    })
}

fn choice_text_control(selected: i16) -> AuthoringModeControl {
    let members = vec!["promptA".into(), "promptB".into()];
    AuthoringModeControl {
        key: "choiceText".into(),
        label: "Choice text".into(),
        value: selected,
        choices: vec![
            FormChoice {
                value: 0,
                label: "Default Yes/No".into(),
            },
            FormChoice {
                value: 1,
                label: "Custom labels".into(),
            },
        ],
        member_fields: members.clone(),
        active_fields: if selected == 1 { members } else { vec![] },
        display: if selected == 0 {
            "Left: Yes     Right: No".into()
        } else {
            String::new()
        },
    }
}

fn resolve_custom(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    imported_custom: bool,
    result: &mut ActionAuthoringProjection,
) {
    let input = &query.context.authoring;
    for (key, label) in [("promptA", "Left"), ("promptB", "Right")] {
        let selection = input.selections.get(key).copied();
        let value = selection
            .or_else(|| query.values.get(key).copied())
            .unwrap_or(0);
        result.resolved_values.insert(key.into(), value);
        // Imported custom records remain preservable, including missing references.
        // Explicitly entering Custom mode is an author task and requires usable selections.
        let entering_custom = input.modes.get("choiceText") == Some(&1);
        if (entering_custom || selection.is_some())
            && ((!imported_custom && selection.is_none())
                || (key == "promptA" && value == 0)
                || !prompt_exists(snapshot, value))
        {
            result.errors.push(format!(
                "Select valid {label} custom label content before applying."
            ));
        }
    }
}

fn prompt_exists(snapshot: &ProjectSnapshot, value: i16) -> bool {
    let id = i32::from(value).unsigned_abs();
    if option_labels_present(snapshot) {
        snapshot
            .option_labels
            .iter()
            .any(|row| row.native_id.0 == id)
    } else {
        snapshot.messages.iter().any(|row| row.native_id.0 == id)
    }
}

pub(super) fn prompt_target(snapshot: &ProjectSnapshot) -> ActionTargetKind {
    if option_labels_present(snapshot) {
        ActionTargetKind::OptionLabel
    } else {
        ActionTargetKind::Message
    }
}

pub(super) fn decorate_fields(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [super::DescribedActionField],
) {
    if matches!(
        query.action_identity.as_str(),
        "realmz.action.30" | "realmz.action.31"
    ) {
        super::ability_check_presentation::decorate(&query.values, fields);
        return;
    }
    if decorate_special_action(snapshot, application, query, projection, fields) {
        return;
    }
    let Some(mode) = projection
        .controls
        .iter()
        .find(|control| control.key == "choiceText")
    else {
        return;
    };
    for field in fields
        .iter_mut()
        .filter(|field| mode.member_fields.contains(&field.key))
    {
        field.special_values.clear();
        if mode.value == 0 {
            field.target_kind = None;
            field.preview = None;
            field.editable = false;
            field.availability_reason = Some("The built-in Yes/No pair is selected.".into());
        } else {
            let kind = prompt_target(snapshot);
            field.control = super::FormControl::Target;
            field.target_kind = Some(kind);
            field.editable = true;
            let label = if field.key == "promptA" {
                "Left"
            } else {
                "Right"
            };
            field.availability_reason = projection
                .errors
                .iter()
                .find(|error| error.contains(label))
                .cloned();
            field.preview = if field.availability_reason.is_none() {
                super::form_description::preview(snapshot, None, query, kind, field.value)
            } else {
                None
            };
        }
    }
    if mode.value == 1 {
        decorate_answer_choices(fields);
    }
}

fn decorate_special_action(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [super::DescribedActionField],
) -> bool {
    if decorate_location_and_selection_actions(snapshot, query, projection, fields) {
        return true;
    }
    match query.action_identity.as_str() {
        "realmz.action.-14" | "realmz.action.14" => {
            super::pick_count_control::decorate(projection, fields)
        }
        "realmz.action.15" | "realmz.action.16" => {
            super::stamina_change_control::decorate(projection, fields)
        }
        "realmz.action.20" | "realmz.action.45" => super::teleport_control::decorate(fields),
        "realmz.action.33" => super::payment_control::decorate(projection, fields),
        "realmz.action.43" => super::condition_duration_control::decorate(projection, fields),
        "realmz.action.51" => {
            super::current_shop_control::decorate(snapshot, query, projection, fields)
        }
        "realmz.action.50" => {
            super::character_selection_control::decorate(snapshot, query, projection, fields)
        }
        "realmz.action.52" => super::misc_character_control::decorate(projection, fields),
        "realmz.action.54" => super::timed_encounter_control::decorate(fields),
        "realmz.action.61" => super::shift_position_control::decorate(projection, fields),
        "realmz.action.120" => super::combat_monster_control::decorate(
            snapshot,
            application,
            query,
            projection,
            fields,
        ),
        "realmz.action.63" => super::time_mutation_control::decorate(projection, fields),
        "realmz.action.64" => super::time_branch_control::decorate(fields),
        "realmz.action.65" | "realmz.action.124" => {
            super::random_item_control::decorate(&query.action_identity, projection, fields)
        }
        "realmz.action.74" => super::spell_points_control::decorate(projection, fields),
        "realmz.action.76" => super::quest_value_control::decorate(projection, fields),
        "realmz.action.86" => {
            super::misc_condition_control::decorate(snapshot, query, projection, fields);
            super::optional_branch_control::decorate(query, projection, fields)
        }
        "realmz.action.77" | "realmz.action.78" => {
            super::optional_branch_control::decorate(query, projection, fields)
        }
        "realmz.action.125" => super::destroy_related_control::decorate(projection, fields),
        _ => return false,
    }
    true
}

fn decorate_location_and_selection_actions(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [super::DescribedActionField],
) -> bool {
    match query.action_identity.as_str() {
        "realmz.action.7" => super::action_patch_control::decorate(projection, fields),
        "realmz.action.13" => {
            super::trigger_mutation_control::decorate(snapshot, query, projection, fields)
        }
        "realmz.action.2" | "realmz.action.48" | "realmz.action.56" | "realmz.action.107" => {
            super::battle_selection_control::decorate(projection, fields)
        }
        "realmz.action.-23" | "realmz.action.23" => {
            super::random_region_control::decorate(projection, fields)
        }
        _ => return false,
    }
    true
}

fn decorate_answer_choices(fields: &mut [super::DescribedActionField]) {
    let labels: Vec<String> = ["promptA", "promptB"]
        .iter()
        .map(|key| {
            fields
                .iter()
                .find(|field| field.key == *key)
                .and_then(|field| field.preview.as_ref())
                .map(|preview| preview.detail.chars().take(40).collect())
                .unwrap_or_else(|| "Select content".into())
        })
        .collect();
    if let Some(field) = fields.iter_mut().find(|field| field.key == "replyPolarity") {
        for choice in &mut field.choices {
            match choice.value {
                0 => choice.label = format!("Right / {} continues", labels[1]),
                1 => choice.label = format!("Left / {} continues", labels[0]),
                _ => {}
            }
        }
    }
}
