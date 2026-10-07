use super::*;
use crate::session::map_lifecycle_commands::new_map_level;

#[test]
fn map_create_uses_the_selected_landlook_base_contract() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("map-base-contract".into()));
    snapshot.landlook_catalogs.push(LandlookCatalogMetadata {
        landlook: 0,
        source: "Data P BD".into(),
        source_blob: BlobId("a".repeat(64)),
        byte_length: crate::codecs::MAPSTATS_CORE_BYTES as u64,
        base_tile: 156,
        base_scale: 0,
        range_slots: Vec::new(),
    });
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .expect("create a map from the imported landlook contract");

    let map = &session.snapshot().world.maps[0];
    assert_eq!(map.tiles, vec![156; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE]);
    let runtime = map.runtime.as_ref().expect("authored map runtime");
    assert_eq!(runtime.base_tile, Some(156));
    assert_eq!(runtime.base_scale, Some(0));
    assert!(runtime.source_blob.is_none());
}

#[test]
fn map_lifecycle_is_revisioned_codec_ready_and_does_not_clone_action_points() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "map-lifecycle".into(),
    )));

    create_and_check_first_land(&mut session);

    add_source_action_point_and_markers(&mut session);

    set_source_only_runtime_metadata(&mut session);

    duplicate_and_check_codec_ready_geometry(&mut session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(6),
            command: EditorCommand::Undo,
        })
        .expect("undo duplicate");
    assert_eq!(session.snapshot().world.maps.len(), 1);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(7),
            command: EditorCommand::Redo,
        })
        .expect("redo duplicate");
    assert_eq!(session.snapshot().world.maps.len(), 2);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(8),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Dungeon,
            },
        })
        .expect("create first dungeon map");
    let dungeon = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| map.identity.0 == "dungeon:0")
        .expect("dungeon map");
    assert_eq!(dungeon.tiles, vec![1; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE]);
    let runtime = dungeon.runtime.as_ref().expect("dungeon runtime");
    assert_eq!(runtime.source, "Data RDD");
    assert_eq!(runtime.landlook, Some(-1));
    assert_eq!(runtime.tileset_id, StableId("dungeon-top-down-302".into()));
}

#[test]
fn map_create_rejects_sparse_native_indexes_without_mutating_session() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("sparse-maps".into()));
    let mut map = new_map_level(LevelType::Land, 1, None);
    map.identity = StableId("land:1".into());
    snapshot.world.maps.push(map);
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        }),
        Err(SessionError::InvalidMapCatalog {
            level_type: LevelType::Land,
            ..
        })
    ));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(!session.can_undo());
}

#[test]
fn campaign_and_start_inputs_are_revisioned_and_undoable() {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut session = EditorSession::new(snapshot);
    let metadata = thornwatch_campaign();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetCampaignMetadata {
                metadata: Box::new(metadata.clone()),
            },
        })
        .expect("set campaign metadata");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::SetStartLocation {
                location: StartLocation {
                    map: StableId("land:0".into()),
                    coordinate: crate::model::MapCoordinate { x: 18, y: 23 },
                },
            },
        })
        .expect("set start location");

    assert_eq!(session.snapshot().campaign.as_ref(), Some(&metadata));
    assert_eq!(session.revision(), Revision(2));
    let start_reference = session
        .references()
        .into_iter()
        .find(|reference| reference.field.0 == "startLocation.map")
        .expect("typed start-map reference");
    assert_eq!(start_reference.target_kind, TargetKind::Map);
    assert_eq!(start_reference.target_id, "land:0");
    assert_eq!(start_reference.resolution, ResolutionState::Resolved);
    assert!(start_reference.byte_provenance.is_none());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo start location");
    assert!(session.snapshot().start_location.is_none());
    assert_eq!(session.snapshot().campaign.as_ref(), Some(&metadata));
}

#[test]
fn map_runtime_and_terrain_profiles_are_narrow_revisioned_commands() {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Thornwatch".into(),
        tiles: vec![7; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetMapRuntimeMetadata {
                identity: StableId("land:0".into()),
                metadata: Box::new(MapRuntimeMetadata {
                    source: "synthetic random-level fixture".into(),
                    source_blob: None,
                    dark: false,
                    uses_los: true,
                    landlook: Some(0),
                    base_scale: Some(1),
                    tileset_id: StableId("classic.landlook.0".into()),
                    base_tile: Some(0),
                    random_rectangles: Vec::new(),
                }),
            },
        })
        .expect("set map runtime metadata");
    let profile = coast_terrain_profile();
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpsertTerrainProfile {
                profile: Box::new(profile.clone()),
            },
        })
        .expect("upsert terrain profile");

    assert_eq!(
        projection.changed_entities,
        [StableId("terrain:0:7".into())]
    );
    assert_eq!(session.snapshot().terrain_catalog, [profile]);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo terrain profile");
    assert!(session.snapshot().terrain_catalog.is_empty());
    assert!(session.snapshot().world.maps[0].runtime.is_some());
}

