use super::*;

#[test]
fn rebuilt_runtime_clips_classic_edge_regions_but_names_empty_intersections() {
    let mut snapshot = slice_snapshot(47);
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "Data RD".into(),
        source_blob: None,
        dark: false,
        uses_los: false,
        landlook: Some(0),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: Some(0),
        random_rectangles: vec![RandomRectangle {
            identity: StableId("land:0:rect:3".into()),
            top: -7,
            left: -23,
            bottom: 90,
            right: 99,
            chance_ten_thousand: 100,
            battle_range: [0; 2],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        }],
    });

    assert!(map_runtime_blockers(&snapshot).is_empty());

    let rectangle = &mut snapshot.world.maps[0]
        .runtime
        .as_mut()
        .unwrap()
        .random_rectangles[0];
    rectangle.top = 90;
    rectangle.bottom = 99;
    let blockers = map_runtime_blockers(&snapshot);
    assert_eq!(blockers.len(), 1);
    assert_eq!(
        blockers[0].code,
        "rebuilt.map-runtime-metadata.random-rectangle"
    );
    assert_eq!(blockers[0].entity, Some(StableId("land:0:rect:3".into())));
}

#[test]
fn dungeon_topology_does_not_depend_on_land_terrain_profiles() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-only".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Vault of Embers".into(),
        tiles: vec![1; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: Some(MapRuntimeMetadata {
            source: "controlled Data RDD fixture".into(),
            source_blob: None,
            dark: true,
            uses_los: true,
            landlook: None,
            base_scale: None,
            tileset_id: StableId("dungeon-top-down-302".into()),
            base_tile: None,
            random_rectangles: Vec::new(),
        }),
    });

    assert!(terrain_catalog_blockers(&snapshot).is_empty());
    assert!(topology_blockers(&snapshot, None).is_empty());
}

#[test]
fn canonical_campaign_and_start_retire_only_their_rebuilt_blockers() {
    let mut snapshot = slice_snapshot(47);
    snapshot.campaign = Some(CampaignMetadata {
        name: "Thornwatch".into(),
        version: "1.0".into(),
        author: "A. Cartographer".into(),
        creator_user_check: String::new(),
        contact: CampaignContact::default(),
        contact_provenance: crate::model::CampaignContactProvenance::Authored,
        description: "Hold the western coast.".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 4,
        maximum_party_levels: 8,
        guidance_authored: true,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 8,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    });
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 18, y: 23 },
    });

    let codes = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<Vec<_>>();
    assert_eq!(
        codes,
        [
            "rebuilt.application-hooks.unavailable",
            "rebuilt.asset-index.unavailable",
            "rebuilt.item-catalog.unavailable",
            "rebuilt.map-runtime-metadata.unavailable",
            "rebuilt.rules-catalog.unavailable",
            "rebuilt.scenario-item-catalog.unavailable",
            "rebuilt.standard-spell-catalog.invalid",
            "rebuilt.terrain-catalog.unavailable",
        ]
    );
}

#[test]
fn imported_unavailable_start_map_or_coordinate_is_deferred_but_startup_is_required() {
    let mut snapshot = slice_snapshot(47);
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:999".into()),
        coordinate: MapCoordinate { x: 18, y: 23 },
    });
    assert!(imported_start_location_requires_deferred_capability(
        &snapshot
    ));
    assert_eq!(
        start_location_blockers(&snapshot)[0].code,
        "rebuilt.start-location.map-unavailable"
    );

    snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 90, y: 23 },
    });
    assert!(imported_start_location_requires_deferred_capability(
        &snapshot
    ));

    snapshot.start_location = None;
    assert!(!imported_start_location_requires_deferred_capability(
        &snapshot
    ));
    assert_eq!(
        start_location_blockers(&snapshot)[0].code,
        "rebuilt.start-location.missing"
    );

    snapshot.origin = ProjectOrigin::Authored;
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:999".into()),
        coordinate: MapCoordinate { x: 18, y: 23 },
    });
    assert!(!imported_start_location_requires_deferred_capability(
        &snapshot
    ));
}

