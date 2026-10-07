use crate::{
    execute,
    request_params::{required_string, required_u64, required_value},
};
use providence_core::dungeon_features::{
    DungeonFeatureEdit, inspect_dungeon_features, preview_dungeon_features,
};
use providence_core::model::{MapCoordinate, StableId};
use providence_core::session::{EditorCommand, EditorSession, Revision};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let identity = StableId(required_string(params, "identity")?);
    if method == "dungeon-cell.selection" {
        let cells: Vec<MapCoordinate> =
            serde_json::from_value(required_value(params, "cells")?.clone())
                .map_err(|error| format!("invalid Dungeon selection: {error}"))?;
        let features = inspect_dungeon_features(session.snapshot(), &identity, &cells)
            .map_err(|error| error.to_string())?;
        return Ok(
            json!({"revision":session.revision(), "mapIdentity":identity, "cells":cells, "features":features}),
        );
    }
    let expected = Revision(required_u64(params, "expectedRevision")?);
    if expected != session.revision() {
        return Err(format!(
            "revision conflict: expected {}, current {}",
            expected.0,
            session.revision().0
        ));
    }
    let edit: DungeonFeatureEdit = serde_json::from_value(required_value(params, "edit")?.clone())
        .map_err(|error| format!("invalid Dungeon feature draft: {error}"))?;
    let preview = preview_dungeon_features(session.snapshot(), &identity, &edit)
        .map_err(|error| error.to_string())?;
    let original_features = inspect_dungeon_features(session.snapshot(), &identity, &edit.cells)
        .map_err(|error| error.to_string())?;
    let mut result = if method == "dungeon-cell.preview-features" {
        json!({"revision":session.revision(), "mapIdentity":identity, "canApply":!preview.painted_cells.is_empty()})
    } else {
        execute(
            session,
            params,
            EditorCommand::ApplyDungeonFeatures { identity, edit },
        )?
    };
    result["renderCells"] =
        json!(preview.painted_cells.iter().map(|cell| {
        let (sprites, behaviors) = crate::map_rendering::dungeon_cell_render_layers(cell.tile);
        json!({"x":cell.x,"y":cell.y,"spriteLayers":sprites,"behaviorOverlays":behaviors})
    }).collect::<Vec<_>>());
    result["paintedCells"] = json!(preview.painted_cells);
    result["unchangedCells"] = json!(preview.unchanged_cells);
    result["managedCells"] = json!(preview.managed_cells);
    result["originalFeatures"] = json!(original_features);
    Ok(result)
}

#[cfg(test)]
mod tests;
