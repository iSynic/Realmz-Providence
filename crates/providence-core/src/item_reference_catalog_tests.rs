use super::*;
use crate::{
    codecs::new_scenario_item_definition,
    model::{BlobId, StableId},
};

fn query(field: &str, value: i32) -> ItemReferenceQuery {
    ItemReferenceQuery {
        field: field.into(),
        current_value: value,
        search: String::new(),
        ownership: "all".into(),
        show_unavailable: false,
        offset: 0,
        seek_current: true,
        limit: 8,
    }
}

fn snapshot() -> ProjectSnapshot {
    ProjectSnapshot::new_authored(StableId("item-reference-test".into()))
}

#[test]
fn race_and_caste_picker_numbers_do_not_change_accepted_native_values() {
    let mut snapshot = snapshot();
    snapshot.race_rules = crate::codecs::decode_race_rules(&vec![0; 408 * 30], None).rules;
    snapshot.caste_rules = crate::codecs::decode_caste_rules(&vec![0; 576 * 30], None).rules;
    for (field, id, label) in [
        ("specificRaceId", 20, "Custom Race 19"),
        ("specificCasteId", 21, "Custom Caste 20"),
    ] {
        let page =
            item_reference_choices(&snapshot, None, &[], &definition(), &query(field, id)).unwrap();
        let row = page.items.iter().find(|row| row.value == id).unwrap();
        assert_eq!(row.author_id, Some((id - 1) as u8));
        assert_eq!(row.label, label);
        assert_eq!(row.target_identity.as_deref(), Some(row.identity.as_str()));
    }
}
fn definition() -> ItemRuleDefinition {
    new_scenario_item_definition(100).unwrap()
}
fn icon(id: &str, resource: i32) -> AssetDescriptor {
    serde_json::from_value(serde_json::json!({"identity": id, "label": "Signed item artwork", "kind": "icon", "mimeType": "image/png",
        "classicResource": {"resourceType": "cicn", "resourceId": resource}, "blob": "preview", "byteLength": 4,
        "classicPayloadBlob": "native", "classicPayloadByteLength": 5, "source": "controlled descriptor"})).unwrap()
}

#[test]
fn item_sound_picker_resolves_runtime_resource_without_rewriting_stored_values() {
    let mut snapshot = snapshot();
    let mut sound = icon("exact-sound-636", 636);
    sound.kind = "sound".into();
    sound.mime_type = Some("audio/wav".into());
    sound.classic_resource.as_mut().unwrap().resource_type = "snd ".into();
    snapshot.assets.push(sound.clone());
    let mut definition = definition();
    definition.sound_id = 36;
    let mut search = query("soundId", 36);
    for alias in ["36", "636"] {
        search.search = alias.into();
        let page = item_reference_choices(&snapshot, None, &[], &definition, &search).unwrap();
        let choice = page.items.iter().find(|row| row.value == 36).unwrap();
        assert!(choice.available);
        assert_eq!(choice.target_identity.as_deref(), Some("exact-sound-636"));
    }
    definition.sound_id = -1236;
    search = query("soundId", -1236);
    search.search = "-1236".into();
    let page = item_reference_choices(&snapshot, None, &[], &definition, &search).unwrap();
    assert_eq!(page.items[0].value, -1236);
    assert_eq!(
        page.items[0].target_identity.as_deref(),
        Some("exact-sound-636")
    );
    assert!(page.items[0].available);
    snapshot.assets.push(sound);
    search.show_unavailable = true;
    let page = item_reference_choices(&snapshot, None, &[], &definition, &search).unwrap();
    assert!(!page.items[0].available);
}

#[test]
fn item_reference_search_retains_signed_artwork_and_clears_empty_results() {
    let mut snapshot = snapshot();
    snapshot.assets.push(icon("negative-art", -185));
    let mut definition = definition();
    definition.icon_id = -185;
    let mut query = query("iconId", -185);
    query.search = "-185".into();
    let page = item_reference_choices(&snapshot, None, &[], &definition, &query).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].value, -185);
    assert_eq!(
        page.items[0].target_identity.as_deref(),
        Some("negative-art")
    );
    assert!(page.items[0].available);
    query.search = "not-an-artwork".into();
    let page = item_reference_choices(&snapshot, None, &[], &definition, &query).unwrap();
    assert_eq!(page.total, 0);
    assert!(page.items.is_empty());
}

#[test]
fn item_reference_current_missing_and_duplicate_keys_are_explicitly_unavailable() {
    let mut snapshot = snapshot();
    let definition = definition();
    let query = query("iconId", 32760);
    let page = item_reference_choices(&snapshot, None, &[], &definition, &query).unwrap();
    let missing = page.items.iter().find(|row| row.value == 32760).unwrap();
    assert!(!missing.available);
    assert!(!missing.reason.is_empty());
    snapshot
        .assets
        .extend([icon("one", 32760), icon("two", 32760)]);
    let page = item_reference_choices(&snapshot, None, &[], &definition, &query).unwrap();
    assert!(
        !page
            .items
            .iter()
            .find(|row| row.value == 32760)
            .unwrap()
            .available
    );
    snapshot.assets.pop();
    snapshot.assets[0].classic_payload_blob = Some(BlobId("native".into()));
    let page = item_reference_choices(&snapshot, None, &[], &definition, &query).unwrap();
    assert!(
        page.items
            .iter()
            .find(|row| row.value == 32760)
            .unwrap()
            .available
    );
}

#[test]
fn item_reference_stock_catalog_search_and_effect_context_remain_bounded() {
    let snapshot = snapshot();
    let mut definition = definition();
    let mut stock = definition.clone();
    stock.classic_id = 51;
    stock.id = StableId("classic.item.51".into());
    stock.name = "Ring of Clarity".into();
    let mut search = query("cursedItemId", 51);
    search.search = "clarity".into();
    let page = item_reference_choices(&snapshot, None, &[stock], &definition, &search).unwrap();
    assert_eq!(page.items[0].ownership, "stock");
    assert_eq!(page.items[0].value, 51);
    definition.item_type = -23;
    assert!(
        item_reference_choices(&snapshot, None, &[], &definition, &query("special.4", 0)).is_ok()
    );
    definition.item_type = 0;
    assert!(
        item_reference_choices(&snapshot, None, &[], &definition, &query("special.4", 0)).is_err()
    );
    definition.special = [29, 2, -3, 0, 4];
    assert!(
        describe_item_effects(&definition)
            .iter()
            .any(|row| row.contains("Poisoned by 2"))
    );
}

#[test]
fn item_reference_condition_mode_and_invalid_effects_are_safe() {
    let snapshot = snapshot();
    let mut definition = definition();
    definition.special = [-10, 0, 29, 0, 0];
    let page =
        item_reference_choices(&snapshot, None, &[], &definition, &query("special.2", 29)).unwrap();
    assert!(
        page.items
            .iter()
            .any(|row| row.value == 29 && row.label == "Inflict Poisoned")
    );
    let mut search = query("special.2", 29);
    search.search = "silenced".into();
    let page = item_reference_choices(&snapshot, None, &[], &definition, &search).unwrap();
    assert_eq!(page.items[0].value, 59);
    search.search = "confused".into();
    let page = item_reference_choices(&snapshot, None, &[], &definition, &search).unwrap();
    assert_eq!(page.items[0].value, 49);
    definition.special[2] = i32::MIN;
    assert!(
        describe_item_effects(&definition)
            .iter()
            .any(|row| row.contains("-2147483668"))
    );
}
