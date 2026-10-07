//! Named keep/set controls for Move Party coordinates.

use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const OPTIONAL_VALUES: [(&str, &str); 3] = [
    ("levelOrKeep", "Destination Level"),
    ("xOrKeep", "Destination X"),
    ("yOrKeep", "Destination Y"),
];

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    for (field, label) in OPTIONAL_VALUES {
        add_optional_value(query, &mut result, field, label)?;
    }
    Ok(result)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    let valid_mode = |key: &str| {
        OPTIONAL_VALUES
            .iter()
            .any(|(field, _)| key == format!("{field}Behavior"))
    };
    let valid_selection = |key: &str| OPTIONAL_VALUES.iter().any(|(field, _)| key == *field);
    if query
        .context
        .authoring
        .modes
        .keys()
        .any(|key| !valid_mode(key))
        || query
            .context
            .authoring
            .selections
            .keys()
            .any(|key| !valid_selection(key))
    {
        return Err("Unknown Move Party authoring control.".into());
    }
    Ok(())
}

fn add_optional_value(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
    field: &str,
    label: &str,
) -> Result<(), String> {
    let input = &query.context.authoring;
    let control_key = format!("{field}Behavior");
    let imported = query.values.get(field).copied().unwrap_or(-1);
    let explicit_mode = input.modes.get(&control_key).copied();
    let mode = explicit_mode.unwrap_or(i16::from(imported >= 0));
    if !matches!(mode, 0 | 1) {
        return Err(format!("{label} must be Keep current or Set destination."));
    }
    result.controls.push(mode_control(
        &control_key,
        field,
        label,
        mode,
        explicit_mode.is_none().then_some(imported),
    ));

    let selected = input.selections.get(field).copied();
    let resolved = match (explicit_mode, mode, selected) {
        (None, _, None) => imported,
        (_, 0, _) => -1,
        (_, 1, Some(value)) => value,
        (_, 1, None) if imported >= 0 => imported,
        (_, 1, None) => {
            result
                .errors
                .push(format!("Enter {label} before applying this move."));
            0
        }
        _ => unreachable!(),
    };
    if mode == 1 && resolved < 0 {
        result.errors.push(format!(
            "{label} cannot be negative when Set destination is selected."
        ));
    }
    result.resolved_values.insert(field.into(), resolved);
    Ok(())
}

fn mode_control(
    key: &str,
    field: &str,
    label: &str,
    mode: i16,
    untouched_import: Option<i16>,
) -> AuthoringModeControl {
    AuthoringModeControl {
        key: key.into(),
        label: label.into(),
        value: mode,
        choices: choices(&[(0, "Keep current"), (1, "Set destination")]),
        member_fields: vec![field.into()],
        active_fields: if mode == 1 {
            vec![field.into()]
        } else {
            vec![]
        },
        display: match untouched_import {
            Some(value) if value < -1 => {
                format!("Imported value {value} also keeps this destination value in Classic.")
            }
            _ => String::new(),
        },
    }
}

fn choices(entries: &[(i16, &str)]) -> Vec<FormChoice> {
    entries
        .iter()
        .map(|(value, label)| FormChoice {
            value: *value,
            label: (*label).into(),
        })
        .collect()
}

pub(super) fn decorate(fields: &mut [DescribedActionField]) {
    for (field, _) in OPTIONAL_VALUES {
        let Some(value) = fields.iter_mut().find(|value| value.key == field) else {
            continue;
        };
        value.minimum = 0;
        value.special_values.clear();
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        0 => destination("Level", "map level"),
        1 => destination("X", "horizontal map cell"),
        2 => destination("Y", "vertical map cell"),
        _ => (field.label.clone(), field.help.clone()),
    }
}

fn destination(label: &str, meaning: &str) -> (String, String) {
    (
        format!("Destination {label}"),
        format!("Set the destination {meaning}, or explicitly keep the current value."),
    )
}
