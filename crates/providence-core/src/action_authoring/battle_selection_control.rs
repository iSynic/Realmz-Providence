use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionTargetKind, AuthoringModeControl,
    DescribedActionField, FormChoice, FormControl,
};

const MODE_KEY: &str = "battleSelection";
const HIGH_FIELD: &str = "battleHigh";
const SINGLE_MODE: i16 = 0;
const RANGE_MODE: i16 = 1;
const IMPORTED_MODE: i16 = 2;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != HIGH_FIELD)
    {
        return Err("Unknown Battle selection authoring control.".into());
    }
    let imported = query.values.get(HIGH_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, SINGLE_MODE | RANGE_MODE)) {
        return Err("Battle Selection must be Single battle or Random range.".into());
    }
    let mode = explicit_mode.unwrap_or(if imported == 0 {
        SINGLE_MODE
    } else if imported > 0 {
        RANGE_MODE
    } else {
        IMPORTED_MODE
    });
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(selection_control(mode, imported));

    let selected = input
        .selections
        .get(HIGH_FIELD)
        .copied()
        .unwrap_or(imported);
    let resolved = match mode {
        SINGLE_MODE => 0,
        RANGE_MODE => selected,
        _ => imported,
    };
    if explicit_mode == Some(RANGE_MODE) && selected <= 0 {
        result
            .errors
            .push("Select a positive high Battle for the random range.".into());
    }
    result.resolved_values.insert(HIGH_FIELD.into(), resolved);
    Ok(result)
}

fn selection_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Battle Selection".into(),
        value: mode,
        choices: vec![
            choice(SINGLE_MODE, "Single battle"),
            choice(RANGE_MODE, "Random range"),
        ],
        member_fields: vec![HIGH_FIELD.into()],
        active_fields: if mode == RANGE_MODE {
            vec![HIGH_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == IMPORTED_MODE {
            format!(
                "Imported high Battle {imported} is not a supported range endpoint; it is retained unchanged."
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
    let Some(field) = fields.iter_mut().find(|field| field.key == HIGH_FIELD) else {
        return;
    };
    field.special_values.clear();
    if mode != RANGE_MODE {
        return;
    }
    field.label = "High Battle".into();
    field.explanation = "Inclusive high endpoint of the random Battle range.".into();
    field.control = FormControl::Target;
    field.target_kind = Some(ActionTargetKind::Battle);
    field.minimum = 1;
    field.maximum = i16::MAX;
    field.editable = true;
    field.availability_reason = projection.errors.first().cloned();
}
