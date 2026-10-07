//! Providence 56ac232c builtInMapStamps.ts: bounded recipe data only.
use crate::{
    model::{LevelType, MapLevel, StableId},
    paint_resources::{PaintResource, PaintResourceCell, PaintResourceKind},
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltinPaintResource {
    pub resource: PaintResource,
    pub availability_reason: Option<String>,
}

pub fn catalog(map: &MapLevel) -> Vec<BuiltinPaintResource> {
    if map.level_type != LevelType::Land {
        return vec![];
    }
    let Some(runtime) = &map.runtime else {
        return vec![];
    };
    RECIPES
        .iter()
        .map(|recipe| {
            let width = recipe.cells.iter().map(|cell| cell.0).max().unwrap() + 1;
            let height = recipe.cells.iter().map(|cell| cell.1).max().unwrap() + 1;
            let availability_reason = if !recipe.looks.is_empty()
                && !runtime
                    .landlook
                    .is_some_and(|look| recipe.looks.contains(&look))
            {
                Some(format!(
                    "This recipe requires Landlook {}.",
                    recipe
                        .looks
                        .iter()
                        .map(i8::to_string)
                        .collect::<Vec<_>>()
                        .join(", ")
                ))
            } else {
                None
            };
            BuiltinPaintResource {
                resource: PaintResource {
                    identity: StableId(format!("preset:{}", recipe.id)),
                    name: recipe.name.into(),
                    collection: recipe.category.into(),
                    kind: PaintResourceKind::Stamp,
                    level_type: LevelType::Land,
                    tileset_id: runtime.tileset_id.clone(),
                    width,
                    height,
                    cells: recipe
                        .cells
                        .iter()
                        .map(|&(x, y, tile)| PaintResourceCell { x, y, tile })
                        .collect(),
                    favorite: false,
                },
                availability_reason,
            }
        })
        .collect()
}

pub fn resolve(map: &MapLevel, identity: &StableId) -> Result<PaintResource, String> {
    let entry = catalog(map)
        .into_iter()
        .find(|entry| entry.resource.identity == *identity)
        .ok_or("The built-in stamp is unavailable for this map.")?;
    if let Some(reason) = entry.availability_reason {
        return Err(reason);
    }
    entry.resource.validate()?;
    Ok(entry.resource)
}

pub fn catalog_mapped(
    snapshot: &crate::model::ProjectSnapshot,
    map: &MapLevel,
    atlas: Option<&crate::terrain_joining::AtlasEvidence>,
) -> Vec<BuiltinPaintResource> {
    let mut entries = catalog(map);
    for (entry, recipe) in entries.iter_mut().zip(RECIPES) {
        if recipe.looks.is_empty() {
            continue;
        }
        let compatible = atlas.is_some_and(|atlas| {
            let binding = crate::terrain_mapping::current(snapshot, atlas);
            crate::terrain_joining::layouts().iter().any(|layout| {
                recipe.looks.contains(&layout.landlook)
                    && recipe.cells.iter().all(|&(_, _, tile)| {
                        let index = tile as usize - 1;
                        !binding.is_some_and(|binding| binding.excluded_tiles.contains(&tile))
                            && (atlas.tile_fingerprints.get(index)
                                == layout.tile_fingerprints.get(index)
                                || binding.is_some_and(|binding| {
                                    binding.layout_identity == layout.identity
                                        && binding.layout_revision == layout.revision
                                        && binding.accepted_tile_fingerprints.get(index)
                                            == atlas.tile_fingerprints.get(index)
                                }))
                    })
            })
        });
        entry.availability_reason = (!compatible).then(|| {
            "This stamp's tiles need compatible artwork or a reviewed Terrain Mapping.".into()
        });
    }
    entries
}

struct Recipe {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    looks: &'static [i8],
    cells: &'static [(u8, u8, i16)],
}

const RECIPES: &[Recipe] = &[
    Recipe {
        id: "tree-pair-151-152",
        name: "Tree 151/152",
        category: "vegetation",
        looks: &[0, 2, 3, 10],
        cells: &[(0, 0, 151), (0, 1, 152)],
    },
    Recipe {
        id: "tree-pair-153-154",
        name: "Tree 153/154",
        category: "vegetation",
        looks: &[0, 2, 3, 10],
        cells: &[(0, 0, 153), (0, 1, 154)],
    },
    Recipe {
        id: "castle-column-142-143",
        name: "Tall Stone Column 142/143",
        category: "structures",
        looks: &[4],
        cells: &[(0, 0, 142), (0, 1, 143)],
    },
    Recipe {
        id: "castle-sarcophagus-153-154",
        name: "Sarcophagus 153/154",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 153), (1, 0, 154)],
    },
    Recipe {
        id: "castle-bed-156-157",
        name: "Bed 156/157",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 156), (1, 0, 157)],
    },
    Recipe {
        id: "castle-long-table-158-162",
        name: "Long Table 158/159/162",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 158), (1, 0, 159), (2, 0, 162)],
    },
    Recipe {
        id: "castle-long-table-bottles-158-160-162",
        name: "Long Table With Bottles 158/160/162",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 158), (1, 0, 160), (2, 0, 162)],
    },
    Recipe {
        id: "castle-long-table-food-158-161-162",
        name: "Long Table With Food 158/161/162",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 158), (1, 0, 161), (2, 0, 162)],
    },
    Recipe {
        id: "castle-torture-rack-163-164",
        name: "Torture Rack 163/164",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 163), (1, 0, 164)],
    },
    Recipe {
        id: "castle-yellow-bed-165-166",
        name: "Yellow Bed 165/166",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 165), (1, 0, 166)],
    },
    Recipe {
        id: "castle-purple-throne-177-178",
        name: "Tall Purple Throne 177/178",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 177), (0, 1, 178)],
    },
    Recipe {
        id: "castle-gargoyle-179-180",
        name: "Stone Gargoyle 179/180",
        category: "structures",
        looks: &[4],
        cells: &[(0, 0, 179), (0, 1, 180)],
    },
    Recipe {
        id: "castle-coffin-185-186",
        name: "Coffin 185/186",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 185), (1, 0, 186)],
    },
    Recipe {
        id: "castle-open-door-north-wall-187-191",
        name: "Open Door From North Wall 187/188/190/191",
        category: "structures",
        looks: &[4],
        cells: &[(0, 0, 187), (1, 0, 188), (0, 1, 190), (1, 1, 191)],
    },
    Recipe {
        id: "castle-open-door-west-wall-193-195",
        name: "Open Door From West Wall 193/195",
        category: "structures",
        looks: &[4],
        cells: &[(0, 0, 193), (0, 1, 195)],
    },
    Recipe {
        id: "castle-open-door-east-wall-194-196",
        name: "Open Door From East Wall 194/196",
        category: "structures",
        looks: &[4],
        cells: &[(0, 0, 194), (0, 1, 196)],
    },
    Recipe {
        id: "castle-purple-object-199-200",
        name: "Purple Altar 199/200",
        category: "furnishings",
        looks: &[4],
        cells: &[(0, 0, 199), (1, 0, 200)],
    },
    Recipe {
        id: "structure-dome-91-90",
        name: "Dome -91/-90",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -91), (1, 0, -90)],
    },
    Recipe {
        id: "structure-house-75-72",
        name: "House -75/-72",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -75), (1, 0, -74), (0, 1, -73), (1, 1, -72)],
    },
    Recipe {
        id: "structure-castle-93-92",
        name: "Castle -93/-92",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -93), (1, 0, -92)],
    },
    Recipe {
        id: "structure-red-building-64-67",
        name: "Red Building -64/-67",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -64), (1, 0, -65), (0, 1, -66), (1, 1, -67)],
    },
    Recipe {
        id: "structure-temple-63-60",
        name: "Temple -63/-60",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -63), (1, 0, -62), (0, 1, -61), (1, 1, -60)],
    },
    Recipe {
        id: "structure-gold-hall-59-56",
        name: "Gold Hall -59/-56",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -59), (1, 0, -58), (0, 1, -57), (1, 1, -56)],
    },
    Recipe {
        id: "structure-arch-52-55",
        name: "Arch -52/-55",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -52), (1, 0, -53), (0, 1, -54), (1, 1, -55)],
    },
    Recipe {
        id: "structure-stone-hall-38-37",
        name: "Stone Hall -38/-37",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -38), (1, 0, -37)],
    },
    Recipe {
        id: "structure-wooden-tower-50-51",
        name: "Wooden Tower -50/-51",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -50), (0, 1, -51)],
    },
    Recipe {
        id: "structure-red-tower-36-33",
        name: "Red Tower -36/-33",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -36), (1, 0, -35), (0, 1, -34), (1, 1, -33)],
    },
    Recipe {
        id: "structure-green-gate-30-31",
        name: "Green Gate -30/-31",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -30), (1, 0, -29), (0, 1, -32), (1, 1, -31)],
    },
    Recipe {
        id: "structure-gnarled-root-25-28",
        name: "Gnarled Root -25/-28",
        category: "structures",
        looks: &[],
        cells: &[(0, 0, -26), (1, 0, -25), (0, 1, -28), (1, 1, -27)],
    },
];
