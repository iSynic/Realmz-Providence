use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionTargetKind, AuthoringModeControl,
    DescribedActionField, FormChoice, FormControl,
};

const NO_BRANCH: i16 = 0;
const BRANCH: i16 = 1;
const IMPORTED: i16 = 2;

pub(super) fn resolve(
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    if query
        .context
        .authoring
        .modes
        .keys()
        .any(|key| !is_mode_key(key))
        || query
            .context
            .authoring
            .selections
            .keys()
            .any(|key| !is_target_key(key))
    {
        return Err("Unknown optional-branch authoring control.".into());
    }
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    augment(query, &mut result)?;
    Ok(result)
}

pub(super) fn augment(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let branch_mode = query.values.get("branchMode").copied().unwrap_or(-1);
    for (target, mode_key, result_label, control_label) in [
        ("falseTarget", "falseDestination", "False", "False result"),
        ("trueTarget", "trueDestination", "True", "True result"),
    ] {
        let imported = query.values.get(target).copied().unwrap_or(0);
        let explicit = query.context.authoring.modes.get(mode_key).copied();
        if explicit.is_some_and(|mode| !matches!(mode, NO_BRANCH | BRANCH)) {
            return Err(format!(
                "{control_label} must continue the current script or branch."
            ));
        }
        let mode = explicit.unwrap_or(if imported == 0 {
            NO_BRANCH
        } else if imported > 0 && matches!(branch_mode, 0..=2) {
            BRANCH
        } else {
            IMPORTED
        });
        let selected = query
            .context
            .authoring
            .selections
            .get(target)
            .copied()
            .unwrap_or(imported);
        let resolved = match mode {
            NO_BRANCH => 0,
            BRANCH => selected,
            _ => imported,
        };
        if explicit == Some(BRANCH) {
            if !matches!(branch_mode, 0..=2) {
                result.errors.push(format!(
                    "Choose an Extra Action Point, Simple Encounter, or Complex Encounter branch type before setting the {result_label} destination."
                ));
            } else if selected <= 0 {
                result.errors.push(format!(
                    "Select a positive {result_label} destination before applying."
                ));
            }
        }
        result.resolved_values.insert(target.into(), resolved);
        result.controls.push(destination_control(
            mode,
            imported,
            target,
            mode_key,
            control_label,
        ));
    }
    Ok(())
}

fn destination_control(
    mode: i16,
    imported: i16,
    target: &str,
    mode_key: &str,
    label: &str,
) -> AuthoringModeControl {
    AuthoringModeControl {
        key: mode_key.into(),
        label: label.into(),
        value: mode,
        choices: vec![
            choice(NO_BRANCH, "Continue current script"),
            choice(BRANCH, "Branch"),
        ],
        member_fields: vec![target.into()],
        active_fields: if mode == BRANCH {
            vec![target.into()]
        } else {
            vec![]
        },
        display: if mode == IMPORTED {
            format!(
                "Imported destination {imported} cannot be represented by the selected branch type; it is retained unchanged."
            )
        } else {
            String::new()
        },
    }
}

pub(super) fn decorate(
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let target_kind = match query.values.get("branchMode").copied() {
        Some(0) => Some(ActionTargetKind::ExtraActionPoint),
        Some(1) => Some(ActionTargetKind::SimpleEncounter),
        Some(2) => Some(ActionTargetKind::ComplexEncounter),
        _ => None,
    };
    for (target, mode_key, result_label) in [
        ("falseTarget", "falseDestination", "False"),
        ("trueTarget", "trueDestination", "True"),
    ] {
        let mode = projection
            .controls
            .iter()
            .find(|control| control.key == mode_key)
            .map(|control| control.value);
        if mode != Some(BRANCH) {
            continue;
        }
        let Some(field) = fields.iter_mut().find(|field| field.key == target) else {
            continue;
        };
        field.label = format!("{result_label} destination");
        field.explanation = format!("Content opened when the test result is {result_label}.");
        field.special_values.clear();
        field.control = FormControl::Target;
        field.target_kind = target_kind;
        field.minimum = 1;
        field.maximum = i16::MAX;
        field.editable = target_kind.is_some();
        field.availability_reason = projection
            .errors
            .iter()
            .find(|error| error.contains(result_label))
            .cloned();
    }
}

pub(super) fn is_mode_key(key: &str) -> bool {
    matches!(key, "falseDestination" | "trueDestination")
}

pub(super) fn is_target_key(key: &str) -> bool {
    matches!(key, "falseTarget" | "trueTarget")
}

fn choice(value: i16, label: &str) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}
