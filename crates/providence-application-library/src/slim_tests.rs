use super::{
    archive::supported_schema_contract, battle_atlas::normalize_legacy_battle_atlas,
    catalog_ownership::retain_non_application, native_sources::resource_keys_from_bytes,
};
use providence_core::{
    model::ClassicResourceKey,
    rebuilt::{ApplicationMediaCatalog, RebuiltV3AssetIndex},
};
use serde_json::json;
use std::collections::BTreeSet;

#[test]
fn slimmer_accepts_only_the_exact_supported_schema_and_origin_pairs() {
    assert!(supported_schema_contract(
        5,
        providence_core::rebuilt::REBUILT_V5_SCHEMA_SHA256,
        "imported"
    ));
    assert!(!supported_schema_contract(
        5,
        providence_core::rebuilt::REBUILT_V5_SCHEMA_SHA256,
        "authored"
    ));
    assert!(supported_schema_contract(
        3,
        providence_core::rebuilt::REBUILT_V3_SCHEMA_SHA256,
        "authored"
    ));
    assert!(supported_schema_contract(
        4,
        providence_core::rebuilt::REBUILT_V4_SCHEMA_SHA256,
        "imported"
    ));
    assert!(!supported_schema_contract(
        4,
        providence_core::rebuilt::REBUILT_V4_SCHEMA_SHA256,
        "authored"
    ));
    assert!(!supported_schema_contract(4, "wrong-hash", "imported"));
    assert!(!supported_schema_contract(
        3,
        providence_core::rebuilt::REBUILT_V4_SCHEMA_SHA256,
        "imported"
    ));
}

#[test]
fn stale_application_mechanics_do_not_become_scenario_overrides() {
    let application = json!({
        "items": [{"id":"classic.item.1", "classicId":1, "name":"Stock", "cost":20}, {"id":"classic.item.805", "classicId":805, "name":"Unknown item", "cost":3}],
        "spells": [{"id":"classic.spell.2712", "classicId":2712, "name":"Stun", "special":2, "durationMin":1, "durationMax":1}]
    });
    let mut scenario = json!({
        "items": [{"id":"classic.item.1", "classicId":1, "name":"Stale", "cost":10}, {"id":"classic.item.800", "classicId":800, "name":"Custom", "cost":10}, {"id":"classic.item.805", "classicId":805, "name":"Scenario Torch", "cost":9, "itemType":24}],
        "spells": [{"id":"classic.spell.2712", "classicId":2712, "name":"Stun", "special":0, "durationMin":-1, "durationMax":-1}, {"id":"classic.spell.5101", "classicId":5101, "name":"Custom", "special":0}]
    });
    assert_eq!(
        retain_non_application(&mut scenario, &application, "items", &BTreeSet::new()).unwrap(),
        1
    );
    assert_eq!(
        retain_non_application(&mut scenario, &application, "spells", &BTreeSet::new()).unwrap(),
        1
    );
    assert_eq!(scenario["items"][0]["classicId"], 800);
    assert_eq!(
        scenario["items"][1],
        json!({"id":"classic.item.805", "classicId":805, "name":"Scenario Torch", "cost":9, "itemType":24})
    );
    assert_eq!(scenario["spells"][0]["classicId"], 5101);
}

#[test]
fn exact_scenario_text_keys_override_only_their_owned_fields() {
    let application = json!({
        "items": [{"id":"classic.item.1", "classicId":1, "name":"Stock", "unidentifiedName":"Stock unknown", "description":"Stock description", "cost":20}],
        "spells": [{"id":"classic.spell.2712", "classicId":2712, "name":"Stun", "description":"Stock description", "special":2, "durationMin":1}]
    });
    let mut scenario = application.clone();
    scenario["items"][0]["name"] = json!("Scenario item name");
    scenario["items"][0]["unidentifiedName"] = json!("Stale unidentified name");
    scenario["items"][0]["cost"] = json!(10);
    scenario["spells"][0]["name"] = json!("Scenario spell name");
    scenario["spells"][0]["description"] = json!("Scenario spell description");
    scenario["spells"][0]["special"] = json!(0);
    let keys = [1, 2006, -2006]
        .into_iter()
        .map(|resource_id| ClassicResourceKey {
            resource_type: "STR#".into(),
            resource_id,
        })
        .collect();
    assert_eq!(
        retain_non_application(&mut scenario, &application, "items", &keys).unwrap(),
        0
    );
    assert_eq!(
        retain_non_application(&mut scenario, &application, "spells", &keys).unwrap(),
        0
    );
    assert_eq!(scenario["items"][0]["name"], "Scenario item name");
    assert_eq!(scenario["items"][0]["unidentifiedName"], "Stock unknown");
    assert_eq!(scenario["items"][0]["cost"], 20);
    assert_eq!(scenario["spells"][0]["name"], "Scenario spell name");
    assert_eq!(
        scenario["spells"][0]["description"],
        "Scenario spell description"
    );
    assert_eq!(scenario["spells"][0]["special"], 2);
    assert_eq!(scenario["spells"][0]["durationMin"], 1);
    let neighboring = BTreeSet::from([ClassicResourceKey {
        resource_type: "STR#".into(),
        resource_id: 2007,
    }]);
    assert_eq!(
        retain_non_application(&mut scenario, &application, "spells", &neighboring).unwrap(),
        1
    );
}

