use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    model::{CLASSIC_MAP_SIZE, LevelType, MapCoordinate, MapLevel, ProjectSnapshot, StableId},
    session::{LandMapCellPaint, SessionError},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LandTerrainPaint {
    pub tileset_id: StableId,
    pub cells: Vec<LandMapCellPaint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandTerrainPaintPreview {
    pub painted_cells: Vec<LandMapCellPaint>,
    pub protected_cells: Vec<MapCoordinate>,
    pub unchanged_cells: usize,
}

/// Decode ordinary terrain without interpreting Special artwork as atlas indices.
pub fn terrain_tile(raw: i16) -> Option<u16> {
    if raw < 0 {
        return None;
    }
    let payload = (raw as u16) & !0x6000;
    let tile = payload % 1000;
    (payload / 1000 <= 3 && tile <= 200).then_some(tile)
}

/// Explicit painting replaces artwork; ordinary cell marker bands remain intact.
pub fn replace_terrain(raw: i16, tile: i16) -> i16 {
    terrain_tile(raw).map_or(tile, |source| (raw as u16 - source + tile as u16) as i16)
}

pub fn land_map<'a>(
    snapshot: &'a ProjectSnapshot,
    identity: &StableId,
) -> Result<&'a MapLevel, SessionError> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
    if map.level_type != LevelType::Land {
        return Err(SessionError::InvalidMapKind {
            identity: identity.clone(),
            expected: LevelType::Land,
        });
    }
    if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
        return Err(invalid(
            identity,
            "the map must contain exactly 90 by 90 cells",
        ));
    }
    Ok(map)
}

pub fn preview_land_terrain_paint(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    paint: &LandTerrainPaint,
) -> Result<LandTerrainPaintPreview, SessionError> {
    let map = land_map(snapshot, identity)?;
    if !map
        .runtime
        .as_ref()
        .is_some_and(|runtime| runtime.tileset_id == paint.tileset_id)
    {
        return Err(invalid(
            identity,
            "the brush atlas does not match this map's current tileset",
        ));
    }
    validate_cells(identity, &paint.cells)?;
    let mut result = LandTerrainPaintPreview {
        painted_cells: Vec::new(),
        protected_cells: Vec::new(),
        unchanged_cells: 0,
    };
    for cell in &paint.cells {
        if !(1..=200).contains(&cell.tile) {
            return Err(invalid(
                identity,
                "terrain brushes require atlas tiles 1 through 200",
            ));
        }
        let index = usize::from(cell.y) * CLASSIC_MAP_SIZE + usize::from(cell.x);
        let current = map.tiles[index];
        let replacement = replace_terrain(current, cell.tile);
        if replacement == current {
            result.unchanged_cells += 1;
        } else {
            result.painted_cells.push(LandMapCellPaint {
                tile: replacement,
                ..*cell
            });
        }
    }
    Ok(result)
}

pub(crate) fn validate_cells(
    identity: &StableId,
    cells: &[LandMapCellPaint],
) -> Result<(), SessionError> {
    let limit = CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE;
    if cells.is_empty() || cells.len() > limit {
        return Err(invalid(
            identity,
            "one operation requires 1 through 8100 cells",
        ));
    }
    let mut coordinates = BTreeSet::new();
    for cell in cells {
        if usize::from(cell.x) >= CLASSIC_MAP_SIZE || usize::from(cell.y) >= CLASSIC_MAP_SIZE {
            return Err(SessionError::MapCoordinateOutOfRange {
                x: cell.x,
                y: cell.y,
            });
        }
        if !coordinates.insert((cell.x, cell.y)) {
            return Err(invalid(
                identity,
                format!("coordinate {},{} appears more than once", cell.x, cell.y),
            ));
        }
    }
    Ok(())
}

pub(crate) fn invalid(identity: &StableId, reason: impl Into<String>) -> SessionError {
    SessionError::InvalidMapPaint {
        identity: identity.clone(),
        reason: reason.into(),
    }
}

#[cfg(test)]
mod tests;
