use crate::codecs::ACTION_POINTS_PER_LEVEL;
use crate::codecs::clear_action_point_marker;
use crate::codecs::ensure_action_point_marker;
use crate::model::ActionPoint;
use crate::model::LevelType;
use crate::model::MapCoordinate;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

pub(super) fn action_point_identity(
    level_type: LevelType,
    level_index: u32,
    record_index: u8,
) -> StableId {
    let level_kind = match level_type {
        LevelType::Land => "land",
        LevelType::Dungeon => "dungeon",
    };
    StableId(format!(
        "action-point:{level_kind}:{level_index}:{record_index}"
    ))
}

pub(super) fn action_point_is_reusable(row: &ActionPoint) -> bool {
    row.classic_door_id <= 0 && row.coordinate.is_none() && row.actions.is_empty()
}

pub(super) fn reusable_action_point_slot(
    snapshot: &ProjectSnapshot,
    level_type: LevelType,
    level_index: u32,
) -> Option<u8> {
    (0..ACTION_POINTS_PER_LEVEL).find_map(|record_index| {
        let existing = snapshot.world.action_points.iter().find(|row| {
            row.level_type == level_type
                && row.level_index == level_index
                && usize::from(row.record_index) == record_index
        });
        (existing.is_none() || existing.is_some_and(action_point_is_reusable))
            .then_some(record_index as u8)
    })
}

pub(super) fn ensure_action_point_coordinate_available(
    snapshot: &ProjectSnapshot,
    level_type: LevelType,
    level_index: u32,
    coordinate: MapCoordinate,
    exclude: Option<&StableId>,
    identity: &StableId,
) -> Result<(), SessionError> {
    if coordinate.x as usize >= crate::model::CLASSIC_MAP_SIZE
        || coordinate.y as usize >= crate::model::CLASSIC_MAP_SIZE
    {
        return Err(SessionError::MapCoordinateOutOfRange {
            x: coordinate.x,
            y: coordinate.y,
        });
    }
    if snapshot.world.action_points.iter().any(|candidate| {
        candidate.level_type == level_type
            && candidate.level_index == level_index
            && candidate.coordinate == Some(coordinate)
            && exclude != Some(&candidate.identity)
    }) {
        return Err(SessionError::InvalidActionPoint {
            identity: identity.clone(),
            reason: format!(
                "trigger coordinate {},{} is already occupied",
                coordinate.x, coordinate.y
            ),
        });
    }
    Ok(())
}

pub(super) fn new_action_point(
    identity: StableId,
    level_type: LevelType,
    level_index: u32,
    record_index: u8,
    coordinate: MapCoordinate,
    actions: Vec<crate::model::ClassicAction>,
    chance_percent: i8,
) -> Result<ActionPoint, SessionError> {
    let post_action_level = u8::try_from(level_index).map_err(|_| {
        SessionError::InvalidActionPoint {
            identity: identity.clone(),
            reason: format!(
                "level {level_index} cannot be represented by the Classic one-byte post-action level"
            ),
        }
    })?;
    let classic_door_id = level_index
        .checked_mul(10_000)
        .and_then(|value| value.checked_add(u32::from(coordinate.y) * 100))
        .and_then(|value| value.checked_add(u32::from(coordinate.x)))
        .and_then(|value| i32::try_from(value).ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| SessionError::InvalidActionPoint {
            identity: identity.clone(),
            reason: "the trigger coordinate cannot be represented by a positive Classic door ID"
                .into(),
        })?;
    let row = ActionPoint {
        identity,
        level_type,
        level_index,
        record_index,
        classic_door_id,
        coordinate: Some(coordinate),
        post_action_level,
        post_action_x: coordinate.x,
        post_action_y: coordinate.y,
        chance_percent,
        actions,
    };
    validate_action_point_draft(&row)?;
    Ok(row)
}

pub(super) fn upsert_action_point(snapshot: &mut ProjectSnapshot, row: ActionPoint) {
    if let Some(existing) = snapshot
        .world
        .action_points
        .iter_mut()
        .find(|candidate| candidate.identity == row.identity)
    {
        *existing = row;
    } else {
        snapshot.world.action_points.push(row);
        snapshot.world.action_points.sort_by_key(|action_point| {
            (
                action_point.level_type as u8,
                action_point.level_index,
                action_point.record_index,
            )
        });
    }
}

