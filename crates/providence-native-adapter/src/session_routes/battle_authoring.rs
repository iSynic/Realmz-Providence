use crate::request_params::{coerce_integral_numbers, required_u64, required_value};
use providence_core::{
    model::{BattleRecord, NativeRecordId},
    session::{BattleCopySource, EditorCommand, EditorSession},
};
use serde_json::{Value, json};

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let expected = required_u64(&params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err(format!(
            "The Battle project changed: expected revision {expected}, current {}. Your draft is kept.",
            session.revision().0
        ));
    }
    match method {
        "battle.allocate" => {
            let source = params
                .get("sourceId")
                .filter(|value| !value.is_null())
                .map(|_| crate::request_params::required_u32(&params, "sourceId"))
                .transpose()?
                .map(NativeRecordId);
            let allocation = session
                .allocate_battle(source)
                .map_err(|error| error.to_string())?;
            Ok(json!({"revision": session.revision(), "allocation": allocation}))
        }
        "battle.draft.prepare" => prepare(&params),
        "battle.clear.prepare" => {
            let review = session
                .clear_battle_draft(NativeRecordId(crate::request_params::required_u32(
                    &params, "nativeId",
                )?))
                .map_err(|error| error.to_string())?;
            Ok(json!({"revision": session.revision(), "review": review}))
        }
        "battle.draft.apply" => apply(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn prepare(params: &Value) -> Result<Value, String> {
    let raw = coerce_integral_numbers(required_value(params, "battle")?.clone());
    let issues = providence_core::session::battle_authoring::draft_issues(&raw);
    let count = raw.get("grid").and_then(Value::as_array).map_or(0, |grid| {
        grid.iter()
            .filter(|value| value.as_i64() != Some(0))
            .count()
    });
    if !issues.is_empty() {
        return Ok(json!({"valid": false, "issues": issues}));
    }
    let battle: BattleRecord = serde_json::from_value(raw)
        .map_err(|error| format!("The Battle draft has an invalid field: {error}"))?;
    providence_core::codecs::validate_battle_record_shape(&battle)
        .map_err(|error| error.to_string())?;
    Ok(json!({"valid": true, "issues": [], "occupants": count, "summonSpaceAdvisory": count > 75}))
}

fn apply(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let battle: BattleRecord = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "battle")?.clone(),
    ))
    .map_err(|error| format!("The Battle draft has an invalid field: {error}"))?;
    let native_id = battle.native_id.0;
    let command = if params
        .get("creation")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        let copy_source: Option<BattleCopySource> = serde_json::from_value(
            coerce_integral_numbers(params.get("copySource").cloned().unwrap_or(Value::Null)),
        )
        .map_err(|error| format!("Invalid reviewed copy source: {error}"))?;
        EditorCommand::CreateBattle {
            battle: Box::new(battle),
            copy_source,
        }
    } else {
        EditorCommand::UpdateBattle {
            battle: Box::new(battle),
        }
    };
    let change = crate::execute(session, &params, command)?;
    let document = super::battles::battle_open(session, json!({"nativeId": native_id}))?;
    Ok(json!({"change": change, "document": document}))
}
