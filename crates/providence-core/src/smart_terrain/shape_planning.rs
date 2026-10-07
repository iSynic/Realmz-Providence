use super::*;

#[derive(Clone, Copy)]
pub(super) struct Target<'a> {
    pub snapshot: &'a ProjectSnapshot,
    pub map: &'a MapLevel,
    pub profile: &'a Profile,
    pub identity: &'a StableId,
    pub atlas: Option<&'a crate::terrain_joining::AtlasEvidence>,
}

pub(super) fn preview(
    target: Target<'_>,
    intent: &SmartTerrainIntent,
    original: Vec<MapCoordinate>,
    canceled: &mut impl FnMut() -> bool,
) -> Result<SmartTerrainPlan, SessionError> {
    let Target {
        snapshot,
        map,
        profile,
        identity,
        atlas,
    } = target;
    let resolved = planning::resolve(map, profile, intent, identity, &original, canceled)?;
    let mut best = planning::finish(snapshot, identity, intent, original.clone(), resolved)?;
    if intent.tolerance == ShapeTolerance::Literal {
        return Ok(best);
    }
    let (editable, ground) = editable_cells(snapshot, map, atlas);
    let candidates =
        shape_adjustment::candidates(&original, &editable, intent.tolerance.cells(), canceled);
    for mask in candidates.into_iter().skip(1) {
        if canceled() {
            return Err(map_paint::invalid(
                identity,
                "Terrain planning was canceled. Your selection is unchanged.",
            ));
        }
        let removed = difference(&original, &mask);
        let (context, clears) = clear_removed(map, profile, &ground, &removed);
        let mut resolved = planning::resolve(&context, profile, intent, identity, &mask, canceled)?;
        resolved.cells.extend(clears);
        let mut plan = planning::finish(snapshot, identity, intent, original.clone(), resolved)?;
        set_effective_mask(&mut plan, mask);
        if score(map, &plan, intent.preset == "water") < score(map, &best, intent.preset == "water")
        {
            best = plan;
        }
    }
    if intent.preset == "water" {
        water_mouth::improve(target, intent, &ground, best, canceled)
    } else {
        Ok(best)
    }
}

pub(super) fn set_effective_mask(plan: &mut SmartTerrainPlan, mask: Vec<MapCoordinate>) {
    plan.effective_mask = mask;
    plan.added_cells = difference(&plan.effective_mask, &plan.mask);
    plan.removed_cells = difference(&plan.mask, &plan.effective_mask);
    plan.retiled_neighbors
        .retain(|cell| !plan.added_cells.contains(cell));
}

fn clear_removed(
    map: &MapLevel,
    profile: &Profile,
    ground: &[Option<i16>],
    removed: &[MapCoordinate],
) -> (MapLevel, Vec<LandMapCellPaint>) {
    let mut context = map.clone();
    let mut clears = vec![];
    for cell in removed {
        let i = usize::from(cell.y) * 90 + usize::from(cell.x);
        if let Some(tile) = ground[i] {
            let old = map_paint::terrain_tile(context.tiles[i]).unwrap_or(0) as i16;
            if profile.family.contains(&old) {
                context.tiles[i] = context.tiles[i] - old + tile;
                clears.push(LandMapCellPaint {
                    x: cell.x,
                    y: cell.y,
                    tile,
                });
            }
        }
    }
    (context, clears)
}

fn score(
    map: &MapLevel,
    plan: &SmartTerrainPlan,
    water: bool,
) -> (usize, usize, usize, usize, usize) {
    (
        if water {
            water_contour::stream_intrusions(map, plan)
        } else {
            0
        },
        plan.unresolved.len(),
        shape_adjustment::contour_cost(&plan.effective_mask),
        plan.added_cells.len() + plan.removed_cells.len(),
        plan.paint.painted_cells.len(),
    )
}

fn difference(left: &[MapCoordinate], right: &[MapCoordinate]) -> Vec<MapCoordinate> {
    let present: BTreeSet<_> = right.iter().map(|cell| (cell.x, cell.y)).collect();
    left.iter()
        .copied()
        .filter(|cell| !present.contains(&(cell.x, cell.y)))
        .collect()
}

fn editable_cells(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    atlas: Option<&crate::terrain_joining::AtlasEvidence>,
) -> (Vec<bool>, Vec<Option<i16>>) {
    use crate::land_tile_catalog::{LandTileCategory, semantics};
    let look = map.runtime.as_ref().and_then(|r| r.landlook).unwrap_or(-1);
    let open: Vec<_> = (1..=200)
        .filter(|tile| {
            let entry = match atlas {
                Some(atlas) => {
                    crate::terrain_mapping::semantics(snapshot, atlas, *tile, Some(look))
                }
                None => semantics(look, *tile),
            };
            entry.is_some_and(|entry| entry.category == LandTileCategory::Open)
        })
        .collect();
    let ground = local_ground(&map.tiles, &open);
    (vec![true; 8100], ground)
}

// Removed shoreline inherits nearby mapped ground, never an unrelated map-wide material.
pub(super) fn local_ground(tiles: &[i16], open: &[i16]) -> Vec<Option<i16>> {
    (0..8100)
        .map(|index| {
            let (x, y) = ((index % 90) as i16, (index / 90) as i16);
            for distance in 0i16..=4 {
                for dy in -distance..=distance {
                    let dx = distance - dy.abs();
                    for nx in [x - dx, x + dx] {
                        let ny = y + dy;
                        if !(0..90).contains(&nx) || !(0..90).contains(&ny) {
                            continue;
                        }
                        if let Some(tile) =
                            map_paint::terrain_tile(tiles[ny as usize * 90 + nx as usize])
                            && open.contains(&(tile as i16))
                        {
                            return Some(tile as i16);
                        }
                    }
                }
            }
            None
        })
        .collect()
}