pub(super) fn validate_action_point_map_cell(
    snapshot: &ProjectSnapshot,
    level_type: LevelType,
    level_index: u32,
    coordinate: MapCoordinate,
) -> Result<(), SessionError> {
    let expected_map_identity = StableId(format!(
        "{}:{level_index}",
        match level_type {
            LevelType::Land => "land",
            LevelType::Dungeon => "dungeon",
        }
    ));
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.level_type == level_type && map.native_index == level_index)
        .ok_or(SessionError::MapNotFound(expected_map_identity))?;
    let cell_index = coordinate.y as usize * crate::model::CLASSIC_MAP_SIZE + coordinate.x as usize;
    if map.tiles.get(cell_index).is_none() {
        return Err(SessionError::InvalidActionPoint {
            identity: map.identity.clone(),
            reason: format!(
                "map has no cell at trigger coordinate {},{}",
                coordinate.x, coordinate.y
            ),
        });
    }
    Ok(())
}

pub(super) fn refresh_action_point_marker(
    snapshot: &mut ProjectSnapshot,
    level_type: LevelType,
    level_index: u32,
    coordinate: MapCoordinate,
) -> Result<Option<StableId>, SessionError> {
    let should_be_marked = snapshot.world.action_points.iter().any(|candidate| {
        candidate.level_type == level_type
            && candidate.level_index == level_index
            && candidate.coordinate == Some(coordinate)
            && candidate.chance_percent > 0
    });
    let expected_map_identity = StableId(format!(
        "{}:{level_index}",
        match level_type {
            LevelType::Land => "land",
            LevelType::Dungeon => "dungeon",
        }
    ));
    let map = snapshot
        .world
        .maps
        .iter_mut()
        .find(|map| map.level_type == level_type && map.native_index == level_index)
        .ok_or(SessionError::MapNotFound(expected_map_identity))?;
    let cell_index = coordinate.y as usize * crate::model::CLASSIC_MAP_SIZE + coordinate.x as usize;
    let current = *map
        .tiles
        .get(cell_index)
        .ok_or_else(|| SessionError::InvalidActionPoint {
            identity: map.identity.clone(),
            reason: format!(
                "map has no cell at trigger coordinate {},{}",
                coordinate.x, coordinate.y
            ),
        })?;
    let updated = if should_be_marked {
        ensure_action_point_marker(current, level_type)
    } else {
        clear_action_point_marker(current, level_type)
    };
    if current == updated {
        return Ok(None);
    }
    map.tiles[cell_index] = updated;
    Ok(Some(map.identity.clone()))
}

pub(super) fn append_changed_map(changed: &mut Vec<StableId>, map: Option<StableId>) {
    if let Some(map) = map
        && !changed.contains(&map)
    {
        changed.push(map);
    }
}

pub(super) fn validate_action_point_draft(row: &ActionPoint) -> Result<(), SessionError> {
    let level_kind = match row.level_type {
        LevelType::Land => "land",
        LevelType::Dungeon => "dungeon",
    };
    let expected_identity = StableId(format!(
        "action-point:{level_kind}:{}:{}",
        row.level_index, row.record_index
    ));
    if row.identity != expected_identity {
        return Err(SessionError::InvalidActionPoint {
            identity: row.identity.clone(),
            reason: format!(
                "native level {} record {} requires identity {}",
                row.level_index, row.record_index, expected_identity.0
            ),
        });
    }
    if row.record_index as usize >= ACTION_POINTS_PER_LEVEL {
        return Err(SessionError::InvalidActionPoint {
            identity: row.identity.clone(),
            reason: format!(
                "record index {} is outside 0 through {}",
                row.record_index,
                ACTION_POINTS_PER_LEVEL - 1
            ),
        });
    }
    validate_action_point_geometry(row)?;
    validate_action_point_slots(row)
}

