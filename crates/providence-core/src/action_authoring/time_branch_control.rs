use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const TEST_FIELDS: [(&str, &str); 2] = [("dayLimit", "Day"), ("hourLimit", "Hour")];

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    for (field, label) in TEST_FIELDS {
        let control_key = format!("{field}Test");
        let imported = query.values.get(field).copied().unwrap_or(-1);
        let mode = query
            .context
            .authoring
            .modes
            .get(&control_key)
            .copied()
            .unwrap_or(i16::from(imported != -1));
        if !matches!(mode, 0 | 1) {
            return Err(format!("{label} test must be ignored or compared."));
        }
        let active = mode == 1;
        result
            .controls
            .push(test_control(control_key, label, field, active));
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
    Ok(result)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    let valid_mode = |key: &str| {
        TEST_FIELDS
            .iter()
            .any(|(field, _)| key == format!("{field}Test"))
    };
    let valid_selection = |key: &str| TEST_FIELDS.iter().any(|(field, _)| key == *field);
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
        return Err("Unknown Branch On Time authoring control.".into());
    }
    Ok(())
}

fn test_control(key: String, label: &str, field: &str, active: bool) -> AuthoringModeControl {
    AuthoringModeControl {
        key,
        label: format!("{label} Test"),
        value: i16::from(active),
        choices: vec![
            FormChoice {
                value: 0,
                label: format!("Ignore {label}"),
            },
            FormChoice {
                value: 1,
                label: format!("Compare {label}"),
            },
        ],
        member_fields: vec![field.into()],
        active_fields: if active { vec![field.into()] } else { vec![] },
        display: String::new(),
    }
}

pub(super) fn decorate(fields: &mut [DescribedActionField]) {
    for (key, _) in TEST_FIELDS {
        let Some(field) = fields.iter_mut().find(|field| field.key == key) else {
            continue;
        };
        field.minimum = 0;
        field.maximum = if key == "hourLimit" { 23 } else { i16::MAX };
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        0 => (
            "Day".into(),
            "Branch on or before this game day, or choose Ignore Day.".into(),
        ),
        1 => (
            "Hour".into(),
            "Branch on or before this hour from 0 through 23, or choose Ignore Hour.".into(),
        ),
        3 => (
            "On Or Before".into(),
            "Extra Action Point run when every enabled time comparison passes.".into(),
        ),
        4 => (
            "After".into(),
            "Extra Action Point run when an enabled time comparison fails.".into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
