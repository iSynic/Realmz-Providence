//! Display hints follow Providence 56ac232c secrets.ts and geometry.ts.
//! They never change map words, resources, Player Map records or runtime eligibility.

use crate::{
    codecs::decode_land_cell,
    map_paint::terrain_tile,
    model::{LevelType, MapCoordinate, MapLevel, PlayerMapRecord, ProjectSnapshot, StableId},
};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapViewOverlays {
    pub secret_cells: Vec<MapCoordinate>,
    pub hidden_path_cells: Vec<MapCoordinate>,
    pub combat_clearing_cells: Vec<MapCoordinate>,
    pub player_maps: Vec<PlayerMapFootprint>,
    pub unmatched_entry_markers: Vec<MapCoordinate>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMapFootprint {
    pub identity: StableId,
    pub native_id: u32,
    pub name: String,
    pub left: u8,
    pub top: u8,
    pub right: u8,
    pub bottom: u8,
}

pub fn project(snapshot: &ProjectSnapshot, map: &MapLevel) -> MapViewOverlays {
    let mut result = MapViewOverlays {
        secret_cells: Vec::new(),
        hidden_path_cells: Vec::new(),
        combat_clearing_cells: Vec::new(),
        player_maps: Vec::new(),
        unmatched_entry_markers: unmatched_entry_markers(snapshot, map),
    };
    if map.level_type == LevelType::Land {
        land_hints(snapshot, map, &mut result);
    }
    result.player_maps = snapshot
        .world
        .player_maps
        .iter()
        .filter_map(|record| {
            let mut footprint = player_map_footprint(record, map)?;
            if let Some(name) = snapshot
                .player_map_names
                .as_ref()
                .and_then(|names| names.available_names.get(record.native_id.0 as usize))
                .filter(|name| !name.is_empty())
            {
                footprint.name = name.clone();
            }
            Some(footprint)
        })
        .collect();
    result
}

fn unmatched_entry_markers(snapshot: &ProjectSnapshot, map: &MapLevel) -> Vec<MapCoordinate> {
    let occupied: std::collections::BTreeSet<_> = snapshot
        .world
        .action_points
        .iter()
        .filter(|row| row.level_type == map.level_type && row.level_index == map.native_index)
        .filter_map(|row| row.coordinate.map(|cell| (cell.x, cell.y)))
        .collect();
    map.tiles
        .iter()
        .take(90 * 90)
        .enumerate()
        .filter_map(|(index, raw)| {
            let marked = match map.level_type {
                LevelType::Land => decode_land_cell(*raw).action_point_marker,
                LevelType::Dungeon => crate::codecs::decode_dungeon_cell(*raw).action_point_marker,
            };
            let cell = MapCoordinate {
                x: (index % 90) as u8,
                y: (index / 90) as u8,
            };
            (marked && !occupied.contains(&(cell.x, cell.y))).then_some(cell)
        })
        .collect()
}

fn land_hints(snapshot: &ProjectSnapshot, map: &MapLevel, result: &mut MapViewOverlays) {
    let look = map.runtime.as_ref().and_then(|runtime| runtime.landlook);
    let profiles: BTreeMap<_, _> = snapshot
        .terrain_catalog
        .iter()
        .filter(|profile| {
            look.is_some() && profile.landlook == look && profile.source != "Data Solids"
        })
        .map(|profile| (profile.tile, profile))
        .collect();
    for (index, &raw) in map.tiles.iter().take(90 * 90).enumerate() {
        let cell = MapCoordinate {
            x: (index % 90) as u8,
            y: (index / 90) as u8,
        };
        if decode_land_cell(raw).hidden_secret {
            result.secret_cells.push(cell);
        }
        let Some(tile) = terrain_tile(raw).map(|tile| tile as i16) else {
            continue;
        };
        let profile = profiles.get(&tile);
        let hidden_path = profile.map_or_else(
            || stock_hidden_path(look, tile),
            |profile| profile.path && profile.solid_type == 0,
        );
        if hidden_path {
            result.hidden_path_cells.push(cell);
        }
        if stock_combat_clearing(look, tile) {
            result.combat_clearing_cells.push(cell);
        }
    }
}

fn stock_hidden_path(look: Option<i8>, tile: i16) -> bool {
    match look {
        Some(0 | 3 | 9 | 10) => tile == 169,
        Some(4) => tile == 96,
        Some(5) => matches!(tile, 169 | 184),
        _ => false,
    }
}

fn stock_combat_clearing(look: Option<i8>, tile: i16) -> bool {
    match look {
        Some(0 | 9 | 10) => (180..=185).contains(&tile),
        Some(4) => (59..=65).contains(&tile),
        Some(5) => (180..=183).contains(&tile) || tile == 185,
        _ => false,
    }
}

fn player_map_footprint(record: &PlayerMapRecord, map: &MapLevel) -> Option<PlayerMapFootprint> {
    if record.picture_id != 0
        || record.show < 0
        || u32::try_from(record.level).ok() != Some(map.native_index)
        || record.is_dungeon != (map.level_type == LevelType::Dungeon)
    {
        return None;
    }
    let size = if record.icon_size > 0 && record.icon_size < 64 {
        record.icon_size.clamp(4, 32)
    } else {
        8
    };
    let cells = (320 + i32::from(size) - 1) / i32::from(size);
    let left = i32::from(record.start_x).clamp(0, 90);
    let top = i32::from(record.start_y).clamp(0, 90);
    let right = (i32::from(record.start_x) + cells).clamp(0, 90);
    let bottom = (i32::from(record.start_y) + cells).clamp(0, 90);
    if right <= left || bottom <= top {
        return None;
    }
    Some(PlayerMapFootprint {
        identity: record.identity.clone(),
        native_id: record.native_id.0,
        name: format!("Player Map {}", record.native_id.0),
        left: left as u8,
        top: top as u8,
        right: right as u8,
        bottom: bottom as u8,
    })
}

#[cfg(test)]
mod tests;
