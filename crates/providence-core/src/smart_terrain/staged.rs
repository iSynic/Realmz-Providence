//! Ordered brush strokes retain their sampled identity until the whole draft commits.
use super::*;
use crate::terrain_joining::AtlasEvidence;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stroke {
    pub sampled_tile: u16,
    pub cells: Vec<MapCoordinate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Intent {
    pub tileset_id: StableId,
    pub atlas_blob: Option<BlobId>,
    pub mapping_revision: u64,
    pub tolerance: ShapeTolerance,
    pub strokes: Vec<Stroke>,
}

impl Intent {
    fn family_intent(&self, family: &str, mask: Vec<MapCoordinate>) -> SmartTerrainIntent {
        SmartTerrainIntent {
            tileset_id: self.tileset_id.clone(),
            preset: family.into(),
            mask,
            atlas_blob: self.atlas_blob.clone(),
            mapping_revision: self.mapping_revision,
            tolerance: self.tolerance,
        }
    }

    fn cell_owners(&self, identity: &StableId) -> Result<Vec<Option<usize>>, SessionError> {
        let mut owner = vec![None; 8100];
        for (index, stroke) in self.strokes.iter().enumerate() {
            for cell in normalize_mask(identity, &stroke.cells)? {
                owner[position(cell)] = Some(index);
            }
        }
        Ok(owner)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Apply {
    pub identity: StableId,
    pub intent: Intent,
    pub atlas: AtlasEvidence,
}

pub fn behavior(
    snapshot: &ProjectSnapshot,
    atlas: &AtlasEvidence,
    look: Option<i8>,
    tile: u16,
) -> Option<&'static str> {
    if let Some(profile) = linear::sampled(snapshot, atlas, tile) {
        return Some(profile.identity);
    }
    crate::terrain_joining::family_for_tile(tile as i16).filter(|family| {
        crate::terrain_mapping::family_layout(snapshot, atlas, family, look).is_some()
    })
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &Intent,
    atlas: &AtlasEvidence,
    canceled: &mut impl FnMut() -> bool,
) -> Result<SmartTerrainPlan, SessionError> {
    let map = map_paint::land_map(snapshot, identity)?;
    validate(snapshot, identity, intent, atlas, map)?;
    check_canceled(identity, canceled)?;
    let look = map.runtime.as_ref().and_then(|runtime| runtime.landlook);
    let owner = intent.cell_owners(identity)?;
    let behaviors: Vec<_> = intent
        .strokes
        .iter()
        .map(|stroke| behavior(snapshot, atlas, look, stroke.sampled_tile))
        .collect();
    let mask = coordinates(owner.iter().map(Option::is_some));
    let mut scratch = snapshot.clone();
    let map_index = scratch
        .world
        .maps
        .iter()
        .position(|map| map.identity == *identity)
        .unwrap();
    let mut result = empty_plan(mask);
    let families = seed_exact(
        &mut scratch.world.maps[map_index],
        intent,
        &owner,
        &mut result,
        &behaviors,
    );
    for (family, cells) in families {
        check_canceled(identity, canceled)?;
        let allowed =
            |index: usize| owner[index].is_none_or(|stroke| behaviors[stroke] == Some(family));
        if let Some(profile) = linear::by_identity(family) {
            linear::paint(&mut scratch.world.maps[map_index], &cells, profile, allowed);
            continue;
        }
        let step = intent.family_intent(family, cells);
        let plan = preview_mapped(&scratch, identity, &step, Some(atlas), canceled)?;
        merge(
            &mut scratch.world.maps[map_index],
            &mut result,
            plan,
            |cell| allowed(position(cell)),
        );
    }
    finish(
        snapshot,
        identity,
        &scratch.world.maps[map_index],
        result,
        atlas,
    )
}

fn check_canceled(
    identity: &StableId,
    canceled: &mut impl FnMut() -> bool,
) -> Result<(), SessionError> {
    if canceled() {
        return Err(map_paint::invalid(
            identity,
            "Magic brush planning canceled; the draft is unchanged.",
        ));
    }
    Ok(())
}

fn seed_exact(
    map: &mut MapLevel,
    intent: &Intent,
    owner: &[Option<usize>],
    result: &mut SmartTerrainPlan,
    behaviors: &[Option<&'static str>],
) -> BTreeMap<&'static str, Vec<MapCoordinate>> {
    let mut families: BTreeMap<&str, Vec<MapCoordinate>> = BTreeMap::new();
    for cell in &result.mask {
        let stroke = &intent.strokes[owner[position(*cell)].unwrap()];
        if let Some(family) = behaviors[owner[position(*cell)].unwrap()] {
            families.entry(family).or_default().push(*cell);
            if linear::by_identity(family).is_some() {
                map.tiles[position(*cell)] = map_paint::replace_terrain(
                    map.tiles[position(*cell)],
                    stroke.sampled_tile as i16,
                );
            }
        } else {
            let raw = map.tiles[position(*cell)];
            map.tiles[position(*cell)] =
                map_paint::replace_terrain(raw, stroke.sampled_tile as i16);
        }
    }
    families
}

fn validate(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &Intent,
    atlas: &AtlasEvidence,
    map: &MapLevel,
) -> Result<(), SessionError> {
    atlas
        .validate(snapshot, map)
        .map_err(|reason| map_paint::invalid(identity, &reason))?;
    if intent.tileset_id != atlas.tileset_id
        || intent.atlas_blob.as_ref() != Some(&atlas.blob)
        || intent.mapping_revision != crate::terrain_mapping::revision(snapshot, &intent.tileset_id)
    {
        return Err(map_paint::invalid(
            identity,
            "The artwork or mapping changed. Reopen Magic before applying.",
        ));
    }
    if intent.strokes.len() > 128
        || intent
            .strokes
            .iter()
            .map(|stroke| stroke.cells.len())
            .sum::<usize>()
            > 32768
    {
        return Err(map_paint::invalid(
            identity,
            "Apply this Magic draft before adding more strokes (128 strokes or 32768 sampled cells).",
        ));
    }
    if intent
        .strokes
        .iter()
        .any(|stroke| stroke.sampled_tile > 200)
    {
        return Err(map_paint::invalid(
            identity,
            "Special artwork requires its stamp workflow; Magic samples ordinary atlas tiles only.",
        ));
    }
    Ok(())
}

fn empty_plan(mask: Vec<MapCoordinate>) -> SmartTerrainPlan {
    SmartTerrainPlan {
        paint: LandTerrainPaintPreview {
            painted_cells: vec![],
            protected_cells: vec![],
            unchanged_cells: 0,
        },
        unresolved: vec![],
        unresolved_reason: None,
        retiled_neighbors: vec![],
        effective_mask: mask.clone(),
        mask,
        added_cells: vec![],
        removed_cells: vec![],
    }
}

fn merge(
    map: &mut MapLevel,
    result: &mut SmartTerrainPlan,
    plan: SmartTerrainPlan,
    allowed: impl Fn(MapCoordinate) -> bool,
) {
    for cell in plan.paint.painted_cells {
        if allowed(MapCoordinate {
            x: cell.x,
            y: cell.y,
        }) {
            map.tiles[usize::from(cell.y) * 90 + usize::from(cell.x)] = cell.tile;
        }
    }
    result
        .paint
        .protected_cells
        .extend(plan.paint.protected_cells);
    result.unresolved.extend(plan.unresolved);
    if plan.unresolved_reason.is_some() {
        result.unresolved_reason = plan.unresolved_reason;
    }
    result
        .added_cells
        .extend(plan.added_cells.into_iter().filter(|cell| allowed(*cell)));
    result.removed_cells.extend(plan.removed_cells);
}

fn finish(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    map: &MapLevel,
    mut result: SmartTerrainPlan,
    atlas: &AtlasEvidence,
) -> Result<SmartTerrainPlan, SessionError> {
    let before = map_paint::land_map(snapshot, identity)?;
    let changed: Vec<_> = map
        .tiles
        .iter()
        .enumerate()
        .filter(|(i, tile)| **tile != before.tiles[*i])
        .map(|(i, tile)| LandMapCellPaint {
            x: (i % 90) as u8,
            y: (i / 90) as u8,
            tile: *tile,
        })
        .collect();
    result.paint.unchanged_cells = result.mask.len().saturating_sub(changed.len());
    result.paint.painted_cells = changed;
    if crate::terrain_mapping::family_layout(
        snapshot,
        atlas,
        "water",
        map.runtime.as_ref().and_then(|r| r.landlook),
    )
    .is_some()
    {
        validate_water(map, &result.paint.painted_cells, &mut result.unresolved);
    }
    result.unresolved = normalize_mask(identity, &result.unresolved)?;
    if !result.unresolved.is_empty() && result.unresolved_reason.is_none() {
        result.unresolved_reason = Some(
            "Warning: some water joins are approximate. Apply keeps the previewed tiles.".into(),
        );
    }
    summarize_mask(&mut result);
    Ok(result)
}

fn summarize_mask(result: &mut SmartTerrainPlan) {
    let original: BTreeSet<_> = result.mask.iter().map(|cell| (cell.y, cell.x)).collect();
    let mut effective = original.clone();
    for cell in &result.removed_cells {
        effective.remove(&(cell.y, cell.x));
    }
    for cell in &result.added_cells {
        effective.insert((cell.y, cell.x));
    }
    result.effective_mask = effective
        .into_iter()
        .map(|(y, x)| MapCoordinate { x, y })
        .collect();
    result.retiled_neighbors = result
        .paint
        .painted_cells
        .iter()
        .filter(|cell| !original.contains(&(cell.y, cell.x)))
        .map(|cell| MapCoordinate {
            x: cell.x,
            y: cell.y,
        })
        .collect();
}

fn validate_water(
    map: &MapLevel,
    changes: &[LandMapCellPaint],
    unresolved: &mut Vec<MapCoordinate>,
) {
    let mut inspect = BTreeSet::new();
    for cell in changes {
        inspect.insert((cell.x, cell.y));
        for (x, y) in topology::neighbors(MapCoordinate {
            x: cell.x,
            y: cell.y,
        }) {
            if (0..90).contains(&x) && (0..90).contains(&y) {
                inspect.insert((x as u8, y as u8));
            }
        }
    }
    for (x, y) in inspect {
        let tile = map_paint::terrain_tile(map.tiles[usize::from(y) * 90 + usize::from(x)])
            .unwrap_or(0) as i16;
        let Some(index) = water_geometry::index(tile) else {
            continue;
        };
        for (direction, (nx, ny)) in [
            (x as i16, y as i16 - 1),
            (x as i16 + 1, y as i16),
            (x as i16, y as i16 + 1),
            (x as i16 - 1, y as i16),
        ]
        .into_iter()
        .enumerate()
        {
            if !(0..90).contains(&nx) || !(0..90).contains(&ny) {
                continue;
            }
            let neighbor = map_paint::terrain_tile(map.tiles[ny as usize * 90 + nx as usize])
                .unwrap_or(0) as i16;
            if water_geometry::PIECES[index].edges[direction]
                != water_geometry::fixed_edge(neighbor, (direction + 2) % 4)
            {
                unresolved.push(MapCoordinate { x, y });
                break;
            }
        }
    }
}

fn position(cell: MapCoordinate) -> usize {
    usize::from(cell.y) * 90 + usize::from(cell.x)
}
fn coordinates(cells: impl Iterator<Item = bool>) -> Vec<MapCoordinate> {
    cells
        .enumerate()
        .filter(|(_, included)| *included)
        .map(|(i, _)| MapCoordinate {
            x: (i % 90) as u8,
            y: (i / 90) as u8,
        })
        .collect()
}

#[cfg(test)]
mod linear_tests;
#[cfg(test)]
mod tests;
