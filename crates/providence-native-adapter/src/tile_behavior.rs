use crate::{
    catalogs::CatalogViews,
    execute,
    request_params::{required_i16, required_string, required_u64, required_value},
};
use providence_core::{
    codecs::decode_custom_landlook_mapstats,
    model::{LevelType, StableId},
    monster_reference_catalog::MonsterReferenceQuery,
    random_region_authoring::references,
    session::{EditorCommand, EditorSession},
    tile_behavior::{self, TileBehaviorEdit, TileBehaviorPlan},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

struct Context {
    owner: StableId,
    look: i8,
    tile: i16,
    source: Vec<u8>,
    current: TileBehaviorEdit,
}

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let store = store.ok_or("Open a saved project before editing tile behavior.")?;
    let context = context(session, store, params)?;
    match method {
        "tile-behavior.open" => Ok(
            json!({"revision":session.revision(),"identity":context.owner,"landlook":context.look,"tile":context.tile,"edit":context.current}),
        ),
        "tile-behavior.reference.list" => reference_page(session, catalogs, params),
        "tile-behavior.combat-artwork" => combat_artwork(session, store, catalogs, &context),
        "tile-behavior.preview" | "tile-behavior.apply" => {
            review_or_apply(session, store, catalogs, method, params, context)
        }
        _ => Err(format!("Unknown tile behavior method {method}")),
    }
}

fn context(
    session: &EditorSession,
    store: &ProjectStore,
    params: &Value,
) -> Result<Context, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err(
            "The tile's project revision changed. Reopen its behavior before applying.".into(),
        );
    }
    let owner = StableId(required_string(params, "identity")?);
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == owner)
        .ok_or("The originating map no longer exists.")?;
    if map.level_type != LevelType::Land {
        return Err("Tile behavior belongs to Land maps.".into());
    }
    let look = map
        .runtime
        .as_ref()
        .and_then(|runtime| runtime.landlook)
        .ok_or("The map has no Landlook context.")?;
    let tile = required_i16(params, "tile")?;
    let catalog = session
        .snapshot()
        .landlook_catalogs
        .iter()
        .find(|row| row.landlook == look)
        .ok_or("Create or restore this Landlook's behavior metadata first.")?;
    let source = store
        .read_blob(&catalog.source_blob)
        .map_err(|error| error.to_string())?;
    let current = tile_behavior::inspect(session.snapshot(), look, tile, &source)?.edit;
    Ok(Context {
        owner,
        look,
        tile,
        source,
        current,
    })
}

fn reference_page(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let query: MonsterReferenceQuery =
        serde_json::from_value(required_value(params, "query")?.clone())
            .map_err(|error| error.to_string())?;
    if query.field != "soundId" {
        return Err("Tile behavior uses the movement sound picker.".into());
    }
    Ok(
        json!({"revision":session.revision(),"page":references::references(session.snapshot(), catalogs.application_media, &query)?}),
    )
}

fn combat_artwork(
    session: &EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    context: &Context,
) -> Result<Value, String> {
    let mut map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == context.owner)
        .expect("bound behavior owner")
        .clone();
    map.runtime.as_mut().expect("bound Landlook").tileset_id =
        StableId("dungeon-top-down-302".into());
    crate::map_rendering::resolve_map_atlas(
        session,
        Some(store),
        catalogs.application_media,
        catalogs.application_media_store,
        &map,
    )
}

fn review_or_apply(
    session: &mut EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
    context: Context,
) -> Result<Value, String> {
    let edit: TileBehaviorEdit = serde_json::from_value(required_value(params, "edit")?.clone())
        .map_err(|error| format!("Invalid tile behavior: {error}"))?;
    validate_sound(
        session,
        catalogs,
        context.current.movement_sound,
        edit.movement_sound,
    )?;
    let plan = tile_behavior::prepare(
        session.snapshot(),
        context.look,
        context.tile,
        &context.source,
        &edit,
    )?;
    if method == "tile-behavior.preview" {
        return Ok(preview(session, &context, &plan, params));
    }
    if plan.changed_fields.is_empty() {
        return Err("The tile behavior is unchanged.".into());
    }
    let blob = store
        .put_blob(&plan.bytes)
        .map_err(|error| error.to_string())?;
    let decoded = decode_custom_landlook_mapstats(&plan.bytes, context.look, blob)
        .map_err(|error| error.to_string())?;
    execute(
        session,
        params,
        EditorCommand::ImportLandlookMapstatsCatalog {
            catalog: Box::new(decoded.catalog),
            profiles: decoded.profiles,
        },
    )
}

fn preview(
    session: &EditorSession,
    context: &Context,
    plan: &TileBehaviorPlan,
    params: &Value,
) -> Value {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let affected: Vec<_> = plan.affected_maps.iter().skip(offset).take(128).map(|identity| {
        let map = session.snapshot().world.maps.iter().find(|map| map.identity == *identity).unwrap();
        let uses = map.tiles.iter().filter(|raw| providence_core::map_paint::terrain_tile(**raw) == Some(context.tile as u16)).count();
        json!({"identity":identity,"name":map.name,"nativeIndex":map.native_index,"tileUses":uses})
    }).collect();
    json!({"revision":session.revision(),"landlook":context.look,"tile":context.tile,"canApply":!plan.changed_fields.is_empty(),"changedFields":plan.changed_fields,
        "affectedMaps":affected,"offset":offset,"total":plan.affected_maps.len(),"truncated":offset.saturating_add(128)<plan.affected_maps.len()})
}

fn validate_sound(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    original: i16,
    value: i16,
) -> Result<(), String> {
    if value == 0 || value == original {
        return Ok(());
    }
    let query = MonsterReferenceQuery {
        field: "soundId".into(),
        current_value: value,
        search: value.to_string(),
        ownership: "all".into(),
        show_unavailable: true,
        offset: 0,
        seek_current: false,
        limit: 128,
    };
    let page = references::references(session.snapshot(), catalogs.application_media, &query)?;
    if page
        .items
        .iter()
        .any(|row| row.value == value && row.available)
    {
        Ok(())
    } else {
        Err(format!(
            "Sound {value} is missing or unavailable. Choose an available movement sound."
        ))
    }
}

#[cfg(test)]
mod tests;
