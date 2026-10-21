//! Conservative ordinary walking; scripts and transport are deliberately unresolved.
use crate::{map_paint, model::*, session::SessionError};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, VecDeque};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Connection {
    pub from: MapCoordinate,
    pub to: MapCoordinate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Connected,
    Blocked,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub connection: Connection,
    pub status: Status,
    pub path: Vec<MapCoordinate>,
    pub problematic_cells: Vec<MapCoordinate>,
    pub reason: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Cell {
    Open,
    Blocked,
    Unknown,
}

pub(crate) fn index(cell: MapCoordinate) -> usize {
    usize::from(cell.y) * CLASSIC_MAP_SIZE + usize::from(cell.x)
}

pub(crate) fn coordinate(index: usize) -> MapCoordinate {
    MapCoordinate {
        x: (index % 90) as u8,
        y: (index / 90) as u8,
    }
}

pub(crate) fn neighbors(index: usize) -> impl Iterator<Item = usize> {
    let x = index % 90;
    let y = index / 90;
    [
        y.checked_sub(1).map(|y| y * 90 + x),
        (x < 89).then_some(index + 1),
        (y < 89).then_some(index + 90),
        x.checked_sub(1).map(|x| y * 90 + x),
    ]
    .into_iter()
    .flatten()
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    connections: &[Connection],
) -> Result<Vec<Route>, SessionError> {
    let map = map_paint::land_map(snapshot, identity)?;
    validate(identity, connections)?;
    Ok(preview_map(snapshot, map, connections))
}

pub(crate) fn preview_map(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    connections: &[Connection],
) -> Vec<Route> {
    let cells = classify(snapshot, map);
    connections
        .iter()
        .map(|connection| route(&cells, connection))
        .collect()
}

pub(crate) fn validate(
    identity: &StableId,
    connections: &[Connection],
) -> Result<(), SessionError> {
    if connections.len() > 32
        || connections.iter().any(|pair| {
            [pair.from, pair.to]
                .iter()
                .any(|cell| cell.x >= 90 || cell.y >= 90)
        })
    {
        return Err(map_paint::invalid(
            identity,
            "Choose at most 32 connections within this 90 by 90 map.",
        ));
    }
    Ok(())
}

fn classify(snapshot: &ProjectSnapshot, map: &MapLevel) -> Vec<Cell> {
    let scripts: BTreeSet<_> = snapshot
        .world
        .action_points
        .iter()
        .filter(|ap| ap.level_type == map.level_type && ap.level_index == map.native_index)
        .filter_map(|ap| ap.coordinate)
        .filter(|cell| cell.x < 90 && cell.y < 90)
        .map(index)
        .collect();
    map.tiles
        .iter()
        .enumerate()
        .map(|(i, &raw)| {
            let cell = crate::codecs::decode_land_cell(raw);
            if scripts.contains(&i)
                || cell.action_point_marker
                || cell.hidden_secret
                || cell.revealed_secret
            {
                Cell::Unknown
            } else {
                terrain(snapshot, map, raw)
            }
        })
        .collect()
}

fn terrain(snapshot: &ProjectSnapshot, map: &MapLevel, raw: i16) -> Cell {
    let Some(runtime) = &map.runtime else {
        return Cell::Unknown;
    };
    let decoded = crate::codecs::decode_land_cell(raw);
    let tile = if raw < 0 {
        runtime.base_tile
    } else {
        decoded
            .terrain_tile
            .filter(|tile| *tile <= 200)
            .map(|tile| tile as i16)
    };
    let Some(tile) = tile else {
        return Cell::Unknown;
    };
    let mut matches = snapshot
        .terrain_catalog
        .iter()
        .filter(|profile| profile.landlook == runtime.landlook && profile.tile == tile);
    let Some(profile) = matches.next() else {
        return Cell::Unknown;
    };
    if matches.next().is_some() {
        return Cell::Unknown;
    }
    if profile.solid_type != 0 && !profile.walkable {
        return Cell::Blocked;
    }
    if profile.boat_requirement != 0 || profile.fly_float {
        return Cell::Unknown;
    }
    if raw < 0 {
        let Some(catalog) = &snapshot.world.special_land_solidity else {
            return Cell::Unknown;
        };
        let Some(&solid) = catalog
            .solid
            .get((-i32::from(decoded.rendered_value)) as usize)
        else {
            return Cell::Unknown;
        };
        if solid {
            return Cell::Blocked;
        }
    }
    Cell::Open
}

fn search(cells: &[Cell], pair: &Connection, allow_unknown: bool) -> Option<Vec<usize>> {
    let start = index(pair.from);
    let end = index(pair.to);
    let permitted = |i| cells[i] == Cell::Open || allow_unknown && cells[i] == Cell::Unknown;
    if !permitted(start) || !permitted(end) {
        return None;
    }
    let mut parent = vec![usize::MAX; 8100];
    let mut queue = VecDeque::from([start]);
    parent[start] = start;
    while let Some(current) = queue.pop_front() {
        if current == end {
            let mut path = vec![end];
            while *path.last().unwrap() != start {
                path.push(parent[*path.last().unwrap()]);
            }
            path.reverse();
            return Some(path);
        }
        for next in neighbors(current) {
            if parent[next] == usize::MAX && permitted(next) {
                parent[next] = current;
                queue.push_back(next);
            }
        }
    }
    None
}

fn route(cells: &[Cell], connection: &Connection) -> Route {
    if let Some(path) = search(cells, connection, false) {
        return Route {
            connection: connection.clone(),
            status: Status::Connected,
            path: path.into_iter().map(coordinate).collect(),
            problematic_cells: vec![],
            reason: "Connected by ordinary cardinal walking; scripts are not executed.".into(),
        };
    }
    if let Some(path) = search(cells, connection, true) {
        return Route {
            connection: connection.clone(),
            status: Status::Unknown,
            problematic_cells: path
                .iter()
                .filter(|&&i| cells[i] == Cell::Unknown)
                .copied()
                .map(coordinate)
                .collect(),
            path: path.into_iter().map(coordinate).collect(),
            reason:
                "This possible route needs unavailable movement facts, a script, or special travel."
                    .into(),
        };
    }
    Route { connection: connection.clone(), status: Status::Blocked, path: vec![],
        problematic_cells: vec![connection.from, connection.to],
        reason: "No ordinary cardinal walking route connects these cells; scripts and transport may provide other routes.".into() }
}

#[cfg(test)]
mod tests;