#[test]
fn ownership_inspection_includes_string_resources_without_media_roles() {
    use providence_core::codecs::{ResourceEntry, write_resource_fork};
    let bytes = write_resource_fork(&[ResourceEntry {
        resource_type: *b"STR#",
        id: 2006,
        name: String::new(),
        attributes: 0,
        data: vec![0, 1, 1, b'X'],
    }])
    .unwrap();
    let keys = resource_keys_from_bytes(&bytes).unwrap();
    assert_eq!(
        keys,
        BTreeSet::from([ClassicResourceKey {
            resource_type: "STR#".into(),
            resource_id: 2006
        }])
    );
    let entries = [2006, 2007].map(|id| ResourceEntry {
        resource_type: *b"STR#",
        id,
        name: String::new(),
        attributes: 0,
        data: vec![0, 0],
    });
    let mut duplicate = write_resource_fork(&entries).unwrap();
    let map = u32::from_be_bytes(duplicate[4..8].try_into().unwrap()) as usize;
    let types =
        map + u16::from_be_bytes(duplicate[map + 24..map + 26].try_into().unwrap()) as usize;
    let references =
        types + u16::from_be_bytes(duplicate[types + 8..types + 10].try_into().unwrap()) as usize;
    duplicate[references + 12..references + 14].copy_from_slice(&2006_i16.to_be_bytes());
    assert_eq!(resource_keys_from_bytes(&duplicate).unwrap(), keys);
}

#[test]
fn legacy_battle_payloads_normalize_only_after_native_application_ownership_is_proven() {
    let descriptor = json!({"identity":"dungeon-top-down-302","label":"Stock","kind":"tileset","mimeType":"image/png","classicResource":{"resourceType":"PICT","resourceId":302},"blob":"0".repeat(64),"byteLength":1,"width":640,"height":640,"tileWidth":32,"tileHeight":32,"columns":20,"rows":20,"source":"application"});
    let application: ApplicationMediaCatalog = serde_json::from_value(json!({"formatVersion":1,"libraryId":"application","sources":[{"identity":"application","nativeName":"Stock","priority":0,"blob":"0".repeat(64),"byteLength":1}],"assets":[{"source":"application","sourcePriority":0,"descriptor":descriptor}],"ambiguousResources":[],"failures":[]})).unwrap();
    let assets: RebuiltV3AssetIndex = serde_json::from_value(json!({"kind":"realmz2.assets","schemaVersion":3,"assets":[{"id":"classic-battle-tiles-302","label":"Legacy","kind":"battle-tileset","mimeType":"image/png","bytes":1,"sha256":"0".repeat(64),"path":"assets/media/legacy.png","width":640,"height":640,"tileWidth":32,"tileHeight":32,"columns":20,"rows":20}]})).unwrap();
    let mut normalized = assets.clone();
    normalize_legacy_battle_atlas(&mut normalized, &BTreeSet::new(), &application).unwrap();
    assert_eq!(
        (
            normalized.assets[0].resource_type.as_deref(),
            normalized.assets[0].resource_id
        ),
        (Some("PICT"), Some(302))
    );
    let scenario_keys = BTreeSet::from([ClassicResourceKey {
        resource_type: "PICT".into(),
        resource_id: 302,
    }]);
    assert!(
        normalize_legacy_battle_atlas(&mut assets.clone(), &scenario_keys, &application)
            .unwrap_err()
            .contains("scenario-owned")
    );
    let mut invalid_application = application.clone();
    invalid_application.assets[0].descriptor.width = Some(64);
    assert!(
        normalize_legacy_battle_atlas(&mut assets.clone(), &BTreeSet::new(), &invalid_application)
            .is_err()
    );
    invalid_application.assets.clear();
    assert!(
        normalize_legacy_battle_atlas(&mut assets.clone(), &BTreeSet::new(), &invalid_application)
            .is_err()
    );
    let mut malformed = assets.clone();
    malformed.assets.push(malformed.assets[0].clone());
    assert!(normalize_legacy_battle_atlas(&mut malformed, &BTreeSet::new(), &application).is_err());
    malformed = assets.clone();
    malformed.assets[0].resource_id = Some(302);
    assert!(normalize_legacy_battle_atlas(&mut malformed, &BTreeSet::new(), &application).is_err());
}
