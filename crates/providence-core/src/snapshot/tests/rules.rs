use super::super::*;
use crate::model::StableId;

#[test]
fn version_six_preserves_rules_and_invents_no_application_contract() {
    let mut current = ProjectSnapshot::new_authored(StableId("v6".into()));
    current.race_rules.push(crate::model::SourcedRaceRule {
        source: "controlled fixture".into(),
        source_blob: None,
        definition: crate::model::RaceRuleDefinition {
            id: StableId("classic.race.1".into()),
            classic_id: 1,
            name: "Human".into(),
            description: String::new(),
            eligible_caste_ids: Vec::new(),
            hit_modifiers: Vec::new(),
            ability_bonuses: Vec::new(),
            save_bonuses: Vec::new(),
            attribute_bonuses: Vec::new(),
            attribute_limits: Vec::new(),
            condition_levels: Vec::new(),
            age_ranges: Vec::new(),
            age_changes: Vec::new(),
            maximum_age: 0,
            does_not_die: false,
            base_movement: 0,
            magic_resistance: 0,
            two_hand_bonus: 0,
            missile_bonus: 0,
            base_attacks: 0,
            maximum_attacks: 0,
            can_regenerate: false,
            default_icon_set: 0,
            item_category_masks: Vec::new(),
            descriptor_flags: 0,
        },
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(6));
    object.remove("scenarioApplication");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v6");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.race_rules.len(), 1);
    assert!(migrated.rule_names.is_none());
    assert!(migrated.scenario_application.is_none());
}

#[test]
fn version_seven_preserves_application_contract_and_invents_no_rule_names() {
    let mut current = ProjectSnapshot::new_authored(StableId("v7".into()));
    current.scenario_application = Some(crate::model::ScenarioApplicationContract::default());
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(7));
    object.remove("ruleNames");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v7");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.scenario_application.is_some());
    assert!(migrated.rule_names.is_none());
}

#[test]
fn version_eight_preserves_rule_names_and_invents_no_item_catalog() {
    let mut current = ProjectSnapshot::new_authored(StableId("v8".into()));
    current.rule_names = Some(crate::model::RuleNameCatalog {
        source: "Data Files/Custom Names.rsrc".into(),
        source_blob: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
        race_resource_id: 129,
        caste_resource_id: 131,
        race_names: vec![String::new(); 30],
        caste_names: vec![String::new(); 30],
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(8));
    object.remove("itemRules");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v8");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.rule_names.is_some());
    assert!(migrated.item_rules.is_empty());
    assert!(migrated.scenario_item_rules.is_empty());
}

#[test]
fn version_nine_preserves_standard_items_and_invents_no_scenario_items() {
    let mut current = ProjectSnapshot::new_authored(StableId("v9".into()));
    current
        .item_rules
        .push(crate::rebuilt::item_rule_fixture(1));
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(9));
    object.remove("scenarioItemRules");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v9");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.item_rules.len(), 1);
    assert!(migrated.scenario_item_rules.is_empty());
    assert!(migrated.classic_sources.is_empty());
}

#[test]
fn version_ten_preserves_scenario_items_and_invents_no_classic_sources() {
    let mut current = ProjectSnapshot::new_authored(StableId("v10".into()));
    current
        .scenario_item_rules
        .push(crate::rebuilt::scenario_item_rule_fixture(0));
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(10));
    object.remove("classicSources");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v10");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.scenario_item_rules.len(), 1);
    assert!(migrated.classic_sources.is_empty());
}
