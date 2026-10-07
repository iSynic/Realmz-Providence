//! Bounded editor selection adapted from Providence 56ac232c,
//! src/editor/map/{mapCellShapes,connectedMapSelection}.ts. Selection is derived.

use crate::model::{CLASSIC_MAP_SIZE, LevelType, MapCoordinate, ProjectSnapshot, StableId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, VecDeque};

mod enclosure;
mod land_families;
mod land_matching;
mod shapes;

/// Explicitly filling a mask differs from adding a stroke: existing holes are filled too.
pub(crate) fn fill_enclosed_mask(cells: &[MapCoordinate]) -> Vec<MapCoordinate> {
    enclosure::fill(cells)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SelectionShape {
    Cell,
    Freehand,
    Line,
    Rectangle,
    Ellipse,
    ConnectedExact,
    ConnectedFeatures,
    ConnectedFamily,
    ConnectedBehavior,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SelectionOperation {
    Replace,
    Add,
    Subtract,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MapSelectionRequest {
    pub shape: SelectionShape,
    pub start: MapCoordinate,
    pub end: MapCoordinate,
    pub filled: bool,
    pub operation: SelectionOperation,
    pub current: Vec<MapCoordinate>,
    #[serde(default)]
    pub path: Vec<MapCoordinate>,
}

pub fn preview_map_selection(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    request: &MapSelectionRequest,
) -> Result<Vec<MapCoordinate>, String> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or_else(|| format!("map '{}' is unavailable", identity.0))?;
    if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
        return Err("The map does not have the required 90 × 90 cells.".into());
    }
    if !valid(&request.start)
        || !valid(&request.end)
        || request.current.len() > 8100
        || request.current.iter().any(|cell| !valid(cell))
        || request.path.len() > 8100
        || request.path.iter().any(|cell| !valid(cell))
        || request.shape == SelectionShape::Freehand && request.path.is_empty()
    {
        return Err("Selection coordinates must be inside the 90 × 90 map.".into());
    }
    let component = match request.shape {
        SelectionShape::ConnectedExact
        | SelectionShape::ConnectedFeatures
        | SelectionShape::ConnectedFamily
        | SelectionShape::ConnectedBehavior => {
            if request.shape == SelectionShape::ConnectedFeatures
                && map.level_type != LevelType::Dungeon
            {
                return Err("Writable-feature matching requires a Dungeon map.".into());
            }
            if matches!(
                request.shape,
                SelectionShape::ConnectedFamily | SelectionShape::ConnectedBehavior
            ) && map.level_type != LevelType::Land
            {
                return Err("Terrain family and behavior matching require a Land map.".into());
            }
            connected(snapshot, map, &request.start, request.shape)
        }
        _ => shapes::geometry(request),
    };
    Ok(combine(request, component))
}

fn combine(request: &MapSelectionRequest, component: Vec<MapCoordinate>) -> Vec<MapCoordinate> {
    let mut indices: BTreeSet<usize> = if request.operation == SelectionOperation::Replace {
        BTreeSet::new()
    } else {
        request.current.iter().map(index).collect()
    };
    for cell in component {
        if request.operation == SelectionOperation::Subtract {
            indices.remove(&index(&cell));
        } else {
            indices.insert(index(&cell));
        }
    }
    if request.shape == SelectionShape::Freehand
        && request.filled
        && request.operation == SelectionOperation::Add
    {
        enclosure::close_added_outline(&mut indices, &request.current);
    }
    indices.into_iter().map(coordinate).collect()
}

fn connected(
    snapshot: &ProjectSnapshot,
    map: &crate::model::MapLevel,
    start: &MapCoordinate,
    shape: SelectionShape,
) -> Vec<MapCoordinate> {
    let tiles = &map.tiles;
    let mut visited = [false; 8100];
    let mut queue = VecDeque::from([index(start)]);
    visited[index(start)] = true;
    let mut result = Vec::new();
    let mask = if shape == SelectionShape::ConnectedFeatures {
        !0x9060_u16
    } else {
        u16::MAX
    };
    let target = tiles[index(start)] as u16 & mask;
    while let Some(next) = queue.pop_front() {
        let matches = if matches!(
            shape,
            SelectionShape::ConnectedFamily | SelectionShape::ConnectedBehavior
        ) {
            land_matching::matches(snapshot, map, shape, tiles[next], tiles[index(start)])
        } else {
            tiles[next] as u16 & mask == target
        };
        if !matches {
            continue;
        }
        let cell = coordinate(next);
        result.push(cell);
        for dy in -1..=1_i16 {
            for dx in -1..=1_i16 {
                let x = i16::from(cell.x) + dx;
                let y = i16::from(cell.y) + dy;
                if !(0..90).contains(&x) || !(0..90).contains(&y) {
                    continue;
                }
                let neighbor = y as usize * 90 + x as usize;
                if !visited[neighbor] {
                    visited[neighbor] = true;
                    queue.push_back(neighbor);
                }
            }
        }
    }
    result
}

fn valid(cell: &MapCoordinate) -> bool {
    cell.x < 90 && cell.y < 90
}
fn index(cell: &MapCoordinate) -> usize {
    usize::from(cell.y) * 90 + usize::from(cell.x)
}
fn coordinate(index: usize) -> MapCoordinate {
    MapCoordinate {
        x: (index % 90) as u8,
        y: (index / 90) as u8,
    }
}

#[cfg(test)]
mod land_tests;
#[cfg(test)]
mod tests;
