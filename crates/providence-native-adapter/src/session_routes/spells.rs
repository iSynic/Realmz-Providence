//! Native spells requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_u32;
use crate::request_params::required_value;
use providence_core::model::SpellDefinition;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "spell.list-standard" => spell_list_standard(session, params),
        "spell.open-standard" => spell_open_standard(session, params),
        "spell.list" => spell_list(session, params),
        "spell.open" => spell_open(session, params),
        "spell.update" => spell_update(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn spell_list_standard(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let items = session
        .snapshot()
        .standard_spells
        .iter()
        .skip(offset)
        .take(limit)
        .map(|spell| {
            let definition = &spell.definition;
            json!({
                "identity": definition.id,
                "classicId": definition.classic_id,
                "recordIndex": definition.record_index,
                "name": definition.name,
                "spellClass": definition.spell_class,
                "cost": definition.cost,
                "targetType": definition.target_type,
                "inCombat": definition.in_combat,
                "inCamp": definition.in_camp,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": session.snapshot().standard_spells.len(),
        "truncated": offset.saturating_add(limit) < session.snapshot().standard_spells.len(),
    }))
}

fn spell_open_standard(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let record_index = required_u32(&params, "recordIndex")?;
    let record_index = u16::try_from(record_index)
        .map_err(|_| "recordIndex must fit an unsigned 16-bit integer".to_string())?;
    let spell = session
        .snapshot()
        .standard_spells
        .iter()
        .find(|spell| spell.definition.record_index == record_index)
        .ok_or_else(|| format!("Data S record {record_index} was not found"))?;
    Ok(json!({
        "revision": session.revision(),
        "spell": spell,
        "readOnly": true,
    }))
}

fn spell_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let items = session
        .snapshot()
        .scenario_spells
        .iter()
        .skip(offset)
        .take(limit)
        .map(|spell| {
            let definition = &spell.definition;
            json!({
                "identity": definition.id,
                "classicId": definition.classic_id,
                "recordIndex": definition.record_index,
                "name": definition.name,
                "spellClass": definition.spell_class,
                "cost": definition.cost,
                "targetType": definition.target_type,
                "inCombat": definition.in_combat,
                "inCamp": definition.in_camp,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": session.snapshot().scenario_spells.len(),
        "truncated": offset.saturating_add(limit) < session.snapshot().scenario_spells.len(),
    }))
}

fn spell_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let record_index = required_u32(&params, "recordIndex")?;
    let record_index = u16::try_from(record_index)
        .map_err(|_| "recordIndex must fit an unsigned 16-bit integer".to_string())?;
    let spell = session
        .snapshot()
        .scenario_spells
        .iter()
        .find(|spell| spell.definition.record_index == record_index)
        .ok_or_else(|| format!("Data Spell record {record_index} was not found"))?;
    Ok(json!({
        "revision": session.revision(),
        "spell": spell,
    }))
}

fn spell_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let record_index = required_u32(&params, "recordIndex")?;
    let record_index = u16::try_from(record_index)
        .map_err(|_| "recordIndex must fit an unsigned 16-bit integer".to_string())?;
    let definition: SpellDefinition = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "definition")?.clone(),
    ))
    .map_err(|error| format!("invalid spell definition: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateScenarioSpell {
            record_index,
            definition: Box::new(definition),
        },
    )
}
