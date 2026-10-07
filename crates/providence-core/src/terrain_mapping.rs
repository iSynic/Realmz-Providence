//! Reviewed authoring bindings; labels never change tile geometry or runtime bytes.
use crate::{
    model::*,
    terrain_joining::{self, AtlasEvidence, Layout},
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MappingEdit {
    pub expected_mapping_revision: u64,
    pub layout_identity: String,
    pub layout_revision: u32,
    pub reviewed_families: BTreeSet<String>,
    pub excluded_tiles: BTreeSet<i16>,
    pub tile_labels: BTreeMap<i16, TerrainTileLabel>,
    pub category_labels: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Acceptance {
    pub identity: StableId,
    pub edit: MappingEdit,
    pub atlas: AtlasEvidence,
}

pub fn revision(snapshot: &ProjectSnapshot, tileset: &StableId) -> u64 {
    snapshot
        .terrain_mappings
        .iter()
        .find(|mapping| mapping.tileset_id == *tileset)
        .map_or(0, |mapping| mapping.revision)
}

pub fn current<'a>(
    snapshot: &'a ProjectSnapshot,
    atlas: &AtlasEvidence,
) -> Option<&'a TerrainMapping> {
    snapshot.terrain_mappings.iter().find(|mapping| {
        mapping.tileset_id == atlas.tileset_id
            && mapping.asset_identity == atlas.asset_identity
            && mapping.scenario_owned == atlas.scenario_owned
    })
}

pub fn family_layout(
    snapshot: &ProjectSnapshot,
    atlas: &AtlasEvidence,
    family: &str,
    look: Option<i8>,
) -> Option<&'static Layout> {
    if let Some(mapping) = current(snapshot, atlas) {
        let tiles = terrain_joining::family_tiles(family);
        if tiles
            .iter()
            .any(|tile| mapping.excluded_tiles.contains(&(*tile as i16)))
        {
            return None;
        }
        if mapping.reviewed_families.contains(family)
            && tiles.iter().all(|tile| {
                mapping.accepted_tile_fingerprints.get(*tile - 1)
                    == atlas.tile_fingerprints.get(*tile - 1)
            })
        {
            return terrain_joining::layouts().iter().find(|layout| {
                layout.identity == mapping.layout_identity
                    && layout.revision == mapping.layout_revision
                    && layout.joining_enabled
            });
        }
    }
    atlas.family_layout(family, look)
}

pub fn semantics(
    snapshot: &ProjectSnapshot,
    atlas: &AtlasEvidence,
    tile: i16,
    look: Option<i8>,
) -> Option<crate::land_tile_catalog::LandTileSemantics> {
    if current(snapshot, atlas).is_some_and(|mapping| mapping.excluded_tiles.contains(&tile)) {
        return None;
    }
    terrain_joining::family_for_tile(tile)
        .and_then(|family| family_layout(snapshot, atlas, family, look))
        .and_then(|layout| crate::land_tile_catalog::semantics(layout.landlook, tile))
        .or_else(|| atlas.semantics(tile, look))
}

pub fn accept(
    snapshot: &mut ProjectSnapshot,
    identity: &StableId,
    edit: MappingEdit,
    atlas: &AtlasEvidence,
) -> Result<Vec<StableId>, String> {
    let map = crate::map_paint::land_map(snapshot, identity).map_err(|e| e.to_string())?;
    atlas.validate(snapshot, map)?;
    let before = revision(snapshot, &atlas.tileset_id);
    if before != edit.expected_mapping_revision {
        return Err("The terrain mapping changed. Review it again before accepting.".into());
    }
    let layout = terrain_joining::layouts()
        .iter()
        .find(|layout| {
            layout.identity == edit.layout_identity && layout.revision == edit.layout_revision
        })
        .ok_or("The chosen terrain layout revision is unavailable.")?;
    if !layout.joining_enabled && !edit.reviewed_families.is_empty() {
        return Err("This layout has display names but no reviewed joining geometry.".into());
    }
    let mapping = TerrainMapping {
        tileset_id: atlas.tileset_id.clone(),
        asset_identity: atlas.asset_identity.clone(),
        scenario_owned: atlas.scenario_owned,
        revision: before
            .checked_add(1)
            .ok_or("Mapping revision limit reached.")?,
        layout_identity: edit.layout_identity,
        layout_revision: edit.layout_revision,
        accepted_tile_fingerprints: atlas.tile_fingerprints.clone(),
        reviewed_families: edit.reviewed_families,
        excluded_tiles: edit.excluded_tiles,
        tile_labels: edit.tile_labels,
        category_labels: edit.category_labels,
    };
    mapping.validate()?;
    if before == 0 && snapshot.terrain_mappings.len() >= 256 {
        return Err("A project can contain at most 256 terrain mappings.".into());
    }
    let changed = snapshot
        .world
        .maps
        .iter()
        .filter(|map| {
            map.runtime
                .as_ref()
                .is_some_and(|r| r.tileset_id == atlas.tileset_id)
        })
        .map(|map| map.identity.clone())
        .collect();
    snapshot
        .terrain_mappings
        .retain(|old| old.tileset_id != atlas.tileset_id);
    snapshot.terrain_mappings.push(mapping);
    snapshot
        .terrain_mappings
        .sort_by_key(|mapping| mapping.tileset_id.clone());
    Ok(changed)
}

#[cfg(test)]
mod tests;
