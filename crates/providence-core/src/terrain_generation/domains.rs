use super::*;

pub(super) struct Prepared {
    pub pieces: Vec<(i16, [u8; 4])>,
    pub domains: Vec<u64>,
    pub editable: Vec<bool>,
    pub before: Vec<i16>,
    pub protected: Vec<MapCoordinate>,
}

pub(super) fn prepare(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &Intent,
    atlas: &AtlasEvidence,
) -> Result<Prepared, SessionError> {
    let map = map_paint::land_map(snapshot, identity)?;
    atlas
        .validate(snapshot, map)
        .map_err(|reason| map_paint::invalid(identity, &reason))?;
    let runtime = map.runtime.as_ref().unwrap();
    if intent.tileset_id != atlas.tileset_id
        || intent.atlas_blob != atlas.blob
        || intent.mapping_revision != crate::terrain_mapping::revision(snapshot, &atlas.tileset_id)
        || crate::terrain_mapping::family_layout(snapshot, atlas, &intent.family, runtime.landlook)
            .is_none()
    {
        return Err(map_paint::invalid(
            identity,
            "This artwork or terrain mapping changed or has no reviewed rules. Reopen Generate Terrain.",
        ));
    }
    let base = runtime
        .base_tile
        .filter(|tile| (1..=200).contains(tile))
        .ok_or_else(|| map_paint::invalid(identity, "This map needs a valid base ground tile."))?;
    let mut pieces = crate::smart_terrain::generation_geometry::pieces(&intent.family);
    if pieces.is_empty() || pieces.iter().any(|(tile, _)| *tile == base) {
        return Err(map_paint::invalid(
            identity,
            "Choose a reviewed terrain family distinct from the base ground.",
        ));
    }
    pieces.sort_by_key(|piece| piece.0);
    pieces.insert(0, (base, [0; 4]));
    let mask = coordinates(identity, &intent.mask)?;
    if mask.is_empty() {
        return Err(map_paint::invalid(
            identity,
            "Select an area before generating terrain.",
        ));
    }
    let mut locks = coordinates(identity, &intent.locks)?;
    map_connectivity::validate(identity, &intent.connections)?;
    locks.extend(
        snapshot
            .world
            .action_points
            .iter()
            .filter(|ap| ap.level_type == map.level_type && ap.level_index == map.native_index)
            .filter_map(|ap| ap.coordinate)
            .filter(|cell| cell.x < 90 && cell.y < 90)
            .map(map_connectivity::index),
    );
    Ok(build(map, pieces, &mask, &locks))
}

fn build(
    map: &MapLevel,
    pieces: Vec<(i16, [u8; 4])>,
    mask: &BTreeSet<usize>,
    locks: &BTreeSet<usize>,
) -> Prepared {
    let all = (1u64 << pieces.len()) - 1;
    let mut prepared = Prepared {
        pieces,
        domains: vec![1; 8100],
        editable: vec![false; 8100],
        before: map.tiles.clone(),
        protected: vec![],
    };
    for (i, &raw) in map.tiles.iter().enumerate() {
        let decoded = crate::codecs::decode_land_cell(raw);
        let piece = prepared.pieces.iter().position(|(tile, _)| raw == *tile);
        let editable = mask.contains(&i)
            && !locks.contains(&i)
            && raw >= 0
            && !decoded.action_point_marker
            && !decoded.note_marker
            && !decoded.path_marker
            && piece.is_some();
        prepared.editable[i] = editable;
        prepared.domains[i] = if editable {
            all
        } else {
            // Nonfamily artwork is fixed ground for this family's joins, never repainted.
            prepared
                .pieces
                .iter()
                .position(|(tile, _)| decoded.terrain_tile == Some(*tile as u16))
                .map_or(1, |piece| 1 << piece)
        };
        if mask.contains(&i) && !editable {
            prepared.protected.push(map_connectivity::coordinate(i));
        }
    }
    prepared
}
