//! Native battles requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use crate::request_params::required_value;
use providence_core::model::BattleRecord;
use providence_core::model::StableId;
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
        "battle.list" => battle_list(session, params),
        "battle.open" => battle_open(session, params),
        "battle.recovery.read" => Ok(json!({"revision": session.revision(),
            "canUndo": !session.undo_history().is_empty(), "canRedo": !session.redo_history().is_empty()})),
        "battle.update" => battle_update(session, params),
        "battle.allocate"
        | "battle.clear.prepare"
        | "battle.draft.prepare"
        | "battle.draft.apply" => super::battle_authoring::dispatch(session, method, params),
        "battle-reference.retarget" => battle_reference_retarget(session, params),
        "battle-monster-reference.repair" => battle_monster_reference_repair(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn battle_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let mut offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let diagnostics = session.diagnostics();
    let search = params
        .get("search")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let filtered: Vec<_> = session
        .snapshot()
        .battles
        .iter()
        .filter(|battle| {
            search.is_empty()
                || format!("battle {}", battle.native_id.0).contains(&search)
                || battle.native_id.0.to_string().contains(&search)
        })
        .collect();
    if let Some(id) = params.get("seekNativeId").and_then(Value::as_u64) {
        offset = filtered
            .iter()
            .position(|row| u64::from(row.native_id.0) == id)
            .map_or(0, |index| index / limit * limit);
    }
    let items = filtered
        .iter()
        .skip(offset)
        .take(limit)
        .map(|battle| catalog_row(battle, &diagnostics))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": filtered.len(), "catalogTotal": session.snapshot().battles.len(),
        "truncated": offset.saturating_add(limit) < filtered.len(),
    }))
}

fn catalog_row(
    battle: &BattleRecord,
    diagnostics: &[providence_core::validation::Diagnostic],
) -> Value {
    let placed = battle.grid.iter().filter(|value| **value != 0).count();
    let problems = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&battle.identity))
        .count();
    json!({
        "identity": battle.identity,
        "nativeId": battle.native_id,
        "distance": battle.distance,
        "placedMonsters": placed,
        "messageBefore": battle.message_before,
        "messageAfter": battle.message_after,
        "battleMacro": battle.battle_macro,
        "problems": problems,
    })
}

pub(super) fn battle_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let native_id = required_u32(&params, "nativeId")?;
    let battle = session
        .snapshot()
        .battles
        .iter()
        .find(|battle| battle.native_id.0 == native_id)
        .ok_or_else(|| format!("battle {native_id} was not found"))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == battle.identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&battle.identity))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "battle": battle,
        "references": references,
        "diagnostics": diagnostics,
    }))
}

fn battle_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let battle: BattleRecord = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "battle")?.clone(),
    ))
    .map_err(|error| format!("invalid battle record: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateBattle {
            battle: Box::new(battle),
        },
    )
}

fn battle_reference_retarget(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetBattleReference {
            source: StableId(required_string(&params, "source")?),
            field: required_string(&params, "field")?,
            target_id: required_i16(&params, "targetId")?,
        },
    )
}

fn battle_monster_reference_repair(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let rewrite: providence_core::session::BattleMonsterReferenceRewrite = serde_json::from_value(
        coerce_integral_numbers(required_value(&params, "rewrite")?.clone()),
    )
    .map_err(|error| format!("invalid battle monster reference repair: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::RewriteBattleMonsterReferences { rewrite },
    )
}
