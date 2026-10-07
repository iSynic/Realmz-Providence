use crate::request_params::{
    coerce_integral_numbers, required_string, required_u64, required_value,
};
use providence_core::session::{EditorCommand, EditorSession, MonsterOperation};
use serde_json::{Value, json};

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let expected = required_u64(&params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err(format!(
            "project revision changed: expected {expected}, current {}",
            session.revision().0
        ));
    }
    let operation: MonsterOperation = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "operation")?.clone(),
    ))
    .map_err(|error| format!("invalid Monster operation: {error}"))?;
    let review = session
        .review_monster_operation(&operation)
        .map_err(|error| error.to_string())?;
    if method == "monster.operation.commit" {
        let review_hash = required_string(&params, "reviewHash")?;
        let change = crate::execute(
            session,
            &params,
            EditorCommand::CommitMonsterOperation {
                operation,
                review_hash,
            },
        )?;
        return Ok(json!({"change": change, "reviewHash": review.review_hash}));
    }
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(128)
        .clamp(1, 128) as usize;
    let section = params
        .get("section")
        .and_then(Value::as_str)
        .unwrap_or("changes");
    let entries = match section {
        "changes" => serde_json::to_value(&review.changes),
        "uses" => serde_json::to_value(&review.uses),
        "excluded" => serde_json::to_value(&review.excluded),
        _ => return Err("Monster review section must be changes, uses, or excluded".into()),
    }
    .map_err(|error| error.to_string())?;
    let entries = entries.as_array().expect("review sections are arrays");
    Ok(
        json!({"revision": session.revision(), "reviewHash": review.review_hash,
        "counts": {"changes": review.changes.len(), "uses": review.uses.len(), "excluded": review.excluded.len()},
        "section": section, "items": entries.iter().skip(offset).take(limit).collect::<Vec<_>>(),
        "offset": offset, "limit": limit, "total": entries.len(), "truncated": offset.saturating_add(limit) < entries.len()}),
    )
}
