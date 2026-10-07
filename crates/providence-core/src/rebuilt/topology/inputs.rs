use super::contracts::RebuiltV3TopologyError;
use crate::model::{CLASSIC_MAP_SIZE, MapLevel, MapRuntimeMetadata, ProjectSnapshot, StableId};
use crate::rebuilt::{runtime_ids::action_point_id, scenario::placed_trigger_is_defined};

pub(super) fn map_runtime(map: &MapLevel) -> Result<&MapRuntimeMetadata, RebuiltV3TopologyError> {
    if map.tiles.len() != CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE {
        return Err(RebuiltV3TopologyError::InvalidCellCount {
            map: map.identity.clone(),
            actual: map.tiles.len(),
        });
    }
    map.runtime
        .as_ref()
        .ok_or_else(|| RebuiltV3TopologyError::MissingRuntimeMetadata(map.identity.clone()))
}

pub(super) fn cell_trigger_ids(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    x: usize,
    y: usize,
) -> Vec<StableId> {
    let mut triggers = snapshot
        .world
        .action_points
        .iter()
        .filter(|trigger| {
            placed_trigger_is_defined(trigger)
                && trigger.level_type == map.level_type
                && trigger.level_index == map.native_index
                && trigger.coordinate.is_some_and(|coordinate| {
                    usize::from(coordinate.x) == x && usize::from(coordinate.y) == y
                })
        })
        .collect::<Vec<_>>();
    triggers.sort_by_key(|trigger| (trigger.record_index, trigger.identity.clone()));
    triggers.into_iter().map(action_point_id).collect()
}

pub(super) fn cell_random_rectangle_ids(
    runtime: &MapRuntimeMetadata,
    x: usize,
    y: usize,
) -> Vec<StableId> {
    let mut rectangles = runtime
        .random_rectangles
        .iter()
        .filter(|rectangle| {
            rectangle.left <= x as i16
                && x as i16 <= rectangle.right
                && rectangle.top <= y as i16
                && y as i16 <= rectangle.bottom
        })
        .map(|rectangle| rectangle.identity.clone())
        .collect::<Vec<_>>();
    rectangles.sort();
    rectangles
}
