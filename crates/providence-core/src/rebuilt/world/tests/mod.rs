mod fixtures;
mod guards;
mod layout;
mod player_maps;
use super::*;
use crate::model::{
    AssetDescriptor, BlobId, ClassicAction, ClassicResourceKey, ExtraCodeRow, NativeRecordId,
};
use fixtures::*;

#[test]
fn land_world_document_is_exact_canonical_and_reimportable() {
    let first = compile_rebuilt_v3_world(&snapshot()).unwrap();
    let second = compile_rebuilt_v3_world(&snapshot()).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.document.kind, "realmz2.world");
    assert_eq!(first.document.schema_version, 3);
    assert_eq!(first.document.maps.len(), 1);
    assert_eq!(first.document.maps[0].name, "Thornwatch");
    assert_eq!(first.document.maps[0].cells.len(), 8100);
    assert_eq!(first.document.maps[0].random_rectangles.len(), 1);
    assert_eq!(first.document.triggers.len(), 1);
    assert_eq!(first.document.player_maps, Vec::new());
    assert_eq!(first.document.transitions, []);
    assert_eq!(first.document.land_layout, None);
    let value: serde_json::Value = serde_json::from_slice(&first.canonical_json).unwrap();
    assert_eq!(value.as_object().unwrap().len(), 9);
    assert_eq!(
        first.sha256,
        "8a0464dab74223a98239ce666f3ed5ada0d58f0238fc97cb3a5462db48612776"
    );
    let reopened: RebuiltV3WorldDocument = serde_json::from_slice(&first.canonical_json).unwrap();
    assert_eq!(reopened, first.document);
}

#[test]
fn world_projects_dungeon_topology_and_refuses_duplicate_map_identity() {
    let mut dungeon = snapshot();
    dungeon.world.maps[0].identity = StableId("dungeon:0".into());
    dungeon.world.maps[0].level_type = LevelType::Dungeon;
    dungeon.world.maps[0].runtime.as_mut().unwrap().landlook = None;
    dungeon.world.maps[0].runtime.as_mut().unwrap().base_scale = None;
    dungeon.world.maps[0].runtime.as_mut().unwrap().base_tile = None;
    dungeon.world.maps[0].runtime.as_mut().unwrap().tileset_id =
        StableId("dungeon-top-down-302".into());
    dungeon.world.action_points[0].level_type = LevelType::Dungeon;
    let world = project_rebuilt_v3_world(&dungeon).expect("dungeon world");
    assert_eq!(world.maps[0].boat_replacement_profiles, None);
    assert_eq!(
        world.maps[0].cells[0].0,
        StableId("classic.dungeon.wall".into())
    );

    let mut duplicate = snapshot();
    duplicate.world.maps.push(duplicate.world.maps[0].clone());
    assert_eq!(
        project_rebuilt_v3_world(&duplicate),
        Err(RebuiltV3WorldError::DuplicateMapId(StableId(
            "land:0".into()
        )))
    );
}

#[test]
fn opcode_92_materializes_an_inert_rebuilt_identity_for_an_empty_classic_slot() {
    let mut snapshot = snapshot();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 92,
        target_native_id: 8,
    }];
    snapshot.extra_codes = vec![
        ExtraCodeRow {
            native_id: NativeRecordId(8),
            values: [0, 1, 0, 0, 0],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(9),
            values: [7, 7, 8, 8, 0],
        },
    ];

    let world = project_rebuilt_v3_world(&snapshot).expect("project opcode 92 placeholder");
    let map = &world.maps[0];
    let placeholder = map
        .random_rectangles
        .iter()
        .find(|rectangle| rectangle.id.0 == "land:0:rect:1")
        .expect("all-zero physical slot receives a runtime identity");
    assert_eq!(placeholder.top, 0);
    assert_eq!(placeholder.left, 0);
    assert_eq!(placeholder.bottom, 0);
    assert_eq!(placeholder.right, 0);
    assert_eq!(placeholder.chance_ten_thousand, 0);
    assert!(
        map.cells
            .iter()
            .all(|cell| !cell.5.contains(&placeholder.id)),
        "the inert placeholder must not invent authored cell membership"
    );
}

#[test]
fn world_projection_leaves_invalid_opcode_92_targets_to_scenario_validation() {
    let mut snapshot = snapshot();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 92,
        target_native_id: 8,
    }];
    snapshot.extra_codes = vec![
        ExtraCodeRow {
            native_id: NativeRecordId(8),
            values: [3, 1, 0, 0, 0],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(9),
            values: [7, 7, 8, 8, 0],
        },
    ];

    let world = project_rebuilt_v3_world(&snapshot).expect("bounded world projection");
    assert_eq!(world.maps.len(), 1);
    assert!(
        world.maps[0]
            .random_rectangles
            .iter()
            .all(|rectangle| rectangle.id.0 != "land:3:rect:1")
    );
}

#[test]
fn special_land_cells_require_the_exact_asset_key() {
    let mut snapshot = snapshot();
    snapshot.world.maps[0].tiles[0] = -1099;
    snapshot.world.special_land_solidity = Some(crate::model::SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId(format!("sha256:{}", "f".repeat(64))),
        solid: vec![false; crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES],
    });
    assert_eq!(
        project_rebuilt_v3_world(&snapshot),
        Err(RebuiltV3WorldError::Topology(
            RebuiltV3TopologyError::MissingSpecialLandAssets(vec![-99])
        ))
    );
    snapshot.assets.push(special_land_asset());
    let mut base_profile = snapshot.terrain_catalog[0].clone();
    base_profile.tile = 4;
    base_profile.combat_build = [[4; 3]; 3];
    snapshot.terrain_catalog.push(base_profile);
    let world = project_rebuilt_v3_world(&snapshot).unwrap();
    assert_eq!(
        world.maps[0].cells[0].10,
        Some(StableId("special-land.-99".into()))
    );
}

fn special_land_asset() -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("special-land.-99".into()),
        label: "Moon Gate".into(),
        kind: "special-land-tile".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -99,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 7,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(32),
        height: Some(32),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled special land tile".into(),
    }
}
