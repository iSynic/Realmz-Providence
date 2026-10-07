//! Native pictures requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::picture_media::picture_projection;
use crate::request_params::required_string;
use providence_core::codecs::SCENARIO_PICTURE_MAX_ID;
use providence_core::codecs::SCENARIO_PICTURE_MIN_ID;
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
        "picture.list" => picture_list(session, params),
        "picture.open" => picture_open(session, params),
        "picture.update" => picture_update(session, params),
        "picture.remove" => picture_remove(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn picture_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let pictures = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.kind == "picture")
        .collect::<Vec<_>>();
    let items = pictures
        .iter()
        .skip(offset)
        .take(limit)
        .map(|asset| picture_projection(asset))
        .collect::<Vec<_>>();
    Ok(json!({
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": pictures.len(),
        "revision": session.revision(),
    }))
}

fn picture_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "picture")
        .ok_or_else(|| format!("Scenario Picture '{}' was not found", identity.0))?;
    Ok(json!({
        "revision": session.revision(),
        "picture": picture_projection(asset),
        "source": asset.source,
        "sourceBlob": asset.blob,
        "classicPayloadBlob": asset.classic_payload_blob,
        "classicPayloadBytes": asset.classic_payload_byte_length,
    }))
}

fn picture_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let mut asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "picture")
        .cloned()
        .ok_or_else(|| format!("Scenario Picture '{}' was not found", identity.0))?;
    if let Some(label) = params.get("label").and_then(Value::as_str) {
        let label = label.trim();
        if label.is_empty() {
            return Err("Scenario Picture label cannot be empty".into());
        }
        asset.label = label.into();
    }
    if let Some(resource_id) = params.get("resourceId").and_then(Value::as_i64) {
        let resource_id = i16::try_from(resource_id).map_err(|_| {
            "picture resourceId is outside the Classic signed-short range".to_string()
        })?;
        if !(SCENARIO_PICTURE_MIN_ID..=SCENARIO_PICTURE_MAX_ID).contains(&resource_id) {
            return Err("Scenario Picture resourceId must be between 30000 and 30128".into());
        }
        asset.classic_resource = Some(ClassicResourceKey {
            resource_type: "PICT".into(),
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

fn picture_remove(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RemoveAsset {
            identity: StableId(required_string(&params, "identity")?),
        },
    )
}
