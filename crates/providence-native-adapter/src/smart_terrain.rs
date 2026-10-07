use crate::request_params::{required_string, required_u64, required_value};
use providence_core::{
    model::{MapCoordinate, StableId},
    session::{EditorCommand, EditorSession},
    smart_terrain::{self, SmartTerrainIntent},
};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    dispatch_mapped(session, method, params, None)
}

pub(crate) fn dispatch_mapped(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
    atlas: Option<&providence_core::terrain_joining::AtlasEvidence>,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The map changed. Refresh Smart terrain before applying.".into());
    }
    let identity = StableId(required_string(params, "identity")?);
    if method == "smart-terrain.open" {
        return open(session, &identity, atlas);
    }
    if method == "smart-terrain.reshape" {
        providence_core::map_paint::land_map(session.snapshot(), &identity)
            .map_err(|error| error.to_string())?;
        let mask: Vec<MapCoordinate> =
            serde_json::from_value(required_value(params, "mask")?.clone())
                .map_err(|error| format!("Invalid mask: {error}"))?;
        let cells =
            smart_terrain::reshape_mask(&identity, &mask, &required_string(params, "operation")?)
                .map_err(|error| error.to_string())?;
        return Ok(json!({"revision":session.revision(),"mask":cells}));
    }
    if !matches!(method, "smart-terrain.preview" | "smart-terrain.apply") {
        return Err(format!("unknown method {method}"));
    }
    let intent: SmartTerrainIntent =
        serde_json::from_value(required_value(params, "intent")?.clone())
            .map_err(|error| format!("Invalid smart terrain: {error}"))?;
    let plan =
        smart_terrain::preview_mapped(session.snapshot(), &identity, &intent, atlas, &mut || false)
            .map_err(|error| error.to_string())?;
    let result = if method == "smart-terrain.preview" {
        json!({"revision":session.revision(),"mapIdentity":identity})
    } else {
        crate::execute(
            session,
            params,
            EditorCommand::ApplySmartTerrain(providence_core::smart_terrain::Apply {
                identity,
                intent,
                atlas: atlas.cloned(),
            }),
        )?
    };
    project_plan(result, plan)
}

fn open(
    session: &EditorSession,
    identity: &StableId,
    atlas: Option<&providence_core::terrain_joining::AtlasEvidence>,
) -> Result<Value, String> {
    if let Some(atlas) = atlas {
        let map = providence_core::map_paint::land_map(session.snapshot(), identity)
            .map_err(|error| error.to_string())?;
        atlas.validate(session.snapshot(), map)?;
        let look = map.runtime.as_ref().and_then(|runtime| runtime.landlook);
        let families: Vec<_> = [("water","Water"),("mountains","Mountains"),("forest","Trees / Forest")].into_iter().map(|(id,name)| {
            let layout = providence_core::terrain_mapping::family_layout(session.snapshot(),atlas,id,look);
            json!({"identity":id,"name":name,"available":layout.is_some(),
                "profileIdentity":layout.map(|layout| &layout.identity),"profileRevision":layout.map(|layout| layout.revision),
                "unavailableReason":layout.is_none().then_some("This family's artwork needs a reviewed terrain mapping.")})
        }).collect();
        let available = families.iter().any(|family| family["available"] == true);
        return Ok(
            json!({"revision":session.revision(),"mapIdentity":identity,"atlasBlob":atlas.blob,"mappingRevision":providence_core::terrain_mapping::revision(session.snapshot(),&atlas.tileset_id),
            "available":available,"presets":families,"unavailableReason":(!available).then_some("This artwork needs a reviewed terrain mapping.")}),
        );
    }
    let availability = smart_terrain::availability(session.snapshot(), identity);
    Ok(json!({"revision":session.revision(),"mapIdentity":identity,
        "available":availability.is_ok(),"unavailableReason":availability.err().map(|error|error.to_string()),
        "presets":[{"identity":"water","name":"Water"},{"identity":"mountains","name":"Mountains"},{"identity":"forest","name":"Trees / Forest"}]}))
}

pub(crate) fn project_plan(
    mut result: Value,
    plan: smart_terrain::SmartTerrainPlan,
) -> Result<Value, String> {
    result["canApply"] = json!(!plan.paint.painted_cells.is_empty());
    result["unresolvedReason"] = json!(plan.unresolved_reason);
    result["retiledNeighbors"] = json!(plan.retiled_neighbors);
    result["mask"] = json!(plan.mask);
    result["originalMask"] = json!(plan.mask);
    result["effectiveMask"] = json!(plan.effective_mask);
    result["addedCells"] = json!(plan.added_cells);
    result["removedCells"] = json!(plan.removed_cells);
    result["unresolvedCells"] = json!(plan.unresolved);
    result["paintedCells"] = json!(plan.paint.painted_cells);
    result["protectedCells"] = json!(plan.paint.protected_cells);
    result["unchangedCells"] = json!(plan.paint.unchanged_cells);
    result["terrainCells"] = json!(plan.paint.painted_cells.iter().map(|cell|json!({"x":cell.x,"y":cell.y,"tile":providence_core::map_paint::terrain_tile(cell.tile).map(|tile|tile.max(1))})).collect::<Vec<_>>());
    Ok(result)
}

#[cfg(test)]
mod tests;
