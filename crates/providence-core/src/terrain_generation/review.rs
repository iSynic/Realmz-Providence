use super::*;

/// Revalidate the reviewed generation before using the ordinary terrain/history writer.
pub fn reviewed_paint(
    snapshot: &ProjectSnapshot,
    apply: &Apply,
) -> Result<map_paint::LandTerrainPaint, SessionError> {
    let plan = preview(
        snapshot,
        &apply.identity,
        &apply.intent,
        &apply.atlas,
        &mut || false,
    )?;
    if plan.outcome != Outcome::Success || plan.review_hash != apply.review_hash {
        return Err(map_paint::invalid(
            &apply.identity,
            "The generated preview changed. Generate and review it again.",
        ));
    }
    Ok(map_paint::LandTerrainPaint {
        tileset_id: apply.intent.tileset_id.clone(),
        cells: plan.painted_cells,
    })
}
