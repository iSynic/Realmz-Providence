use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, AuthoringModeControl, DescribedActionField,
    FormChoice, FormControl,
};

const MODE_KEY: &str = "miscellaneousCheck";
const VALUE_KEY: &str = "value";

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input.selections.keys().any(|key| key != VALUE_KEY)
    {
        return Err("Unknown miscellaneous character-check authoring control.".into());
    }
    let imported = query.values.get("selector").copied().unwrap_or(0);
    let mode = input.modes.get(MODE_KEY).copied().unwrap_or(imported);
    if input.modes.contains_key(MODE_KEY) && !(0..=8).contains(&mode) {
        return Err("Character check must use one of the named properties.".into());
    }
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.resolved_values.insert("selector".into(), mode);
    if let Some(value) = input.selections.get(VALUE_KEY) {
        result.resolved_values.insert(VALUE_KEY.into(), *value);
    }
    result.controls.push(mode_control(mode));
    Ok(result)
}

fn mode_control(mode: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Check".into(),
        value: mode,
        choices: [
            "Movement maximum",
            "Party position threshold",
            "Possesses item",
            "Percent chance",
            "Failed attribute save",
            "Failed resistance save",
            "Current selected character",
            "Wears item",
            "Exact party position",
        ]
        .into_iter()
        .enumerate()
        .map(|(value, label)| choice(value as i16, label))
        .collect(),
        member_fields: vec!["selector".into(), VALUE_KEY.into()],
        active_fields: (mode != 6).then(|| VALUE_KEY.into()).into_iter().collect(),
        display: if mode == 6 {
            "Uses the character currently selected by the running game; no additional value is authored.".into()
        } else if !(0..=8).contains(&mode) {
            "This imported check mode is not understood; its stored value is retained.".into()
        } else {
            String::new()
        },
    }
}

pub(super) fn decorate(
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let mode = projection.controls[0].value;
    let Some(field) = fields.iter_mut().find(|field| field.key == VALUE_KEY) else {
        return;
    };
    field.choices.clear();
    field.special_values.clear();
    field.preview = if matches!(mode, 2 | 7) {
        field.preview.clone()
    } else {
        None
    };
    let (label, choices) = match mode {
        0 => ("Movement Maximum Below", &[][..]),
        1 => ("Party Position Before", &[][..]),
        2 => ("Item To Possess", &[][..]),
        3 => ("Chance", &[][..]),
        4 => ("Attribute Save", attribute_choices()),
        5 => ("Resistance Save", resistance_choices()),
        6 => ("Current Selected Character", &[][..]),
        7 => ("Item To Wear", &[][..]),
        8 => ("Party Position", position_choices()),
        _ => ("Imported Check Value", &[][..]),
    };
    field.label = label.into();
    if mode == 3 {
        field.minimum = 0;
        field.maximum = 100;
    }
    if !choices.is_empty() {
        field.control = FormControl::Choice;
        field.target_kind = None;
        field.choices = choices.to_vec();
    }
}

fn choice(value: i16, label: &str) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}

fn attribute_choices() -> &'static [FormChoice] {
    use std::sync::OnceLock;
    static CHOICES: OnceLock<Vec<FormChoice>> = OnceLock::new();
    CHOICES.get_or_init(|| {
        [
            (0, "Brawn"),
            (1, "Knowledge"),
            (2, "Judgment"),
            (3, "Agility"),
            (4, "Vitality"),
            (6, "Luck"),
        ]
        .into_iter()
        .map(|(value, label)| choice(value, label))
        .collect()
    })
}

fn resistance_choices() -> &'static [FormChoice] {
    use std::sync::OnceLock;
    static CHOICES: OnceLock<Vec<FormChoice>> = OnceLock::new();
    CHOICES.get_or_init(|| {
        ["Charm", "Heat", "Cold", "Electrical", "Chemical", "Mental"]
            .into_iter()
            .enumerate()
            .map(|(value, label)| choice(value as i16, label))
            .collect()
    })
}

fn position_choices() -> &'static [FormChoice] {
    use std::sync::OnceLock;
    static CHOICES: OnceLock<Vec<FormChoice>> = OnceLock::new();
    CHOICES.get_or_init(|| {
        (1..=6)
            .map(|value| choice(value, &format!("Party position {value}")))
            .collect()
    })
}
