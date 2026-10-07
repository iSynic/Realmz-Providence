//! Author-facing scope and operand controls for Branch on Miscellaneous.

use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionTargetKind, AuthoringModeControl,
    DescribedActionField, FormChoice, FormControl,
};
use crate::model::ProjectSnapshot;

const SCOPE_KEY: &str = "characterScope";
const VALUE_KEY: &str = "signedTestValue";

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input
        .modes
        .keys()
        .any(|key| key != SCOPE_KEY && !super::optional_branch_control::is_mode_key(key))
        || input
            .selections
            .keys()
            .any(|key| key != VALUE_KEY && !super::optional_branch_control::is_target_key(key))
    {
        return Err("Unknown miscellaneous-branch authoring control.".into());
    }
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    let test = query.values.get("testSelector").copied().unwrap_or(0);
    if matches!(test, 0 | 1 | 2 | 5 | 6) {
        let imported = query.values.get(VALUE_KEY).copied().unwrap_or(0);
        let scope = input
            .modes
            .get(SCOPE_KEY)
            .copied()
            .unwrap_or(i16::from(imported < 0));
        if !matches!(scope, 0 | 1) {
            return Err("Character scope must be Whole party or Picked characters.".into());
        }
        let selection = input
            .selections
            .get(VALUE_KEY)
            .copied()
            .unwrap_or_else(|| imported.saturating_abs());
        let resolved = if scope == 1 {
            -selection.saturating_abs()
        } else {
            selection.saturating_abs()
        };
        result.resolved_values.insert(VALUE_KEY.into(), resolved);
        result.controls.push(scope_control(scope));
        if (input.modes.contains_key(SCOPE_KEY) || input.selections.contains_key(VALUE_KEY))
            && selection == 0
        {
            result
                .errors
                .push("Select a nonzero value for this character test before applying.".into());
        }
    }
    super::optional_branch_control::augment(query, &mut result)?;
    Ok(result)
}

fn scope_control(scope: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: SCOPE_KEY.into(),
        label: "Characters to consider".into(),
        value: scope,
        choices: vec![
            choice(0, "Whole party"),
            choice(1, "Currently picked characters"),
        ],
        member_fields: vec![VALUE_KEY.into()],
        active_fields: vec![VALUE_KEY.into()],
        display: String::new(),
    }
}

pub(super) fn decorate(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let test = query.values.get("testSelector").copied().unwrap_or(0);
    let Some(field) = fields.iter_mut().find(|field| field.key == VALUE_KEY) else {
        return;
    };
    field.visible = !matches!(test, 3 | 4);
    field.special_values.clear();
    field.value = field.value.saturating_abs();
    match test {
        0 => target_field(snapshot, query, field, ActionTargetKind::Caste, "Caste"),
        1 => target_field(snapshot, query, field, ActionTargetKind::Race, "Race"),
        2 => choice_field(field, "Gender", &[(1, "Male"), (2, "Female")]),
        5 => choice_field(
            field,
            "Caste Class",
            &[
                (1, "Fighter types"),
                (2, "Magical types"),
                (3, "Monk / rogue"),
            ],
        ),
        6 => field.label = "Race Class Number".into(),
        _ => {}
    }
    field.availability_reason = projection
        .errors
        .iter()
        .find(|error| error.contains("character test"))
        .cloned();
}

fn target_field(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    field: &mut DescribedActionField,
    kind: ActionTargetKind,
    label: &str,
) {
    field.label = label.into();
    field.control = FormControl::Target;
    field.target_kind = Some(kind);
    field.preview = super::form_description::preview(snapshot, None, query, kind, field.value);
}

fn choice_field(field: &mut DescribedActionField, label: &str, values: &[(i16, &str)]) {
    field.label = label.into();
    field.control = FormControl::Choice;
    field.target_kind = None;
    field.preview = None;
    field.choices = values
        .iter()
        .map(|(value, label)| choice(*value, label))
        .collect();
}

fn choice(value: i16, label: &str) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}
