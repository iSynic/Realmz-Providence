//! Native sounds requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_string;
use crate::sound_media::sound_projection;
use providence_core::codecs::SCENARIO_SOUND_MAX_ID;
use providence_core::codecs::SCENARIO_SOUND_MIN_ID;
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
        "sound.list" => sound_list(session, params),
        "sound.open" => sound_open(session, params),
        "sound.update" => sound_update(session, params),
        "sound.remove" => sound_remove(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn sound_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let sounds = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.kind == "sound")
        .collect::<Vec<_>>();
    let items = sounds
        .iter()
        .skip(offset)
        .take(limit)
        .map(|asset| sound_projection(asset))
        .collect::<Vec<_>>();
    Ok(json!({
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": sounds.len(),
        "revision": session.revision(),
    }))
}

fn sound_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "sound")
        .ok_or_else(|| format!("Scenario Sound '{}' was not found", identity.0))?;
    Ok(json!({
        "revision": session.revision(),
        "sound": sound_projection(asset),
        "source": asset.source,
        "sourceBlob": asset.blob,
        "classicPayloadBlob": asset.classic_payload_blob,
        "classicPayloadBytes": asset.classic_payload_byte_length,
    }))
}

fn sound_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let mut asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "sound")
        .cloned()
        .ok_or_else(|| format!("Scenario Sound '{}' was not found", identity.0))?;
    if let Some(label) = params.get("label").and_then(Value::as_str) {
        let label = label.trim();
        if label.is_empty() {
            return Err("Scenario Sound label cannot be empty".into());
        }
        asset.label = label.into();
    }
    if let Some(resource_id) = params.get("resourceId").and_then(Value::as_i64) {
        let resource_id = i16::try_from(resource_id).map_err(|_| {
            "sound resourceId is outside the Classic signed-short range".to_string()
        })?;
        if !(SCENARIO_SOUND_MIN_ID..=SCENARIO_SOUND_MAX_ID).contains(&resource_id) {
            return Err("Scenario Sound resourceId must be between 200 and 500".into());
        }
        asset.classic_resource = Some(ClassicResourceKey {
            resource_type: "snd ".into(),
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

fn sound_remove(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RemoveAsset {
            identity: StableId(required_string(&params, "identity")?),
        },
    )
}
