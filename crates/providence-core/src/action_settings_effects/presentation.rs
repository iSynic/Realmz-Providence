use super::{consumer_words, unique_row};
use crate::action_authoring::{
    ActionFormDescribeQuery, FormRow, action_definition_for_opcode, decode_form_values,
    describe_action_form, form_definition,
};
use crate::model::{ClassicAction, ExtraCodeRow, LevelType, ProjectSnapshot, StableId};
use crate::session::ActionSettingsCallerConfirmation;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSettingsImpactAction {
    pub source: StableId,
    pub slot: u8,
    pub label: String,
    pub location: String,
    pub changes: Vec<ActionSettingsValueChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSettingsValueChange {
    pub label: String,
    pub before: i16,
    pub after: i16,
}

pub(crate) fn describe_impact(
    snapshot: &ProjectSnapshot,
    writes: &[ExtraCodeRow],
    transaction_writes: &[ExtraCodeRow],
    caller: &ActionSettingsCallerConfirmation,
) -> Result<ActionSettingsImpactAction, String> {
    let action = crate::session::action_settings_commands::inspect_caller(
        snapshot,
        &caller.source,
        caller.slot,
    )
    .map_err(|error| error.to_string())?;
    let query = form_query(snapshot, transaction_writes, &action)?;
    let description = describe_action_form(snapshot, &query)?;
    let mut changes = Vec::new();
    for field in description.fields {
        let Some(index) = field.index else {
            continue;
        };
        let secondary = field.row == FormRow::Secondary;
        let id = u32::try_from(action.target_native_id).map_err(|_| "negative settings ID")?
            + u32::from(secondary);
        let Some(row) = writes.iter().find(|row| row.native_id.0 == id) else {
            continue;
        };
        let previous = unique_row(snapshot, id)?.ok_or("settings are missing")?;
        if previous.values[index as usize] == row.values[index as usize] {
            continue;
        }
        let usage = crate::validation::action_settings::Caller {
            source: caller.source.clone(),
            slot: caller.slot,
            raw_opcode: action.raw_opcode,
            shape: "presentation",
            secondary,
        };
        if consumer_words(snapshot, transaction_writes, id, &usage)? & (1 << index) == 0 {
            continue;
        }
        changes.push(ActionSettingsValueChange {
            label: field.label,
            before: previous.values[index as usize],
            after: row.values[index as usize],
        });
    }
    Ok(ActionSettingsImpactAction {
        source: caller.source.clone(),
        slot: caller.slot,
        label: description.action.label,
        location: action_location(snapshot, &caller.source, caller.slot),
        changes,
    })
}

fn form_query(
    snapshot: &ProjectSnapshot,
    writes: &[ExtraCodeRow],
    action: &ClassicAction,
) -> Result<ActionFormDescribeQuery, String> {
    let definition =
        action_definition_for_opcode(action.raw_opcode).ok_or("action has no definition")?;
    let form_id = definition
        .form_id
        .as_deref()
        .ok_or("action has no settings form")?;
    let id = u32::try_from(action.target_native_id).map_err(|_| "negative settings ID")?;
    let values = decode_form_values(form_id, final_values(snapshot, writes, id)?)
        .ok_or("action settings form is unavailable")?;
    let secondary_values =
        if let Some(companion) = form_definition(form_id).and_then(|form| form.companion_form_id) {
            decode_form_values(&companion, final_values(snapshot, writes, id + 1)?)
                .ok_or("companion settings form is unavailable")?
        } else {
            Default::default()
        };
    Ok(ActionFormDescribeQuery {
        action_identity: definition.identity,
        target_native_id: action.target_native_id,
        values,
        secondary_values,
        context: Default::default(),
    })
}

fn final_values(
    snapshot: &ProjectSnapshot,
    writes: &[ExtraCodeRow],
    id: u32,
) -> Result<[i16; 5], String> {
    if let Some(row) = writes.iter().find(|row| row.native_id.0 == id) {
        return Ok(row.values);
    }
    unique_row(snapshot, id)?
        .map(|row| row.values)
        .ok_or_else(|| "settings are missing".into())
}

fn action_location(snapshot: &ProjectSnapshot, source: &StableId, slot: u8) -> String {
    let record = if let Some(row) = snapshot
        .world
        .action_points
        .iter()
        .find(|row| row.identity == *source)
    {
        let level = if row.level_type == LevelType::Land {
            "Land"
        } else {
            "Dungeon"
        };
        let coordinate = row
            .coordinate
            .map(|point| format!(" ({}, {})", point.x, point.y))
            .unwrap_or_default();
        format!(
            "{level} {} · Action Point {}{coordinate}",
            row.level_index, row.record_index
        )
    } else if let Some(row) = snapshot
        .extra_action_points
        .iter()
        .find(|row| row.identity == *source)
    {
        format!("Extra Action Point {}", row.native_id.0)
    } else if let Some(row) = snapshot
        .simple_encounters
        .iter()
        .find(|row| row.identity == *source)
    {
        format!("Simple Encounter {}", row.native_id.0)
    } else if let Some(row) = snapshot
        .complex_encounters
        .iter()
        .find(|row| row.identity == *source)
    {
        format!("Complex Encounter {}", row.native_id.0)
    } else {
        "Unavailable action".into()
    };
    format!("{record} · Step {}", u16::from(slot) + 1)
}
