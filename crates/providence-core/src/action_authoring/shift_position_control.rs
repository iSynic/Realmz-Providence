use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, AuthoringModeControl, DescribedActionField,
    FormChoice,
};

const MODE_KEY: &str = "shiftDistanceMode";
const X_FIELD: &str = "xShift";
const Y_FIELD: &str = "yShift";
const STORED_MODE_FIELD: &str = "randomize";
const EXACT: i16 = 0;
const RANDOM: i16 = 1;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input
            .selections
            .keys()
            .any(|key| !matches!(key.as_str(), X_FIELD | Y_FIELD))
    {
        return Err("Unknown Shift Position authoring control.".into());
    }
    let imported_mode = query.values.get(STORED_MODE_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, EXACT | RANDOM)) {
        return Err("Shift distance must be Exact or Random.".into());
    }
    let mode = explicit_mode.unwrap_or(i16::from(imported_mode != 0));
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(mode_control(mode, imported_mode));
    if let Some(mode) = explicit_mode {
        result
            .resolved_values
            .insert(STORED_MODE_FIELD.into(), mode);
    }
    for (key, axis) in [(X_FIELD, "X"), (Y_FIELD, "Y")] {
        let selected = input
            .selections
            .get(key)
            .copied()
            .or_else(|| query.values.get(key).copied())
            .unwrap_or(0);
        if input.selections.contains_key(key) {
            result.resolved_values.insert(key.into(), selected);
        }
        if mode == RANDOM
            && (explicit_mode.is_some() || input.selections.contains_key(key))
            && selected < 1
        {
            result.errors.push(format!(
                "Random {axis} distance requires a maximum of at least 1."
            ));
        }
    }
    Ok(result)
}

fn mode_control(mode: i16, imported_mode: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Distance".into(),
        value: mode,
        choices: vec![
            choice(EXACT, "Exact distance"),
            choice(RANDOM, "Random distance"),
        ],
        member_fields: vec![X_FIELD.into(), Y_FIELD.into(), STORED_MODE_FIELD.into()],
        active_fields: vec![X_FIELD.into(), Y_FIELD.into()],
        display: if !matches!(imported_mode, EXACT | RANDOM) {
            format!(
                "Imported random-mode marker {imported_mode} is retained until the mode is changed."
            )
        } else {
            String::new()
        },
    }
}

fn choice(value: i16, label: &str) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}

pub(super) fn decorate(
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let random = projection
        .controls
        .iter()
        .find(|control| control.key == MODE_KEY)
        .is_some_and(|control| control.value == RANDOM);
    for field in fields
        .iter_mut()
        .filter(|field| matches!(field.key.as_str(), X_FIELD | Y_FIELD))
    {
        field.minimum = if random { 1 } else { i16::MIN };
        field.availability_reason = projection
            .errors
            .iter()
            .find(|error| error.contains(if field.key == X_FIELD { "X" } else { "Y" }))
            .cloned();
    }
}
