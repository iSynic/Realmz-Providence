use super::super::*;
use crate::model::StableId;

#[test]
fn version_nineteen_preserves_binary_spells_and_adds_only_fallback_text() {
    let mut current = ProjectSnapshot::new_authored(StableId("v19".into()));
    current.scenario_spells =
        crate::codecs::decode_scenario_spells(&vec![0; crate::codecs::SCENARIO_SPELL_BYTES], None)
            .spells;
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(19));
    for spell in object["scenarioSpells"].as_array_mut().unwrap() {
        let spell = spell.as_object_mut().unwrap();
        spell.remove("textSourceBlob");
        spell.remove("nameAuthored");
        spell["definition"].as_object_mut().unwrap().remove("name");
        spell["definition"]
            .as_object_mut()
            .unwrap()
            .remove("description");
    }

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v19");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.scenario_spells.len(), 105);
    assert_eq!(
        migrated.scenario_spells[0].definition.name,
        "Custom Spell 0"
    );
    assert!(
        migrated.scenario_spells[0]
            .definition
            .description
            .is_empty()
    );
    assert!(migrated.scenario_spells[0].text_source_blob.is_none());
    assert!(!migrated.scenario_spells[0].name_authored);
}

#[test]
fn version_twenty_preserves_named_custom_spells_and_invents_no_standard_catalog() {
    let mut current = ProjectSnapshot::new_authored(StableId("v20".into()));
    current.scenario_spells =
        crate::codecs::decode_scenario_spells(&vec![0; crate::codecs::SCENARIO_SPELL_BYTES], None)
            .spells;
    current.scenario_spells[0].definition.name = "Moon Gate".into();
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(20));
    object.remove("standardSpells");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v20");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(
        migrated.scenario_spells.len(),
        crate::codecs::SCENARIO_SPELL_RECORDS
    );
    assert_eq!(migrated.scenario_spells[0].definition.name, "Moon Gate");
    assert!(migrated.standard_spells.is_empty());
}

#[test]
fn version_twenty_one_invents_no_treasure_catalog() {
    let current = ProjectSnapshot::new_authored(StableId("v21".into()));
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(21));
    object.remove("treasures");
    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v21");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.treasures.is_empty());
}

#[test]
fn version_twenty_two_preserves_treasures_and_invents_no_shops() {
    let mut current = ProjectSnapshot::new_authored(StableId("v22".into()));
    current.treasures.push(crate::model::TreasureRecord {
        identity: StableId("treasure:0".into()),
        native_id: crate::model::NativeRecordId(0),
        item_ids: vec![0; crate::codecs::TREASURE_ITEM_SLOTS],
        experience: 0,
        gold: 1,
        gems: 0,
        jewelry: 0,
        authored: true,
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(22));
    object.remove("shops");
    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v22");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.treasures.len(), 1);
    assert!(migrated.shops.is_empty());
}

#[test]
fn version_twenty_three_preserves_shops_and_invents_no_option_labels() {
    let mut current = ProjectSnapshot::new_authored(StableId("v23".into()));
    current.shops.push(crate::model::ShopRecord {
        identity: StableId("shop:0".into()),
        native_id: crate::model::NativeRecordId(0),
        item_ids: vec![0; crate::codecs::SHOP_ITEM_SLOTS],
        quantities: vec![0; crate::codecs::SHOP_ITEM_SLOTS],
        inflation: 100,
        authored: true,
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(23));
    object.remove("optionLabels");
    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v23");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.shops.len(), 1);
    assert!(migrated.option_labels.is_empty());
}
