use providence_core::session::EditorSession;
use serde_json::{Value, json};

use super::catalog_page::CatalogQuery;

pub(super) fn catalog(session: &EditorSession, params: Value) -> Result<Value, String> {
    let mut query = CatalogQuery::from_params(&params, 40);
    query.limit = query.limit.min(40);
    let current = params
        .get("currentValue")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let show_unavailable = params
        .get("showUnavailable")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut rows = session.snapshot().extra_action_points.iter().map(|row| {
        let value = i64::from(row.native_id.0);
        let available = value > 0 && value <= i64::from(i16::MAX);
        let descriptor = session.snapshot().script_descriptors.iter()
            .find(|item| item.source == row.identity).map_or("", |item| item.text.as_str());
        let label = if descriptor.is_empty() { format!("Extra Action Point {value}") } else { descriptor.chars().take(160).collect() };
        json!({"identity": row.identity, "targetIdentity": row.identity, "value": value,
            "label": label, "ownership": "Scenario", "available": available,
            "reason": if value == 0 { "Zero means no Global hook; choose Unassigned instead." } else { "This XAP number cannot be stored in a Global hook." },
            "detail": format!("{} of 8 steps used", row.actions.len())})
    }).collect::<Vec<_>>();
    if current != 0
        && !rows
            .iter()
            .any(|row| row["value"].as_i64() == Some(current))
    {
        rows.push(json!({"identity": format!("extra-action-point:{current}"), "value": current,
            "label": "Missing imported Extra Action Point", "ownership": "Scenario",
            "available": false, "reason": "This imported assignment is preserved. Choose an existing XAP to replace it.",
            "detail": "The assigned script is unavailable; no preview can be inferred."}));
    }
    rows.retain(|row| {
        (show_unavailable
            || row["available"] == true
            || (current != 0 && row["value"].as_i64() == Some(current)))
            && (query.search.is_empty()
                || format!("{} {}", row["value"], row["label"])
                    .to_lowercase()
                    .contains(&query.search))
    });
    rows.sort_by_key(|row| row["value"].as_i64().unwrap_or(0));
    if params.get("seekCurrent").and_then(Value::as_bool) == Some(true)
        && let Some(index) = rows
            .iter()
            .position(|row| row["value"].as_i64() == Some(current))
    {
        query.requested_offset = index / query.limit * query.limit;
    }
    let (items, offset, total) = query.page(rows);
    Ok(
        json!({"revision": session.revision(), "page": {"items": items, "offset": offset,
        "limit": query.limit, "total": total, "truncated": offset + query.limit < total}}),
    )
}
