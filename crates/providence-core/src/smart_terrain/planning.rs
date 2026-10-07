use super::*;

pub(super) struct Resolved {
    pub cells: Vec<LandMapCellPaint>,
    pub unresolved: Vec<MapCoordinate>,
    pub reason: Option<String>,
}

pub(super) fn resolve(
    map: &MapLevel,
    profile: &Profile,
    intent: &SmartTerrainIntent,
    identity: &StableId,
    mask: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> Result<Resolved, SessionError> {
    let mut resolved = if intent.preset == "water" {
        resolve_water(map, identity, mask, canceled)?
    } else {
        let mut resolved = Resolved {
            cells: vec![],
            unresolved: vec![],
            reason: None,
        };
        let context = family_context::include_neighbors(map, profile, mask);
        let set = context.iter().map(|cell| (cell.x, cell.y)).collect();
        for cell in context {
            if canceled() {
                return Err(canceled_error(identity));
            }
            let tile = resolution::resolve(map, profile, intent, identity, cell, &set)
                .unwrap_or_else(|| {
                    resolved.unresolved.push(cell);
                    resolution::best_fit(map, profile, cell, &set)
                });
            resolved.cells.push(LandMapCellPaint {
                x: cell.x,
                y: cell.y,
                tile,
            });
        }
        resolved
    };
    if !resolved.unresolved.is_empty() {
        resolved.reason = Some(
            "Warning: some transitions are approximate. Apply keeps the previewed tiles.".into(),
        );
    }
    Ok(resolved)
}

fn resolve_water(
    map: &MapLevel,
    identity: &StableId,
    mask: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> Result<Resolved, SessionError> {
    let context = water_context::include_neighbors(map, mask);
    let fills_stream = water_contour::fills_existing_stream(map, mask, &context);
    let exact = if fills_stream {
        water_solver::solve_filled(map, &context, canceled)
    } else {
        water_solver::solve(map, &context, canceled)
    };
    let (tiles, unresolved) = match exact {
        Ok(tiles) => (tiles, vec![]),
        Err(water_solver::Failure::Canceled) => return Err(canceled_error(identity)),
        Err(_) if fills_stream => water_fill::resolve(map, mask, &context, canceled)
            .map_err(|_| canceled_error(identity))?,
        Err(_) => {
            water_fallback::solve(map, &context, canceled).map_err(|_| canceled_error(identity))?
        }
    };
    Ok(Resolved {
        cells: context
            .iter()
            .zip(tiles)
            .map(|(cell, tile)| LandMapCellPaint {
                x: cell.x,
                y: cell.y,
                tile,
            })
            .collect(),
        unresolved,
        reason: None,
    })
}

pub(super) fn canceled_error(identity: &StableId) -> SessionError {
    map_paint::invalid(
        identity,
        "Terrain planning was canceled. Your selection is unchanged.",
    )
}

pub(super) fn finish(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &SmartTerrainIntent,
    mask: Vec<MapCoordinate>,
    resolved: Resolved,
) -> Result<SmartTerrainPlan, SessionError> {
    let cells = resolved.cells;
    let paint = if cells.is_empty() {
        LandTerrainPaintPreview {
            painted_cells: vec![],
            protected_cells: vec![],
            unchanged_cells: 0,
        }
    } else {
        map_paint::preview_land_terrain_paint(
            snapshot,
            identity,
            &LandTerrainPaint {
                tileset_id: intent.tileset_id.clone(),
                cells,
            },
        )?
    };
    let selected: BTreeSet<_> = mask.iter().map(|cell| (cell.x, cell.y)).collect();
    let retiled_neighbors = paint
        .painted_cells
        .iter()
        .filter(|cell| !selected.contains(&(cell.x, cell.y)))
        .map(|cell| MapCoordinate {
            x: cell.x,
            y: cell.y,
        })
        .collect();
    Ok(SmartTerrainPlan {
        paint,
        unresolved: resolved.unresolved,
        unresolved_reason: resolved.reason,
        retiled_neighbors,
        effective_mask: mask.clone(),
        added_cells: vec![],
        removed_cells: vec![],
        mask,
    })
}
