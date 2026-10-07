//! Derived Land paint plans. Variation follows Providence 56ac232c paintResolver.ts;
//! marker handling remains governed by the canonical terrain writer.
use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    map_paint::{LandTerrainPaintPreview, invalid, land_map, terrain_tile},
    model::{MapCoordinate, ProjectSnapshot, StableId},
    session::{LandMapCellPaint, SessionError},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LandPaintOperation {
    Paint,
    Erase,
    Replace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LandPaintVariation {
    Single,
    CycleGroup,
    StableRandom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LandPaintIntent {
    pub tileset_id: StableId,
    pub cells: Vec<MapCoordinate>,
    pub operation: LandPaintOperation,
    pub selected_tile: i16,
    pub replace_tile: Option<i16>,
    pub variation: LandPaintVariation,
    pub variation_tiles: Vec<i16>,
    pub fill_percent: u8,
    pub seed: u32,
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &LandPaintIntent,
) -> Result<LandTerrainPaintPreview, SessionError> {
    let map = land_map(snapshot, identity)?;
    let runtime = map
        .runtime
        .as_ref()
        .ok_or_else(|| invalid(identity, "This map has no tileset."))?;
    if runtime.tileset_id != intent.tileset_id {
        return Err(invalid(
            identity,
            "The tile palette changed. Start a new operation.",
        ));
    }
    validate(identity, intent)?;
    let erase_tile = if intent.operation == LandPaintOperation::Erase {
        Some(configured_erase_tile(snapshot, identity)?)
    } else {
        None
    };
    let mut cells = intent.cells.clone();
    cells.sort_by_key(|cell| (cell.y, cell.x));
    let mut result = LandTerrainPaintPreview {
        painted_cells: Vec::new(),
        protected_cells: Vec::new(),
        unchanged_cells: 0,
    };
    for cell in cells {
        let raw = map.tiles[usize::from(cell.y) * 90 + usize::from(cell.x)];
        accumulate(&mut result, intent, raw, cell, erase_tile);
    }
    Ok(result)
}

fn accumulate(
    result: &mut LandTerrainPaintPreview,
    intent: &LandPaintIntent,
    raw: i16,
    cell: MapCoordinate,
    erase_tile: Option<i16>,
) {
    if intent.operation == LandPaintOperation::Replace
        && terrain_tile(raw).map(|tile| tile as i16) != intent.replace_tile
        || stable_random_index(intent.seed ^ 0x4f1bbcdc, cell.x, cell.y, 0, 100)
            >= usize::from(intent.fill_percent)
    {
        result.unchanged_cells += 1;
        return;
    }
    let selected =
        erase_tile.unwrap_or_else(|| resolve_tile(intent, &cell, result.painted_cells.len()));
    let replacement = crate::map_paint::replace_terrain(raw, selected);
    if replacement == raw {
        result.unchanged_cells += 1;
    } else {
        result.painted_cells.push(LandMapCellPaint {
            x: cell.x,
            y: cell.y,
            tile: replacement,
        });
    }
}

pub fn configured_erase_tile(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
) -> Result<i16, SessionError> {
    let map = land_map(snapshot, identity)?;
    let runtime = map
        .runtime
        .as_ref()
        .ok_or_else(|| invalid(identity, "This map has no erase tile."))?;
    let catalogs = snapshot
        .landlook_catalogs
        .iter()
        .filter(|row| Some(row.landlook) == runtime.landlook)
        .collect::<Vec<_>>();
    if catalogs.len() > 1 {
        return Err(invalid(identity, "The shared erase tile is ambiguous."));
    }
    let tile = catalogs
        .first()
        .map(|row| row.base_tile)
        .or(runtime.base_tile)
        .ok_or_else(|| {
            invalid(
                identity,
                "Configure this Landlook's erase tile in Level setup.",
            )
        })?;
    if !(0..=200).contains(&tile) {
        return Err(invalid(
            identity,
            "The configured erase tile must be 0 through 200.",
        ));
    }
    Ok(tile)
}

fn validate(identity: &StableId, intent: &LandPaintIntent) -> Result<(), SessionError> {
    if intent.cells.is_empty() || intent.cells.len() > 8100 || intent.fill_percent > 100 {
        return Err(invalid(
            identity,
            "Select 1 through 8100 cells and a fill percentage from 0 through 100.",
        ));
    }
    let mut seen = BTreeSet::new();
    if intent
        .cells
        .iter()
        .any(|cell| cell.x >= 90 || cell.y >= 90 || !seen.insert((cell.x, cell.y)))
    {
        return Err(invalid(
            identity,
            "Paint coordinates must be unique and inside the map.",
        ));
    }
    if intent.operation != LandPaintOperation::Erase && !(1..=200).contains(&intent.selected_tile) {
        return Err(invalid(
            identity,
            "Choose a terrain tile from 1 through 200.",
        ));
    }
    if intent.operation == LandPaintOperation::Replace
        && !intent
            .replace_tile
            .is_some_and(|tile| (0..=200).contains(&tile))
    {
        return Err(invalid(
            identity,
            "Choose the terrain tile to replace, from 0 through 200.",
        ));
    }
    if intent.variation_tiles.len() > 200
        || intent
            .variation_tiles
            .iter()
            .any(|tile| !(1..=200).contains(tile))
    {
        return Err(invalid(
            identity,
            "Variation requires at most 200 terrain tiles, each from 1 through 200.",
        ));
    }
    Ok(())
}

fn resolve_tile(intent: &LandPaintIntent, cell: &MapCoordinate, sequence: usize) -> i16 {
    let tiles = &intent.variation_tiles;
    if tiles.is_empty() || intent.variation == LandPaintVariation::Single {
        return intent.selected_tile;
    }
    let index = if intent.variation == LandPaintVariation::CycleGroup {
        sequence % tiles.len()
    } else {
        stable_random_index(intent.seed, cell.x, cell.y, sequence, tiles.len())
    };
    tiles[index]
}

fn stable_random_index(seed: u32, x: u8, y: u8, sequence: usize, length: usize) -> usize {
    let mut value = seed ^ (u32::from(x).wrapping_add(0x9e3779b9)).wrapping_mul(0x85ebca6b);
    value ^= (u32::from(y).wrapping_add(0xc2b2ae35)).wrapping_mul(0x27d4eb2f);
    value ^= (sequence as u32)
        .wrapping_add(0x165667b1)
        .wrapping_mul(0x9e3779b1);
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb352d);
    value ^= value >> 15;
    value = value.wrapping_mul(0x846ca68b);
    value ^= value >> 16;
    value as usize % length
}

#[cfg(test)]
mod tests;
