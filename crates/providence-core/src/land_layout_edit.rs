//! One reviewed Data LL placement uses the same plan for preview and mutation.

use crate::codecs::{
    LAND_LAYOUT_CELLS, LAND_LAYOUT_COLUMNS, LAND_LAYOUT_ROWS, classic_land_index,
    classic_layout_value,
};
use crate::model::{LevelType, ProjectSnapshot, StableId};
use crate::session::SessionError;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutCellChange {
    pub row: u8,
    pub column: u8,
    pub previous_value: i16,
    pub value: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutOccupant {
    pub identity: Option<StableId>,
    pub native_index: Option<u32>,
    pub name: String,
    pub missing: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPlacementPreview {
    pub row: u8,
    pub column: u8,
    pub target: Option<LayoutOccupant>,
    pub replaced: Option<LayoutOccupant>,
    pub changes: Vec<LayoutCellChange>,
    pub creates_layout: bool,
}

pub fn preview_layout_placement(
    snapshot: &ProjectSnapshot,
    row: u8,
    column: u8,
    target: Option<&StableId>,
) -> Result<LayoutPlacementPreview, SessionError> {
    if usize::from(row) >= LAND_LAYOUT_ROWS || usize::from(column) >= LAND_LAYOUT_COLUMNS {
        return Err(SessionError::LandLayoutCoordinateOutOfRange { row, column });
    }
    let value = target_value(snapshot, target)?;
    let cell_index = usize::from(row) * LAND_LAYOUT_COLUMNS + usize::from(column);
    let original = snapshot.world.land_layout.as_ref();
    if let Some(layout) = original
        && layout.cells.len() != LAND_LAYOUT_CELLS
    {
        return Err(SessionError::InvalidLandLayoutCellCount(layout.cells.len()));
    }
    let previous_value = original.map_or(0, |layout| layout.cells[cell_index]);
    let mut changes = Vec::new();
    for index in 0..LAND_LAYOUT_CELLS {
        let previous = original.map_or(0, |layout| layout.cells[index]);
        let next = if index == cell_index {
            value
        } else if value != 0 && previous == value {
            0
        } else {
            previous
        };
        if previous != next {
            changes.push(LayoutCellChange {
                row: (index / LAND_LAYOUT_COLUMNS) as u8,
                column: (index % LAND_LAYOUT_COLUMNS) as u8,
                previous_value: previous,
                value: next,
            });
        }
    }
    Ok(LayoutPlacementPreview {
        row,
        column,
        target: occupant(snapshot, value),
        replaced: if previous_value == value {
            None
        } else {
            occupant(snapshot, previous_value)
        },
        changes,
        creates_layout: original.is_none(),
    })
}

fn target_value(
    snapshot: &ProjectSnapshot,
    target: Option<&StableId>,
) -> Result<i16, SessionError> {
    match target {
        None => Ok(0),
        Some(identity) => snapshot
            .world
            .maps
            .iter()
            .find(|map| map.identity == *identity && map.level_type == LevelType::Land)
            .and_then(|map| classic_layout_value(map.native_index))
            .ok_or_else(|| SessionError::InvalidLandLayoutTarget(identity.clone())),
    }
}

fn occupant(snapshot: &ProjectSnapshot, value: i16) -> Option<LayoutOccupant> {
    if value == 0 {
        return None;
    }
    let native_index = classic_land_index(value);
    let map = native_index.and_then(|index| {
        snapshot
            .world
            .maps
            .iter()
            .find(|map| map.level_type == LevelType::Land && map.native_index == index)
    });
    Some(LayoutOccupant {
        identity: map.map(|map| map.identity.clone()),
        native_index,
        name: map.map_or_else(
            || {
                native_index.map_or_else(
                    || "Unrecognized preserved placement".into(),
                    |index| format!("Missing Land level {index}"),
                )
            },
            |map| map.name.clone(),
        ),
        missing: map.is_none(),
    })
}

#[cfg(test)]
mod tests;
