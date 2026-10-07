use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const MODE_KEY: &str = "paymentCurrency";
const AMOUNT_FIELD: &str = "signedAmount";

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != AMOUNT_FIELD)
    {
        return Err("Unknown Take Gold Or Gems authoring control.".into());
    }
    let imported = query.values.get(AMOUNT_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(MODE_KEY).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, 0 | 1)) {
        return Err("Payment currency must be Gold or Gems.".into());
    }
    let mode = explicit_mode.unwrap_or_else(|| {
        if imported == i16::MIN {
            2
        } else {
            i16::from(imported <= 0)
        }
    });
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(currency_control(mode, imported));

    let selected = input
        .selections
        .get(AMOUNT_FIELD)
        .copied()
        .or_else(|| (imported != i16::MIN).then(|| imported.abs()));
    let resolved = match (explicit_mode, input.selections.get(AMOUNT_FIELD), selected) {
        (None, None, _) => imported,
        (_, _, Some(value)) if mode == 0 => value,
        (_, _, Some(value)) if mode == 1 => value.checked_neg().unwrap_or(value),
        _ => imported,
    };
    if explicit_mode.is_some() || input.selections.contains_key(AMOUNT_FIELD) {
        let value = selected.unwrap_or(0);
        if !(1..=i16::MAX).contains(&value) {
            result.errors.push(format!(
                "Payment amount must be between 1 and {}.",
                i16::MAX
            ));
        }
    }
    result.resolved_values.insert(AMOUNT_FIELD.into(), resolved);
    Ok(result)
}

fn currency_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Payment Currency".into(),
        value: mode,
        choices: vec![choice(0, "Gold"), choice(1, "Gems")],
        member_fields: vec![AMOUNT_FIELD.into()],
        active_fields: if matches!(mode, 0 | 1) {
            vec![AMOUNT_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == 2 {
            format!(
                "Imported amount {imported} cannot be represented as a positive payment amount; it is retained unchanged."
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
    let Some(field) = fields.iter_mut().find(|field| field.key == AMOUNT_FIELD) else {
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
        0 => (
            "Payment Amount".into(),
            "Amount the party must pay in the selected currency.".into(),
        ),
        1 => (
            "Branch When".into(),
            "Choose whether successful or failed payment branches. Skip to final step on failure continues at the eighth code."
                .into(),
        ),
        3 => (
            "Destination".into(),
            "Used only when the behavior branches. Extra Action Point mode loads a script; encounter modes select a branch in the already loaded encounter."
                .into(),
        ),
        4 => (
            "Code Position".into(),
            "For an in-encounter branch, choose its result-program slot; zero selects the top Code/ID."
                .into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
