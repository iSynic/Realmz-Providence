use super::super::*;
use super::fixtures::*;
use crate::model::{BlobId, ClassicAction, PlayerMapMarker, ProjectOrigin};

#[test]
fn opcode_twenty_nine_requires_defined_in_range_player_map_authority() {
    let mut snapshot = snapshot();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 29,
        target_native_id: 3,
    }];
    assert!(matches!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::MissingPlayerMap { native_id: 3, .. })
    ));

    snapshot.world.action_points[0].actions[0].target_native_id = 20;
    assert!(matches!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::PlayerMapIdOutOfRange { native_id: 20, .. })
    ));
}

#[test]
fn reachable_player_maps_project_all_four_pinned_runtime_modes() {
    let snapshot = all_player_map_modes();

    let world = project_rebuilt_v3_world(&snapshot).expect("project all player-map modes");

    assert_eq!(world.player_maps.len(), 4);
    assert_eq!(world.player_maps[0].name, "Known Map 1");
    assert_eq!(world.player_maps[0].unavailable_name, "Unknown Map 1");
    assert_eq!(world.player_maps[0].mode, "land-crop");
    assert_eq!(world.player_maps[0].markers[0].classic_icon_id, 143);
    assert_eq!(world.player_maps[1].mode, "dungeon-crop");
    assert_eq!(world.player_maps[2].mode, "picture");
    assert_eq!(
        world.player_maps[2].picture_asset_id,
        Some(StableId("etched-map".into()))
    );
    assert_eq!(world.player_maps[3].mode, "scrolling-text");
    assert_eq!(world.player_maps[3].map_id, None);
    assert_eq!(world.player_maps[3].party_marker_asset_id, None);
    assert_eq!(
        world.player_maps[3].scrolling_text_asset_id,
        Some(StableId("road-journal".into()))
    );
}

#[test]
fn imported_player_maps_preserve_missing_exact_media_references() {
    let mut snapshot = snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:player-map-source".into()),
    };
    snapshot.world.action_points[0].actions = (0..2)
        .map(|slot| ClassicAction {
            slot,
            raw_opcode: 29,
            target_native_id: i16::from(slot),
        })
        .collect();
    set_missing_player_map_records(&mut snapshot);

    let world = project_rebuilt_v3_world(&snapshot)
        .expect("missing imported Player Map media is deferred as exact references");

    assert_eq!(world.player_maps[0].map_id, Some(StableId("land:0".into())));
    assert_eq!(
        world.player_maps[0].picture_asset_id,
        Some(StableId("classic.resource.PICT.30000".into()))
    );
    assert_eq!(
        world.player_maps[0].party_marker_asset_id,
        Some(StableId("classic.resource.cicn.138".into()))
    );
    assert_eq!(
        world.player_maps[1].markers[0].icon_asset_id,
        StableId("classic.resource.cicn.143".into())
    );
}

#[test]
fn application_player_map_markers_resolve_without_entering_scenario_truth() {
    let snapshot = application_marker_snapshot();
    let scenario_only = project_rebuilt_v3_world(&snapshot)
        .expect("missing optional marker artwork does not invalidate the Player Map");
    assert!(scenario_only.player_maps[0].markers.is_empty());
    assert_eq!(
        scenario_only.player_maps[0].party_marker_asset_id,
        Some(StableId("scenario-party-marker".into()))
    );
    let application = player_map_application_fixture();

    let world = project_rebuilt_v3_world_with_application(&snapshot, &application)
        .expect("application-owned Player Map icons");

    assert_eq!(snapshot.assets.len(), 1);
    assert_eq!(
        world.player_maps[0].party_marker_asset_id,
        Some(StableId("scenario-party-marker".into())),
        "scenario exact keys must shadow the application catalog"
    );
    assert_eq!(
        world.player_maps[0].markers[0].icon_asset_id,
        StableId("application:cicn:143".into())
    );
    assert_eq!(
        world.player_maps[0].markers[1].icon_asset_id,
        StableId("realmz-special-land-neg-99".into())
    );
    assert_eq!(
        world.player_maps[0].markers[2].icon_asset_id,
        StableId("realmz-portrait-257".into())
    );
}

