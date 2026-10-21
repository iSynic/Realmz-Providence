use super::*;
use crate::{codecs::*, model::*};
use sha2::{Digest, Sha256};

fn supplied_table(snapshot: &mut ProjectSnapshot, landlook: i8) -> Vec<u8> {
    let mut bytes = vec![0; MAPSTATS_CORE_BYTES];
    for tile in 0..201 {
        for word in 0..20 {
            let value = (tile as i16 + word as i16 * 17) - 300;
            let offset = tile * 40 + word * 2;
            bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
        }
    }
    bytes[8040..8042].copy_from_slice(&(150_i16 + i16::from(landlook)).to_be_bytes());
    bytes[8042..8044].copy_from_slice(&3_i16.to_be_bytes());
    bytes.extend_from_slice(&[0x80, 0xde, 0xad, 0, 0xff]);
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest(&bytes)));
    let path = custom_landlook_source_name(landlook).unwrap();
    let decoded = decode_landlook_mapstats(&bytes, landlook, path, blob.clone()).unwrap();
    snapshot.landlook_catalogs.push(decoded.catalog);
    snapshot.terrain_catalog.extend(decoded.profiles);
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: path.into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    bytes
}

#[test]
fn all_supplied_custom_tables_project_without_initial_map_or_opcode_selection() {
    let mut snapshot = battle_terrain_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let before = project_rebuilt_v3_battle_terrain_sets(&snapshot).unwrap();
    let mut sources = std::collections::BTreeMap::new();
    for look in 6..=8 {
        let bytes = supplied_table(&mut snapshot, look);
        sources.insert(custom_landlook_source_name(look).unwrap().into(), bytes);
    }
    let sets = project_rebuilt_v3_battle_terrain_sets(&snapshot).unwrap();
    assert_eq!(sets.len(), 5);
    assert_eq!(sets[..2], before);
    for look in 6..=8 {
        let set = sets.iter().find(|set| set.landlook == Some(look)).unwrap();
        assert_eq!(set.id.0, format!("classic.battle-terrain.landlook.{look}"));
        assert_eq!(set.base_tile, Some(150 + i16::from(look)));
        assert_eq!(set.tiles.len(), 401);
        assert_source_tiles(set, &sources[custom_landlook_source_name(look).unwrap()]);
        assert_eq!(set.tiles[201..], before[1].tiles[201..]);
    }
    let facts = crate::rebuilt::project_rebuilt_v7_classic_records(&snapshot, &sources).unwrap();
    for source in facts.sources {
        assert_eq!(
            source.sha256,
            format!("{:x}", Sha256::digest(&sources[&source.native_path]))
        );
        assert_eq!(source.byte_length, 8049);
        assert_eq!(source.effective_sha256, source.sha256);
    }
}

fn assert_source_tiles(set: &RebuiltV3BattleTerrainSet, bytes: &[u8]) {
    for (tile, row) in set.tiles[..201].iter().enumerate() {
        let word = |index| {
            let offset = tile * 40 + index * 2;
            i16::from_be_bytes([bytes[offset], bytes[offset + 1]])
        };
        assert_eq!(
            (row.tile, row.sound, row.time, row.solid),
            (tile as i16, word(0), word(1), word(2))
        );
        assert_eq!(
            (row.shore, row.need_boat, row.is_path),
            (word(3) != 0, word(4), word(5) != 0)
        );
        assert_eq!(
            (row.los, row.fly_float, row.forest),
            (word(6) != 0, word(7) != 0, word(8))
        );
        for y in 0..3 {
            for x in 0..3 {
                assert_eq!(row.combat_build[y][x], word(10 + y * 3 + x));
            }
        }
    }
}

#[test]
fn supplied_custom_tables_survive_without_battles_but_missing_support_is_an_error() {
    let mut snapshot = battle_terrain_snapshot();
    snapshot.battles.clear();
    supplied_table(&mut snapshot, 6);
    assert!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot)
            .unwrap()
            .iter()
            .any(|set| set.landlook == Some(6))
    );
    snapshot
        .terrain_catalog
        .retain(|profile| !(profile.landlook == Some(-1) && profile.tile == 300));
    assert!(matches!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::IncompleteProfiles { landlook: -1, .. })
    ));
}

#[test]
fn supplied_custom_tables_reject_incomplete_duplicate_profiles_and_conflicting_base_tiles() {
    let mut snapshot = battle_terrain_snapshot();
    supplied_table(&mut snapshot, 6);
    let complete = snapshot.clone();
    snapshot
        .terrain_catalog
        .retain(|profile| !(profile.landlook == Some(6) && profile.tile == 17));
    assert!(matches!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::IncompleteProfiles {
            landlook: 6,
            actual: 200,
            ..
        })
    ));
    let mut snapshot = complete.clone();
    snapshot.terrain_catalog.push(
        snapshot
            .terrain_catalog
            .iter()
            .find(|profile| profile.landlook == Some(6))
            .unwrap()
            .clone(),
    );
    assert!(matches!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::IncompleteProfiles {
            landlook: 6,
            actual: 202,
            ..
        })
    ));
    let mut snapshot = complete;
    let mut duplicate = snapshot.landlook_catalogs[0].clone();
    duplicate.base_tile += 1;
    snapshot.landlook_catalogs.push(duplicate);
    assert!(matches!(
        project_rebuilt_v3_battle_terrain_sets(&snapshot),
        Err(RebuiltV3BattleTerrainError::AmbiguousBaseTile { landlook: 6, .. })
    ));
}

#[test]
fn unselected_stock_look_stays_addressable_without_an_initial_battle() {
    let mut snapshot = battle_terrain_snapshot();
    snapshot.battles.clear();
    snapshot.landlook_catalogs.push(LandlookCatalogMetadata {
        landlook: 10,
        source: "Data Files/Data Snow BD".into(),
        source_blob: BlobId(format!("sha256:{}", "b".repeat(64))),
        byte_length: MAPSTATS_CORE_BYTES as u64,
        base_tile: 155,
        base_scale: 0,
        range_slots: vec![],
    });
    snapshot
        .terrain_catalog
        .extend((0..=200).map(|tile| terrain_profile(tile, 10)));
    let sets = project_rebuilt_v3_battle_terrain_sets(&snapshot).unwrap();
    let snow = sets.iter().find(|set| set.landlook == Some(10)).unwrap();
    assert_eq!(snow.base_tile, Some(155));
    assert_eq!(snow.tiles.len(), 401);
    assert_eq!(snow.tiles[17], terrain_projection(&terrain_profile(17, 10)));
    snapshot
        .terrain_catalog
        .retain(|row| !(row.landlook == Some(10) && row.tile == 17));
    assert!(project_rebuilt_v3_battle_terrain_sets(&snapshot).is_err());
}
