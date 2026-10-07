use crate::request_params::{required_string, required_u64, required_value};
use providence_core::{
    land_paint_intent::{LandPaintIntent, configured_erase_tile, preview},
    map_paint::terrain_tile,
    model::StableId,
    session::{EditorCommand, EditorSession},
};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The map changed. Refresh the paint preview before applying.".into());
    }
    let identity = StableId(required_string(params, "identity")?);
    if method == "map.paint-options" {
        let erase = configured_erase_tile(session.snapshot(), &identity);
        return Ok(
            json!({"revision": session.revision(), "mapIdentity": identity,
            "eraseTile": erase.as_ref().ok(), "eraseUnavailableReason": erase.err().map(|error| error.to_string())}),
        );
    }
    let intent: LandPaintIntent = serde_json::from_value(required_value(params, "intent")?.clone())
        .map_err(|error| format!("Invalid paint options: {error}"))?;
    let plan =
        preview(session.snapshot(), &identity, &intent).map_err(|error| error.to_string())?;
    let bounds = json!({"left": intent.cells.iter().map(|cell| cell.x).min(), "top": intent.cells.iter().map(|cell| cell.y).min(),
        "right": intent.cells.iter().map(|cell| cell.x).max(), "bottom": intent.cells.iter().map(|cell| cell.y).max()});
    let erase_tile =
        if intent.operation == providence_core::land_paint_intent::LandPaintOperation::Erase {
            Some(
                configured_erase_tile(session.snapshot(), &identity)
                    .map_err(|error| error.to_string())?,
            )
        } else {
            None
        };
    let mut result = if method == "map.preview-intent" {
        json!({"revision": session.revision(), "mapIdentity": identity})
    } else {
        crate::execute(
            session,
            params,
            EditorCommand::ApplyLandPaintIntent { identity, intent },
        )?
    };
    result["canApply"] = json!(!plan.painted_cells.is_empty());
    result["bounds"] = bounds;
    result["eraseTile"] = json!(erase_tile);
    result["protectedCells"] = json!(plan.protected_cells);
    result["unchangedCells"] = json!(plan.unchanged_cells);
    result["terrainCells"] = json!(
        plan.painted_cells
            .iter()
            .map(|cell| json!({"x": cell.x, "y": cell.y,
        "tile": terrain_tile(cell.tile).map(|tile| tile.max(1))}))
            .collect::<Vec<_>>()
    );
    result["paintedCells"] = json!(plan.painted_cells);
    Ok(result)
}

#[cfg(test)]
mod tests;
