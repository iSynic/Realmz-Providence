use super::{BlobId, StableId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn normalize(snapshot: &mut super::ProjectSnapshot) {
    snapshot
        .terrain_catalog
        .sort_by_key(|profile| (profile.landlook, profile.tile));
    for catalog in &mut snapshot.landlook_catalogs {
        catalog.range_slots.sort_by_key(|slot| slot.slot);
    }
    snapshot
        .landlook_catalogs
        .sort_by_key(|catalog| catalog.landlook);
    snapshot
        .terrain_mappings
        .sort_by_key(|mapping| mapping.tileset_id.clone());
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerrainMapping {
    pub tileset_id: StableId,
    pub asset_identity: StableId,
    pub scenario_owned: bool,
    pub revision: u64,
    pub layout_identity: String,
    pub layout_revision: u32,
    pub accepted_tile_fingerprints: Vec<String>,
    pub reviewed_families: BTreeSet<String>,
    pub excluded_tiles: BTreeSet<i16>,
    pub tile_labels: BTreeMap<i16, TerrainTileLabel>,
    pub category_labels: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerrainTileLabel {
    pub name: Option<String>,
    pub material: Option<String>,
}

impl TerrainMapping {
    pub fn validate(&self) -> Result<(), String> {
        if self.revision == 0
            || self.layout_revision == 0
            || self.layout_identity.is_empty()
            || self.tileset_id.0.is_empty()
            || self.asset_identity.0.is_empty()
        {
            return Err(
                "A terrain mapping requires stable artwork, layout and revision identities.".into(),
            );
        }
        if self.accepted_tile_fingerprints.len() != 200
            || self.accepted_tile_fingerprints.iter().any(|hash| {
                hash.len() != 64
                    || !hash
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
        {
            return Err("A terrain mapping requires the 200 reviewed tile fingerprints.".into());
        }
        if self
            .reviewed_families
            .iter()
            .any(|family| !matches!(family.as_str(), "water" | "mountains" | "forest"))
            || self
                .excluded_tiles
                .iter()
                .chain(self.tile_labels.keys())
                .any(|tile| !(1..=200).contains(tile))
        {
            return Err("A terrain mapping names an unsupported family or tile.".into());
        }
        if self.category_labels.len() > 32
            || self.tile_labels.values().any(|label| {
                label
                    .name
                    .iter()
                    .chain(label.material.iter())
                    .any(|s| !valid_label(s))
            })
            || self
                .category_labels
                .iter()
                .any(|(key, value)| !valid_label(key) || !valid_label(value))
        {
            return Err("Terrain labels must contain 1–120 printable characters.".into());
        }
        Ok(())
    }
}

fn valid_label(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 120 && !value.chars().any(char::is_control)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainProfile {
    pub source: String,
    pub source_blob: Option<BlobId>,
    pub tile: i16,
    pub landlook: Option<i8>,
    pub movement_sound_id: Option<i16>,
    pub movement_cost: i16,
    pub solid_type: i16,
    pub walkable: bool,
    pub shore: bool,
    pub boat_requirement: i16,
    pub path: bool,
    pub blocks_los: bool,
    pub fly_float: bool,
    pub forest_type: i16,
    pub combat_build: [[i16; 3]; 3],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandlookRangeSlot {
    pub slot: u8,
    pub first_tile: i16,
    pub last_tile: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandlookCatalogMetadata {
    pub landlook: i8,
    pub source: String,
    pub source_blob: BlobId,
    pub byte_length: u64,
    pub base_tile: i16,
    pub base_scale: i16,
    #[serde(default)]
    pub range_slots: Vec<LandlookRangeSlot>,
}
