use super::{
    RebuiltV3LandLayout, RebuiltV3TransitionEndpoint, RebuiltV3WorldError, RebuiltV3WorldTransition,
};
use crate::{
    codecs::{LAND_LAYOUT_CELLS, LAND_LAYOUT_COLUMNS, LAND_LAYOUT_ROWS, classic_land_index},
    model::{LandLayout, LevelType, MapLevel, ProjectOrigin, ProjectSnapshot, StableId},
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn project(
    snapshot: &ProjectSnapshot,
) -> Result<(Vec<RebuiltV3WorldTransition>, Option<RebuiltV3LandLayout>), RebuiltV3WorldError> {
    let Some(layout) = &snapshot.world.land_layout else {
        return Ok((Vec::new(), None));
    };
    if layout.cells.len() != LAND_LAYOUT_CELLS {
        return Err(RebuiltV3WorldError::InvalidLandLayoutCellCount(
            layout.cells.len(),
        ));
    }
    let maps_by_index = index_maps(snapshot)?;
    let placed_maps = resolve_placements(snapshot, layout, &maps_by_index)?;
    Ok((
        transitions(&placed_maps),
        Some(RebuiltV3LandLayout {
            rows: LAND_LAYOUT_ROWS as u8,
            cols: LAND_LAYOUT_COLUMNS as u8,
            cells: layout.cells.clone(),
        }),
    ))
}

fn index_maps(snapshot: &ProjectSnapshot) -> Result<BTreeMap<u32, &MapLevel>, RebuiltV3WorldError> {
    let mut maps_by_index = BTreeMap::new();
    for map in snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
    {
        if maps_by_index.insert(map.native_index, map).is_some() {
            return Err(RebuiltV3WorldError::DuplicateLandMapIndex(map.native_index));
        }
    }
    Ok(maps_by_index)
}

fn resolve_placements<'a>(
    snapshot: &ProjectSnapshot,
    layout: &LandLayout,
    maps_by_index: &BTreeMap<u32, &'a MapLevel>,
) -> Result<Vec<Option<&'a MapLevel>>, RebuiltV3WorldError> {
    let mut placed = BTreeSet::new();
    let mut placed_maps = Vec::with_capacity(LAND_LAYOUT_CELLS);
    for (index, value) in layout.cells.iter().copied().enumerate() {
        if value == 0 {
            placed_maps.push(None);
            continue;
        }
        let row = index / LAND_LAYOUT_COLUMNS;
        let column = index % LAND_LAYOUT_COLUMNS;
        let native_index = classic_land_index(value)
            .ok_or(RebuiltV3WorldError::InvalidLandLayoutValue { row, column, value })?;
        let map = maps_by_index.get(&native_index).copied().ok_or(
            RebuiltV3WorldError::MissingLandLayoutMap {
                row,
                column,
                native_index,
            },
        )?;
        if !placed.insert(map.identity.clone())
            && !matches!(snapshot.origin, ProjectOrigin::Imported { .. })
        {
            return Err(RebuiltV3WorldError::DuplicateLandLayoutPlacement {
                map: map.identity.clone(),
            });
        }
        placed_maps.push(Some(map));
    }

    Ok(placed_maps)
}

fn transitions(placed_maps: &[Option<&MapLevel>]) -> Vec<RebuiltV3WorldTransition> {
    let directions = [
        ("north", -1isize, 0isize, "south"),
        ("northeast", -1, 1, "southwest"),
        ("east", 0, 1, "west"),
        ("southeast", 1, 1, "northwest"),
        ("south", 1, 0, "north"),
        ("southwest", 1, -1, "northeast"),
        ("west", 0, -1, "east"),
        ("northwest", -1, -1, "southeast"),
    ];
    let mut transitions = BTreeMap::new();
    let mut source_locations = BTreeSet::new();
    for row in 0..LAND_LAYOUT_ROWS {
        for column in 0..LAND_LAYOUT_COLUMNS {
            let Some(source_map) = placed_maps[row * LAND_LAYOUT_COLUMNS + column] else {
                continue;
            };
            // Castle checklayout scans row-major and jumps at the first matching level.
            if !source_locations.insert(source_map.identity.clone()) {
                continue;
            }
            for (edge, row_delta, column_delta, target_edge) in directions {
                let target_row = row as isize + row_delta;
                let target_column = column as isize + column_delta;
                if target_row < 0
                    || target_column < 0
                    || target_row >= LAND_LAYOUT_ROWS as isize
                    || target_column >= LAND_LAYOUT_COLUMNS as isize
                {
                    continue;
                }
                let Some(target_map) =
                    placed_maps[target_row as usize * LAND_LAYOUT_COLUMNS + target_column as usize]
                else {
                    continue;
                };
                if target_map.identity == source_map.identity {
                    continue;
                }
                let transition = transition(source_map, target_map, edge, target_edge);
                transitions.insert(transition.id.clone(), transition);
            }
        }
    }
    transitions.into_values().collect()
}

fn transition(
    source: &MapLevel,
    target: &MapLevel,
    edge: &str,
    target_edge: &str,
) -> RebuiltV3WorldTransition {
    RebuiltV3WorldTransition {
        id: StableId(format!(
            "layout:{}:{edge}:{}",
            source.identity.0, target.identity.0
        )),
        source: RebuiltV3TransitionEndpoint {
            map_id: source.identity.clone(),
            edge: edge.into(),
        },
        target: RebuiltV3TransitionEndpoint {
            map_id: target.identity.clone(),
            edge: target_edge.into(),
        },
    }
}
