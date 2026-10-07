//! Bounded revision-checked discovery reads. No mutation or project transport lives here.
use crate::request_params::required_string;
use providence_core::{discovery::DiscoveryRecord, session::EditorSession};
use serde_json::{Value, json};

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    guard(session, &params)?;
    match method {
        "discovery.search" => search(session, &params),
        "discovery.preview" => preview(session, &params),
        "discovery.links" => links(session, &params),
        "discovery.trace" => trace(session, &params),
        "quest.flow" => quest_flow(session, &params),
        _ => Err(format!("unknown method {method}")),
    }
}

pub(crate) fn guard(session: &EditorSession, p: &Value) -> Result<(), String> {
    let revision = p
        .get("expectedRevision")
        .and_then(Value::as_u64)
        .ok_or("expectedRevision is required for discovery")?;
    if revision != session.revision().0 {
        return Err("Discovery results are stale. Refresh for the current revision.".into());
    }
    if p.get("projectId").and_then(Value::as_str) != Some(session.snapshot().project_id.0.as_str())
    {
        return Err("Discovery belongs to another project. Refresh the current project.".into());
    }
    Ok(())
}

pub(crate) fn page(session: &EditorSession, p: &Value, rows: Vec<Value>) -> Value {
    let offset = p.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = p
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let total = rows.len();
    json!({"projectId": session.snapshot().project_id, "revision": session.revision(), "generation": p.get("generation"),
        "items": rows.into_iter().skip(offset).take(limit).map(|mut row| { if let Some(record) = row.get_mut("record") { project_rule_number(record); } row }).collect::<Vec<_>>(), "offset": offset, "limit": limit, "total": total, "remaining": total.saturating_sub(offset.saturating_add(limit))})
}

pub(crate) fn project_rule_number(record: &mut Value) {
    if let Some(id) = record["identity"]
        .as_str()
        .and_then(providence_core::rule_presentation::identity_author_number)
    {
        record["authorId"] = json!(id);
    }
}

fn search(session: &EditorSession, p: &Value) -> Result<Value, String> {
    let scope = p.get("scope").and_then(Value::as_str).unwrap_or("scenario");
    if !matches!(scope, "scenario" | "stock" | "docs") {
        return Err("This session index does not contain personal-library records.".into());
    }
    let query = p.get("query").and_then(Value::as_str).unwrap_or("");
    let kind = p.get("kind").and_then(Value::as_str).unwrap_or("all");
    let hits = session.discovery().search(query, kind, scope);
    Ok(page(
        session,
        p,
        hits.into_iter()
            .map(|r| serde_json::to_value(r).unwrap())
            .collect(),
    ))
}

fn preview(session: &EditorSession, p: &Value) -> Result<Value, String> {
    let identity = required_string(p, "identity")?;
    let index = session.discovery();
    let record = index
        .records
        .iter()
        .find(|r| {
            r.identity == identity && p["scope"].as_str().is_none_or(|scope| r.scope == scope)
        })
        .ok_or("The discovery record no longer exists.")?;
    let query = p["query"].as_str().unwrap_or("");
    let fields = preview_fields(record, query);
    let mut summary = record.clone();
    summary.fields.clear();
    let mut summary = serde_json::to_value(summary).unwrap();
    project_rule_number(&mut summary);
    Ok(
        json!({"record": summary, "fields": fields, "fieldsTotal": record.fields.len(), "revision": session.revision(),
        "callers": index.incoming_record(record).into_iter().take(3).collect::<Vec<_>>(),
        "usedBy": index.incoming_record(record).len(), "uses": index.outgoing(&record.identity).len()}),
    )
}

pub(crate) fn preview_fields(record: &DiscoveryRecord, query: &str) -> Vec<Value> {
    let query_lower = query.to_lowercase();
    let matches = |value: &String| !query.is_empty() && value.to_lowercase().contains(&query_lower);
    record.fields.iter().filter(|(_, text)| matches(text))
        .chain(record.fields.iter().filter(|(_, text)| !matches(text))).take(64)
        .map(|(field, text)| json!({"field": field, "text": providence_core::discovery::snippet(text, query), "truncated":text.chars().count() > 360})).collect()
}

