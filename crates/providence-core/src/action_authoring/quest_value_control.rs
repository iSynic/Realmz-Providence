use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    AuthoringModeControl, DescribedActionField, FormChoice,
};

const MODE_KEY: &str = "autoBranch";
const DISABLED: i16 = 0;
const ENABLED: i16 = 1;
const IMPORTED: i16 = 2;
const BRANCH_FIELDS: [&str; 3] = ["branchMode", "threshold", "target"];

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    let input = &query.context.authoring;
    let imported_threshold = value(query, "threshold");
    let imported_mode = value(query, "branchMode");
    let imported_target = value(query, "target");
    let explicit = input.modes.get(MODE_KEY).copied();
    if explicit.is_some_and(|mode| !matches!(mode, DISABLED | ENABLED)) {
        return Err("Auto branch must be Disabled or Branch at threshold.".into());
    }
    let imported_supported = valid_threshold(imported_threshold)
        && matches!(imported_mode, 1..=3)
        && imported_target >= 0;
    let mode = explicit.unwrap_or(if imported_threshold == 0 {
        DISABLED
    } else if imported_supported {
        ENABLED
    } else {
        IMPORTED
    });
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    result.controls.push(branch_control(
        mode,
        [imported_mode, imported_threshold, imported_target],
    ));
    if mode == DISABLED {
        result.resolved_values.insert("threshold".into(), 0);
        return Ok(result);
    }
    if mode == IMPORTED {
        return Ok(result);
    }
    for key in BRANCH_FIELDS {
        let selected = input
            .selections
            .get(key)
            .copied()
            .unwrap_or_else(|| value(query, key));
        result.resolved_values.insert(key.into(), selected);
    }
    validate_enabled(&mut result);
    Ok(result)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != MODE_KEY)
        || input
            .selections
            .keys()
            .any(|key| !BRANCH_FIELDS.contains(&key.as_str()))
    {
        return Err("Unknown Set Quest Value authoring control.".into());
    }
    Ok(())
}

fn validate_enabled(result: &mut ActionAuthoringProjection) {
    let threshold = result.resolved_values["threshold"];
    if !valid_threshold(threshold) {
        result
            .errors
            .push("Auto-branch threshold must be -127 through -1 or 1 through 127.".into());
    }
    if !matches!(result.resolved_values["branchMode"], 1..=3) {
        result.errors.push(
            "Choose Extra Action Point, Simple Encounter, or Complex Encounter for the auto branch."
                .into(),
        );
    }
    if result.resolved_values["target"] < 0 {
        result
            .errors
            .push("Choose a nonnegative auto-branch destination.".into());
    }
}

fn valid_threshold(value: i16) -> bool {
    (-127..=-1).contains(&value) || (1..=127).contains(&value)
}

fn value(query: &ActionFormDescribeQuery, key: &str) -> i16 {
    query.values.get(key).copied().unwrap_or(0)
}

fn branch_control(mode: i16, imported: [i16; 3]) -> AuthoringModeControl {
    AuthoringModeControl {
        key: MODE_KEY.into(),
        label: "Auto Branch".into(),
        value: mode,
        choices: vec![
            choice(DISABLED, "Disabled"),
            choice(ENABLED, "Branch at threshold"),
        ],
        member_fields: BRANCH_FIELDS.iter().map(|field| (*field).into()).collect(),
        active_fields: if mode == ENABLED {
            BRANCH_FIELDS.iter().map(|field| (*field).into()).collect()
        } else {
            vec![]
        },
        display: if mode == IMPORTED {
            format!(
                "Imported auto branch [{},{},{}] is outside the supported authoring contract; it is retained unchanged.",
                imported[0], imported[1], imported[2]
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
    if let Some(control) = projection
        .controls
        .iter()
        .find(|control| control.key == MODE_KEY)
    {
        let reason = if control.value == DISABLED {
            Some("Auto branch is disabled.".to_owned())
        } else if control.value == IMPORTED {
            Some(
                "The imported auto-branch values are outside the supported authoring contract."
                    .to_owned(),
            )
        } else {
            None
        };
        for field in fields
            .iter_mut()
            .filter(|field| control.member_fields.contains(&field.key))
        {
            field.availability_reason = reason.clone();
        }
    }
    if let Some(delta) = fields.iter_mut().find(|field| field.key == "delta") {
        delta.minimum = -127;
        delta.maximum = 127;
    }
    if let Some(threshold) = fields.iter_mut().find(|field| field.key == "threshold") {
        threshold.minimum = -127;
        threshold.maximum = 127;
    }
    if let Some(target) = fields.iter_mut().find(|field| field.key == "target") {
        target.minimum = 0;
        target.maximum = i16::MAX;
        if let Some(error) = projection
            .errors
            .iter()
            .find(|error| error.contains("destination"))
        {
            target.availability_reason = Some(error.clone());
        }
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        0 => ("Quest".into(), "Quest value to change.".into()),
        1 => (
            "Change Amount".into(),
            "Signed amount added before Classic clamps the quest value to -127 through 127.".into(),
        ),
        2 => (
            "Destination Type".into(),
            "Kind of content opened when the enabled threshold is reached.".into(),
        ),
        3 => (
            "Threshold".into(),
            "Branch when the resulting quest value is at least this nonzero value.".into(),
        ),
        4 => (
            "Destination".into(),
            "Content opened when the resulting quest value reaches the threshold.".into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
