//! Native icons requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::icon_media::icon_projection;
use crate::request_params::required_string;
use providence_core::codecs::SCENARIO_ICON_MAX_ID;
use providence_core::codecs::SCENARIO_ICON_MIN_ID;
use providence_core::model::ClassicResourceKey;
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
        "icon.list" => icon_list(session, params),
        "icon.open" => icon_open(session, params),
        "icon.update" => icon_update(session, params),
        "icon.remove" => icon_remove(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn icon_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let icons = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.kind == "icon")
        .collect::<Vec<_>>();
    let items = icons
        .iter()
        .skip(offset)
        .take(limit)
        .map(|asset| icon_projection(asset))
        .collect::<Vec<_>>();
    Ok(json!({
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": icons.len(),
        "revision": session.revision(),
    }))
}

fn icon_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "icon")
        .ok_or_else(|| format!("Scenario Icon '{}' was not found", identity.0))?;
    Ok(json!({
        "revision": session.revision(),
        "icon": icon_projection(asset),
        "source": asset.source,
        "sourceBlob": asset.blob,
        "classicPayloadBlob": asset.classic_payload_blob,
        "classicPayloadBytes": asset.classic_payload_byte_length,
    }))
}

fn icon_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let mut asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "icon")
        .cloned()
        .ok_or_else(|| format!("Scenario Icon '{}' was not found", identity.0))?;
    if let Some(label) = params.get("label").and_then(Value::as_str) {
        let label = label.trim();
        if label.is_empty() {
            return Err("Scenario Icon label cannot be empty".into());
        }
        asset.label = label.into();
    }
    if let Some(resource_id) = params.get("resourceId").and_then(Value::as_i64) {
        let resource_id = i16::try_from(resource_id)
            .map_err(|_| "icon resourceId is outside the Classic signed-short range".to_string())?;
        if !(SCENARIO_ICON_MIN_ID..=SCENARIO_ICON_MAX_ID).contains(&resource_id) {
            return Err("Scenario Icon resourceId must be a positive signed-short ID".into());
        }
        asset.classic_resource = Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: i32::from(resource_id),
        });
    }
    execute(
        session,
        &params,
        EditorCommand::UpsertAsset {
            asset: Box::new(asset),
        },
    )
}

fn icon_remove(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RemoveAsset {
            identity: StableId(required_string(&params, "identity")?),
        },
    )
}
