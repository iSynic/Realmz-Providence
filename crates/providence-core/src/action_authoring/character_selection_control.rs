use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionTargetKind, AuthoringModeControl,
    DescribedActionField, FormChoice, FormControl,
};
use crate::model::ProjectSnapshot;

const PROPERTY_KEY: &str = "characterProperty";
const VALUE_KEY: &str = "raceCasteOrClass";

pub(super) fn resolve(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != PROPERTY_KEY)
        || input
            .selections
            .keys()
            .any(|key| !matches!(key.as_str(), "gender" | VALUE_KEY))
    {
        return Err("Unknown character-selection authoring control.".into());
    }
    let imported = query.values.get("selector").copied().unwrap_or(0);
    let mode = input.modes.get(PROPERTY_KEY).copied().unwrap_or(imported);
    if input.modes.contains_key(PROPERTY_KEY) && !(0..=4).contains(&mode) {
        return Err("Property must be Race, Gender, Caste, Race class, or Caste class.".into());
    }
    let active = match mode {
        1 => Some("gender"),
        0 | 2..=4 => Some(VALUE_KEY),
        _ => None,
    };
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.resolved_values.insert("selector".into(), mode);
    if let Some(key) = active
        && let Some(value) = input.selections.get(key)
    {
        result.resolved_values.insert(key.into(), *value);
    }
    if (!input.modes.is_empty() || !input.selections.is_empty())
        && let Some(error) = selection_error(snapshot, mode, &result.resolved_values)
    {
        result.errors.push(error);
    }
    result.controls.push(property_control(mode, active));
    Ok(result)
}

fn selection_error(
    snapshot: &ProjectSnapshot,
    mode: i16,
    values: &std::collections::BTreeMap<String, i16>,
) -> Option<String> {
    let value = values
        .get(if mode == 1 { "gender" } else { VALUE_KEY })
        .copied()
        .unwrap_or(0);
    let valid = match mode {
        0 => super::target_preview(snapshot, ActionTargetKind::Race, value, &Default::default())
            .is_some(),
        1 => matches!(value, 1 | 2),
        2 => super::target_preview(
            snapshot,
            ActionTargetKind::Caste,
            value,
            &Default::default(),
        )
        .is_some(),
        3 => (1..=9).contains(&value),
        4 => (1..=7).contains(&value),
        _ => return None,
    };
    (!valid).then(|| {
        format!(
            "Select a valid {} before applying.",
            match mode {
                0 => "race",
                1 => "gender",
                2 => "caste",
                3 => "race class",
                4 => "caste class",
                _ => unreachable!(),
            }
        )
    })
}

fn property_control(mode: i16, active: Option<&str>) -> AuthoringModeControl {
    AuthoringModeControl {
        key: PROPERTY_KEY.into(),
        label: "Property".into(),
        value: mode,
        choices: vec![
            choice(0, "Race"),
            choice(1, "Gender"),
            choice(2, "Caste"),
            choice(3, "Race class"),
            choice(4, "Caste class"),
        ],
        member_fields: vec!["selector".into(), "gender".into(), VALUE_KEY.into()],
        active_fields: active.into_iter().map(str::to_owned).collect(),
        display: if active.is_none() {
            "This imported property mode is not understood; its stored values are retained.".into()
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
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let mode = projection.controls[0].value;
    let Some(field) = fields.iter_mut().find(|field| field.key == VALUE_KEY) else {
        return;
    };
    field.special_values.clear();
    match mode {
        0 => set_target(
            snapshot,
            query,
            projection,
            field,
            ActionTargetKind::Race,
            "Race",
        ),
        2 => set_target(
            snapshot,
            query,
            projection,
            field,
            ActionTargetKind::Caste,
            "Caste",
        ),
        3 => set_choices(projection, field, "Race Class", race_classes()),
        4 => set_choices(projection, field, "Caste Class", caste_classes()),
        _ => {}
    }
}

fn set_target(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    field: &mut DescribedActionField,
    kind: ActionTargetKind,
    label: &str,
) {
    field.label = label.into();
    field.control = FormControl::Target;
    field.target_kind = Some(kind);
    field.choices.clear();
    field.editable = true;
    field.availability_reason = projection.errors.first().cloned();
    field.preview = if field.availability_reason.is_none() {
        super::form_description::preview(snapshot, None, query, kind, field.value)
    } else {
        None
    };
}

fn set_choices(
    projection: &ActionAuthoringProjection,
    field: &mut DescribedActionField,
    label: &str,
    choices: Vec<FormChoice>,
) {
    field.label = label.into();
    field.control = FormControl::Choice;
    field.target_kind = None;
    field.preview = None;
    field.choices = choices;
    field.editable = true;
    field.availability_reason = projection.errors.first().cloned();
}

fn race_classes() -> Vec<FormChoice> {
    [
        "Short Race",
        "Elvish",
        "Half Breed",
        "Goblinoid",
        "Reptilian",
        "Nether Worldly",
        "Goodly Race",
        "Neutral Race",
        "Evil Race",
    ]
    .into_iter()
    .enumerate()
    .map(|(index, label)| choice(index as i16 + 1, label))
    .collect()
}

fn caste_classes() -> Vec<FormChoice> {
    [
        "Warrior",
        "Rogue",
        "Archer",
        "Sorcerer",
        "Priest",
        "Enchanter",
        "Warrior / Wizard",
    ]
    .into_iter()
    .enumerate()
    .map(|(index, label)| choice(index as i16 + 1, label))
    .collect()
}
