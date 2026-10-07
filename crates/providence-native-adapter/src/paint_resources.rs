use crate::request_params::{required_string, required_u64, required_value};
use providence_core::{
    map_stamp::{StampPlacement, capture, preview},
    model::{MapCoordinate, StableId},
    paint_resources::{PaintResource, PaintResourceChange},
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: crate::catalogs::CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let store = store.ok_or("Save the project before managing local paint resources.")?;
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The document changed. Refresh before continuing.".into());
    }
    let resources = store
        .read_paint_resources()
        .map_err(|error| error.to_string())?;
    match method {
        "paint-resources.list" | "paint-resources.open" => {
            read_catalog(session, store, &resources, catalogs, method, params)
        }
        "paint-resources.apply" => {
            let change: PaintResourceChange =
                serde_json::from_value(required_value(params, "change")?.clone())
                    .map_err(|error| error.to_string())?;
            let changed = store
                .change_paint_resources_recorded(
                    required_u64(params, "resourceRevision")?,
                    change,
                    &required_string(params, "operationId")?,
                )
                .map_err(|error| error.to_string())?;
            Ok(json!({"revision": session.revision(), "resourceRevision": changed.revision}))
        }
        "paint-resources.operation-status" => {
            let change: PaintResourceChange =
                serde_json::from_value(required_value(params, "change")?.clone())
                    .map_err(|error| error.to_string())?;
            let receipt = store
                .paint_resource_operation_status(
                    &required_string(params, "operationId")?,
                    required_u64(params, "resourceRevision")?,
                    &change,
                )
                .map_err(|error| error.to_string())?;
            Ok(
                json!({"revision": session.revision(), "resourceRevision": resources.revision, "receipt": receipt,
                "outcome": receipt.as_ref().map(|entry| if entry.committed { "committed" } else { "not-committed" }).unwrap_or("unknown")}),
            )
        }
        "paint-resources.capture" => capture_selection(session, params, resources.revision),
        "paint-resources.preview-features" => preview_features(session, params),
        "paint-resources.preview" => preview_resource(session, Some(store), catalogs, params),
        "paint-resources.geometry" => preview_geometry(session, params),
        "map-stamp.preview" | "map-stamp.apply" => {
            placement(session, &resources, Some(store), catalogs, method, params)
        }
        _ => Err(format!("Unknown paint resource command {method}")),
    }
}

fn read_catalog(
    session: &EditorSession,
    store: &ProjectStore,
    resources: &providence_core::paint_resources::PaintResources,
    catalogs: crate::catalogs::CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let atlas = resolved_atlas(session, Some(store), catalogs, params);
    let mut result = crate::paint_resource_catalog::read(
        session,
        resources,
        catalogs.application_media,
        atlas.as_ref(),
        method,
        params,
    )?;
    if method == "paint-resources.open" && result["availabilityReason"].is_null() {
        let resource = serde_json::from_value(result["resource"].clone())
            .map_err(|error| error.to_string())?;
        result["specialPreviews"] = crate::special_land_artwork::resource_previews(
            session,
            Some(store),
            catalogs,
            &resource,
        )?;
    }
    Ok(result)
}

fn capture_selection(
    session: &EditorSession,
    params: &Value,
    resource_revision: u64,
) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    let cells: Vec<MapCoordinate> =
        serde_json::from_value(required_value(params, "cells")?.clone())
            .map_err(|error| error.to_string())?;
    let resource: PaintResource =
        serde_json::from_value(required_value(params, "resource")?.clone())
            .map_err(|error| error.to_string())?;
    let capture = capture(session.snapshot(), &identity, &cells, resource)
        .map_err(|error| error.to_string())?;
    Ok(
        json!({"revision":session.revision(), "resourceRevision":resource_revision, "capture":capture,"renderCells":crate::paint_resource_catalog::render_resource_cells(&capture.resource)}),
    )
}

fn placement(
    session: &mut EditorSession,
    resources: &providence_core::paint_resources::PaintResources,
    store: Option<&ProjectStore>,
    catalogs: crate::catalogs::CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    let resource_id = StableId(required_string(params, "resourceIdentity")?);
    let atlas = resolved_atlas(session, store, catalogs, params);
    let resource = selected_resource(session, resources, &resource_id, params, atlas.as_ref())?;
    let special_previews =
        crate::special_land_artwork::resource_previews(session, store, catalogs, &resource)?;
    let origin: MapCoordinate = serde_json::from_value(required_value(params, "origin")?.clone())
        .map_err(|error| error.to_string())?;
    let placement = StampPlacement { resource, origin };
    let plan =
        preview(session.snapshot(), &identity, &placement).map_err(|error| error.to_string())?;
    let bounds = json!({"left":origin.x,"top":origin.y,"right":origin.x + placement.resource.width - 1,"bottom":origin.y + placement.resource.height - 1});
    let mut result = if method == "map-stamp.apply" {
        crate::execute(
            session,
            params,
            EditorCommand::ApplyMapStamp {
                identity,
                placement,
            },
        )?
    } else {
        json!({"revision": session.revision(), "mapIdentity": identity})
    };
    result["preview"] = json!(plan);
    result["bounds"] = bounds;
    result["paintedCells"] = json!(plan.painted_cells);
    result["protectedCells"] = json!(plan.protected_cells);
    result["unchangedCells"] = json!(plan.unchanged_cells);
    result["managedCells"] = json!(plan.managed_cells);
    result["renderCells"] =
        json!(plan.painted_cells.iter().map(|cell| {
        let (sprites, behaviors) = crate::map_rendering::dungeon_cell_render_layers(cell.tile);
        json!({"x":cell.x,"y":cell.y,"spriteLayers":sprites,"behaviorOverlays":behaviors})
    }).collect::<Vec<_>>());
    result["terrainCells"] = json!(plan.painted_cells.iter().map(|cell| json!({"x":cell.x,"y":cell.y,"tile":if cell.tile<0 {Some(cell.tile)} else {providence_core::map_paint::terrain_tile(cell.tile).map(|tile|tile as i16)}})).collect::<Vec<_>>());
    result["specialPreviews"] = special_previews;
    result["canApply"] = json!(!plan.painted_cells.is_empty() && plan.protected_cells.is_empty());
    Ok(result)
}

