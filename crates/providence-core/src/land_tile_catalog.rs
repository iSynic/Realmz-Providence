//! Stock tile names are derived from Providence 56ac232c landlookTileSemantics.ts.
//! Unknown and custom artwork never inherits Plains visual semantics.

use serde::Serialize;
use std::{collections::BTreeMap, sync::OnceLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LandTileCategory {
    WaterShore,
    MountainLand,
    MountainWater,
    Road,
    Watercraft,
    Forest,
    TreeDetail,
    Rocks,
    Graves,
    Buildings,
    TerrainProp,
    CaveTransition,
    Hazard,
    Open,
    Blank,
    Uncertain,
}

impl LandTileCategory {
    pub fn label(self) -> &'static str {
        match self {
            Self::WaterShore => "Water / shore",
            Self::MountainLand => "Mountain to land",
            Self::MountainWater => "Mountain to water",
            Self::Road => "Road / path art",
            Self::Watercraft => "Boat / watercraft",
            Self::Forest => "Forest transition",
            Self::TreeDetail => "Tree detail",
            Self::Rocks => "Rocks / rubble",
            Self::Graves => "Graves",
            Self::Buildings => "Buildings",
            Self::TerrainProp => "Terrain prop",
            Self::CaveTransition => "Cave transition",
            Self::Hazard => "Hazard / ruin",
            Self::Open => "Open land",
            Self::Blank => "Blank / unused",
            Self::Uncertain => "Uncertain",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct LandTileSemantics {
    pub name: &'static str,
    pub category: LandTileCategory,
    pub confidence: &'static str,
    pub notes: &'static str,
    pub connections: &'static str,
    pub category_label: &'static str,
}

pub fn semantics(landlook: i8, tile: i16) -> Option<LandTileSemantics> {
    if ![0, 2, 3, 4, 5, 9, 10].contains(&landlook) || !(1..=200).contains(&tile) {
        return None;
    }
    static CATALOG: OnceLock<BTreeMap<(i8, i16), LandTileSemantics>> = OnceLock::new();
    let rows = CATALOG.get_or_init(stock_catalog);
    rows.get(&(landlook, tile))
        .or_else(|| rows.get(&(0, tile)))
        .copied()
}

fn stock_catalog() -> BTreeMap<(i8, i16), LandTileSemantics> {
    let mut catalog = BTreeMap::new();
    for line in include_str!("land_tile_catalog/stock.tsv")
        .lines()
        .filter(|line| !line.starts_with('#'))
    {
        let fields: Vec<_> = line.split('\t').collect();
        assert_eq!(fields.len(), 9, "invalid embedded stock tile metadata");
        let look: i8 = fields[0].parse().expect("stock Landlook identity");
        let first: i16 = fields[1].parse().expect("stock tile bound");
        let last: i16 = fields[2].parse().expect("stock tile bound");
        let category = category(fields[3]);
        for tile in first..=last {
            assert!(
                catalog
                    .insert(
                        (look, tile),
                        LandTileSemantics {
                            name: fields[5],
                            category,
                            confidence: fields[4],
                            notes: fields[6],
                            connections: fields[7],
                            category_label: fields[8],
                        }
                    )
                    .is_none(),
                "duplicate embedded stock tile metadata"
            );
        }
    }
    catalog
}

fn category(value: &str) -> LandTileCategory {
    use LandTileCategory::*;
    match value {
        "water-shore" => WaterShore,
        "mountain-land" => MountainLand,
        "mountain-water" => MountainWater,
        "road" => Road,
        "watercraft" => Watercraft,
        "forest" => Forest,
        "tree-detail" => TreeDetail,
        "rocks" => Rocks,
        "graves" => Graves,
        "buildings" => Buildings,
        "terrain-prop" => TerrainProp,
        "cave-transition" => CaveTransition,
        "hazard" => Hazard,
        "open" => Open,
        "blank" => Blank,
        "uncertain" => Uncertain,
        _ => panic!("invalid embedded stock tile category"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_families_retain_the_exact_stock_look() {
        let plains = semantics(0, 151).unwrap();
        let castle = semantics(4, 151).unwrap();
        let desert = semantics(5, 151).unwrap();
        assert_eq!(plains.name, "Tree detail");
        assert_eq!(plains.category, LandTileCategory::TreeDetail);
        assert_eq!(castle.name, "Wooden chest facing west");
        assert_eq!(castle.category, LandTileCategory::TerrainProp);
        assert_eq!(desert.name, "Dense desert bush");
        assert_eq!(semantics(0, 1).unwrap().name, "Shoreline, land west");
        for look in [0, 2, 3, 4, 5, 9, 10] {
            for tile in 1..=200 {
                let row = semantics(look, tile).unwrap();
                assert!(!row.name.is_empty());
                assert!(["known", "likely", "uncertain"].contains(&row.confidence));
            }
        }
    }

    #[test]
    fn unknown_custom_and_non_atlas_identities_have_no_stock_semantics() {
        for look in [-1, 1, 6, 7, 8, 11, 127] {
            assert!(semantics(look, 151).is_none());
        }
        for tile in [-30000, -1, 0, 201, 32767] {
            assert!(semantics(0, tile).is_none());
        }
    }

    #[test]
    fn shape_notes_and_directional_connections_keep_the_donor_meaning() {
        assert_eq!(
            semantics(0, 5).unwrap().notes,
            "Boundary runs from top midpoint to bottom-right."
        );
        assert_eq!(
            semantics(0, 6).unwrap().notes,
            "Boundary runs from top-left to bottom midpoint."
        );
        assert_eq!(semantics(0, 21).unwrap().connections, "north,south");
        assert_eq!(semantics(0, 44).unwrap().connections, "north,east,west");
        assert!(semantics(4, 44).unwrap().connections.is_empty());
        assert!(
            semantics(0, 151)
                .unwrap()
                .notes
                .contains("not contiguous smart-forest")
        );
    }
}
