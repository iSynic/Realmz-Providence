//! Native special land requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_string;
use crate::world_route_projections::special_land_projection;
use providence_core::codecs::SPECIAL_LAND_TILE_DEFAULT_ID;
use providence_core::codecs::SPECIAL_LAND_TILE_MAX_ID;
use providence_core::codecs::SPECIAL_LAND_TILE_MIN_ID;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::references::ResolutionState;
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
        "special-land.list" => special_land_list(session, params),
        "special-land.open" => special_land_open(session, params),
        "special-land.update" => special_land_update(session, params),
        "special-land.remove" => special_land_remove(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn special_land_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let tiles = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.kind == "special-land-tile")
        .collect::<Vec<_>>();
    let items = tiles
        .iter()
        .skip(offset)
        .take(limit)
        .map(|asset| special_land_projection(session, asset))
        .collect::<Vec<_>>();
    let missing_targets = session
        .references()
        .into_iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::SpecialLandTile
                && reference.resolution == ResolutionState::Missing
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "items": items,
        "missingTargets": missing_targets,
        "offset": offset,
        "limit": limit,
        "total": tiles.len(),
        "revision": session.revision(),
        "defaultResourceId": SPECIAL_LAND_TILE_DEFAULT_ID,
    }))
}

fn special_land_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "special-land-tile")
        .ok_or_else(|| format!("Special Land Tile '{}' was not found", identity.0))?;
    let uses = session
        .references()
        .into_iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::SpecialLandTile
                && asset
                    .classic_resource
                    .as_ref()
                    .is_some_and(|resource| reference.target_id == resource.resource_id.to_string())
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "tile": special_land_projection(session, asset),
        "source": asset.source,
        "sourceBlob": asset.blob,
        "classicPayloadBlob": asset.classic_payload_blob,
        "classicPayloadBytes": asset.classic_payload_byte_length,
        "usedBy": uses,
    }))
}

fn special_land_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let mut asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "special-land-tile")
        .cloned()
        .ok_or_else(|| format!("Special Land Tile '{}' was not found", identity.0))?;
    if let Some(label) = params.get("label").and_then(Value::as_str) {
        let label = label.trim();
        if label.is_empty() {
            return Err("Special Land Tile label cannot be empty".into());
        }
        asset.label = label.into();
    }
    if let Some(resource_id) = params.get("resourceId").and_then(Value::as_i64) {
        let resource_id = i16::try_from(resource_id).map_err(|_| {
            "special-land resourceId is outside the Classic signed-short range".to_string()
        })?;
        if !(SPECIAL_LAND_TILE_MIN_ID..=SPECIAL_LAND_TILE_MAX_ID).contains(&resource_id) {
            return Err("Special Land Tile resourceId must be a negative signed-short ID".into());
        }
        asset.classic_resource = Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: i32::from(resource_id),
        });
    }
    if params.get("landlook").is_some() {
        asset.landlook = params
            .get("landlook")
            .and_then(Value::as_i64)
            .map(i8::try_from)
            .transpose()
            .map_err(|_| "special-land landlook is outside the signed-byte range".to_string())?;
    }
    if params.get("baseTile").is_some() {
        asset.base_tile = params
            .get("baseTile")
            .and_then(Value::as_i64)
            .map(i16::try_from)
            .transpose()
            .map_err(|_| "special-land baseTile is outside the signed-short range".to_string())?;
    }
    execute(
        session,
        &params,
        EditorCommand::UpsertAsset {
            asset: Box::new(asset),
        },
    )
}

fn special_land_remove(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RemoveAsset {
            identity: StableId(required_string(&params, "identity")?),
        },
    )
}
