//! Native monsters requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::monster_inventory::monster_catalog_projection;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use crate::request_params::required_value;
use providence_core::model::MonsterDescription;
use providence_core::model::MonsterRecord;
use providence_core::model::NativeRecordId;
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
        "monster.catalog" => monster_catalog(session, params),
        "monster.list" => monster_list(session, params),
        "monster.open" => monster_open(session, params),
        "monster.uses" => monster_uses(session, params),
        "monster.update" => monster_update(session, params),
        "monster.draft.prepare" | "monster.draft.apply" => {
            super::monster_drafts::dispatch(session, method, params)
        }
        "monster.operation.prepare" | "monster.operation.commit" => {
            super::monster_operations::dispatch(session, method, params)
        }
        "monster.create" => monster_create(session, params),
        "monster.duplicate" => monster_duplicate(session, params),
        "monster.clear" => monster_clear(session, params),
        "monster.switch-records" => monster_switch_records(session, params),
        "monster.copy-to-all-sets" => monster_copy_to_all_sets(session, params),
        "monster.generate-variants" => monster_generate_variants(session, params),
        "monster-description.update" | "monster.update-description" => {
            monster_description_update(session, params)
        }
        "monster-reference.retarget" => monster_reference_retarget(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn monster_uses(session: &EditorSession, params: Value) -> Result<Value, String> {
    let expected = crate::request_params::required_u64(&params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err("The project changed. Reload Monster uses.".into());
    }
    let id = required_u32(&params, "nativeId")?;
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(128)
        .clamp(1, 128) as usize;
    let uses = providence_core::monster_uses::monster_uses(session.snapshot())
        .into_iter()
        .filter(|reference| reference.target_id == id)
        .collect::<Vec<_>>();
    Ok(
        json!({"revision": session.revision(), "nativeId": id, "offset": offset, "total": uses.len(),
        "items": uses.iter().skip(offset).take(limit).collect::<Vec<_>>() }),
    )
}

fn monster_catalog(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let page = monster_catalog_projection(session.snapshot(), &params)?;
    Ok(json!({"revision": session.revision(), "catalog": page}))
}

fn monster_list(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let set_id = params.get("setId").and_then(Value::as_i64).unwrap_or(0) as i16;
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let set = session
        .snapshot()
        .monster_sets
        .iter()
        .find(|set| set.set_id == set_id)
        .ok_or_else(|| format!("monster set {set_id} was not found"))?;
    let diagnostics = session.diagnostics();
    let items = set
        .monsters
        .iter()
        .skip(offset)
        .take(limit)
        .map(|monster| {
            let problems = diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&monster.identity))
                .count();
            json!({
                "identity": monster.identity,
                "nativeId": monster.native_id,
                "displayName": monster.display_name,
                "hitDice": monster.hit_dice,
                "armor": monster.armor,
                "agility": monster.agility,
                "iconId": monster.icon_id,
                "problems": problems,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "setId": set.set_id,
        "nativePath": set.native_path,
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": set.monsters.len(),
        "truncated": offset.saturating_add(limit) < set.monsters.len(),
    }))
}

pub(super) fn monster_open(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let set_id = required_i16(&params, "setId")?;
    let native_id = required_u32(&params, "nativeId")?;
    let monster = session
        .snapshot()
        .monster_sets
        .iter()
        .find(|set| set.set_id == set_id)
        .and_then(|set| {
            set.monsters
                .iter()
                .find(|monster| monster.native_id.0 == native_id)
        })
        .ok_or_else(|| format!("monster {set_id}:{native_id} was not found"))?;
    let description = session
        .snapshot()
        .monster_descriptions
        .iter()
        .find(|description| description.native_id.0 == native_id);
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == monster.identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&monster.identity))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "setId": set_id,
        "monster": monster,
        "description": description,
        "normalNotOnMenu": session.snapshot().monster_sets.iter()
            .find(|set| set.set_id == 0)
            .and_then(|set| set.monsters.iter().find(|record| record.native_id.0 == native_id && record.hit_dice != 0))
            .map(|record| record.not_on_menu),
        "slotPreview": providence_core::monster_reference_preview::preview_monster_references(session.snapshot(), monster, false, false)?,
        "references": references,
        "diagnostics": diagnostics,
    }))
}

fn monster_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let set_id = required_i16(&params, "setId")?;
    let monster: MonsterRecord = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "monster")?.clone(),
    ))
    .map_err(|error| format!("invalid monster record: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateMonster {
            set_id,
            monster: Box::new(monster),
        },
    )
}

fn monster_create(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::CreateMonster {
            set_id: required_i16(&params, "setId")?,
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn monster_duplicate(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::DuplicateMonster {
            set_id: required_i16(&params, "setId")?,
            source_id: NativeRecordId(required_u32(&params, "sourceNativeId")?),
            target_id: NativeRecordId(required_u32(&params, "targetNativeId")?),
        },
    )
}

fn monster_clear(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::ClearMonster {
            set_id: required_i16(&params, "setId")?,
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn monster_switch_records(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::SwitchMonsterRecords {
            set_id: required_i16(&params, "setId")?,
            first_id: NativeRecordId(required_u32(&params, "firstNativeId")?),
            second_id: NativeRecordId(required_u32(&params, "secondNativeId")?),
        },
    )
}

fn monster_copy_to_all_sets(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::CopyMonsterToAllSets {
            source_set_id: required_i16(&params, "sourceSetId")?,
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn monster_generate_variants(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::GenerateMonsterVariants {
            native_id: NativeRecordId(required_u32(&params, "nativeId")?),
        },
    )
}

fn monster_description_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let description: MonsterDescription = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "description")?.clone(),
    ))
    .map_err(|error| format!("invalid monster description: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateMonsterDescription { description },
    )
}

fn monster_reference_retarget(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetMonsterReference {
            source: StableId(required_string(&params, "source")?),
            field: required_string(&params, "field")?,
            target_id: required_i16(&params, "targetId")?,
        },
    )
}
