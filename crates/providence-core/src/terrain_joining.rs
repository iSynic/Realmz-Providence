//! Joining geometry is independent of display labels and native tile behavior.
use crate::{
    land_tile_catalog::{self, LandTileSemantics},
    model::*,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AtlasEvidence {
    pub tileset_id: StableId,
    pub asset_identity: StableId,
    pub blob: BlobId,
    pub scenario_owned: bool,
    pub tile_fingerprints: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub identity: String,
    pub revision: u32,
    pub landlook: i8,
    pub name: String,
    pub joining_enabled: bool,
    pub tile_fingerprints: Vec<String>,
}

pub fn layouts() -> &'static [Layout] {
    #[derive(Deserialize)]
    struct Catalog {
        profiles: Vec<Layout>,
    }
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    &CATALOG
        .get_or_init(|| {
            serde_json::from_str(include_str!("terrain_joining/profiles.json"))
                .expect("reviewed stock joining layouts")
        })
        .profiles
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingSample {
    pub family: String,
    pub tile: i16,
    pub level: u8,
    pub x: u8,
    pub y: u8,
    pub cells: Vec<i16>,
}

pub fn mapping_samples() -> &'static [MappingSample] {
    #[derive(Deserialize)]
    struct Samples {
        samples: Vec<MappingSample>,
    }
    static SAMPLES: OnceLock<Samples> = OnceLock::new();
    &SAMPLES
        .get_or_init(|| {
            serde_json::from_str(include_str!("terrain_joining/mapping_samples.json"))
                .expect("reviewed source joins")
        })
        .samples
}

pub fn fingerprint_rgba(rgba: &[u8], width: u32, height: u32) -> Result<Vec<String>, String> {
    if width != 640 || height != 320 || rgba.len() != 640 * 320 * 4 {
        return Err("Terrain mapping requires an exact 640 × 320 outdoor atlas.".into());
    }
    Ok((0..200)
        .map(|tile| {
            let mut hash = Sha256::new();
            for y in 0..32 {
                let first = ((tile / 20 * 32 + y) * 640 + tile % 20 * 32) * 4;
                hash.update(&rgba[first..first + 32 * 4]);
            }
            format!("{:x}", hash.finalize())
        })
        .collect())
}

pub fn family_tiles(family: &str) -> Vec<usize> {
    match family {
        "water" => (1..=32).chain(38..=51).chain([60]).collect(),
        "mountains" => (61..=93).collect(),
        "forest" => (121..=129).collect(),
        _ => vec![],
    }
}

pub fn family_for_tile(tile: i16) -> Option<&'static str> {
    match tile {
        1..=32 | 38..=51 | 60 => Some("water"),
        61..=93 => Some("mountains"),
        121..=129 => Some("forest"),
        _ => None,
    }
}

impl AtlasEvidence {
    pub fn validate(&self, snapshot: &ProjectSnapshot, map: &MapLevel) -> Result<(), String> {
        let runtime = map.runtime.as_ref().ok_or("The map has no atlas.")?;
        if self.tileset_id != runtime.tileset_id || self.tile_fingerprints.len() != 200 {
            return Err("The terrain mapping belongs to a different atlas.".into());
        }
        use crate::map_artwork::{self, MapArtworkResolution};
        match map_artwork::scenario(snapshot, &runtime.tileset_id) {
            MapArtworkResolution::Resolved(asset) => {
                if !self.scenario_owned
                    || asset.identity != self.asset_identity
                    || asset.blob != self.blob
                {
                    return Err("The scenario atlas changed. Review its mapping again.".into());
                }
            }
            MapArtworkResolution::Missing if !self.scenario_owned => (),
            MapArtworkResolution::Missing => {
                return Err("The mapped scenario artwork is no longer available.".into());
            }
            MapArtworkResolution::WrongKind | MapArtworkResolution::Ambiguous => {
                return Err(
                    "The scenario atlas is incompatible or has ambiguous ownership.".into(),
                );
            }
        }
        Ok(())
    }

    pub fn family_layout(
        &self,
        family: &str,
        preferred_look: Option<i8>,
    ) -> Option<&'static Layout> {
        let tiles = family_tiles(family);
        if tiles.is_empty() || self.tile_fingerprints.len() != 200 {
            return None;
        }
        layouts()
            .iter()
            .filter(|layout| {
                layout.joining_enabled
                    && tiles.iter().all(|tile| {
                        self.tile_fingerprints[*tile - 1] == layout.tile_fingerprints[*tile - 1]
                    })
            })
            .max_by_key(|layout| {
                (
                    Some(layout.landlook) == preferred_look,
                    self.matches(layout),
                    -layout.landlook,
                )
            })
    }

    pub fn semantics(&self, tile: i16, preferred_look: Option<i8>) -> Option<LandTileSemantics> {
        if !(1..=200).contains(&tile) || self.tile_fingerprints.len() != 200 {
            return None;
        }
        let layout = family_for_tile(tile)
            .and_then(|family| self.family_layout(family, preferred_look))
            .or_else(|| {
                layouts().iter().max_by_key(|layout| {
                    (
                        self.matches(layout),
                        Some(layout.landlook) == preferred_look,
                        -layout.landlook,
                    )
                })
            })?;
        (self.tile_fingerprints[tile as usize - 1] == layout.tile_fingerprints[tile as usize - 1])
            .then(|| land_tile_catalog::semantics(layout.landlook, tile))
            .flatten()
    }

    fn matches(&self, layout: &Layout) -> usize {
        self.tile_fingerprints
            .iter()
            .zip(&layout.tile_fingerprints)
            .filter(|(a, b)| a == b)
            .count()
    }
}

#[cfg(test)]
mod tests;