fn validate_action_point_geometry(row: &ActionPoint) -> Result<(), SessionError> {
    if let Some(coordinate) = row.coordinate {
        if coordinate.x as usize >= crate::model::CLASSIC_MAP_SIZE
            || coordinate.y as usize >= crate::model::CLASSIC_MAP_SIZE
        {
            return Err(SessionError::InvalidActionPoint {
                identity: row.identity.clone(),
                reason: format!(
                    "trigger coordinate {},{} is outside the 90 by 90 map",
                    coordinate.x, coordinate.y
                ),
            });
        }
        let expected_door_id = u64::from(row.level_index) * 10_000
            + u64::from(coordinate.y) * 100
            + u64::from(coordinate.x);
        if expected_door_id == 0 || expected_door_id > i32::MAX as u64 {
            return Err(SessionError::InvalidActionPoint {
                identity: row.identity.clone(),
                reason:
                    "the trigger coordinate cannot be represented by a positive Classic door ID"
                        .into(),
            });
        }
        if row.classic_door_id != expected_door_id as i32 {
            return Err(SessionError::InvalidActionPoint {
                identity: row.identity.clone(),
                reason: format!(
                    "trigger coordinate {},{} requires Classic door ID {}",
                    coordinate.x, coordinate.y, expected_door_id
                ),
            });
        }
    } else if row.classic_door_id > 0 {
        let door_id = row.classic_door_id as u32;
        let position = door_id % 10_000;
        let x = position % 100;
        let y = position / 100;
        if door_id / 10_000 == row.level_index
            && x < crate::model::CLASSIC_MAP_SIZE as u32
            && y < crate::model::CLASSIC_MAP_SIZE as u32
        {
            return Err(SessionError::InvalidActionPoint {
                identity: row.identity.clone(),
                reason: "a valid Classic door ID must expose its canonical trigger coordinate"
                    .into(),
            });
        }
    }
    Ok(())
}

fn validate_action_point_slots(row: &ActionPoint) -> Result<(), SessionError> {
    let mut slots = BTreeSet::new();
    for action in &row.actions {
        if action.slot >= 8 {
            return Err(SessionError::InvalidActionPoint {
                identity: row.identity.clone(),
                reason: format!("action slot {} is outside 0 through 7", action.slot),
            });
        }
        if !slots.insert(action.slot) {
            return Err(SessionError::InvalidActionPoint {
                identity: row.identity.clone(),
                reason: format!("action slot {} is duplicated", action.slot),
            });
        }
    }
    Ok(())
}

pub(super) fn validate_action_point_replacement(
    snapshot: &ProjectSnapshot,
    action_point: &ActionPoint,
    existing_index: usize,
) -> Result<(), SessionError> {
    let existing = &snapshot.world.action_points[existing_index];
    if existing.level_type != action_point.level_type
        || existing.level_index != action_point.level_index
        || existing.record_index != action_point.record_index
    {
        return Err(SessionError::InvalidActionPoint {
            identity: action_point.identity.clone(),
            reason: "native level and record identity cannot be changed".into(),
        });
    }
    if let Some(coordinate) = action_point.coordinate {
        let collision =
            snapshot
                .world
                .action_points
                .iter()
                .enumerate()
                .any(|(index, candidate)| {
                    index != existing_index
                        && candidate.level_type == action_point.level_type
                        && candidate.level_index == action_point.level_index
                        && candidate.coordinate == Some(coordinate)
                });
        if collision {
            return Err(SessionError::InvalidActionPoint {
                identity: action_point.identity.clone(),
                reason: format!(
                    "trigger coordinate {},{} is already occupied",
                    coordinate.x, coordinate.y
                ),
            });
        }
    }
    Ok(())
}

pub(super) fn validate_action_point_trigger(
    snapshot: &ProjectSnapshot,
    row: &ActionPoint,
) -> Result<(), SessionError> {
    if let Some(coordinate) = row.coordinate {
        validate_action_point_map_cell(snapshot, row.level_type, row.level_index, coordinate)?;
    }
    Ok(())
}

pub(super) fn validate_new_action_point_position(
    snapshot: &ProjectSnapshot,
    level_type: LevelType,
    level_index: u32,
    coordinate: MapCoordinate,
    identity: &StableId,
) -> Result<(), SessionError> {
    ensure_action_point_coordinate_available(
        snapshot,
        level_type,
        level_index,
        coordinate,
        None,
        identity,
    )?;
    validate_action_point_map_cell(snapshot, level_type, level_index, coordinate)
}
