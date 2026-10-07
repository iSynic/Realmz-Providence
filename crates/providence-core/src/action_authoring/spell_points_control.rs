use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};
use std::collections::BTreeMap;

const MODE_KEY: &str = "spellPointDirection";
const MULTIPLIER_FIELD: &str = "signedRollCount";

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != MULTIPLIER_FIELD)
    {
        return Err("Unknown Change Spell Points authoring control.".into());
    }

    let imported = query.values.get(MULTIPLIER_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, 0 | 1)) {
        return Err("Spell-point direction must be Give or Take.".into());
    }
    let mode = explicit_mode.unwrap_or_else(|| {
        if imported == i16::MIN {
            2
        } else {
            i16::from(imported < 0)
        }
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
        (_, _, Some(value)) if mode == 0 => value,
        (_, _, Some(value)) if mode == 1 => value.checked_neg().unwrap_or(value),
        _ => imported,
    };
    if explicit_mode.is_some() || input.selections.contains_key(MULTIPLIER_FIELD) {
        let minimum = if mode == 1 { 1 } else { 0 };
        let value = selected.unwrap_or(-1);
        if !(minimum..=i16::MAX).contains(&value) {
            result.errors.push(format!(
                "Spell-point multiplier must be between {minimum} and {}.",
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
        label: "Spell Point Change".into(),
        value: mode,
        choices: vec![
            choice(0, "Give spell points"),
            choice(1, "Take spell points"),
        ],
        member_fields: vec![MULTIPLIER_FIELD.into()],
        active_fields: if matches!(mode, 0 | 1) {
            vec![MULTIPLIER_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == 2 {
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
        0 => field.minimum = 0,
        1 => field.minimum = 1,
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
            "Multiplier".into(),
            if values
                .get(MULTIPLIER_FIELD)
                .is_some_and(|value| *value < 0)
            {
                "Take the resulting spell points from each picked spellcaster. Classic stores this direction as a negative multiplier."
                    .into()
            } else {
                "Give the resulting spell points to each picked spellcaster.".into()
            },
        ),
        1 => (
            "Random Range Low / Optional Sound".into(),
            "Low endpoint of the spell-point calculation. When Play Sound is enabled, the same stored number also selects the sound."
                .into(),
        ),
        2 => (
            "Random Range High".into(),
            "High endpoint of the spell-point calculation.".into(),
        ),
        3 => (
            "Play Sound".into(),
            "Zero disables sound. Any nonzero value plays the sound selected by Random Range Low / Optional Sound."
                .into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