fn create_and_check_first_land(session: &mut EditorSession) {
    let created = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .expect("create first land map");
    assert_eq!(created.changed_entities, vec![StableId("land:0".into())]);
    let land = &session.snapshot().world.maps[0];
    assert_eq!(land.name, "Land level 0");
    assert_eq!(land.tiles, vec![156; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE]);
    let runtime = land.runtime.as_ref().expect("new map runtime");
    assert_eq!(runtime.source, "Data RD");
    assert_eq!(runtime.landlook, Some(0));
    assert_eq!(runtime.tileset_id, StableId("classic.landlook.0".into()));
    assert_eq!(runtime.base_tile, Some(156));
}

fn add_source_action_point_and_markers(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpdateLandMapCell {
                identity: StableId("land:0".into()),
                x: 1,
                y: 1,
                tile: 112,
            },
        })
        .expect("set the Action Point cell payload");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::CreateActionPoint {
                map: StableId("land:0".into()),
                coordinate: MapCoordinate { x: 1, y: 1 },
            },
        })
        .expect("create the source Action Point");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::UpdateLandMapCell {
                identity: StableId("land:0".into()),
                x: 2,
                y: 2,
                tile: 2112,
            },
        })
        .expect("set an unrelated secret marker band");
}

fn set_source_only_runtime_metadata(session: &mut EditorSession) {
    let mut runtime = session.snapshot().world.maps[0]
        .runtime
        .clone()
        .expect("source runtime");
    runtime.dark = true;
    runtime.uses_los = true;
    runtime.random_rectangles.push(RandomRectangle {
        identity: StableId("land:0:rect:0".into()),
        top: 1,
        left: 1,
        bottom: 3,
        right: 3,
        chance_ten_thousand: 500,
        battle_range: [0; 2],
        random_doors: [0; 3],
        random_door_percent: [0; 3],
        only: false,
        option: 0,
        sound_id: 0,
        text_id: 0,
    });
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(4),
            command: EditorCommand::SetMapRuntimeMetadata {
                identity: StableId("land:0".into()),
                metadata: Box::new(runtime),
            },
        })
        .expect("set source runtime metadata");
}

fn duplicate_and_check_codec_ready_geometry(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(5),
            command: EditorCommand::DuplicateMap {
                source: StableId("land:0".into()),
            },
        })
        .expect("duplicate land geometry");
    assert_eq!(session.snapshot().world.maps.len(), 2);
    assert_eq!(session.snapshot().world.action_points.len(), 1);
    let duplicate = &session.snapshot().world.maps[1];
    assert_eq!(duplicate.identity, StableId("land:1".into()));
    assert_eq!(duplicate.name, "Land level 1");
    assert_eq!(duplicate.tiles[CLASSIC_MAP_SIZE + 1], 112);
    assert_eq!(duplicate.tiles[CLASSIC_MAP_SIZE * 2 + 2], 2112);
    let runtime = duplicate.runtime.as_ref().expect("duplicate runtime");
    assert!(!runtime.dark);
    assert!(!runtime.uses_los);
    assert!(runtime.random_rectangles.is_empty());
    assert!(runtime.source_blob.is_none());
    assert_eq!(runtime.landlook, Some(0));
    assert_eq!(runtime.tileset_id, StableId("classic.landlook.0".into()));

    let encoded_maps = crate::codecs::encode_land_maps(&session.snapshot().world.maps, None)
        .expect("encode dense authored maps");
    let decoded_maps = crate::codecs::decode_land_maps(&encoded_maps).records;
    assert_eq!(decoded_maps.len(), 2);
    assert_eq!(decoded_maps[1].tiles, duplicate.tiles);
    let encoded_runtime =
        crate::codecs::encode_land_random_levels(&session.snapshot().world.maps, None)
            .expect("encode authored runtime metadata");
    let decoded_runtime = crate::codecs::decode_land_random_levels(&encoded_runtime);
    assert_eq!(decoded_runtime.records.len(), 2);
    assert_eq!(decoded_runtime.records[1].runtime.dark, runtime.dark);
    assert_eq!(
        decoded_runtime.records[1].runtime.random_rectangles,
        runtime.random_rectangles
    );
}

fn thornwatch_campaign() -> CampaignMetadata {
    CampaignMetadata {
        name: "Thornwatch".into(),
        version: "1.0".into(),
        author: "A. Cartographer".into(),
        creator_user_check: String::new(),
        contact: CampaignContact::default(),
        contact_provenance: crate::model::CampaignContactProvenance::Authored,
        description: "Hold the coast.".into(),
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
    }
}

fn coast_terrain_profile() -> TerrainProfile {
    TerrainProfile {
        source: "synthetic mapstats fixture".into(),
        source_blob: None,
        tile: 7,
        landlook: Some(0),
        movement_sound_id: Some(82),
        movement_cost: 3,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: true,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[7; 3]; 3],
    }
}
