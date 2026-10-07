use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    ActionTargetKind, AuthoringModeControl, DescribedActionField, FormChoice, FormControl,
};
use crate::codecs::ACTION_POINTS_PER_LEVEL;
use crate::model::ProjectSnapshot;

const DISABLED: i16 = 0;
const ENABLED: i16 = 1;
const IMPORTED: i16 = 2;
const MAX_ACTION_POINT: i16 = ACTION_POINTS_PER_LEVEL as i16 - 1;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_keys(query)?;
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    resolve_single(query, &mut result)?;
    resolve_range(query, &mut result)?;
    resolve_activation(query, &mut result)?;
    Ok(result)
}

fn validate_keys(query: &ActionFormDescribeQuery) -> Result<(), String> {
    let valid_mode = |key: &str| matches!(key, "singleTarget" | "landRange" | "activationState");
    let valid_selection = |key: &str| {
        matches!(
            key,
            "level" | "singleTrigger" | "percent" | "rangeStartWithSign" | "rangeEnd"
        )
    };
    if query
        .context
        .authoring
        .modes
        .keys()
        .any(|key| !valid_mode(key))
        || query
            .context
            .authoring
            .selections
            .keys()
            .any(|key| !valid_selection(key))
    {
        return Err("Unknown Change Action Point State authoring control.".into());
    }
    Ok(())
}

fn resolve_single(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let imported = value(query, "singleTrigger");
    let inferred = match imported {
        0 => DISABLED,
        1..=MAX_ACTION_POINT => ENABLED,
        _ => IMPORTED,
    };
    let explicit = query.context.authoring.modes.get("singleTarget").copied();
    let mode = explicit.unwrap_or(inferred);
    require_supported_mode(mode, explicit, "Single target")?;
    let selected = selection(query, "singleTrigger").unwrap_or(imported);
    let resolved = match mode {
        DISABLED => 0,
        ENABLED => selected,
        _ => imported,
    };
    if mode == ENABLED
        && (explicit.is_some() || selection(query, "singleTrigger").is_some())
        && !matches!(resolved, 1..=MAX_ACTION_POINT)
    {
        result.errors.push(format!(
            "Select an Action Point from 1 through {MAX_ACTION_POINT} for the single target."
        ));
    }
    result
        .resolved_values
        .insert("singleTrigger".into(), resolved);
    result.controls.push(toggle_control(
        "singleTarget",
        "Single Action Point",
        mode,
        &["singleTrigger"],
        imported,
    ));
    Ok(())
}

fn resolve_range(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let low = value(query, "rangeStartWithSign");
    let high = value(query, "rangeEnd");
    let inferred = if low == 0 && high == 0 {
        DISABLED
    } else if (1..=MAX_ACTION_POINT).contains(&low) && (low..=MAX_ACTION_POINT).contains(&high) {
        ENABLED
    } else {
        IMPORTED
    };
    let explicit = query.context.authoring.modes.get("landRange").copied();
    let mode = explicit.unwrap_or(inferred);
    require_supported_mode(mode, explicit, "Land range")?;
    let selected_low = selection(query, "rangeStartWithSign").unwrap_or(low);
    let selected_high = selection(query, "rangeEnd").unwrap_or(high);
    let (resolved_low, resolved_high) = match mode {
        DISABLED => (0, 0),
        ENABLED => (selected_low, selected_high),
        _ => (low, high),
    };
    if mode == ENABLED
        && (explicit.is_some()
            || selection(query, "rangeStartWithSign").is_some()
            || selection(query, "rangeEnd").is_some())
        && (!(1..=MAX_ACTION_POINT).contains(&resolved_low)
            || !(resolved_low..=MAX_ACTION_POINT).contains(&resolved_high))
    {
        result.errors.push(format!(
            "Select an inclusive Land Action Point range from 1 through {MAX_ACTION_POINT}."
        ));
    }
    result
        .resolved_values
        .insert("rangeStartWithSign".into(), resolved_low);
    result
        .resolved_values
        .insert("rangeEnd".into(), resolved_high);
    result.controls.push(toggle_control(
        "landRange",
        "Land Action Point Range",
        mode,
        &["rangeStartWithSign", "rangeEnd"],
        low,
    ));
    Ok(())
}

