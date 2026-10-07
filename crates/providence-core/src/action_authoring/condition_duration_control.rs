use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const MODE_KEY: &str = "conditionDuration";
const MAGNITUDE_FIELD: &str = "durationOrDelta";

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != MAGNITUDE_FIELD)
    {
        return Err("Unknown Give Condition authoring control.".into());
    }
    let imported = query.values.get(MAGNITUDE_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, 0 | 1)) {
        return Err("Condition duration must be Timed or Permanent.".into());
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
    result.controls.push(duration_control(mode, imported));

    let selected = input
        .selections
        .get(MAGNITUDE_FIELD)
        .copied()
        .or_else(|| (imported != i16::MIN).then(|| imported.abs()));
    let resolved = match (
        explicit_mode,
        input.selections.get(MAGNITUDE_FIELD),
        selected,
    ) {
        (None, None, _) => imported,
        (_, _, Some(value)) if mode == 0 => value,
        (_, _, Some(value)) if mode == 1 => value.checked_neg().unwrap_or(value),
        _ => imported,
    };
    if explicit_mode.is_some() || input.selections.contains_key(MAGNITUDE_FIELD) {
        let value = selected.unwrap_or(0);
        if !(1..=i16::MAX).contains(&value) {
            result.errors.push(format!(
                "Condition magnitude must be between 1 and {}.",
                i16::MAX
            ));
        }
    }
    result
        .resolved_values
        .insert(MAGNITUDE_FIELD.into(), resolved);
    Ok(result)
}

fn duration_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Condition Duration".into(),
        value: mode,
        choices: vec![choice(0, "Timed"), choice(1, "Permanent")],
        member_fields: vec![MAGNITUDE_FIELD.into()],
        active_fields: if matches!(mode, 0 | 1) {
            vec![MAGNITUDE_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == 2 {
            format!(
                "Imported magnitude {imported} has no safe Timed/Permanent representation; it is retained unchanged."
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
    let Some(field) = fields.iter_mut().find(|field| field.key == MAGNITUDE_FIELD) else {
        return;
    };
    field.special_values.clear();
    if !matches!(mode, 0 | 1) {
        return;
    }
    field.minimum = 1;
    field.maximum = i16::MAX;
    if field.value != i16::MIN {
        field.value = field.value.abs();
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        2 => (
            "Magnitude".into(),
            "Timed conditions count down from this magnitude. Permanent conditions retain this magnitude and Classic stores it as a negative value."
                .into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
