//! Authored entry facts, independent of runtime state and physical reachability.
mod filter;
use crate::{
    action_authoring::{form_identity_for_opcode, is_known_opcode},
    codecs::{decode_dungeon_cell, decode_land_cell},
    model::{ActionPoint, CLASSIC_MAP_SIZE, LevelType, ProjectSnapshot, StableId},
};
pub use filter::{ActivationFilter, ChanceFilter, ChecksFilter, MarkerFilter, PrecedenceFilter};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionPointActivation {
    pub placed: bool,
    pub location: String,
    pub chance_percent: i8,
    pub chance_positive: bool,
    pub entry_marker: Option<bool>,
    pub secret: &'static str,
    pub marker_editable: bool,
    pub marker_reason: &'static str,
    pub shadowed_by: Option<StableId>,
    pub check_slots: Vec<u8>,
    pub unknown_slots: Vec<u8>,
}

pub fn project(snapshot: &ProjectSnapshot, row: &ActionPoint) -> ActionPointActivation {
    let mut result = ActionPointActivation {
        placed: row.coordinate.is_some(),
        location: row.coordinate.map_or_else(
            || "Unplaced".into(),
            |cell| {
                format!(
                    "{} {} · cell {}, {}",
                    if row.level_type == LevelType::Land {
                        "Land"
                    } else {
                        "Dungeon"
                    },
                    row.level_index,
                    cell.x,
                    cell.y
                )
            },
        ),
        chance_percent: row.chance_percent,
        chance_positive: row.chance_percent > 0,
        entry_marker: None,
        secret: "none",
        marker_editable: false,
        marker_reason: "Place this Action Point on an available map cell first.",
        shadowed_by: None,
        check_slots: Vec::new(),
        unknown_slots: Vec::new(),
    };
    describe_program(&mut result, row);
    describe_placement(&mut result, snapshot, row);
    result
}

fn describe_program(result: &mut ActionPointActivation, row: &ActionPoint) {
    for action in &row.actions {
        let form = form_identity_for_opcode(action.opcode()).unwrap_or_default();
        if form.contains("branch") || form == "gold" {
            result.check_slots.push(action.slot);
        }
        if !is_known_opcode(action.opcode()) {
            result.unknown_slots.push(action.slot);
        }
    }
}

fn describe_placement(
    result: &mut ActionPointActivation,
    snapshot: &ProjectSnapshot,
    row: &ActionPoint,
) {
    if let Some(cell) = row.coordinate {
        result.shadowed_by = snapshot
            .world
            .action_points
            .iter()
            .filter(|other| {
                other.level_type == row.level_type
                    && other.level_index == row.level_index
                    && other.coordinate == Some(cell)
                    && other.record_index < row.record_index
            })
            .min_by_key(|other| other.record_index)
            .map(|other| other.identity.clone());
        if let Some(raw) = snapshot
            .world
            .maps
            .iter()
            .find(|map| map.level_type == row.level_type && map.native_index == row.level_index)
            .filter(|_| {
                usize::from(cell.x) < CLASSIC_MAP_SIZE && usize::from(cell.y) < CLASSIC_MAP_SIZE
            })
            .and_then(|map| {
                map.tiles
                    .get(usize::from(cell.y) * CLASSIC_MAP_SIZE + usize::from(cell.x))
            })
        {
            describe_tile(result, row.level_type, *raw);
        }
    }
}

fn describe_tile(result: &mut ActionPointActivation, kind: LevelType, raw: i16) {
    result.marker_editable = true;
    result.marker_reason = "Entry markers can also affect movement through solid tiles. Chance and script conditions remain separate.";
    match kind {
        LevelType::Dungeon => {
            let cell = decode_dungeon_cell(raw);
            result.entry_marker = Some(cell.action_point_marker);
            if cell.action_point_marker && (raw as u16 & 0x0f00 != 0) {
                result.secret = if cell.revealed_secret {
                    "revealed"
                } else {
                    "hidden"
                };
                result.marker_reason = "Dungeon direction and secret bits remain unchanged. Removing the entry marker changes how this secret entrance is processed.";
            }
        }
        LevelType::Land => {
            let cell = decode_land_cell(raw);
            result.entry_marker = Some(cell.action_point_marker);
            if cell.hidden_secret || cell.revealed_secret {
                result.secret = if cell.hidden_secret {
                    "hidden"
                } else {
                    "revealed"
                };
                result.marker_editable = false;
                result.marker_reason = "The entry marker is part of this secret tile. Use the map's secret controls to change secret behavior; the AP control preserves it.";
            }
        }
    }
}
