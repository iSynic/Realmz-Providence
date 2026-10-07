use providence_core::session::EditorSession;
use serde_json::{Value, json};

pub(super) fn resolve_exact(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let resource_id = params
        .get("resourceId")
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
        .ok_or_else(|| "missing or out-of-range integer parameter resourceId".to_string())?;
    if resource_id == 0 {
        return Err("scrolling TEXT resourceId must be nonzero".into());
    }
    let mut matches = session.snapshot().assets.iter().filter(|asset| {
        asset.kind == "text-resource"
            && asset.classic_resource.as_ref().is_some_and(|resource| {
                resource.resource_type == "TEXT" && resource.resource_id == resource_id
            })
    });
    let asset = matches
        .next()
        .ok_or_else(|| format!("exact scenario-owned TEXT resource {resource_id} was not found"))?;
    if matches.next().is_some() {
        return Err(format!(
            "exact scenario-owned TEXT resource {resource_id} is ambiguous"
        ));
    }
    Ok(json!({
        "revision": session.revision(),
        "resource": crate::text_resources::text_resource_projection(session, asset),
        "ownership": "scenario",
    }))
}
