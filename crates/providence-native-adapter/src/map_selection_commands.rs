use crate::request_params::{required_string, required_u64, required_value};
use providence_core::{
    dungeon_features::inspect_dungeon_features,
    map_selection::{MapSelectionRequest, preview_map_selection},
    model::{LevelType, StableId},
    session::EditorSession,
};
use serde_json::{Value, json};

pub(crate) fn preview(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let expected = required_u64(params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err("The map revision changed before selecting. Make a new selection.".into());
    }
    let identity = StableId(required_string(params, "identity")?);
    let selection: MapSelectionRequest =
        serde_json::from_value(required_value(params, "selection")?.clone())
            .map_err(|error| format!("Invalid map selection: {error}"))?;
    let cells = preview_map_selection(session.snapshot(), &identity, &selection)?;
    let dungeon = session
        .snapshot()
        .world
        .maps
        .iter()
        .any(|map| map.identity == identity && map.level_type == LevelType::Dungeon);
    let features = if dungeon && !cells.is_empty() {
        inspect_dungeon_features(session.snapshot(), &identity, &cells)
            .map_err(|error| error.to_string())?
    } else {
        Vec::new()
    };
    Ok(
        json!({"revision": session.revision(), "mapIdentity": identity, "cells": cells,
        "anchor": selection.start, "features": features}),
    )
}

#[cfg(test)]
mod tests;