fn resolve_activation(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let imported = value(query, "percent");
    let inferred = match imported {
        i16::MIN..=-1 => DISABLED,
        0..=100 => ENABLED,
        _ => IMPORTED,
    };
    let explicit = query
        .context
        .authoring
        .modes
        .get("activationState")
        .copied();
    let mode = explicit.unwrap_or(inferred);
    require_supported_mode(mode, explicit, "Activation")?;
    let selected = selection(query, "percent").unwrap_or(imported);
    let resolved = match mode {
        DISABLED if explicit.is_some() => -1,
        DISABLED => imported,
        ENABLED => selected,
        _ => imported,
    };
    if mode == ENABLED
        && (explicit.is_some() || selection(query, "percent").is_some())
        && !(0..=100).contains(&resolved)
    {
        result
            .errors
            .push("Activation chance must be between 0 and 100 percent.".into());
    }
    result.resolved_values.insert("percent".into(), resolved);
    result.controls.push(AuthoringModeControl {
        key: "activationState".into(),
        label: "New State".into(),
        value: mode,
        choices: vec![
            choice(ENABLED, "Set activation chance"),
            choice(DISABLED, "Disable"),
        ],
        member_fields: vec!["percent".into()],
        active_fields: if mode == ENABLED {
            vec!["percent".into()]
        } else {
            Vec::new()
        },
        display: imported_display(mode, imported),
    });
    Ok(())
}

fn require_supported_mode(mode: i16, explicit: Option<i16>, label: &str) -> Result<(), String> {
    if explicit.is_some() && !matches!(mode, DISABLED | ENABLED) {
        return Err(format!("{label} must be Disabled or Enabled."));
    }
    Ok(())
}

fn toggle_control(
    key: &str,
    label: &str,
    mode: i16,
    fields: &[&str],
    imported: i16,
) -> AuthoringModeControl {
    AuthoringModeControl {
        key: key.into(),
        label: label.into(),
        value: mode,
        choices: vec![choice(DISABLED, "Do not change"), choice(ENABLED, "Change")],
        member_fields: fields.iter().map(|field| (*field).into()).collect(),
        active_fields: if matches!(mode, ENABLED | IMPORTED) {
            fields.iter().map(|field| (*field).into()).collect()
        } else {
            Vec::new()
        },
        display: imported_display(mode, imported),
    }
}

fn imported_display(mode: i16, imported: i16) -> String {
    if mode == IMPORTED {
        format!("Imported encoding {imported} is retained unchanged.")
    } else {
        String::new()
    }
}

fn value(query: &ActionFormDescribeQuery, key: &str) -> i16 {
    query.values.get(key).copied().unwrap_or(0)
}

fn selection(query: &ActionFormDescribeQuery, key: &str) -> Option<i16> {
    query.context.authoring.selections.get(key).copied()
}

fn choice(value: i16, label: &str) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}

pub(super) fn decorate(
    _snapshot: &ProjectSnapshot,
    _query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let mode = |key: &str| {
        projection
            .controls
            .iter()
            .find(|control| control.key == key)
            .map(|control| control.value)
    };
    if let Some(field) = fields.iter_mut().find(|field| field.key == "level") {
        field.label = "Target Map".into();
        field.minimum = 0;
    }
    decorate_action_point(fields, "singleTrigger", mode("singleTarget"));
    decorate_action_point(fields, "rangeStartWithSign", mode("landRange"));
    decorate_action_point(fields, "rangeEnd", mode("landRange"));
    if let Some(field) = fields.iter_mut().find(|field| field.key == "percent") {
        field.special_values.clear();
        if mode("activationState") == Some(ENABLED) {
            field.minimum = 0;
            field.maximum = 100;
        }
    }
}

fn decorate_action_point(fields: &mut [DescribedActionField], key: &str, mode: Option<i16>) {
    let Some(field) = fields.iter_mut().find(|field| field.key == key) else {
        return;
    };
    field.minimum = 1;
    field.maximum = MAX_ACTION_POINT;
    field.special_values.clear();
    if mode == Some(ENABLED) {
        field.control = FormControl::Target;
        field.target_kind = Some(ActionTargetKind::SameMapActionPoint);
    } else if mode == Some(IMPORTED) {
        field.control = FormControl::Integer;
        field.target_kind = None;
        field.preview = None;
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        0 => (
            "Target Map".into(),
            "Map containing the Action Points whose activation chance will change.".into(),
        ),
        1 => (
            "Single Action Point".into(),
            "Optional individual Action Point on the target map.".into(),
        ),
        2 => (
            "Activation Chance".into(),
            "New chance from 0 through 100 percent, or choose Disable.".into(),
        ),
        3 => (
            "Range Start".into(),
            "First Action Point in the inclusive land-map range.".into(),
        ),
        4 => (
            "Range End".into(),
            "Last Action Point in the inclusive land-map range.".into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