fn selected_resource(
    session: &EditorSession,
    resources: &providence_core::paint_resources::PaintResources,
    identity: &StableId,
    params: &Value,
    atlas: Option<&providence_core::terrain_joining::AtlasEvidence>,
) -> Result<PaintResource, String> {
    if identity.0.starts_with("preset:") {
        let map = crate::paint_resource_catalog::context_map(session, params)
            .ok_or("Choose a map before selecting a built-in stamp.")?;
        let entry = providence_core::paint_resources::builtins::catalog_mapped(
            session.snapshot(),
            map,
            atlas,
        )
        .into_iter()
        .find(|entry| entry.resource.identity == *identity)
        .ok_or("This built-in stamp is unavailable.")?;
        if let Some(reason) = entry.availability_reason {
            return Err(reason);
        }
        return Ok(entry.resource);
    }
    if let Some(id) = identity.0.strip_prefix("special:") {
        return special_land_resource(session, identity, params, id);
    }
    if required_u64(params, "resourceRevision")? != resources.revision {
        return Err("The local resource changed. Refresh the stamp preview.".into());
    }
    resources
        .entries
        .iter()
        .find(|entry| entry.identity == *identity)
        .cloned()
        .ok_or("The resource no longer exists.".into())
}

fn resolved_atlas(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: crate::catalogs::CatalogViews<'_>,
    params: &Value,
) -> Option<providence_core::terrain_joining::AtlasEvidence> {
    let map = crate::paint_resource_catalog::context_map(session, params)?;
    if map.level_type != providence_core::model::LevelType::Land {
        return None;
    }
    let projection = crate::map_rendering::resolve_map_atlas(
        session,
        store,
        catalogs.application_media,
        catalogs.application_media_store,
        map,
    )
    .ok()?;
    crate::terrain_atlas::evidence(&projection).ok()
}

#[cfg(test)]
mod tests;

fn preview_features(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let tile = crate::request_params::required_i16(params, "tile")?;
    let changes: Vec<providence_core::dungeon_features::DungeonFeatureChange> =
        serde_json::from_value(required_value(params, "changes")?.clone())
            .map_err(|error| error.to_string())?;
    let preview = providence_core::paint_resources::dungeon_cells::preview(tile, &changes)?;
    let (sprites, behaviors) = crate::map_rendering::dungeon_cell_render_layers(preview.tile);
    Ok(
        json!({"revision":session.revision(),"preview":preview,"renderCell":{"spriteLayers":sprites,"behaviorOverlays":behaviors}}),
    )
}

fn preview_resource(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: crate::catalogs::CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let resource: PaintResource =
        serde_json::from_value(required_value(params, "resource")?.clone())
            .map_err(|error| error.to_string())?;
    resource.validate()?;
    Ok(
        json!({"revision":session.revision(),"renderCells":crate::paint_resource_catalog::render_resource_cells(&resource),
            "specialPreviews":crate::special_land_artwork::resource_previews(session,store,catalogs,&resource)?}),
    )
}

fn preview_geometry(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let resource: PaintResource =
        serde_json::from_value(required_value(params, "resource")?.clone())
            .map_err(|error| error.to_string())?;
    let edit = serde_json::from_value(required_value(params, "edit")?.clone())
        .map_err(|error| error.to_string())?;
    let preview = providence_core::paint_resources::geometry::preview(&resource, edit)?;
    Ok(json!({"revision":session.revision(),"preview":preview,
        "renderCells":crate::paint_resource_catalog::render_resource_cells(&preview.resource)}))
}

fn special_land_resource(
    session: &EditorSession,
    identity: &StableId,
    params: &Value,
    id: &str,
) -> Result<PaintResource, String> {
    let id: i16 = id
        .parse()
        .map_err(|_| "The Special Land identity is invalid.")?;
    if !(-999..=-1).contains(&id) {
        return Err("The Special Land identity is not a resource ID.".into());
    }
    let map = crate::paint_resource_catalog::context_map(session, params)
        .ok_or("Choose the destination Land map first.")?;
    if map.level_type != providence_core::model::LevelType::Land {
        return Err("Special Land placement requires a Land map.".into());
    }
    Ok(PaintResource {
        identity: identity.clone(),
        name: format!("Special Land {id}"),
        collection: "".into(),
        kind: providence_core::paint_resources::PaintResourceKind::Stamp,
        level_type: map.level_type,
        tileset_id: map
            .runtime
            .as_ref()
            .ok_or("The map has no artwork identity.")?
            .tileset_id
            .clone(),
        width: 1,
        height: 1,
        cells: vec![providence_core::paint_resources::PaintResourceCell {
            x: 0,
            y: 0,
            tile: id,
        }],
        favorite: false,
    })
}
