use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};
use std::collections::BTreeMap;

const MODE_KEY: &str = "staminaDirection";
const MULTIPLIER_FIELD: &str = "multiplier";
const HEAL: i16 = 0;
const DAMAGE: i16 = 1;
const IMPORTED: i16 = 2;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != MULTIPLIER_FIELD)
    {
        return Err("Unknown stamina-change authoring control.".into());
    }
    let imported = query.values.get(MULTIPLIER_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, HEAL | DAMAGE)) {
        return Err("Stamina change must Heal or Damage.".into());
    }
    let mode = explicit_mode.unwrap_or(if imported == i16::MIN {
        IMPORTED
    } else if imported < 0 {
        DAMAGE
    } else {
        HEAL
    });
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(direction_control(mode, imported));

    let selected = input
        .selections
        .get(MULTIPLIER_FIELD)
        .copied()
        .or_else(|| (imported != i16::MIN).then(|| imported.abs()));
    let resolved = match (
        explicit_mode,
        input.selections.get(MULTIPLIER_FIELD),
        selected,
    ) {
        (None, None, _) => imported,
        (_, _, Some(value)) if mode == HEAL => value,
        (_, _, Some(value)) if mode == DAMAGE => value.checked_neg().unwrap_or(value),
        _ => imported,
    };
    if explicit_mode.is_some() || input.selections.contains_key(MULTIPLIER_FIELD) {
        let minimum = if mode == DAMAGE { 1 } else { 0 };
        let value = selected.unwrap_or(-1);
        if !(minimum..=i16::MAX).contains(&value) {
            result.errors.push(format!(
                "Stamina multiplier must be between {minimum} and {}.",
                i16::MAX
            ));
        }
    }
    result
        .resolved_values
        .insert(MULTIPLIER_FIELD.into(), resolved);
    Ok(result)
}

fn direction_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Stamina Change".into(),
        value: mode,
        choices: vec![
            choice(HEAL, "Heal stamina"),
            choice(DAMAGE, "Damage stamina"),
        ],
        member_fields: vec![MULTIPLIER_FIELD.into()],
        active_fields: if matches!(mode, HEAL | DAMAGE) {
            vec![MULTIPLIER_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == IMPORTED {
            format!(
                "Imported multiplier {imported} cannot be represented as a positive magnitude; it is retained unchanged."
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
    let Some(field) = fields
        .iter_mut()
        .find(|field| field.key == MULTIPLIER_FIELD)
    else {
        return;
    };
    field.special_values.clear();
    match mode {
        HEAL => field.minimum = 0,
        DAMAGE => field.minimum = 1,
        _ => return,
    }
    field.maximum = i16::MAX;
    if field.value != i16::MIN {
        field.value = field.value.abs();
    }
}

pub(super) fn field_presentation(
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
) -> (String, String) {
    match field.index {
        0 => (
            "Roll Multiplier".into(),
            if values.get(MULTIPLIER_FIELD).is_some_and(|value| *value < 0) {
                "Multiply the random roll by this magnitude and damage the selected characters. Classic stores damage as a negative multiplier."
                    .into()
            } else {
                "Multiply the random roll by this magnitude and heal the selected characters."
                    .into()
            },
        ),
        1 => (
            "Roll Range Low".into(),
            "Low end of the random stamina-change roll.".into(),
        ),
        2 => (
            "Roll Range High".into(),
            "High end of the random stamina-change roll.".into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
