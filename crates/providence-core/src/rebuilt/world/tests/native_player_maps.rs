use super::super::*;
use super::fixtures::{player_map_application_fixture, snapshot};
use crate::{
    codecs::{PLAYER_MAP_RECORD_BYTES, decode_player_maps, player_map_record_has_semantics},
    model::{BlobId, ClassicAction, ProjectOrigin},
    rebuilt::ApplicationMediaAmbiguity,
};

fn imported() -> ProjectSnapshot {
    let mut snapshot = snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:fixture".into()),
    };
    let mut bytes = vec![0; 22 * PLAYER_MAP_RECORD_BYTES];
    for id in [0, 3, 4, 5, 20] {
        bytes[id * 340 + 68..id * 340 + 70].copy_from_slice(&16_i16.to_be_bytes());
    }
    for (id, offset, value) in [
        (2, 68, -1_i16),
        (3, 64, 7),
        (3, 66, 30000),
        (4, 64, -1),
        (5, 64, -9),
        (5, 66, 30001),
        (19, 68, i16::MIN),
        (19, 70, -301),
        (19, 64, -7),
        (21, 70, -300),
    ] {
        bytes[id * 340 + offset..id * 340 + offset + 2].copy_from_slice(&value.to_be_bytes());
    }
    snapshot.world.player_maps = decode_player_maps(&bytes).records;
    snapshot
}

#[test]
fn imported_catalog_keeps_safe_blank_unreachable_rows_and_exact_missing_targets() {
    let snapshot = imported();
    assert!(!player_map_record_has_semantics(
        &snapshot.world.player_maps[0]
    ));
    assert!(
        project_rebuilt_v3_world(&snapshot)
            .unwrap()
            .player_maps
            .is_empty()
    );
    let world = compile_imported_world(&snapshot, None, None)
        .unwrap()
        .document;
    assert_eq!(
        world
            .player_maps
            .iter()
            .map(|row| row.classic_id)
            .collect::<Vec<_>>(),
        [0, 3, 5, 19]
    );
    assert_eq!(world.player_maps[0].mode, "land-crop");
    assert_eq!(world.player_maps[1].map_id, Some(StableId("land:7".into())));
    assert_eq!(
        world.player_maps[1].picture_asset_id,
        Some(StableId("classic.resource.PICT.30000".into()))
    );
    assert_eq!(world.player_maps[2].mode, "picture");
    assert_eq!(
        world.player_maps[2].map_id,
        Some(StableId("land:-9".into()))
    );
    assert_eq!(
        world.player_maps[2].picture_asset_id,
        Some(StableId("classic.resource.PICT.30001".into()))
    );
    assert_eq!(world.player_maps[3].mode, "scrolling-text");
    assert_eq!(world.player_maps[3].icon_size, i16::MIN);
    assert_eq!(
        world.player_maps[3].scrolling_text_asset_id,
        Some(StableId("classic.resource.TEXT.-301".into()))
    );
    assert_eq!(world.player_maps[3].map_id, None);
    assert_eq!(world.player_maps[3].party_marker_asset_id, None);
}

#[test]
fn unsafe_imported_map_keeps_its_caller_without_a_fabricated_display_definition() {
    let mut snapshot = imported();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 29,
        target_native_id: 1,
    }];
    assert!(matches!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::MissingPlayerMap { native_id: 1, .. })
    ));
    let world = compile_imported_world(&snapshot, None, None)
        .unwrap()
        .document;
    assert!(world.player_maps.iter().all(|row| row.classic_id != 1));
    assert_eq!(world.triggers.len(), 1);
}

#[test]
fn duplicate_rows_and_ambiguous_resources_remain_errors() {
    let mut snapshot = imported();
    snapshot
        .world
        .player_maps
        .push(snapshot.world.player_maps[0].clone());
    assert!(matches!(
        compile_imported_world(&snapshot, None, None),
        Err(RebuiltV3WorldError::DuplicatePlayerMapId(0))
    ));
    snapshot.world.player_maps.pop();
    let mut application = player_map_application_fixture();
    application
        .ambiguous_resources
        .push(ApplicationMediaAmbiguity {
            source: application.sources[0].identity.clone(),
            source_priority: 0,
            resource: crate::model::ClassicResourceKey {
                resource_type: "TEXT".into(),
                resource_id: -301,
            },
            occurrences: 2,
        });
    assert!(matches!(
        compile_imported_world(&snapshot, Some(&application), None),
        Err(RebuiltV3WorldError::InvalidPlayerMap { .. })
    ));
}

#[test]
fn fresh_and_legacy_text_map_rules_remain_strict() {
    let mut snapshot = imported();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 29,
        target_native_id: 19,
    }];
    assert!(matches!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::InvalidPlayerMap { .. })
    ));
    snapshot.origin = ProjectOrigin::Authored;
    assert!(matches!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::InvalidPlayerMap { .. })
    ));
    assert!(compile_imported_world(&snapshot, None, None).is_err());
}
