use super::{SelectionShape, land_families};
use crate::map_paint::terrain_tile;
use crate::model::{MapLevel, ProjectSnapshot};

pub(super) fn matches(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    shape: SelectionShape,
    raw: i16,
    anchor: i16,
) -> bool {
    let landlook = map.runtime.as_ref().and_then(|runtime| runtime.landlook);
    if shape == SelectionShape::ConnectedFamily {
        let signature = |tile| landlook.and_then(|look| land_families::family(look, tile));
        return signature(anchor).map_or(raw == anchor, |target| signature(raw) == Some(target));
    }
    let signature = |tile| behavior(snapshot, landlook, tile);
    signature(anchor).map_or(raw == anchor, |target| signature(raw) == Some(target))
}

fn behavior(snapshot: &ProjectSnapshot, landlook: Option<i8>, raw: i16) -> Option<u16> {
    let tile = terrain_tile(raw)? as i16;
    let mut profiles = snapshot
        .terrain_catalog
        .iter()
        .filter(|row| row.landlook == landlook && row.tile == tile && row.source != "Data Solids");
    let row = profiles.next()?;
    if profiles.next().is_some() {
        return None;
    }
    let solid = row.solid_type != 0 || row.boat_requirement != 0 || row.fly_float;
    let flags = [
        !solid,
        solid,
        row.path,
        row.shore,
        row.boat_requirement != 0,
        row.fly_float,
        row.blocks_los,
        row.forest_type != 0,
        row.combat_build.iter().flatten().any(|value| *value != 0),
    ];
    Some(flags.iter().enumerate().fold(0, |value, (bit, enabled)| {
        value | (u16::from(*enabled) << bit)
    }))
}
