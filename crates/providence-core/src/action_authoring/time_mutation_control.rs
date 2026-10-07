use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};
use std::collections::BTreeMap;

const VALUE_FIELDS: [(&str, &str); 3] = [
    ("dayOrDelta", "Day"),
    ("hourOrDelta", "Hour"),
    ("minuteOrDelta", "Minute"),
];

pub(super) fn field_presentation(
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
) -> (String, String) {
    match (field.index, values.get("mode").copied()) {
        (0, _) => (
            "Time Change".into(),
            "Choose whether to set an absolute time or add an offset.".into(),
        ),
        (1, Some(1)) => absolute("Day", "game day"),
        (2, Some(1)) => absolute("Hour", "hour from 0 through 23"),
        (3, Some(1)) => absolute("Minute", "minute from 0 through 59"),
        (1, Some(2)) => offset("Day", "Negative values move time backward."),
        (2, Some(2)) => offset(
            "Hour",
            "When the result exceeds 23, Classic advances one day and subtracts 24 once.",
        ),
        (3, Some(2)) => offset(
            "Minute",
            "When the result exceeds 59, Classic advances one hour and subtracts 60 once.",
        ),
        (3, _) => (
            "Minute".into(),
            "Minute component used after a supported time-change mode is selected.".into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}

fn absolute(label: &str, range: &str) -> (String, String) {
    (
        label.into(),
        format!(
            "Set the absolute {range}. Use the adjacent choice to keep the current {} instead.",
            label.to_lowercase()
        ),
    )
}

fn offset(label: &str, consequence: &str) -> (String, String) {
    (
        format!("{label} Offset"),
        format!(
            "Add this signed number of {}. {consequence}",
            label.to_lowercase()
        ),
    )
}

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    let input = &query.context.authoring;
    let imported_mode = query.values.get("mode").copied().unwrap_or(0);
    let mode = input
        .modes
        .get("timeOperation")
        .copied()
        .unwrap_or(imported_mode);
    if !matches!(mode, 1 | 2) && input.modes.contains_key("timeOperation") {
        return Err("Time change must set an absolute time or add an offset.".into());
    }

    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.resolved_values.insert("mode".into(), mode);
    result.controls.push(operation_control(mode));
    if mode == 1 {
        add_absolute_controls(query, &mut result);
    }
    Ok(result)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    let valid_mode = |key: &str| {
        key == "timeOperation"
            || VALUE_FIELDS
                .iter()
                .any(|(field, _)| key == format!("{field}Behavior"))
    };
    let valid_selection = |key: &str| VALUE_FIELDS.iter().any(|(field, _)| key == *field);
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
        return Err("Unknown Change Time authoring control.".into());
    }
    Ok(())
}

fn operation_control(value: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: "timeOperation".into(),
        label: "Time Change".into(),
        value,
        choices: choices(&[(1, "Set absolute time"), (2, "Add time offset")]),
        member_fields: vec!["mode".into()],
        active_fields: vec![],
        display: String::new(),
    }
}

fn add_absolute_controls(query: &ActionFormDescribeQuery, result: &mut ActionAuthoringProjection) {
    for (field, label) in VALUE_FIELDS {
        let behavior_key = format!("{field}Behavior");
        let imported = query.values.get(field).copied().unwrap_or(-1);
        let behavior = query
            .context
            .authoring
            .modes
            .get(&behavior_key)
            .copied()
            .unwrap_or(i16::from(imported != -1));
        let active = behavior == 1;
        result.controls.push(AuthoringModeControl {
            key: behavior_key,
            label: label.into(),
            value: behavior,
            choices: choices(&[(0, "Keep current"), (1, "Set exact value")]),
            member_fields: vec![field.into()],
            active_fields: if active { vec![field.into()] } else { vec![] },
            display: String::new(),
        });
        let selected = query
            .context
            .authoring
            .selections
            .get(field)
            .copied()
            .unwrap_or(if imported == -1 { 0 } else { imported });
        result
            .resolved_values
            .insert(field.into(), if active { selected } else { -1 });
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

pub(super) fn decorate(
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let absolute = projection
        .controls
        .iter()
        .find(|control| control.key == "timeOperation")
        .is_some_and(|control| control.value == 1);
    if !absolute {
        return;
    }
    for (key, _) in VALUE_FIELDS {
        let Some(field) = fields.iter_mut().find(|field| field.key == key) else {
            continue;
        };
        field.minimum = 0;
        field.maximum = match key {
            "hourOrDelta" => 23,
            "minuteOrDelta" => 59,
            _ => i16::MAX,
        };
    }
}
