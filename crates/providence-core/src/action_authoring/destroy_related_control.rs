use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const COUNT_FIELD: &str = "maxCount";
const MODE_KEY: &str = "destroyCountMode";

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    let input = &query.context.authoring;
    let imported = query.values.get(COUNT_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, 0 | 1)) {
        return Err("Monsters To Destroy must be all matching monsters or a limited count.".into());
    }
    let mode = explicit_mode.unwrap_or(match imported {
        0 => 0,
        1.. => 1,
        _ => 2,
    });
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(count_control(mode, imported));

    let selected = input
        .selections
        .get(COUNT_FIELD)
        .copied()
        .or_else(|| (imported > 0).then_some(imported));
    let resolved = match (explicit_mode, mode, selected) {
        (None, _, None) => imported,
        (_, 0, _) => 0,
        (_, 1, Some(value)) => value,
        _ => imported,
    };
    if mode == 1
        && (explicit_mode.is_some() || input.selections.contains_key(COUNT_FIELD))
        && !matches!(selected, Some(1..=100))
    {
        result
            .errors
            .push("Maximum monsters to destroy must be between 1 and 100.".into());
    }
    result.resolved_values.insert(COUNT_FIELD.into(), resolved);
    Ok(result)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    if query
        .context
        .authoring
        .modes
        .keys()
        .any(|key| key != MODE_KEY)
        || query
            .context
            .authoring
            .selections
            .keys()
            .any(|key| key != COUNT_FIELD)
    {
        return Err("Unknown Destroy Related Monsters authoring control.".into());
    }
    Ok(())
}

fn count_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Monsters To Destroy".into(),
        value: mode,
        choices: vec![
            choice(0, "All matching monsters"),
            choice(1, "Limit the number"),
        ],
        member_fields: vec![COUNT_FIELD.into()],
        active_fields: if mode == 1 {
            vec![COUNT_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == 2 {
            format!(
                "Imported count {imported} destroys no monsters in Classic; it is retained unchanged. Choose a supported behavior to replace it."
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
    let Some(mode) = projection
        .controls
        .iter()
        .find(|control| control.key == MODE_KEY)
        .map(|control| control.value)
    else {
        return;
    };
    let Some(field) = fields.iter_mut().find(|field| field.key == COUNT_FIELD) else {
        return;
    };
    field.special_values.clear();
    if mode == 1 {
        field.minimum = 1;
        field.maximum = 100;
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        0 => (
            "Monster Name Tag".into(),
            "Match active combatants by their stored name tag. This is not a Monster record number."
                .into(),
        ),
        1 => (
            "Maximum To Destroy".into(),
            "Destroy up to this many matching active monsters. Choose All matching monsters to use Classic's zero encoding."
                .into(),
        ),
        4 => (
            "Allied Monsters".into(),
            "Protect monsters allied to the party, or include them among matching monsters. Any imported nonzero value includes them."
                .into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
