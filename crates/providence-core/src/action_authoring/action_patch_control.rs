use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionTargetKind, AuthoringModeControl,
    DescribedActionField, FormChoice, FormControl,
};

const ACTION_POINT: i16 = 0;
const SIMPLE_ENCOUNTER: i16 = 1;
const COMPLEX_ENCOUNTER: i16 = 2;
const IMPORTED: i16 = 3;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    resolve_valid_input(query)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    if query
        .context
        .authoring
        .modes
        .keys()
        .any(|key| key != "patchTargetKind")
        || query
            .context
            .authoring
            .selections
            .keys()
            .any(|key| key != "levelOrCache")
    {
        return Err("Unknown Action Code Replacement authoring control.".into());
    }
    Ok(())
}

fn resolve_valid_input(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let imported = query.values.get("levelOrCache").copied().unwrap_or(0);
    let inferred = match imported {
        -1 => SIMPLE_ENCOUNTER,
        -2 => COMPLEX_ENCOUNTER,
        0.. => ACTION_POINT,
        _ => IMPORTED,
    };
    let mode = query
        .context
        .authoring
        .modes
        .get("patchTargetKind")
        .copied()
        .unwrap_or(inferred);
    if query
        .context
        .authoring
        .modes
        .contains_key("patchTargetKind")
        && !matches!(mode, ACTION_POINT | SIMPLE_ENCOUNTER | COMPLEX_ENCOUNTER)
    {
        return Err("Replacement target must be an Action Point, Simple Encounter result, or Complex Encounter result.".into());
    }
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    let selected_level = query
        .context
        .authoring
        .selections
        .get("levelOrCache")
        .copied()
        .unwrap_or(if imported >= 0 { imported } else { 0 });
    let resolved = match mode {
        ACTION_POINT => selected_level,
        SIMPLE_ENCOUNTER => -1,
        COMPLEX_ENCOUNTER => -2,
        _ => imported,
    };
    result
        .resolved_values
        .insert("levelOrCache".into(), resolved);
    result.controls.push(target_kind_control(mode, imported));
    Ok(result)
}

fn target_kind_control(mode: i16, imported: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: "patchTargetKind".into(),
        label: "Replace Codes In".into(),
        value: mode,
        choices: vec![
            choice(ACTION_POINT, "Action Point"),
            choice(SIMPLE_ENCOUNTER, "Simple Encounter result"),
            choice(COMPLEX_ENCOUNTER, "Complex Encounter result"),
        ],
        member_fields: vec!["levelOrCache".into()],
        active_fields: if matches!(mode, ACTION_POINT | IMPORTED) {
            vec!["levelOrCache".into()]
        } else {
            vec![]
        },
        display: if mode == IMPORTED {
            format!("Imported target encoding {imported} is unsupported and remains unchanged.")
        } else {
            String::new()
        },
    }
}

pub(super) fn decorate(
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let mode = projection
        .controls
        .iter()
        .find(|control| control.key == "patchTargetKind")
        .map(|control| control.value);
    let Some(field) = fields.iter_mut().find(|field| field.key == "levelOrCache") else {
        return;
    };
    if mode == Some(ACTION_POINT) {
        field.label = "Target Map".into();
        field.explanation =
            "Map containing the Action Point whose eight CODE/ID slots will be replaced.".into();
        field.control = FormControl::Target;
        field.target_kind = Some(ActionTargetKind::Map);
        field.minimum = 0;
        field.editable = true;
    } else if mode == Some(IMPORTED) {
        field.control = FormControl::Integer;
        field.target_kind = None;
    }
}

fn choice(value: i16, label: &str) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}
