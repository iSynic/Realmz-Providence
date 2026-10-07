use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionTargetKind, AuthoringModeControl,
    DescribedActionField, FormChoice, FormControl,
};
use crate::model::ProjectSnapshot;

pub(super) fn resolve(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    let input = &query.context.authoring;
    if input.modes.keys().any(|key| key != "shopSelection")
        || input.selections.keys().any(|key| key != "shop")
    {
        return Err("Unknown Change Shop authoring control.".into());
    }
    let imported = query.values.get("shop").copied().unwrap_or(0);
    let mode = input
        .modes
        .get("shopSelection")
        .copied()
        .unwrap_or(imported.signum());
    if input.modes.contains_key("shopSelection") && !matches!(mode, 0 | 1) {
        return Err("Choose Current shop or Specific shop.".into());
    }
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    let value = if mode == 0 {
        0
    } else {
        input.selections.get("shop").copied().unwrap_or(imported)
    };
    result.resolved_values.insert("shop".into(), value);
    if mode == 1
        && (!input.modes.is_empty() || !input.selections.is_empty())
        && (value <= 0
            || !snapshot
                .shops
                .iter()
                .any(|shop| shop.native_id.0 == value as u32))
    {
        result
            .errors
            .push("Select an available specific shop before applying.".into());
    }
    result.controls.push(mode_control(mode));
    Ok(result)
}

fn mode_control(mode: i16) -> AuthoringModeControl {
    AuthoringModeControl {
        key: "shopSelection".into(),
        label: "Shop to change".into(),
        value: mode,
        choices: vec![
            FormChoice {
                value: 0,
                label: "Current shop".into(),
            },
            FormChoice {
                value: 1,
                label: "Specific shop".into(),
            },
        ],
        member_fields: vec!["shop".into()],
        active_fields: if mode != 0 {
            vec!["shop".into()]
        } else {
            vec![]
        },
        display: if mode == 0 {
            "Uses the shop loaded during execution; its identity depends on the caller.".into()
        } else {
            String::new()
        },
    }
}

pub(super) fn decorate(
    snapshot: &ProjectSnapshot,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let Some(field) = fields.iter_mut().find(|field| field.key == "shop") else {
        return;
    };
    field.special_values.clear();
    if projection.controls[0].value == 1 {
        field.label = "Shop".into();
        field.control = FormControl::Target;
        field.target_kind = Some(ActionTargetKind::Shop);
        field.editable = true;
        field.availability_reason = projection.errors.first().cloned();
        field.preview = if field.value > 0 && projection.errors.is_empty() {
            super::form_description::preview(
                snapshot,
                None,
                query,
                ActionTargetKind::Shop,
                field.value,
            )
        } else {
            None
        };
    }
}
