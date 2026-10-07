//! Native economy requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use crate::request_params::required_value;
use providence_core::codecs::SHOP_CATEGORY_SIZE;
use providence_core::model::NativeRecordId;
use providence_core::model::ShopRecord;
use providence_core::model::StableId;
use providence_core::model::TreasureRecord;
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
        "treasure.list" => treasure_list(session, params),
        "treasure.open" => treasure_open(session, params),
        "treasure.update" => treasure_update(session, params),
        "treasure.create" => treasure_create(session, params),
        "treasure.clear" => treasure_clear(session, params),
        "treasure-reference.retarget" => treasure_reference_retarget(session, params),
        "shop.list" => shop_list(session, params),
        "shop.open" => shop_open(session, params),
        "shop.update" => shop_update(session, params),
        "shop.create" => shop_create(session, params),
        "shop.clear" => shop_clear(session, params),
        "shop-reference.retarget" => shop_reference_retarget(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn treasure_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let diagnostics = session.diagnostics();
    let items = session
        .snapshot()
        .treasures
        .iter()
        .skip(offset)
        .take(limit)
        .map(|treasure| {
            let populated = treasure
                .item_ids
                .iter()
                .filter(|item_id| **item_id > 0)
                .count();
            let problems = diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&treasure.identity))
                .count();
            json!({
                "identity": treasure.identity,
                "nativeId": treasure.native_id,
                "populatedItems": populated,
                "experience": treasure.experience,
                "gold": treasure.gold,
                "gems": treasure.gems,
                "jewelry": treasure.jewelry,
                "problems": problems,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": session.snapshot().treasures.len(),
        "truncated": offset.saturating_add(limit) < session.snapshot().treasures.len(),
        "nextNativeId": next_native_id(session.snapshot().treasures.iter().map(|record| record.native_id)),
    }))
}

fn treasure_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let native_id = required_u32(&params, "nativeId")?;
    let treasure = session
        .snapshot()
        .treasures
        .iter()
        .find(|treasure| treasure.native_id.0 == native_id)
        .ok_or_else(|| format!("treasure {native_id} was not found"))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == treasure.identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&treasure.identity))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "treasure": treasure,
        "references": references,
        "diagnostics": diagnostics,
    }))
}

fn treasure_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let treasure: TreasureRecord = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "treasure")?.clone(),
    ))
    .map_err(|error| format!("invalid treasure record: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateTreasure {
            treasure: Box::new(treasure),
        },
    )
}

fn treasure_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::CreateTreasure {
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn treasure_clear(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::ClearTreasure {
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn treasure_reference_retarget(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetTreasureItem {
            source: StableId(required_string(&params, "source")?),
            slot: required_u32(&params, "slot")?
                .try_into()
                .map_err(|_| "slot must fit in u8".to_string())?,
            target_id: required_i16(&params, "targetId")?,
        },
    )
}

fn shop_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let diagnostics = session.diagnostics();
    let problems_only = params["problemsOnly"].as_bool().unwrap_or(false);
    let shops = session
        .snapshot()
        .shops
        .iter()
        .filter_map(|shop| {
            let problems = diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&shop.identity))
                .count();
            (!problems_only || problems > 0).then_some((shop, problems))
        })
        .collect::<Vec<_>>();
    let items = shops.iter().skip(offset).take(limit).map(|(shop, problems)| {
        let active = shop
            .item_ids
            .chunks(SHOP_CATEGORY_SIZE)
            .map(|category| {
                category
                    .iter()
                    .take_while(|item_id| **item_id >= 0)
                    .filter(|item_id| **item_id > 0)
                    .count()
            })
            .sum::<usize>();
        json!({"identity": shop.identity, "nativeId": shop.native_id, "inflation": shop.inflation, "activeItems": active, "problems": problems})
    }).collect::<Vec<_>>();
    Ok(
        json!({"revision": session.revision(), "items": items, "offset": offset, "limit": limit, "total": shops.len(), "allTotal": session.snapshot().shops.len(), "truncated": offset.saturating_add(limit) < shops.len(), "nextNativeId": next_native_id(session.snapshot().shops.iter().map(|record| record.native_id))}),
    )
}

fn shop_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let native_id = required_u32(&params, "nativeId")?;
    let shop = session
        .snapshot()
        .shops
        .iter()
        .find(|shop| shop.native_id.0 == native_id)
        .ok_or_else(|| format!("shop {native_id} was not found"))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == shop.identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&shop.identity))
        .collect::<Vec<_>>();
    Ok(
        json!({"revision": session.revision(), "shop": shop, "references": references, "diagnostics": diagnostics}),
    )
}

fn shop_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let shop: ShopRecord = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "shop")?.clone(),
    ))
    .map_err(|error| format!("invalid shop record: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateShop {
            shop: Box::new(shop),
        },
    )
}

fn shop_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::CreateShop {
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn shop_clear(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::ClearShop {
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn shop_reference_retarget(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetShopItem {
            source: StableId(required_string(&params, "source")?),
            slot: required_u32(&params, "slot")?
                .try_into()
                .map_err(|_| "slot must fit in u16".to_string())?,
            target_id: required_i16(&params, "targetId")?,
        },
    )
}

fn next_native_id(ids: impl Iterator<Item = NativeRecordId>) -> Option<u32> {
    let occupied = ids
        .map(|id| id.0)
        .collect::<std::collections::BTreeSet<_>>();
    (0..=i16::MAX as u32).find(|id| !occupied.contains(id))
}
