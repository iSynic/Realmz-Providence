use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, AuthoringModeControl, DescribedActionField,
    FormChoice,
};

const MODE_KEY: &str = "pickEligibility";
const COUNT_FIELD: &str = "targetNativeId";
const ALL_MODE: i16 = 0;
const CONSCIOUS_MODE: i16 = 1;
const IMPORTED_MODE: i16 = 2;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != COUNT_FIELD)
    {
        return Err("Unknown Pick Characters authoring control.".into());
    }
    let imported = query.target_native_id;
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, 0 | 1)) {
        return Err(
            "Eligible Characters must include all party members or only conscious or animated members."
                .into(),
        );
    }
    let mode = explicit_mode.unwrap_or(if imported > 0 {
        ALL_MODE
    } else if imported < 0 && imported != i16::MIN {
        CONSCIOUS_MODE
    } else {
        IMPORTED_MODE
    });
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(eligibility_control(mode, imported));

    let selected = input
        .selections
        .get(COUNT_FIELD)
        .copied()
        .or_else(|| (imported != 0 && imported != i16::MIN).then(|| imported.abs()));
    let resolved = match (explicit_mode, input.selections.get(COUNT_FIELD), selected) {
        (None, None, _) => imported,
        (_, _, Some(value)) if mode == ALL_MODE => value,
        (_, _, Some(value)) if mode == CONSCIOUS_MODE => value.checked_neg().unwrap_or(value),
        _ => imported,
    };
    if (explicit_mode.is_some() || input.selections.contains_key(COUNT_FIELD))
        && !matches!(selected, Some(1..=6))
    {
        result
            .errors
            .push("Number of characters to pick must be between 1 and 6.".into());
    }
    result.resolved_values.insert(COUNT_FIELD.into(), resolved);
    Ok(result)
}

fn eligibility_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Eligible Characters".into(),
        value: mode,
        choices: vec![
            choice(ALL_MODE, "Any party member"),
            choice(CONSCIOUS_MODE, "Conscious or animated only"),
        ],
        member_fields: vec![COUNT_FIELD.into()],
        active_fields: if matches!(mode, ALL_MODE | CONSCIOUS_MODE) {
            vec![COUNT_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == IMPORTED_MODE {
            format!(
                "Imported character count {imported} cannot be represented by the supported authoring choices; it is retained unchanged."
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
    if !matches!(mode, ALL_MODE | CONSCIOUS_MODE) {
        return;
    }
    field.label = "Number To Pick".into();
    field.explanation = "Maximum number of characters the player may select.".into();
    field.minimum = 1;
    field.maximum = 6;
    if field.value != i16::MIN {
        field.value = field.value.abs();
    }
}
