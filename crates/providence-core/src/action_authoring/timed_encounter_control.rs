use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const OPTIONAL_VALUES: [(&str, &str, i16); 3] = [
    ("percentOrKeep", "Activation Chance", 100),
    ("incrementOrKeep", "Repeat Interval", i16::MAX),
    ("dayOffsetOrKeep", "Next Activation Offset", i16::MAX),
];

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    for (field, label, maximum) in OPTIONAL_VALUES {
        add_optional_value(query, &mut result, field, label, maximum);
    }
    add_day_base(query, &mut result)?;
    Ok(result)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    let valid_mode = |key: &str| {
        key == "activationDayBase"
            || OPTIONAL_VALUES
                .iter()
                .any(|(field, _, _)| key == format!("{field}Behavior"))
    };
    let valid_selection = |key: &str| OPTIONAL_VALUES.iter().any(|(field, _, _)| key == *field);
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
        return Err("Unknown Change Timed Encounter authoring control.".into());
    }
    Ok(())
}

fn add_optional_value(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
    field: &str,
    label: &str,
    maximum: i16,
) {
    let input = &query.context.authoring;
    let control_key = format!("{field}Behavior");
    let imported = query.values.get(field).copied().unwrap_or(-1);
    let explicit_mode = input.modes.get(&control_key).copied();
    let mode = explicit_mode.unwrap_or(i16::from(imported >= 0));
    let active = mode == 1;
    result.controls.push(AuthoringModeControl {
        key: control_key,
        label: label.into(),
        value: mode,
        choices: choices(&[(0, "Keep current"), (1, "Set new value")]),
        member_fields: vec![field.into()],
        active_fields: if active { vec![field.into()] } else { vec![] },
        display: if explicit_mode.is_none() && imported < -1 {
            format!("Imported value {imported} also leaves this setting unchanged in Classic.")
        } else {
            String::new()
        },
    });

    let selected = input.selections.get(field).copied();
    let resolved = match (explicit_mode, active, selected) {
        (None, _, None) => imported,
        (_, false, _) => -1,
        (_, true, Some(value)) => value,
        (_, true, None) if imported >= 0 => imported,
        (_, true, None) => {
            result
                .errors
                .push(format!("Enter a {label} before applying this change."));
            0
        }
    };
    if active && !(0..=maximum).contains(&resolved) {
        result
            .errors
            .push(format!("{label} must be between 0 and {maximum}."));
    }
    result.resolved_values.insert(field.into(), resolved);
}

fn add_day_base(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let input = &query.context.authoring;
    let imported = query.values.get("resetDayFlag").copied().unwrap_or(0);
    let explicit = input.modes.get("activationDayBase").copied();
    let mode = explicit.unwrap_or(i16::from(imported != 0));
    if !matches!(mode, 0 | 1) {
        return Err("Activation day must keep its schedule or start from the current day.".into());
    }
    result.controls.push(AuthoringModeControl {
        key: "activationDayBase".into(),
        label: "Activation Day".into(),
        value: mode,
        choices: choices(&[(0, "Keep scheduled day"), (1, "Start from current day")]),
        member_fields: vec!["resetDayFlag".into()],
        active_fields: vec![],
        display: if explicit.is_none() && !matches!(imported, 0 | 1) {
            format!("Imported nonzero flag {imported} starts from the current day in Classic.")
        } else {
            String::new()
        },
    });
    if explicit.is_some() {
        result.resolved_values.insert("resetDayFlag".into(), mode);
    }
    Ok(())
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
    for (field, _, maximum) in OPTIONAL_VALUES {
        let Some(value) = fields.iter_mut().find(|value| value.key == field) else {
            continue;
        };
        value.minimum = 0;
        value.maximum = maximum;
        value.special_values.clear();
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        0 => (
            "Timed Encounter".into(),
            "Choose the timed encounter whose schedule or activation chance will change.".into(),
        ),
        1 => (
            "Activation Chance".into(),
            "Set a new activation chance from 0 through 100 percent, or keep the current chance."
                .into(),
        ),
        2 => (
            "Repeat Interval".into(),
            "Set the number of days between repeated activations, or keep the current interval."
                .into(),
        ),
        3 => (
            "Activation Day".into(),
            "Choose whether the following offset starts from the scheduled day or today's game day."
                .into(),
        ),
        4 => (
            "Next Activation Offset".into(),
            "Add this many days to the selected activation-day base, or keep the current day."
                .into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
