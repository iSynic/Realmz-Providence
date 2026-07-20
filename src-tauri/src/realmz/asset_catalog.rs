use crate::project::{AssetCatalog, LevelType, MapEntity, RandomLevel, TilesetAsset};
use std::collections::BTreeSet;

pub(super) fn build_asset_catalog(
    maps: &[MapEntity],
    random_levels: &[RandomLevel],
) -> AssetCatalog {
    let mut landlooks = BTreeSet::new();
    for level in random_levels {
        if level.landlook >= 0 {
            landlooks.insert(level.landlook);
        }
    }
    let mut tilesets: Vec<TilesetAsset> = landlooks
        .into_iter()
        .map(|landlook| TilesetAsset {
            id: format!("landlook-{}", landlook),
            landlook,
            name: landlook_name(landlook).to_string(),
            source: if (6..=8).contains(&landlook) {
                "Scenario resource fork".to_string()
            } else {
                "Realmz reference resources".to_string()
            },
            available: true,
            image_path: None,
            pict_id: landlook_pict_id(landlook),
            tile_width: 32,
            tile_height: 32,
            columns: 20,
            rows: 10,
            custom: (6..=8).contains(&landlook),
            base_tile: landlook_base_tile(landlook),
        })
        .collect();
    if maps.iter().any(|map| map.level_type == LevelType::Dungeon) {
        tilesets.push(TilesetAsset {
            id: "dungeon-top-down-302".to_string(),
            landlook: 2,
            name: "Dungeon Top Down".to_string(),
            source: "Realmz reference resources".to_string(),
            available: true,
            image_path: None,
            pict_id: Some(302),
            tile_width: 16,
            tile_height: 16,
            columns: 4,
            rows: 4,
            custom: false,
            base_tile: None,
        });
    }
    AssetCatalog {
        tilesets,
        ..AssetCatalog::default()
    }
}

fn landlook_name(landlook: i8) -> &'static str {
    match landlook {
        0 => "Plains",
        3 => "Subterranean",
        4 => "Castle",
        5 => "Desert",
        6 => "Custom 6",
        7 => "Custom 7",
        8 => "Custom 8",
        9 => "Swamp",
        10 => "Snow",
        _ => "Unknown landlook",
    }
}

fn landlook_pict_id(landlook: i8) -> Option<i32> {
    match landlook {
        0 => Some(300),
        2 => Some(302),
        3 => Some(303),
        4 => Some(304),
        5 => Some(305),
        6 => Some(306),
        7 => Some(307),
        8 => Some(308),
        9 => Some(309),
        10 => Some(310),
        _ => None,
    }
}

fn landlook_base_tile(landlook: i8) -> Option<i16> {
    match landlook {
        0 => Some(156),
        3 => Some(155),
        4 => Some(111),
        5 => Some(191),
        6..=8 => Some(156),
        9 | 10 => Some(155),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{Confidence, Provenance};
    use crate::realmz::{parse_fields, FIELD_BYTES};

    fn random_level(landlook: i8) -> RandomLevel {
        RandomLevel {
            id: format!("land:0:{landlook}"),
            source: "Data RD".to_string(),
            level_type: LevelType::Land,
            level_index: 0,
            landlook,
            is_dark: false,
            use_los: false,
            rects: Vec::new(),
            provenance: Provenance {
                source_file: "Data RD".to_string(),
                record_index: 0,
                byte_offset: 0,
                byte_length: 0,
                confidence: Confidence::Confirmed,
            },
        }
    }

    #[test]
    fn catalog_deduplicates_landlooks_and_classifies_custom_assets() {
        let catalog = build_asset_catalog(
            &[],
            &[
                random_level(6),
                random_level(0),
                random_level(6),
                random_level(-1),
            ],
        );

        assert_eq!(
            catalog
                .tilesets
                .iter()
                .map(|tileset| tileset.id.as_str())
                .collect::<Vec<_>>(),
            vec!["landlook-0", "landlook-6"]
        );
        let custom = catalog
            .tilesets
            .iter()
            .find(|tileset| tileset.landlook == 6)
            .expect("custom landlook");
        assert!(custom.custom);
        assert_eq!(custom.source, "Scenario resource fork");
        assert_eq!(custom.pict_id, Some(306));
        assert_eq!(custom.base_tile, Some(156));
    }

    #[test]
    fn catalog_adds_dungeon_tileset_when_dungeon_maps_exist() {
        let maps = parse_fields(&vec![0; FIELD_BYTES], LevelType::Dungeon, "Data DL");
        let catalog = build_asset_catalog(&maps, &[]);

        assert_eq!(catalog.tilesets.len(), 1);
        let dungeon = &catalog.tilesets[0];
        assert_eq!(dungeon.id, "dungeon-top-down-302");
        assert_eq!(dungeon.pict_id, Some(302));
        assert_eq!((dungeon.tile_width, dungeon.tile_height), (16, 16));
        assert!(!dungeon.custom);
    }
}
