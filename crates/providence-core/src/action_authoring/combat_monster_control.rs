use super::{
    ActionAuthoringProjection, ActionFormDescribeQuery, ActionSemanticInventoryField,
    ActionTargetKind, AuthoringModeControl, DescribedActionField, FormChoice,
};
use crate::{model::ProjectSnapshot, rebuilt::ApplicationMediaCatalog};

const COUNT_FIELD: &str = "count";
const COUNT_MODE: &str = "combatantCountMode";
const MUTATION_MODE: &str = "combatantChange";
const ICON_FIELD: &str = "replacementIcon";
const SIDE_FIELD: &str = "traitorOverride";

pub(super) fn resolve(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
) -> Result<ActionAuthoringProjection, String> {
    validate_input(query)?;
    let mut result = ActionAuthoringProjection {
        resolved_values: query.values.clone(),
        ..Default::default()
    };
    add_count_control(query, &mut result)?;
    add_mutation_control(snapshot, application, query, &mut result)?;
    Ok(result)
}

fn validate_input(query: &ActionFormDescribeQuery) -> Result<(), String> {
    if query
        .context
        .authoring
        .modes
        .keys()
        .any(|key| !matches!(key.as_str(), COUNT_MODE | MUTATION_MODE))
        || query
            .context
            .authoring
            .selections
            .keys()
            .any(|key| !matches!(key.as_str(), COUNT_FIELD | ICON_FIELD | SIDE_FIELD))
    {
        return Err("Unknown Change Combat Monster authoring control.".into());
    }
    Ok(())
}

fn add_count_control(
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let input = &query.context.authoring;
    let imported = query.values.get(COUNT_FIELD).copied().unwrap_or(0);
    let explicit = input.modes.get(COUNT_MODE).copied();
    let mode = explicit.unwrap_or(match imported {
        0 => 0,
        1.. => 1,
        _ => 2,
    });
    if !matches!(mode, 0..=2) {
        return Err("Combatants To Change must be none, limited, or all matching.".into());
    }
    result.controls.push(AuthoringModeControl {
        key: COUNT_MODE.into(),
        label: "Combatants To Change".into(),
        value: mode,
        choices: choices(&[
            (0, "Make no changes"),
            (1, "Limit the number"),
            (2, "All matching combatants"),
        ]),
        member_fields: vec![COUNT_FIELD.into()],
        active_fields: if mode == 1 {
            vec![COUNT_FIELD.into()]
        } else {
            vec![]
        },
        display: String::new(),
    });
    let selected = input
        .selections
        .get(COUNT_FIELD)
        .copied()
        .or_else(|| (imported > 0).then_some(imported));
    let resolved = match (explicit, mode, selected) {
        (None, _, None) => imported,
        (_, 0, _) => 0,
        (_, 1, Some(value)) => value,
        (_, 2, _) => -1,
        _ => imported,
    };
    if mode == 1
        && (explicit.is_some() || input.selections.contains_key(COUNT_FIELD))
        && !matches!(selected, Some(1..=100))
    {
        result
            .errors
            .push("Combatant limit must be between 1 and 100.".into());
    }
    result.resolved_values.insert(COUNT_FIELD.into(), resolved);
    Ok(())
}

fn add_mutation_control(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    result: &mut ActionAuthoringProjection,
) -> Result<(), String> {
    let input = &query.context.authoring;
    let imported_icon = query.values.get(ICON_FIELD).copied().unwrap_or(-1);
    let explicit = input.modes.get(MUTATION_MODE).copied();
    let mode = explicit.unwrap_or(i16::from(imported_icon == -1));
    if !matches!(mode, 0 | 1) {
        return Err("Combatant Change must alter appearance or allegiance.".into());
    }
    let active = if mode == 0 { ICON_FIELD } else { SIDE_FIELD };
    result.controls.push(AuthoringModeControl {
        key: MUTATION_MODE.into(),
        label: "Combatant Change".into(),
        value: mode,
        choices: choices(&[(0, "Change appearance"), (1, "Change allegiance")]),
        member_fields: vec![ICON_FIELD.into(), SIDE_FIELD.into()],
        active_fields: vec![active.into()],
        display: String::new(),
    });

    if explicit == Some(1) {
        result.resolved_values.insert(ICON_FIELD.into(), -1);
    } else if explicit == Some(0) {
        let selected = input.selections.get(ICON_FIELD).copied();
        let value = selected.or_else(|| (imported_icon != -1).then_some(imported_icon));
        if value.is_none() {
            result
                .errors
                .push("Enter a replacement appearance before applying.".into());
        }
        if let Some(value) = selected
            && !crate::monster_appearance::resolve_monster_appearance(snapshot, application, value)
                .complete()
        {
            result
                .errors
                .push("Select an available paired monster appearance before applying.".into());
        }
        result
            .resolved_values
            .insert(ICON_FIELD.into(), value.unwrap_or(imported_icon));
    }
    if let Some(value) = input.selections.get(SIDE_FIELD) {
        result.resolved_values.insert(SIDE_FIELD.into(), *value);
    }
    Ok(())
}

fn choices(entries: &[(i16, &str)]) -> Vec<FormChoice> {
    entries
        .iter()
        .map(|(value, label)| FormChoice {
            value: *value,
            label: (*label).into(),
        })
        .collect()
}

pub(super) fn decorate(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &ActionFormDescribeQuery,
    projection: &ActionAuthoringProjection,
    fields: &mut [DescribedActionField],
) {
    let count_mode = projection
        .controls
        .iter()
        .find(|control| control.key == COUNT_MODE)
        .map(|control| control.value);
    if count_mode == Some(1)
        && let Some(field) = fields.iter_mut().find(|field| field.key == COUNT_FIELD)
    {
        field.minimum = 1;
        field.maximum = 100;
        field.special_values.clear();
    }
    if let Some(field) = fields.iter_mut().find(|field| field.key == ICON_FIELD) {
        field.special_values.clear();
        let appearance_mode = projection
            .controls
            .iter()
            .any(|control| control.key == MUTATION_MODE && control.value == 0);
        if appearance_mode {
            field.control = super::FormControl::Target;
            field.target_kind = Some(ActionTargetKind::MonsterAppearance);
            field.editable = true;
            field.availability_reason = projection
                .errors
                .iter()
                .find(|error| error.contains("appearance"))
                .cloned();
            field.preview = super::form_description::preview(
                snapshot,
                application,
                query,
                ActionTargetKind::MonsterAppearance,
                field.value,
            );
        }
    }
    if let Some(field) = fields.iter_mut().find(|field| field.key == SIDE_FIELD) {
        field.special_values.clear();
    }
}

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    match field.index {
        0 => (
            "Combatant Type".into(),
            "Match summoned NPCs or ordinary monsters in the current combat.".into(),
        ),
        1 => (
            "Monster Name Tag".into(),
            "Match active combatants by their stored name tag. This is not a Monster record number."
                .into(),
        ),
        2 => (
            "Maximum To Change".into(),
            "Limit how many matching combatants change. Zero makes no changes; a negative value reaches every match."
                .into(),
        ),
        3 => (
            "Replacement Appearance".into(),
            "Classic treats every value except -1 as an appearance change. Selecting this operation leaves allegiance unchanged."
                .into(),
        ),
        4 => (
            "New Allegiance".into(),
            "Choose the player or enemy side. This field is used only when Change allegiance is selected."
                .into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