#[test]
fn current_party_marker_retains_resolved_portrait_identity() {
    let mut snapshot = snapshot();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 29,
        target_native_id: 0,
    }];
    snapshot.world.player_maps = vec![player_map(0, false, 0, 0, 1, Vec::new())];
    let mut application = player_map_application_fixture();
    application.assets[0].descriptor.kind = "portrait".into();
    application.assets[0].descriptor.identity = StableId("resolved-party-portrait".into());
    let world = project_rebuilt_v3_world_with_application(&snapshot, &application).unwrap();
    assert_eq!(
        world.player_maps[0].party_marker_asset_id,
        Some(StableId("resolved-party-portrait".into()))
    );
    assert!(snapshot.assets.is_empty());
}

fn all_player_map_modes() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    let mut dungeon = snapshot.world.maps[0].clone();
    dungeon.identity = StableId("dungeon:0".into());
    dungeon.level_type = LevelType::Dungeon;
    dungeon.runtime.as_mut().unwrap().landlook = None;
    dungeon.runtime.as_mut().unwrap().base_scale = None;
    dungeon.runtime.as_mut().unwrap().base_tile = None;
    dungeon.runtime.as_mut().unwrap().tileset_id = StableId("dungeon-top-down-302".into());
    snapshot.world.maps.push(dungeon);
    snapshot.world.action_points[0].actions = (0..4)
        .map(|slot| ClassicAction {
            slot,
            raw_opcode: 29,
            target_native_id: i16::from(slot),
        })
        .collect();
    snapshot.assets.extend([
        player_map_asset("party-marker", "icon", "cicn", 138),
        player_map_asset("village-marker", "icon", "cicn", 143),
        player_map_asset("etched-map", "picture", "PICT", 30_001),
        player_map_asset("road-journal", "text-resource", "TEXT", -200),
    ]);
    snapshot.world.player_maps = vec![
        player_map(0, false, 0, 0, 0, markers(143)),
        player_map(1, true, 0, 0, 0, markers(143)),
        player_map(2, false, 0, 30_001, 0, markers(0)),
        player_map(3, false, 0, 0, -200, markers(0)),
    ];
    snapshot.player_map_names = Some(crate::model::PlayerMapNameCatalog {
        source_blob: None,
        available_names: (1..=20).map(|index| format!("Known Map {index}")).collect(),
        unavailable_names: (1..=20)
            .map(|index| format!("Unknown Map {index}"))
            .collect(),
    });

    snapshot
}

fn markers(icon_id: i16) -> Vec<PlayerMapMarker> {
    let mut markers = vec![
        PlayerMapMarker {
            icon_id: 0,
            x: 0,
            y: 0
        };
        10
    ];
    if icon_id != 0 {
        markers[0] = PlayerMapMarker {
            icon_id,
            x: 18,
            y: 23,
        };
    }
    markers
}

fn application_marker_snapshot() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 29,
        target_native_id: 0,
    }];
    let mut markers = vec![
        PlayerMapMarker {
            icon_id: 0,
            x: 0,
            y: 0,
        };
        10
    ];
    markers[0] = PlayerMapMarker {
        icon_id: 143,
        x: 18,
        y: 23,
    };
    markers[1] = PlayerMapMarker {
        icon_id: -99,
        x: 19,
        y: 24,
    };
    markers[2] = PlayerMapMarker {
        icon_id: 257,
        x: 20,
        y: 25,
    };
    snapshot.world.player_maps = vec![player_map(0, false, 0, 0, 1, markers)];
    snapshot.assets.push(player_map_asset(
        "scenario-party-marker",
        "icon",
        "cicn",
        138,
    ));
    snapshot
}
