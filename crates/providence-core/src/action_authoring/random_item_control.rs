use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const COUNT_FIELD: &str = "countOrRandomLimit";

#[derive(Clone, Copy)]
struct CountConfig {
    mode_key: &'static str,
    control_label: &'static str,
    fixed_error: &'static str,
    maximum: i16,
}

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let config = config(query)?;
    validate_input(query, config)?;
    let input = &query.context.authoring;
    let imported = query.values.get(COUNT_FIELD).copied().unwrap_or(0);
    let explicit_mode = input.modes.get(config.mode_key).copied();
    if explicit_mode.is_some_and(|mode| !matches!(mode, 0 | 1)) {
        return Err(format!("{} must be fixed or random.", config.control_label));
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
    result.controls.push(count_control(config, mode, imported));

    let selected = input
        .selections
        .get(COUNT_FIELD)
        .copied()
        .or_else(|| (imported != i16::MIN).then(|| imported.abs()));
    let resolved = match (explicit_mode, input.selections.get(COUNT_FIELD), selected) {
        (None, None, _) => imported,
        (_, _, Some(value)) if mode == 0 => value,
        (_, _, Some(value)) if mode == 1 => value.checked_neg().unwrap_or(value),
        _ => imported,
    };
    if explicit_mode.is_some() || input.selections.contains_key(COUNT_FIELD) {
        let minimum = if mode == 1 { 1 } else { 0 };
        let value = selected.unwrap_or(-1);
        if !(minimum..=config.maximum).contains(&value) {
            result.errors.push(format!(
                "{} must be between {minimum} and {}.",
                if mode == 1 {
                    "Random maximum"
                } else {
                    config.fixed_error
                },
                config.maximum
            ));
        }
    }
    result.resolved_values.insert(COUNT_FIELD.into(), resolved);
    Ok(result)
}

fn config(query: &ActionFormDescribeQuery) -> Result<CountConfig, String> {
    match query.action_identity.as_str() {
        "realmz.action.65" => Ok(CountConfig {
            mode_key: "itemCountMode",
            control_label: "Item Count",
            fixed_error: "Fixed item count",
            maximum: 20,
        }),
        "realmz.action.124" => Ok(CountConfig {
            mode_key: "spawnCountMode",
            control_label: "Spawn Count",
            fixed_error: "Fixed spawn count",
            maximum: 100,
        }),
        _ => Err("This action has no signed random-count control.".into()),
    }
}

fn validate_input(query: &ActionFormDescribeQuery, config: CountConfig) -> Result<(), String> {
    if query
        .context
        .authoring
        .modes
        .keys()
        .any(|key| key != config.mode_key)
        || query
            .context
            .authoring
            .selections
            .keys()
            .any(|key| key != COUNT_FIELD)
    {
        return Err(format!(
            "Unknown {} authoring control.",
            query.action_identity
        ));
    }
    Ok(())
}

fn count_control(config: CountConfig, mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: config.mode_key.into(),
        label: config.control_label.into(),
        value: mode,
        choices: vec![choice(0, "Fixed count"), choice(1, "Random count")],
        member_fields: vec![COUNT_FIELD.into()],
        active_fields: if matches!(mode, 0 | 1) {
            vec![COUNT_FIELD.into()]
        } else {
            vec![]
        },
        display: if mode == 2 {
            format!(
                "Imported count {imported} cannot be safely converted to a positive random maximum; it is retained unchanged."
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
    action_identity: &str,
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let maximum = if action_identity == "realmz.action.124" {
        100
    } else {
        20
    };
    let Some(mode) = projection
        .controls
        .iter()
        .find(|control| matches!(control.key.as_str(), "itemCountMode" | "spawnCountMode"))
        .map(|control| control.value)
    else {
        return;
    };
    let Some(field) = fields.iter_mut().find(|field| field.key == COUNT_FIELD) else {
        return;
    };
    field.special_values.clear();
    field.maximum = maximum;
    match mode {
        0 => field.minimum = 0,
        1 => {
            field.minimum = 1;
            if field.value != i16::MIN {
                field.value = field.value.abs();
            }
        }
        _ => {}
    }
}

pub(super) fn field_presentation(
    opcode: i16,
    field: &ActionSemanticInventoryField,
    values: &std::collections::BTreeMap<String, i16>,
) -> (String, String) {
    let count_index = if opcode == 124 { 2 } else { 0 };
    match field.index {
        index if index == count_index && values.get(COUNT_FIELD).is_some_and(|value| *value < 0) => (
            "Random Maximum".into(),
            format!("{} a random count from 1 through this maximum. Classic stores this choice as a negative number.", if opcode == 124 { "Spawn" } else { "Award" }),
        ),
        index if index == count_index => (
            "Fixed Count".into(),
            if opcode == 124 {
                "Spawn exactly this many monsters, up to Classic's 100-combatant limit.".into()
            } else {
                "Award exactly this many items. The Classic award buffer holds at most 20 items."
                    .into()
            },
        ),
        1 if opcode == 65 => (
            "Item Range Low".into(),
            "Choose the low endpoint of the item range used for each award.".into(),
        ),
        2 if opcode == 65 => (
            "Item Range High".into(),
            "Choose the high endpoint of the item range used for each award.".into(),
        ),
        1 if opcode == 124 => (
            "Monster To Spawn".into(),
            "Choose the Monster record copied into each new combatant.".into(),
        ),
        3 if opcode == 124 => (
            "Spawn Sound".into(),
            "Optional sound played once for each successfully placed monster.".into(),
        ),
        4 if opcode == 124 => (
            "Spawn Allegiance".into(),
            "Use the calling quest or monster side when available, keep the monster record's authored side in a battle macro, or explicitly force the enemy side."
                .into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
