//! Reviewed terrain rules from Providence 56ac232c smartTerrainBrush/Topology.
//! Pixel/corpus guesses remain unresolved; custom artwork never inherits stock rules.
use crate::{
    map_paint::{self, LandTerrainPaint, LandTerrainPaintPreview},
    model::*,
    session::{LandMapCellPaint, SessionError},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::OnceLock,
};

mod family_context;
#[cfg(test)]
mod irregular_water_tests;
pub mod linear;
mod planning;
#[cfg(test)]
mod refinement_tests;
mod resolution;
mod shape_adjustment;
mod shape_planning;
#[cfg(test)]
mod shape_tests;
pub mod staged;
#[cfg(test)]
mod tests;
mod topology;
#[cfg(test)]
mod water_bridge_tests;
mod water_budget;
#[cfg(test)]
mod water_budget_tests;
mod water_connectivity;
mod water_context;
mod water_contour;
mod water_domains;
mod water_fallback;
mod water_fill;
#[cfg(test)]
mod water_fill_tests;
mod water_geometry;
mod water_join_search;
mod water_mouth;
#[cfg(test)]
mod water_mouth_tests;
#[cfg(test)]
mod water_orientations;
mod water_refinement;
mod water_regions;
mod water_solver;
#[cfg(test)]
mod water_tests;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SmartTerrainIntent {
    pub tileset_id: StableId,
    pub preset: String,
    pub mask: Vec<MapCoordinate>,
    #[serde(default)]
    pub atlas_blob: Option<BlobId>,
    #[serde(default)]
    pub mapping_revision: u64,
    #[serde(default)]
    pub tolerance: ShapeTolerance,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ShapeTolerance {
    #[default]
    Literal,
    Gentle,
    Balanced,
    Strong,
}

impl ShapeTolerance {
    pub fn cells(self) -> u8 {
        match self {
            Self::Literal => 0,
            Self::Gentle => 1,
            Self::Balanced => 2,
            Self::Strong => 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Apply {
    pub identity: StableId,
    pub intent: SmartTerrainIntent,
    pub atlas: Option<crate::terrain_joining::AtlasEvidence>,
}

pub struct SmartTerrainPlan {
    pub paint: LandTerrainPaintPreview,
    /// Best-fit transitions needing visual review; these do not block Apply.
    pub unresolved: Vec<MapCoordinate>,
    pub mask: Vec<MapCoordinate>,
    pub unresolved_reason: Option<String>,
    pub retiled_neighbors: Vec<MapCoordinate>,
    pub effective_mask: Vec<MapCoordinate>,
    pub added_cells: Vec<MapCoordinate>,
    pub removed_cells: Vec<MapCoordinate>,
}

#[derive(Debug, Deserialize)]
struct Rules {
    looks: Vec<i8>,
    presets: BTreeMap<String, Profile>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    family: Vec<i16>,
    center: Vec<i16>,
    masks: BTreeMap<u8, Vec<i16>>,
    roles: BTreeMap<String, Vec<i16>>,
    water_roles: BTreeMap<String, Vec<i16>>,
}
fn rules() -> &'static Rules {
    static RULES: OnceLock<Rules> = OnceLock::new();
    RULES.get_or_init(|| {
        serde_json::from_str(include_str!("smart_terrain/reviewed_rules.json"))
            .expect("bounded reviewed terrain rules")
    })
}

pub fn availability(snapshot: &ProjectSnapshot, identity: &StableId) -> Result<(), SessionError> {
    let map = map_paint::land_map(snapshot, identity)?;
    let runtime = map
        .runtime
        .as_ref()
        .ok_or_else(|| map_paint::invalid(identity, "The map has no Landlook renderer."))?;
    let look = runtime
        .landlook
        .ok_or_else(|| map_paint::invalid(identity, "The map has no Landlook profile."))?;
    if !rules().looks.contains(&look) {
        return Err(map_paint::invalid(
            identity,
            "This Landlook has no reviewed smart terrain mapping. Use explicit tiles; the mask will be kept.",
        ));
    }
    let expected = ClassicResourceKey {
        resource_type: "PICT".into(),
        resource_id: 300 + i32::from(look),
    };
    if crate::map_artwork::resource_key(&runtime.tileset_id).as_ref() != Some(&expected)
        || snapshot.assets.iter().any(|asset| {
            asset.classic_resource.as_ref() == Some(&expected)
                || asset.identity == runtime.tileset_id
        })
    {
        return Err(map_paint::invalid(
            identity,
            "Scenario artwork cannot inherit stock smart terrain mappings. Use explicit tiles for this atlas.",
        ));
    }
    Ok(())
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &SmartTerrainIntent,
) -> Result<SmartTerrainPlan, SessionError> {
    preview_cancellable(snapshot, identity, intent, &mut || false)
}

pub fn preview_cancellable(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &SmartTerrainIntent,
    canceled: &mut impl FnMut() -> bool,
) -> Result<SmartTerrainPlan, SessionError> {
    preview_mapped(snapshot, identity, intent, None, canceled)
}

pub fn preview_mapped(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &SmartTerrainIntent,
    atlas: Option<&crate::terrain_joining::AtlasEvidence>,
    canceled: &mut impl FnMut() -> bool,
) -> Result<SmartTerrainPlan, SessionError> {
    let map = map_paint::land_map(snapshot, identity)?;
    validate_mapping(snapshot, map, identity, intent, atlas)?;
    let profile = rules().presets.get(&intent.preset).ok_or_else(|| {
        map_paint::invalid(identity, "Choose Water, Mountains or Trees / Forest.")
    })?;
    let mask = normalize_mask(identity, &intent.mask)?;
    shape_planning::preview(
        shape_planning::Target {
            snapshot,
            map,
            profile,
            identity,
            atlas,
        },
        intent,
        mask,
        canceled,
    )
}

fn validate_mapping(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    identity: &StableId,
    intent: &SmartTerrainIntent,
    atlas: Option<&crate::terrain_joining::AtlasEvidence>,
) -> Result<(), SessionError> {
    if let Some(atlas) = atlas {
        atlas
            .validate(snapshot, map)
            .map_err(|reason| map_paint::invalid(identity, &reason))?;
        if intent.atlas_blob.as_ref() != Some(&atlas.blob) {
            return Err(map_paint::invalid(
                identity,
                "The atlas changed. Reopen Smart terrain before applying.",
            ));
        }
        if intent.mapping_revision != crate::terrain_mapping::revision(snapshot, &intent.tileset_id)
        {
            return Err(map_paint::invalid(
                identity,
                "The terrain mapping changed. Review this draft again.",
            ));
        }
        if crate::terrain_mapping::family_layout(
            snapshot,
            atlas,
            &intent.preset,
            map.runtime.as_ref().and_then(|runtime| runtime.landlook),
        )
        .is_none()
        {
            return Err(map_paint::invalid(
                identity,
                "This terrain family has no verified mapping for the current artwork.",
            ));
        }
    } else {
        if crate::terrain_mapping::revision(snapshot, &intent.tileset_id) != 0 {
            return Err(map_paint::invalid(
                identity,
                "The saved mapping requires current artwork verification.",
            ));
        }
        availability(snapshot, identity)?;
    }
    if map.runtime.as_ref().expect("validated renderer").tileset_id != intent.tileset_id {
        return Err(map_paint::invalid(
            identity,
            "The mask atlas changed. Reopen Smart terrain.",
        ));
    }
    Ok(())
}

fn pick(tiles: &[i16], identity: &StableId, preset: &str, cell: MapCoordinate, salt: &str) -> i16 {
    let text = format!("{}:{preset}:{}:{}:{salt}", identity.0, cell.x, cell.y);
    let hash = text.encode_utf16().fold(2166136261u32, |hash, word| {
        (hash ^ u32::from(word)).wrapping_mul(16777619)
    }) as i32;
    tiles[hash.unsigned_abs() as usize % tiles.len()]
}

fn normalize_mask(
    identity: &StableId,
    mask: &[MapCoordinate],
) -> Result<Vec<MapCoordinate>, SessionError> {
    if mask.len() > 8100 {
        return Err(map_paint::invalid(
            identity,
            "A mask can cover at most 8100 cells.",
        ));
    }
    if let Some(cell) = mask.iter().find(|cell| cell.x >= 90 || cell.y >= 90) {
        return Err(SessionError::MapCoordinateOutOfRange {
            x: cell.x,
            y: cell.y,
        });
    }
    let unique: BTreeSet<_> = mask.iter().map(|cell| (cell.y, cell.x)).collect();
    Ok(unique
        .into_iter()
        .map(|(y, x)| MapCoordinate { x, y })
        .collect())
}

pub fn reshape_mask(
    identity: &StableId,
    mask: &[MapCoordinate],
    operation: &str,
) -> Result<Vec<MapCoordinate>, SessionError> {
    let mask = normalize_mask(identity, mask)?;
    if operation == "fill" {
        return Ok(crate::map_selection::fill_enclosed_mask(&mask));
    }
    let set: BTreeSet<_> = mask.iter().map(|cell| (cell.x, cell.y)).collect();
    let mut result = set.clone();
    match operation {
        "clear" => result.clear(),
        "grow" => {
            for cell in &mask {
                for (x, y) in topology::neighbors(*cell) {
                    if (0..90).contains(&x) && (0..90).contains(&y) {
                        result.insert((x as u8, y as u8));
                    }
                }
            }
        }
        "shrink" => result.retain(|(x, y)| {
            topology::neighbors(MapCoordinate { x: *x, y: *y })
                .all(|(x, y)| set.contains(&(x as u8, y as u8)))
        }),
        _ => {
            return Err(map_paint::invalid(
                identity,
                "Choose Fill, Grow, Shrink or Clear mask.",
            ));
        }
    }
    let cells: Vec<_> = result
        .into_iter()
        .map(|(x, y)| MapCoordinate { x, y })
        .collect();
    normalize_mask(identity, &cells)
}
