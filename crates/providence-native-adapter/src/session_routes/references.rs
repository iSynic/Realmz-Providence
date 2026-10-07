//! Native references requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_u32;
use providence_core::model::NativeRecordId;
use providence_core::model::StableId;
use providence_core::references::TargetKind;
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
        "reference.used-by" => reference_used_by(session, params),
        "reference.retarget" => reference_retarget(session, params),
        "action-reference.retarget" => action_reference_retarget(session, params),
        "action.set-opcode" => action_set_opcode(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn reference_used_by(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let target_kind =
        serde_json::from_value::<TargetKind>(json!(required_string(&params, "targetKind")?))
            .map_err(|_| "targetKind is not a registered typed-reference target".to_string())?;
    let target_id = required_string(&params, "targetId")?;
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let matches = if target_kind == TargetKind::Battle {
        session.battle_uses(NativeRecordId(target_id.parse().map_err(|_| {
            "Battle targetId must be an unsigned native record ID".to_string()
        })?))
    } else {
        session
            .references()
            .into_iter()
            .filter(|reference| {
                reference.target_kind == target_kind && reference.target_id == target_id
            })
            .collect::<Vec<_>>()
    };
    let total = matches.len();
    let items = matches
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "targetKind": target_kind,
        "targetId": target_id,
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn reference_retarget(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetMessageReference {
            source: StableId(required_string(&params, "source")?),
            field: required_string(&params, "field")?,
            target_native_id: NativeRecordId(required_u32(&params, "targetNativeId")?),
        },
    )
}

fn action_reference_retarget(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetActionReference {
            source: StableId(required_string(&params, "source")?),
            slot: required_u8(&params, "slot")?,
            target_native_id: required_i16(&params, "targetNativeId")?,
        },
    )
}

fn action_set_opcode(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::SetActionOpcode {
            source: StableId(required_string(&params, "source")?),
            slot: required_u8(&params, "slot")?,
            raw_opcode: required_i16(&params, "rawOpcode")?,
        },
    )
}