#[test]
fn certified_land_inputs_produce_compact_topology_without_a_generic_blocker() {
    let mut snapshot = slice_snapshot(47);
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "synthetic map runtime fixture".into(),
        source_blob: None,
        dark: false,
        uses_los: true,
        landlook: Some(0),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: Some(0),
        random_rectangles: Vec::new(),
    });
    snapshot.terrain_catalog = [0, 60, 147]
        .into_iter()
        .map(|tile| TerrainProfile {
            source: "synthetic mapstats fixture".into(),
            source_blob: None,
            tile,
            landlook: Some(0),
            movement_sound_id: Some(82),
            movement_cost: 3,
            solid_type: 0,
            walkable: true,
            shore: false,
            boat_requirement: if tile == 60 {
                2
            } else if tile == 147 {
                1
            } else {
                0
            },
            path: false,
            blocks_los: false,
            fly_float: false,
            forest_type: 0,
            combat_build: [[tile; 3]; 3],
        })
        .collect();

    let codes = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<Vec<_>>();
    assert!(!codes.iter().any(|code| code.contains("terrain-catalog")));
    assert!(
        !codes
            .iter()
            .any(|code| code.contains("map-runtime-metadata"))
    );
    assert!(!codes.iter().any(|code| code.contains("map-topology")));

    snapshot.world.maps[0].tiles[0] = 430;
    assert!(terrain_catalog_blockers(&snapshot).is_empty());
    assert!(topology_blockers(&snapshot, None).is_empty());
}

#[test]
fn unresolved_special_land_art_is_a_precise_topology_blocker() {
    let mut snapshot = special_land_snapshot();
    let classification = classify_rebuilt_v3(&snapshot);
    let blocker = classification
        .blockers
        .iter()
        .find(|blocker| blocker.code == "rebuilt.map-topology.special-land-assets")
        .expect("precise special-land blocker");
    assert!(blocker.message.contains("-99"));

    let mut application = application_appearance_catalog();
    let mut application_tile = application.assets[0].clone();
    application_tile.descriptor.identity = StableId("application:special-land:-99".into());
    application_tile.descriptor.label = "Application Special Land -99".into();
    application_tile.descriptor.kind = "special-land-tile".into();
    application_tile.descriptor.classic_resource = Some(ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: -99,
    });
    application.assets.push(application_tile);
    assert!(topology_blockers(&snapshot, Some(&application)).is_empty());
    assert!(snapshot.assets.is_empty());

    snapshot.assets.push(decoded_special_land_tile());
    let resolved_codes = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<Vec<_>>();
    assert!(
        !resolved_codes
            .iter()
            .any(|code| code == "rebuilt.map-topology.special-land-assets")
    );
    assert!(resolved_codes.contains(&"rebuilt.asset-index.appearance-catalog".into()));
}

#[test]
fn unattributed_mapstats_inputs_remain_explicit_blockers() {
    let mut snapshot = slice_snapshot(47);
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: String::new(),
        source_blob: None,
        dark: false,
        uses_los: false,
        landlook: Some(0),
        base_scale: Some(1),
        tileset_id: StableId("classic.landlook.0".into()),
        base_tile: Some(0),
        random_rectangles: Vec::new(),
    });
    snapshot.terrain_catalog.push(TerrainProfile {
        source: String::new(),
        source_blob: None,
        tile: 0,
        landlook: Some(0),
        movement_sound_id: None,
        movement_cost: 1,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[0; 3]; 3],
    });

    let codes = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<Vec<_>>();
    assert!(codes.contains(&"rebuilt.map-runtime-metadata.provenance".into()));
    assert!(codes.contains(&"rebuilt.terrain-catalog.provenance".into()));
}
