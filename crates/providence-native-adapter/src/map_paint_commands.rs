use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_u64;
use crate::request_params::required_value;
use providence_core::map_paint::{LandTerrainPaint, preview_land_terrain_paint};
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::LandMapCellPaint;
use providence_core::session::Revision;
use serde_json::Value;
use serde_json::json;

pub(super) fn terrain_tiles(map: &MapLevel) -> Vec<Option<u16>> {
    if map.level_type != LevelType::Land {
        return Vec::new();
    }
    map.tiles
        .iter()
        .map(|&tile| providence_core::map_paint::terrain_tile(tile).map(|tile| tile.max(1)))
        .collect()
}

pub(super) fn paint_raw_cells(
    session: &mut EditorSession,
    params: &Value,
) -> Result<Value, String> {
    let cells: Vec<LandMapCellPaint> =
        serde_json::from_value(required_value(params, "cells")?.clone())
            .map_err(|error| format!("invalid land map paint cells: {error}"))?;
    let identity = StableId(required_string(params, "identity")?);
    let positions = cells.clone();
    let mut result = execute(
        session,
        params,
        EditorCommand::PaintLandMapCells {
            identity: identity.clone(),
            cells,
        },
    )?;
    let map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == identity)
        .ok_or_else(|| format!("painted map {} was not found", identity.0))?;
    result["paintedCells"] = json!(
        positions
            .iter()
            .copied()
            .map(|cell| {
                let index = usize::from(cell.y) * CLASSIC_MAP_SIZE + usize::from(cell.x);
                LandMapCellPaint {
                    tile: map.tiles[index],
                    ..cell
                }
            })
            .collect::<Vec<_>>()
    );
    result["terrainCells"] = json!(
        positions
            .iter()
            .map(|cell| {
                let index = usize::from(cell.y) * CLASSIC_MAP_SIZE + usize::from(cell.x);
                json!({"x": cell.x, "y": cell.y, "tile": providence_core::map_paint::terrain_tile(map.tiles[index]).map(|tile| tile.max(1))})
            })
            .collect::<Vec<_>>()
    );
    Ok(result)
}

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let expected = Revision(required_u64(params, "expectedRevision")?);
    if expected != session.revision() {
        return Err(format!(
            "revision conflict: expected {}, current {}",
            expected.0,
            session.revision().0
        ));
    }
    let identity = StableId(required_string(params, "identity")?);
    let paint: LandTerrainPaint = serde_json::from_value(required_value(params, "paint")?.clone())
        .map_err(|error| format!("invalid terrain brush: {error}"))?;
    let preview = preview_land_terrain_paint(session.snapshot(), &identity, &paint)
        .map_err(|error| error.to_string())?;
    let mut result = if method == "map.preview-terrain" {
        json!({"revision": session.revision(), "mapIdentity": identity})
    } else {
        execute(
            session,
            params,
            EditorCommand::PaintLandTerrain { identity, paint },
        )?
    };
    let fields = result
        .as_object_mut()
        .expect("map paint projection is an object");
    fields.insert("paintedCells".into(), json!(preview.painted_cells));
    fields.insert("protectedCells".into(), json!(preview.protected_cells));
    fields.insert("unchangedCells".into(), json!(preview.unchanged_cells));
    Ok(result)
}

#[cfg(test)]
mod tests;
