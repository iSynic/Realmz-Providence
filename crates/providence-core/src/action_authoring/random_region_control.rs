use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const MODE_KEY: &str = "encounterFrequency";
const CHANCE_FIELD: &str = "percent";
const CHANCE_MODE: i16 = 0;
const DISABLED_MODE: i16 = 1;
const INVISIBLE_MODE: i16 = 2;
const IMPORTED_MODE: i16 = 3;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != CHANCE_FIELD)
    {
        return Err("Unknown Random Encounter authoring control.".into());
    }
    let imported = query.values.get(CHANCE_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, 0..=2)) {
        return Err(
            "Random Encounters must use an encounter chance, be disabled, or be invisible.".into(),
        );
    }
    let mode = explicit_mode.unwrap_or(match imported {
        1.. => CHANCE_MODE,
        0 => DISABLED_MODE,
        -1 => INVISIBLE_MODE,
        _ => IMPORTED_MODE,
    });
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(frequency_control(mode, imported));

    let selected = input
        .selections
        .get(CHANCE_FIELD)
        .copied()
        .or_else(|| (imported > 0).then_some(imported));
    let resolved = match (explicit_mode, input.selections.get(CHANCE_FIELD), selected) {
        (None, None, _) => imported,
        (_, _, Some(value)) if mode == CHANCE_MODE => value,
        (_, _, _) if mode == DISABLED_MODE => 0,
        (_, _, _) if mode == INVISIBLE_MODE => -1,
        _ => imported,
    };
    if mode == CHANCE_MODE
        && (explicit_mode.is_some() || input.selections.contains_key(CHANCE_FIELD))
        && !matches!(selected, Some(1..=10_000))
    {
        result
            .errors
            .push("Encounter chance must be between 1 and 10,000.".into());
    }
    result.resolved_values.insert(CHANCE_FIELD.into(), resolved);
    Ok(result)
}

fn frequency_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Random Encounters".into(),
        value: mode,
        choices: vec![
            choice(CHANCE_MODE, "Use encounter chance"),
            choice(DISABLED_MODE, "Disable encounters"),
            choice(INVISIBLE_MODE, "Invisible encounter"),
        ],
        member_fields: vec![CHANCE_FIELD.into()],
        active_fields: if mode == CHANCE_MODE {
            vec![CHANCE_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == IMPORTED_MODE {
            format!(
                "Imported encounter value {imported} is not a canonical authoring choice; it is retained unchanged."
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
    let Some(field) = fields.iter_mut().find(|field| field.key == CHANCE_FIELD) else {
        return;
    };
    field.special_values.clear();
    if mode == CHANCE_MODE {
        field.minimum = 1;
        field.maximum = 10_000;
    }
}

pub(super) fn field_presentation(
    opcode: i16,
    field: &ActionSemanticInventoryField,
) -> (String, String) {
    match field.index {
        0 => (
            if opcode < 0 {
                "Dungeon Level".into()
            } else {
                "Land Level".into()
            },
            "Level containing the random-encounter rectangle to change.".into(),
        ),
        1 => (
            "Random Rectangle".into(),
            "Random-encounter rectangle within the selected level.".into(),
        ),
        2 => (
            "Encounter Chance".into(),
            "Number of random-encounter chances in 10,000 when chance mode is selected.".into(),
        ),
        3 => (
            "Battle Range Low".into(),
            "New low battle number; Keep current preserves the rectangle's existing value.".into(),
        ),
        4 => (
            "Battle Range High".into(),
            "New high battle number; Keep current preserves the rectangle's existing value.".into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
