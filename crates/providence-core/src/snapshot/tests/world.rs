use super::super::*;
use crate::model::StableId;

#[test]
fn version_twenty_four_preserves_option_labels_and_invents_no_landlook_catalogs() {
    let mut current = ProjectSnapshot::new_authored(StableId("v24".into()));
    current.option_labels.push(crate::model::OptionLabelRecord {
        identity: StableId("option-label:0".into()),
        native_id: crate::model::NativeRecordId(0),
        text: "Proceed".into(),
        authored: true,
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(24));
    object.remove("landlookCatalogs");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v24");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.option_labels.len(), 1);
    assert!(migrated.landlook_catalogs.is_empty());
}

#[test]
fn version_twenty_five_preserves_landlooks_and_invents_no_land_layout() {
    let mut current = ProjectSnapshot::new_authored(StableId("v25".into()));
    current
        .landlook_catalogs
        .push(crate::model::LandlookCatalogMetadata {
            landlook: 5,
            source: "Data Desert BD".into(),
            source_blob: crate::model::BlobId("sha256:mapstats".into()),
            byte_length: 8104,
            base_tile: 191,
            base_scale: 0,
            range_slots: Vec::new(),
        });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(25));
    object
        .get_mut("world")
        .and_then(serde_json::Value::as_object_mut)
        .expect("world object")
        .remove("landLayout");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v25");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.landlook_catalogs.len(), 1);
    assert!(migrated.world.land_layout.is_none());
}

#[test]
fn version_twenty_six_preserves_land_layout_and_invents_no_player_maps() {
    let mut current = ProjectSnapshot::new_authored(StableId("v26".into()));
    current.world.land_layout = Some(crate::model::LandLayout {
        cells: vec![0; crate::codecs::LAND_LAYOUT_CELLS],
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(26));
    object
        .get_mut("world")
        .and_then(serde_json::Value::as_object_mut)
        .expect("world object")
        .remove("playerMaps");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v26");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.world.land_layout.is_some());
    assert!(migrated.world.player_maps.is_empty());
}

#[test]
fn version_twenty_seven_moves_player_map_names_to_their_resource_catalog() {
    let mut current = ProjectSnapshot::new_authored(StableId("v27".into()));
    current.world.player_maps =
        crate::codecs::decode_player_maps(&vec![0; crate::codecs::PLAYER_MAP_RECORD_BYTES]).records;
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(27));
    object.remove("playerMapNames");
    let record = object
        .get_mut("world")
        .and_then(serde_json::Value::as_object_mut)
        .and_then(|world| world.get_mut("playerMaps"))
        .and_then(serde_json::Value::as_array_mut)
        .and_then(|records| records.first_mut())
        .and_then(serde_json::Value::as_object_mut)
        .expect("player map record");
    record.insert("name".into(), serde_json::json!("Northern March"));
    record.insert(
        "unavailableName".into(),
        serde_json::json!("Uncharted North"),
    );

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v27");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.world.player_maps.len(), 1);
    let catalog = migrated.player_map_names.expect("migrated names");
    assert_eq!(catalog.available_names.len(), 20);
    assert_eq!(catalog.available_names[0], "Northern March");
    assert_eq!(catalog.unavailable_names[0], "Uncharted North");
    assert!(catalog.source_blob.is_none());
}

#[test]
fn version_twenty_eight_preserves_player_map_names_and_invents_no_special_land_solidity() {
    let mut current = ProjectSnapshot::new_authored(StableId("v28".into()));
    current.player_map_names = Some(crate::model::PlayerMapNameCatalog {
        source_blob: Some(crate::model::BlobId(format!("sha256:{}", "a".repeat(64)))),
        available_names: (1..=20).map(|index| format!("Known Map {index}")).collect(),
        unavailable_names: (1..=20)
            .map(|index| format!("Unknown Map {index}"))
            .collect(),
    });
    current.world.special_land_solidity = Some(crate::model::SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: crate::model::BlobId(format!("sha256:{}", "b".repeat(64))),
        solid: vec![false; crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES],
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(28));
    object
        .get_mut("world")
        .and_then(serde_json::Value::as_object_mut)
        .expect("world object")
        .remove("specialLandSolidity");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v28");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    let catalog = migrated.player_map_names.expect("preserved names");
    assert_eq!(catalog.available_names[0], "Known Map 1");
    assert_eq!(catalog.unavailable_names[19], "Unknown Map 20");
    assert!(migrated.world.special_land_solidity.is_none());
}

#[test]
fn version_twenty_nine_preserves_special_land_and_defaults_custom_ranges() {
    let mut current = ProjectSnapshot::new_authored(StableId("v29".into()));
    current.world.special_land_solidity = Some(crate::model::SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: crate::model::BlobId(format!("sha256:{}", "b".repeat(64))),
        solid: vec![false; crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES],
    });
    current
        .landlook_catalogs
        .push(crate::model::LandlookCatalogMetadata {
            landlook: 6,
            source: "Data Custom 1 BD".into(),
            source_blob: crate::model::BlobId(format!("sha256:{}", "c".repeat(64))),
            byte_length: crate::codecs::MAPSTATS_REFERENCE_BYTES as u64,
            base_tile: 156,
            base_scale: 1,
            range_slots: Vec::new(),
        });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(29));
    object
        .get_mut("landlookCatalogs")
        .and_then(serde_json::Value::as_array_mut)
        .and_then(|catalogs| catalogs.first_mut())
        .and_then(serde_json::Value::as_object_mut)
        .expect("custom landlook catalog")
        .remove("rangeSlots");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v29");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.world.special_land_solidity.is_some());
    assert!(migrated.landlook_catalogs[0].range_slots.is_empty());
}
