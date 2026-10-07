//! Atomic, named Dungeon feature edits preserve markers owned by other workflows.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::codecs::{DungeonPrimitive, DungeonPrimitiveWriterStatus, apply_dungeon_primitive};
use crate::model::{
    CLASSIC_MAP_SIZE, LevelType, MapCoordinate, MapLevel, ProjectSnapshot, StableId,
};
use crate::session::{LandMapCellPaint, SessionError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DungeonFeatureChange {
    pub primitive: DungeonPrimitive,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DungeonFeatureEdit {
    pub cells: Vec<MapCoordinate>,
    pub changes: Vec<DungeonFeatureChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DungeonFeaturePreview {
    pub painted_cells: Vec<LandMapCellPaint>,
    pub unchanged_cells: usize,
    pub managed_cells: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DungeonFeatureState {
    pub primitive: DungeonPrimitive,
    /// None means mixed selection; leaving this control untouched retains each cell.
    pub enabled: Option<bool>,
}

pub fn inspect_dungeon_features(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    cells: &[MapCoordinate],
) -> Result<Vec<DungeonFeatureState>, SessionError> {
    let map = dungeon_map(snapshot, identity)?;
    validate_coordinates(identity, cells)?;
    Ok(DungeonPrimitive::ALL
        .into_iter()
        .filter(|primitive| {
            primitive.writer_status() == DungeonPrimitiveWriterStatus::WriterSafePrimitive
        })
        .map(|primitive| {
            let first = map.tiles[index(&cells[0])] as u16 & primitive.mask() != 0;
            let uniform = cells
                .iter()
                .all(|cell| (map.tiles[index(cell)] as u16 & primitive.mask() != 0) == first);
            DungeonFeatureState {
                primitive,
                enabled: uniform.then_some(first),
            }
        })
        .collect())
}

pub fn preview_dungeon_features(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    edit: &DungeonFeatureEdit,
) -> Result<DungeonFeaturePreview, SessionError> {
    let map = dungeon_map(snapshot, identity)?;
    validate_coordinates(identity, &edit.cells)?;
    validate_changes(identity, &edit.changes)?;
    let mut result = DungeonFeaturePreview {
        painted_cells: Vec::new(),
        unchanged_cells: 0,
        managed_cells: 0,
    };
    for cell in &edit.cells {
        let original = map.tiles[index(cell)];
        let mut tile = original;
        for change in &edit.changes {
            tile = apply_dungeon_primitive(tile, change.primitive, change.enabled)
                .expect("all requested primitives were validated before planning");
        }
        result.managed_cells += usize::from(original as u16 & 0x9060 != 0);
        if tile == original {
            result.unchanged_cells += 1;
        } else {
            result.painted_cells.push(LandMapCellPaint {
                x: cell.x,
                y: cell.y,
                tile,
            });
        }
    }
    Ok(result)
}

fn dungeon_map<'a>(
    snapshot: &'a ProjectSnapshot,
    identity: &StableId,
) -> Result<&'a MapLevel, SessionError> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
    if map.level_type != LevelType::Dungeon {
        return Err(SessionError::InvalidMapKind {
            identity: identity.clone(),
            expected: LevelType::Dungeon,
        });
    }
    if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
        return Err(invalid(
            identity,
            "the Dungeon must contain exactly 90 by 90 cells",
        ));
    }
    Ok(map)
}

fn validate_coordinates(identity: &StableId, cells: &[MapCoordinate]) -> Result<(), SessionError> {
    if cells.is_empty() || cells.len() > CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
        return Err(invalid(identity, "select 1 through 8100 cells"));
    }
    let mut seen = BTreeSet::new();
    for cell in cells {
        if usize::from(cell.x) >= CLASSIC_MAP_SIZE || usize::from(cell.y) >= CLASSIC_MAP_SIZE {
            return Err(SessionError::MapCoordinateOutOfRange {
                x: cell.x,
                y: cell.y,
            });
        }
        if !seen.insert((cell.x, cell.y)) {
            return Err(invalid(
                identity,
                "a selected coordinate appears more than once",
            ));
        }
    }
    Ok(())
}

fn validate_changes(
    identity: &StableId,
    changes: &[DungeonFeatureChange],
) -> Result<(), SessionError> {
    if changes.is_empty() || changes.len() > 12 {
        return Err(invalid(identity, "choose 1 through 12 writable features"));
    }
    let mut seen = 0;
    for change in changes {
        if change.primitive.writer_status() != DungeonPrimitiveWriterStatus::WriterSafePrimitive {
            return Err(SessionError::InvalidDungeonPrimitive {
                identity: identity.clone(),
                primitive: change.primitive,
                reason: "this marker belongs to its owning workflow".into(),
            });
        }
        if seen & change.primitive.mask() != 0 {
            return Err(invalid(identity, "a feature appears more than once"));
        }
        seen |= change.primitive.mask();
    }
    Ok(())
}

fn index(cell: &MapCoordinate) -> usize {
    usize::from(cell.y) * CLASSIC_MAP_SIZE + usize::from(cell.x)
}

pub(crate) fn invalid(identity: &StableId, reason: &str) -> SessionError {
    SessionError::InvalidMapPaint {
        identity: identity.clone(),
        reason: reason.into(),
    }
}

#[cfg(test)]
mod tests;
