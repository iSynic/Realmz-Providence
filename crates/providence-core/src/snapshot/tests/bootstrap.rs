use super::super::*;
use crate::model::StableId;

#[test]
fn version_one_snapshot_migrates_to_explicit_unconfigured_package_inputs() {
    let current = ProjectSnapshot::new_authored(StableId("legacy".into()));
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(1));
    object.remove("campaign");
    object.remove("startLocation");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v1");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.campaign.is_none());
    assert!(migrated.start_location.is_none());
    assert!(migrated.rule_names.is_none());
    let encoded = to_deterministic_json(&migrated).expect("write current version");
    assert!(encoded.contains(&format!("\"formatVersion\": {SNAPSHOT_FORMAT_VERSION}")));
}

#[test]
fn version_two_preserves_bootstrap_fields_and_adds_no_terrain_claims() {
    let mut current = ProjectSnapshot::new_authored(StableId("v2".into()));
    current.start_location = Some(crate::model::StartLocation {
        map: StableId("land:0".into()),
        coordinate: crate::model::MapCoordinate { x: 1, y: 2 },
    });
    current.world.maps.push(crate::model::MapLevel {
        identity: StableId("land:0".into()),
        level_type: crate::model::LevelType::Land,
        native_index: 0,
        name: "Legacy map".into(),
        tiles: vec![0; crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE],
        runtime: None,
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(2));
    object.remove("terrainCatalog");
    object["world"]["maps"][0]
        .as_object_mut()
        .expect("map object")
        .remove("runtime");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v2");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.start_location.is_some());
    assert!(migrated.terrain_catalog.is_empty());
    assert!(migrated.world.maps[0].runtime.is_none());
    assert!(migrated.rule_names.is_none());
}

#[test]
fn version_three_preserves_map_inputs_and_adds_no_asset_claims() {
    let mut current = ProjectSnapshot::new_authored(StableId("v3".into()));
    current.terrain_catalog.push(crate::model::TerrainProfile {
        source: "synthetic".into(),
        source_blob: None,
        tile: 7,
        landlook: Some(0),
        movement_sound_id: Some(82),
        movement_cost: 1,
        solid_type: 0,
        walkable: true,
        shore: false,
        boat_requirement: 0,
        path: false,
        blocks_los: false,
        fly_float: false,
        forest_type: 0,
        combat_build: [[7; 3]; 3],
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(3));
    object.remove("assets");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v3");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.terrain_catalog.len(), 1);
    assert!(migrated.assets.is_empty());
    assert!(migrated.extra_codes.is_empty());
    assert!(migrated.rule_names.is_none());
    assert!(migrated.race_rules.is_empty());
    assert!(migrated.caste_rules.is_empty());
    assert!(migrated.rule_names.is_none());
}

#[test]
fn version_four_preserves_assets_and_invents_no_extra_code_rows() {
    let mut current = ProjectSnapshot::new_authored(StableId("v4".into()));
    current.assets.push(crate::model::AssetDescriptor {
        identity: StableId("asset.fixture".into()),
        label: "Fixture".into(),
        kind: "image".into(),
        mime_type: Some("image/png".into()),
        classic_resource: None,
        scenario_music_slot: None,
        blob: crate::model::BlobId("0".repeat(64)),
        byte_length: 0,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(1),
        height: Some(1),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "synthetic".into(),
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(4));
    object.remove("extraCodes");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v4");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.assets.len(), 1);
    assert!(migrated.extra_codes.is_empty());
    assert!(migrated.race_rules.is_empty());
    assert!(migrated.caste_rules.is_empty());
    assert!(migrated.rule_names.is_none());
}

#[test]
fn version_five_preserves_extra_codes_and_invents_no_rule_catalog() {
    let mut current = ProjectSnapshot::new_authored(StableId("v5".into()));
    current.extra_codes.push(crate::model::ExtraCodeRow {
        native_id: crate::model::NativeRecordId(8),
        values: [1, -2, 3, -4, 5],
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(5));
    object.remove("raceRules");
    object.remove("casteRules");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v5");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.extra_codes.len(), 1);
    assert!(migrated.race_rules.is_empty());
    assert!(migrated.caste_rules.is_empty());
    assert!(migrated.scenario_application.is_none());
}
