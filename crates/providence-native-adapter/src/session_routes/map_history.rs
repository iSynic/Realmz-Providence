//! A bounded terrain-only history delta avoids reopening an unchanged map document.

use providence_core::{
    model::{CLASSIC_MAP_SIZE, LevelType, MapLevel},
    session::{EditorCommand, EditorSession},
};
use serde_json::{Value, json};

const MAX_DELTA_CELLS: usize = 1024;

pub(super) fn execute(
    session: &mut EditorSession,
    params: &Value,
    redo: bool,
) -> Result<Value, String> {
    let before = candidate(session, redo);
    let mut result = crate::execute(
        session,
        params,
        if redo {
            EditorCommand::Redo
        } else {
            EditorCommand::Undo
        },
    )?;
    if let Some(before) = before
        && let Some(after) = session
            .snapshot()
            .world
            .maps
            .iter()
            .find(|m| m.identity == before.identity)
        && let Some(mut delta) = terrain_delta(&before, after)
    {
        attach_display_hints(&mut delta, session, after);
        result["mapTerrainDelta"] = delta;
    }
    Ok(result)
}

fn attach_display_hints(delta: &mut Value, session: &EditorSession, map: &MapLevel) {
    use std::collections::BTreeSet;
    let coordinates = |cells: Vec<providence_core::model::MapCoordinate>| -> BTreeSet<_> {
        cells.into_iter().map(|cell| (cell.x, cell.y)).collect()
    };
    let blockers = coordinates(providence_core::map_editor_preview::blocking_cells(
        session.snapshot(),
        map,
    ));
    let overlays = providence_core::map_view_overlays::project(session.snapshot(), map);
    let hidden_paths = coordinates(overlays.hidden_path_cells);
    let clearings = coordinates(overlays.combat_clearing_cells);
    for cell in delta["cells"].as_array_mut().expect("terrain delta cells") {
        let key = (
            cell["x"].as_u64().unwrap() as u8,
            cell["y"].as_u64().unwrap() as u8,
        );
        cell["blocksLos"] = json!(blockers.contains(&key));
        cell["hiddenPath"] = json!(hidden_paths.contains(&key));
        cell["combatClearing"] = json!(clearings.contains(&key));
    }
}

fn candidate(session: &EditorSession, redo: bool) -> Option<MapLevel> {
    let entries = if redo {
        session.redo_history()
    } else {
        session.undo_history()
    };
    let entry = entries.last()?;
    if !entry.references_unchanged || entry.changed_entities.len() != 1 {
        return None;
    }
    // Other world state, including AP markers, retains the ordinary refresh path.
    if entry.snapshot.world.action_points != session.snapshot().world.action_points {
        return None;
    }
    session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity == entry.changed_entities[0] && map.level_type == LevelType::Land)
        .cloned()
}

fn terrain_delta(before: &MapLevel, after: &MapLevel) -> Option<Value> {
    if before.identity != after.identity
        || before.level_type != after.level_type
        || before.native_index != after.native_index
        || before.name != after.name
        || before.runtime != after.runtime
        || before.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE
        || after.tiles.len() != before.tiles.len()
    {
        return None;
    }
    let mut cells = Vec::new();
    for (index, (&previous, &tile)) in before.tiles.iter().zip(&after.tiles).enumerate() {
        if previous == tile {
            continue;
        }
        // Flags, overlays and invalid imported values need full artwork/diagnostic refresh.
        if !(1..=200).contains(&previous)
            || !(1..=200).contains(&tile)
            || cells.len() == MAX_DELTA_CELLS
        {
            return None;
        }
        cells.push(
            json!({"x": index % CLASSIC_MAP_SIZE, "y": index / CLASSIC_MAP_SIZE, "tile": tile}),
        );
    }
    if cells.is_empty() {
        return None;
    }
    Some(json!({"identity": after.identity, "cells": cells}))
}

#[cfg(test)]
mod tests;
