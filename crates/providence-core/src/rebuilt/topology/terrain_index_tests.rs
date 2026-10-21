use super::*;

fn terrain_profile(tile: i16, landlook: Option<i8>, movement_cost: i16) -> TerrainProfile {
    TerrainProfile {
        source: "terrain lookup test".into(),
        source_blob: None,
        tile,
        landlook,
        movement_sound_id: None,
        movement_cost,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[0; 3]; 3],
    }
}
fn linear_terrain_profile<'a>(
    catalog: &'a [TerrainProfile],
    map: &StableId,
    tile: i16,
    landlook: Option<i8>,
) -> Result<&'a TerrainProfile, RebuiltV3TopologyError> {
    let exact = catalog
        .iter()
        .filter(|profile| profile.tile == tile && profile.landlook == landlook)
        .collect::<Vec<_>>();
    if exact.len() > 1 {
        return Err(RebuiltV3TopologyError::AmbiguousTerrainProfile { landlook, tile });
    }
    if let Some(profile) = exact.first() {
        return Ok(profile);
    }
    if landlook.is_some() {
        let shared = catalog
            .iter()
            .filter(|profile| profile.tile == tile && profile.landlook.is_none())
            .collect::<Vec<_>>();
        if shared.len() > 1 {
            return Err(RebuiltV3TopologyError::AmbiguousTerrainProfile {
                landlook: None,
                tile,
            });
        }
        if let Some(profile) = shared.first() {
            return Ok(profile);
        }
    }
    Err(RebuiltV3TopologyError::MissingTerrainProfile {
        map: map.clone(),
        tile,
    })
}
#[test]
fn indexed_terrain_lookup_matches_linear_exact_shared_missing_and_ambiguous_cases() {
    let catalog = vec![
        terrain_profile(7, Some(2), 20),
        terrain_profile(7, None, 10),
        terrain_profile(8, None, 30),
        terrain_profile(9, Some(2), 90),
        terrain_profile(9, None, 11),
        terrain_profile(9, None, 12),
        terrain_profile(10, None, 13),
        terrain_profile(10, None, 14),
        terrain_profile(99, Some(3), 15),
        terrain_profile(99, Some(3), 16),
    ];
    let map = StableId("terrain-index-test-map".into());
    let index = TerrainProfileIndex::new(&catalog);
    for (tile, landlook) in [
        (7, Some(2)),  // exact wins over the shared entry
        (7, Some(4)),  // shared fallback
        (7, None),     // shared profile is exact when no landlook is requested
        (8, Some(4)),  // shared-only key
        (9, Some(2)),  // exact wins even when the shared key is ambiguous
        (9, Some(4)),  // ambiguous shared fallback
        (10, Some(2)), // ambiguous shared fallback
        (10, None),    // ambiguous exact shared key
        (12, Some(2)), // missing key
        (99, Some(3)), // ambiguity remains lazy until this key is queried
    ] {
        assert_eq!(
            index.get(&map, tile, landlook),
            linear_terrain_profile(&catalog, &map, tile, landlook),
            "tile {tile}, landlook {landlook:?}"
        );
    }
    assert_eq!(
        index.get(&map, 7, Some(2)).unwrap().movement_cost,
        20,
        "exact profile must take precedence over shared"
    );
    assert_eq!(
        index.get(&map, 7, Some(4)).unwrap().movement_cost,
        10,
        "shared profile remains the fallback"
    );
    assert_eq!(
        index.get(&map, 8, Some(4)).unwrap().movement_cost,
        30,
        "an unqueried ambiguous key does not affect other lookups"
    );
}
