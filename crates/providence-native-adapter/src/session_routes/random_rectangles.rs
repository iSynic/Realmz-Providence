//! Native random rectangles requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_value;
use providence_core::model::RandomRectangle;
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
        "random-rectangle.list" => random_rectangle_list(session, params),
        "random-rectangle.open" => random_rectangle_open(session, params),
        "random-rectangle.upsert" => random_rectangle_upsert(session, params),
        "random-rectangle.remove" => random_rectangle_remove(session, params),
        "random-rectangle.reference.retarget" => {
            random_rectangle_reference_retarget(session, params)
        }
        "random-rectangle.field.retarget" => random_rectangle_field_retarget(session, params),
        "random-rectangle.battle-range.retarget" => {
            random_rectangle_battle_range_retarget(session, params)
        }
        _ => Err(format!("unknown method {method}")),
    }
}

fn random_rectangle_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let map_identity = StableId(required_string(&params, "mapIdentity")?);
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == map_identity)
        .ok_or_else(|| format!("map {} was not found", map_identity.0))?;
    let runtime = map
        .runtime
        .as_ref()
        .ok_or_else(|| format!("map {} has no runtime metadata", map_identity.0))?;
    let diagnostics = session.diagnostics();
    let references = session.references();
    let items = runtime
        .random_rectangles
        .iter()
        .map(|rectangle| {
            let problems = diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&rectangle.identity))
                .count();
            let links = references
                .iter()
                .filter(|reference| reference.source == rectangle.identity)
                .count();
            json!({
                "identity": rectangle.identity,
                "top": rectangle.top,
                "left": rectangle.left,
                "bottom": rectangle.bottom,
                "right": rectangle.right,
                "chanceTenThousand": rectangle.chance_ten_thousand,
                "links": links,
                "problems": problems,
            })
        })
        .collect::<Vec<_>>();
    let total = items.len();
    Ok(json!({
        "map": {
            "identity": map.identity,
            "levelType": map.level_type,
            "nativeIndex": map.native_index,
            "name": map.name,
        },
        "items": items,
        "total": total,
        "limit": providence_core::codecs::RANDOM_RECTANGLE_SLOTS,
        "truncated": false,
    }))
}

fn random_rectangle_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let (map, rectangle) = session
        .snapshot()
        .world
        .maps
        .iter()
        .find_map(|map| {
            map.runtime.as_ref().and_then(|runtime| {
                runtime
                    .random_rectangles
                    .iter()
                    .find(|rectangle| rectangle.identity == identity)
                    .map(|rectangle| (map, rectangle))
            })
        })
        .ok_or_else(|| format!("random rectangle {} was not found", identity.0))?;
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
    Ok(json!({
        "revision": session.revision(),
        "map": {
            "identity": map.identity,
            "levelType": map.level_type,
            "nativeIndex": map.native_index,
            "name": map.name,
        },
        "randomRectangle": rectangle,
        "references": references,
        "diagnostics": diagnostics,
    }))
}

fn random_rectangle_upsert(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let rectangle: RandomRectangle = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "randomRectangle")?.clone(),
    ))
    .map_err(|error| format!("invalid random rectangle: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpsertMapRandomRectangle {
            map: StableId(required_string(&params, "mapIdentity")?),
            rectangle: Box::new(rectangle),
        },
    )
}

fn random_rectangle_remove(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RemoveMapRandomRectangle {
            map: StableId(required_string(&params, "mapIdentity")?),
            slot: required_u8(&params, "slot")?,
        },
    )
}

fn random_rectangle_reference_retarget(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetRandomRectangleDoor {
            source: StableId(required_string(&params, "source")?),
            door_slot: required_u8(&params, "doorSlot")?,
            target_native_id: required_i16(&params, "targetNativeId")?,
        },
    )
}

fn random_rectangle_field_retarget(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetRandomRectangleReference {
            source: StableId(required_string(&params, "source")?),
            field: required_string(&params, "field")?,
            target_native_id: required_i16(&params, "targetNativeId")?,
        },
    )
}

fn random_rectangle_battle_range_retarget(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetRandomRectangleBattleRange {
            source: StableId(required_string(&params, "source")?),
            low_id: required_i16(&params, "lowId")?,
            high_id: required_i16(&params, "highId")?,
        },
    )
}
