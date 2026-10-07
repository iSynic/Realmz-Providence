//! Native player maps requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_value;
use crate::world_route_projections::classic_source_present;
use crate::world_route_projections::player_map_catalog_item;
use providence_core::codecs::player_map_names;
use providence_core::codecs::player_map_record_has_semantics;
use providence_core::model::PlayerMapRecord;
use providence_core::model::StableId;
use providence_core::references::TargetKind;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::PlayerMapNamesDraft;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "player-map.list" => player_map_list(session, params),
        "player-map.open" => player_map_open(session, params),
        "player-map.update" => player_map_update(session, params),
        "player-map.names.update" => player_map_names_update(session, params),
        "player-map.apply-draft" => player_map_apply_draft(session, params),
        "player-map.validate" => player_map_validate(session, params),
        "player-map.create" => execute(session, &params, EditorCommand::CreatePlayerMap),
        _ => Err(format!("unknown method {method}")),
    }
}

fn player_map_validate(session: &EditorSession, params: Value) -> Result<Value, String> {
    if crate::request_params::required_u64(&params, "expectedRevision")? != session.revision().0 {
        return Err("The Player Map project changed. Reload before validating this draft.".into());
    }
    let record: PlayerMapRecord =
        serde_json::from_value(crate::request_params::coerce_integral_numbers(
            required_value(&params, "playerMap")?.clone(),
        ))
        .map_err(|error| error.to_string())?;
    let names: Option<PlayerMapNamesDraft> = params
        .get("names")
        .filter(|value| !value.is_null())
        .map(|value| serde_json::from_value(value.clone()))
        .transpose()
        .map_err(|error| error.to_string())?;
    let error = session
        .validate_player_map_draft(&record, names.as_ref())
        .err()
        .map(|error| error.to_string());
    let count = providence_core::codecs::player_map_text_byte_length;
    Ok(
        json!({"revision":session.revision(),"valid":error.is_none(),"error":error,
        "noteBytes":count(&record.note),"availableNameBytes":names.as_ref().and_then(|names| count(&names.available_name)),
        "unavailableNameBytes":names.as_ref().and_then(|names| count(&names.unavailable_name))}),
    )
}

fn player_map_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let total = session.snapshot().world.player_maps.len();
    let references = session.references();
    let diagnostics = session.diagnostics();
    let source_present = classic_source_present(session.snapshot(), "Data MD2");
    let next_free = (0..20).find(|id| {
        !session
            .snapshot()
            .world
            .player_maps
            .iter()
            .any(|row| row.native_id.0 == *id || row.identity.0 == format!("player-map:{id}"))
    });
    let records = session
        .snapshot()
        .world
        .player_maps
        .iter()
        .skip(offset)
        .take(limit)
        .map(|record| {
            player_map_catalog_item(
                record,
                session.snapshot().player_map_names.as_ref(),
                &references,
                &diagnostics,
                source_present,
            )
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "records": records,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
        "nextFreeNativeId": next_free,
        "canCreate": next_free.is_some(),
    }))
}

fn player_map_apply_draft(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let player_map: PlayerMapRecord =
        serde_json::from_value(required_value(&params, "playerMap")?.clone())
            .map_err(|error| format!("invalid player map: {error}"))?;
    let names: Option<PlayerMapNamesDraft> = params
        .get("names")
        .filter(|value| !value.is_null())
        .map(|value| serde_json::from_value(value.clone()))
        .transpose()
        .map_err(|error| format!("invalid Player Map names: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::ApplyPlayerMapDraft {
            player_map: Box::new(player_map),
            names,
        },
    )
}

fn player_map_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let record = session
        .snapshot()
        .world
        .player_maps
        .iter()
        .find(|record| record.identity == identity)
        .ok_or_else(|| format!("Player Map {} was not found", identity.0))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    let (available_name, unavailable_name) = player_map_names(
        session.snapshot().player_map_names.as_ref(),
        record.native_id.0,
    );
    Ok(json!({
        "revision": session.revision(),
        "playerMap": record,
        "names": {
            "availableName": available_name.unwrap_or_default(),
            "unavailableName": unavailable_name.unwrap_or_default(),
            "effectiveName": available_name.filter(|name| !name.is_empty()).map(ToOwned::to_owned).unwrap_or_else(|| format!("Map {}", record.native_id.0 + 1)),
            "sourceBlob": session.snapshot().player_map_names.as_ref().and_then(|catalog| catalog.source_blob.as_ref()),
        },
        "runtimeAddressable": record.native_id.0 < 20,
        "defined": player_map_record_has_semantics(record),
        "sourcePresent": classic_source_present(session.snapshot(), "Data MD2"),
        "editability": "editable",
        "referenceSummary": {
            "outgoing": references.len(),
            "usedBy": session.references().iter().filter(|reference| {
                reference.target_kind == TargetKind::PlayerMap && reference.target_id == identity.0
            }).count(),
        },
        "diagnosticCount": diagnostics.len(),
        "references": references,
        "diagnostics": diagnostics,
    }))
}

fn player_map_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let value = required_value(&params, "playerMap")?;
    if value.get("name").is_some() || value.get("unavailableName").is_some() {
        return Err("Player Map names belong to Scenario.rsrc; use player-map.names.update".into());
    }
    let player_map: PlayerMapRecord = serde_json::from_value(value.clone())
        .map_err(|error| format!("invalid player map: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdatePlayerMap {
            player_map: Box::new(player_map),
        },
    )
}

fn player_map_names_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::UpdatePlayerMapNames {
            native_id: required_u8(&params, "nativeId")?,
            available_name: required_string(&params, "availableName")?,
            unavailable_name: required_string(&params, "unavailableName")?,
        },
    )
}
