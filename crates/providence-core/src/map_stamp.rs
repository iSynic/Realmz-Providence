//! Sparse 32×32 convenience stamps never copy AP, Note or unknown ownership bits.
use crate::{
    map_paint::{invalid, terrain_tile},
    model::{LevelType, MapCoordinate, MapLevel, ProjectSnapshot, StableId},
    paint_resources::{PaintResource, PaintResourceCell, PaintResourceKind},
    session::{LandMapCellPaint, SessionError},
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StampPlacement {
    pub resource: PaintResource,
    pub origin: MapCoordinate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StampPreview {
    pub painted_cells: Vec<LandMapCellPaint>,
    pub protected_cells: Vec<MapCoordinate>,
    pub managed_cells: usize,
    pub unchanged_cells: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StampCapture {
    pub resource: PaintResource,
    pub omitted_cells: usize,
}

pub fn capture(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    selected: &[MapCoordinate],
    mut resource: PaintResource,
) -> Result<StampCapture, SessionError> {
    let map = map(snapshot, identity)?;
    if selected.is_empty() || selected.len() > 1024 {
        return Err(invalid(
            identity,
            "Select 1 through 1024 cells for a stamp.",
        ));
    }
    let mut seen = BTreeSet::new();
    if selected
        .iter()
        .any(|cell| cell.x >= 90 || cell.y >= 90 || !seen.insert((cell.y, cell.x)))
    {
        return Err(invalid(
            identity,
            "Capture coordinates must be distinct and inside the map.",
        ));
    }
    let left = selected.iter().map(|cell| cell.x).min().unwrap();
    let top = selected.iter().map(|cell| cell.y).min().unwrap();
    resource.width = selected.iter().map(|cell| cell.x).max().unwrap() - left + 1;
    resource.height = selected.iter().map(|cell| cell.y).max().unwrap() - top + 1;
    resource.kind = PaintResourceKind::Stamp;
    resource.level_type = map.level_type;
    resource.tileset_id = atlas(map, identity)?.clone();
    resource.cells.clear();
    let mut omitted_cells = 0;
    for (y, x) in seen {
        let raw = map.tiles[usize::from(y) * 90 + usize::from(x)];
        let tile = match map.level_type {
            LevelType::Land => terrain_tile(raw).map(|tile| tile as i16),
            LevelType::Dungeon => Some((raw as u16 & !0x9060) as i16),
        };
        if let Some(tile) = tile {
            resource.cells.push(PaintResourceCell {
                x: x - left,
                y: y - top,
                tile,
            });
        } else {
            omitted_cells += 1;
        }
    }
    resource
        .validate()
        .map_err(|reason| invalid(identity, reason))?;
    Ok(StampCapture {
        resource,
        omitted_cells,
    })
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    placement: &StampPlacement,
) -> Result<StampPreview, SessionError> {
    let map = map(snapshot, identity)?;
    let resource = &placement.resource;
    resource
        .validate()
        .map_err(|reason| invalid(identity, reason))?;
    if resource.kind != PaintResourceKind::Stamp
        || resource.level_type != map.level_type
        || *atlas(map, identity)? != resource.tileset_id
    {
        return Err(invalid(
            identity,
            "The stamp's map kind or atlas does not match this destination.",
        ));
    }
    if u16::from(placement.origin.x) + u16::from(resource.width) > 90
        || u16::from(placement.origin.y) + u16::from(resource.height) > 90
    {
        return Err(invalid(
            identity,
            "The entire stamp must fit inside the map.",
        ));
    }
    let mut result = StampPreview {
        painted_cells: vec![],
        protected_cells: vec![],
        managed_cells: 0,
        unchanged_cells: 0,
    };
    for cell in &resource.cells {
        accumulate(map, placement.origin, cell, &mut result);
    }
    Ok(result)
}

fn accumulate(
    map: &MapLevel,
    origin: MapCoordinate,
    cell: &PaintResourceCell,
    result: &mut StampPreview,
) {
    let position = MapCoordinate {
        x: origin.x + cell.x,
        y: origin.y + cell.y,
    };
    let raw = map.tiles[usize::from(position.y) * 90 + usize::from(position.x)];
    let replacement = match map.level_type {
        LevelType::Land => {
            if cell.tile < 0 {
                cell.tile
            } else {
                result.managed_cells +=
                    usize::from(terrain_tile(raw).is_some_and(|tile| raw as u16 != tile));
                crate::map_paint::replace_terrain(raw, cell.tile)
            }
        }
        LevelType::Dungeon => {
            result.managed_cells += usize::from(raw as u16 & 0x9060 != 0);
            (raw as u16 & 0x9060 | cell.tile as u16) as i16
        }
    };
    if replacement == raw {
        result.unchanged_cells += 1;
    } else {
        result.painted_cells.push(LandMapCellPaint {
            x: position.x,
            y: position.y,
            tile: replacement,
        });
    }
}

fn map<'a>(
    snapshot: &'a ProjectSnapshot,
    identity: &StableId,
) -> Result<&'a MapLevel, SessionError> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
    if map.tiles.len() != 8100 {
        return Err(invalid(identity, "A stamp requires a complete 90×90 map."));
    }
    Ok(map)
}

fn atlas<'a>(map: &'a MapLevel, identity: &StableId) -> Result<&'a StableId, SessionError> {
    map.runtime
        .as_ref()
        .map(|runtime| &runtime.tileset_id)
        .ok_or_else(|| invalid(identity, "The map has no atlas identity."))
}

#[cfg(test)]
mod tests;