fn links(session: &EditorSession, p: &Value) -> Result<Value, String> {
    let index = session.discovery();
    let direction = required_string(p, "direction")?;
    let rows = match direction.as_str() {
        "incoming" => {
            let kind = required_string(p, "kind")?;
            if let Some(record) = index.records.iter().find(|r| {
                r.identity == p["identity"].as_str().unwrap_or("")
                    && p["scope"].as_str().is_none_or(|scope| r.scope == scope)
            }) {
                index.incoming_record(record)
            } else {
                let mut rows = index.incoming(
                    if kind == "icon" {
                        "monster-appearance"
                    } else {
                        &kind
                    },
                    &required_string(p, "id")?,
                );
                rows.retain(|r| {
                    p["scope"].as_str().is_none_or(|scope| {
                        r.target_scope
                            .as_deref()
                            .is_none_or(|target| scope == target)
                    })
                });
                rows
            }
        }
        "outgoing" => index.outgoing(&required_string(p, "identity")?),
        _ => return Err("direction must be incoming or outgoing".into()),
    };
    let query = p
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    let rows = rows.into_iter().filter(|r| {
        format!(
            "{} {} {} {} {}",
            r.source_label, r.field, r.target_label, r.meaning, r.source
        )
        .to_lowercase()
        .contains(&query)
    });
    Ok(page(
        session,
        p,
        rows.map(|r| serde_json::to_value(r).unwrap()).collect(),
    ))
}

fn trace(session: &EditorSession, p: &Value) -> Result<Value, String> {
    let offset = p.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = p
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let depth = p.get("depthLimit").and_then(Value::as_u64).unwrap_or(8) as usize;
    let ancestors: Vec<String> = read_array(p, "ancestors")?;
    let positions: Vec<Option<i16>> = read_array(p, "ancestorPositions")?;
    let contexts: Vec<Option<String>> = read_array(p, "ancestorContexts")?;
    let required_position = p["requiredPosition"]
        .as_i64()
        .map(i16::try_from)
        .transpose()
        .map_err(|_| "Caller step position is out of range")?;
    if required_position.is_some_and(|value| !(0..8).contains(&value))
        || positions
            .iter()
            .flatten()
            .any(|value| !(0..8).contains(value))
    {
        return Err("Caller step positions must be between 0 and 7.".into());
    }
    let trace = session
        .discovery()
        .trace(providence_core::discovery::TraceQuery {
            kind: &required_string(p, "kind")?,
            id: &required_string(p, "id")?,
            offset,
            limit,
            depth_limit: depth,
            filter: p["query"].as_str().unwrap_or(""),
            batch_token: p["batchToken"].as_str().filter(|value| !value.is_empty()),
            advance_work: p["advanceWork"].as_bool().unwrap_or(false),
            identity: p["identity"].as_str().filter(|value| !value.is_empty()),
            scope: p["scope"].as_str(),
            ancestors: &ancestors,
            required_position,
            ancestor_positions: &positions,
            ancestor_contexts: &contexts,
            caller_context: p["callerContext"].as_str(),
        })?;
    Ok(
        json!({"trace": trace, "revision": session.revision(), "projectId": session.snapshot().project_id, "offset": offset, "limit": limit}),
    )
}

fn quest_flow(session: &EditorSession, p: &Value) -> Result<Value, String> {
    let id = p
        .get("id")
        .and_then(Value::as_i64)
        .ok_or("id is required")?;
    if !(1..=126).contains(&id) {
        return Err("Quest ID must be 1 through 126.".into());
    }
    let role = required_string(p, "role")?;
    if !matches!(role.as_str(), "checks" | "changes") {
        return Err("role must be checks or changes".into());
    }
    let query = p
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    let rows = session.discovery().quests.iter().filter(|r| {
        i64::from(r.quest_id) == id
            && if role == "checks" {
                r.checks
            } else {
                r.changes
            }
    });
    let rows: Vec<_> = rows
        .filter(|r| {
            format!(
                "{} {} {} {} {}",
                r.source, r.source_label, r.effect, r.condition, r.branch
            )
            .to_lowercase()
            .contains(&query)
        })
        .map(|r| serde_json::to_value(r).unwrap())
        .collect();
    let mut params = p.clone();
    let origin = p["origin"].as_str().unwrap_or("");
    let found = rows
        .iter()
        .position(|row: &Value| row["occurrence"].as_str() == Some(origin));
    if !origin.is_empty()
        && let Some(index) = found
    {
        params["offset"] = json!((index / 64) * 64);
    }
    let mut result = page(session, &params, rows);
    result["originFound"] = json!(!origin.is_empty() && found.is_some());
    Ok(result)
}

fn read_array<T: serde::de::DeserializeOwned>(p: &Value, key: &str) -> Result<Vec<T>, String> {
    p.get(key)
        .map(|v| serde_json::from_value(v.clone()))
        .transpose()
        .map_err(|_| format!("{key} must be an array of valid caller values"))
        .map(Option::unwrap_or_default)
}
