//! AP catalog scope, activation filters and bounded paging.
use super::action_points::descriptor;
use crate::request_params::required_string;
use crate::session_routes::catalog_page::CatalogQuery;
use providence_core::{
    model::{ActionPoint, MapLevel, StableId},
    session::EditorSession,
};
use serde_json::{Value, json};

pub(super) fn list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let map_identity = required_string(&params, "mapIdentity")?;
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == map_identity)
        .ok_or_else(|| format!("map {map_identity} was not found"))?;
    let all_items = catalog_items(session, map);
    let counts = catalog_counts(&all_items);
    let query = CatalogQuery::from_params(&params, 100);
    let activation_filter: providence_core::action_point_activation::ActivationFilter =
        serde_json::from_value(
            params
                .get("activationFilters")
                .cloned()
                .unwrap_or_else(|| json!({})),
        )
        .map_err(|error| format!("invalid Action Point activation filter: {error}"))?;
    let filtered = all_items
        .into_iter()
        .filter(|(item, status)| {
            action_point_matches(item, &query) && activation_filter.matches(status)
        })
        .map(|(item, _)| item)
        .collect::<Vec<_>>();
    let (items, offset, total) = query.page(filtered);
    Ok(json!({
        "map": {
            "identity": map.identity,
            "levelType": map.level_type,
            "nativeIndex": map.native_index,
            "name": map.name,
        },
        "items": items,
        "offset": offset,
        "limit": query.limit,
        "total": total,
        "counts": counts,
        "filter": query.filter,
        "search": query.search,
        "truncated": offset.saturating_add(query.limit) < total,
    }))
}

type CatalogItem = (
    Value,
    providence_core::action_point_activation::ActionPointActivation,
);
fn catalog_items(session: &EditorSession, map: &MapLevel) -> Vec<CatalogItem> {
    let diagnostics = session.diagnostics();
    let references = session.references();
    let rows = &session.snapshot().world.action_points;
    let source_ids = rows
        .iter()
        .map(|row| row.identity.clone())
        .collect::<std::collections::BTreeSet<_>>();
    rows.iter()
        .map(|row| {
            let current_map = belongs_to_map(row, map);
            let status = providence_core::action_point_activation::project(session.snapshot(), row);
            let item = catalog_row(
                row,
                descriptor(session, &row.identity),
                current_map,
                &diagnostics,
                &references,
                &source_ids,
                &status,
            );
            (item, status)
        })
        .collect()
}

fn catalog_counts(all_items: &[CatalogItem]) -> Value {
    json!({
        "all": all_items.len(),
        "current-map": all_items.iter().filter(|(item, _)| item["currentMap"].as_bool() == Some(true)).count(),
        "active": all_items.iter().filter(|(item, _)| item["active"].as_bool() == Some(true)).count(),
        "reusable": all_items.iter().filter(|(item, _)| item["reusable"].as_bool() == Some(true)).count(),
        "warnings": all_items.iter().filter(|(item, _)| item["problems"].as_u64().unwrap_or(0) > 0).count(),
    })
}

fn belongs_to_map(row: &ActionPoint, map: &MapLevel) -> bool {
    row.level_type == map.level_type && row.level_index == map.native_index
}

fn action_point_matches(item: &Value, query: &CatalogQuery) -> bool {
    let matches_filter = match query.filter.as_str() {
        "all" => true,
        "current-map" => item["currentMap"].as_bool() == Some(true),
        "active" => item["active"].as_bool() == Some(true),
        "reusable" => item["reusable"].as_bool() == Some(true),
        "warnings" => item["problems"].as_u64().unwrap_or(0) > 0,
        _ => false,
    };
    matches_filter
        && (query.search.is_empty()
            || format!(
                "{} {}",
                item["recordIndex"],
                item["label"].as_str().unwrap_or("")
            )
            .to_ascii_lowercase()
            .contains(&query.search))
}

fn catalog_row(
    row: &ActionPoint,
    descriptor: &str,
    current_map: bool,
    diagnostics: &[providence_core::validation::Diagnostic],
    references: &[providence_core::references::ReferenceDescriptor],
    source_ids: &std::collections::BTreeSet<StableId>,
    status: &providence_core::action_point_activation::ActionPointActivation,
) -> Value {
    let reusable = row.classic_door_id <= 0 && row.coordinate.is_none() && row.actions.is_empty();
    let problems = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&row.identity))
        .count();
    let used_by = references
        .iter()
        .filter(|reference| {
            reference.target_kind == providence_core::references::TargetKind::ActionPoint
                && reference.target_id == row.record_index.to_string()
                && source_ids.contains(&reference.source)
        })
        .count();
    let coordinate = row
        .coordinate
        .map(|coordinate| format!("{}, {}", coordinate.x, coordinate.y));
    json!({
        "identity": row.identity,
        "recordIndex": row.record_index,
        "descriptor": descriptor,
        "label": coordinate.map_or_else(
            || if reusable {
                format!("Action Point {} · reusable", row.record_index)
            } else {
                format!("Action Point {} · preserved disabled row", row.record_index)
            },
            |coordinate| format!("Action Point {} ({coordinate})", row.record_index),
        ),
        "coordinate": row.coordinate,
        "chancePercent": row.chance_percent,
        "currentMap": current_map,
        "active": row.coordinate.is_some() && row.chance_percent > 0,
        "reusable": reusable,
        "populatedActions": row.actions.len(),
        "usedBy": used_by,
        "problems": problems,
        "activation": status,
    })
}
