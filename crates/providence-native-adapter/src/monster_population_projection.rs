use providence_core::{monster_population::MonsterPopulationRow, session::Revision};
use serde_json::{Value, json};

pub(crate) fn project(
    revision: Revision,
    library_revision: Revision,
    params: &Value,
    rows: &[MonsterPopulationRow],
) -> Result<Value, String> {
    let expected = crate::request_params::required_u64(params, "expectedRevision")?;
    if expected != revision.0 {
        return Err(format!(
            "project revision conflict: expected {expected}, actual {}",
            revision.0
        ));
    }
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    Ok(json!({
        "format": "providence.monster-population-plan.v1",
        "projectRevision": revision,
        "libraryRevision": library_revision,
        "offset": offset,
        "limit": limit,
        "total": rows.len(),
        "rows": rows.iter().skip(offset).take(limit).collect::<Vec<_>>(),
    }))
}
