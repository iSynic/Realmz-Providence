use super::*;
use crate::{
    codecs::{
        MONSTER_RECORD_BYTES, ROGUE_ENCOUNTER_RECORD_BYTES, STANDARD_SPELL_BYTES,
        decode_monster_set, decode_rogue_encounters, decode_standard_spells,
    },
    model::{
        CampaignContact, CampaignMetadata, CampaignRestrictions, ClassicAction, ExtraActionPoint,
        ExtraCodeRow, MonsterDescription, NativeRecordId, OptionLabelRecord,
        ScenarioApplicationContract, ScenarioApplicationHooks, ShopRecord, StableId,
        TreasureRecord,
    },
    rebuilt::{item_rule_fixture, scenario_item_rule_fixture},
};
use serde_json::Value;

pub(crate) fn complete_content_snapshot() -> ProjectSnapshot {
    let mut snapshot = super::super::rules::tests::complete_rule_snapshot();
    snapshot.project_id = StableId("content-fixture".into());
    snapshot.campaign = Some(CampaignMetadata {
        name: "The Ashen Crown".into(),
        version: "1.0".into(),
        author: "A. Cartographer".into(),
        creator_user_check: String::new(),
        contact: CampaignContact {
            title: "The Ashen Crown".into(),
            email: "keeper@example.invalid".into(),
            web: String::new(),
            date: "2026-09-02".into(),
            fee: String::new(),
        },
        contact_provenance: crate::model::CampaignContactProvenance::Authored,
        description: "Hold the western coast.".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 4,
        maximum_party_levels: 8,
        guidance_authored: true,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 20,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    });
    snapshot.scenario_application = Some(ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    snapshot.item_rules = (1..=799).map(item_rule_fixture).collect();
    snapshot.scenario_item_rules = (0..200).map(scenario_item_rule_fixture).collect();
    snapshot.standard_spells = decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
    snapshot
}

#[test]
fn complete_content_document_is_exact_deterministic_and_metadata_free() {
    let mut snapshot = complete_content_snapshot();
    snapshot.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:7".into()),
        native_id: NativeRecordId(7),
        text: "Proceed".into(),
        authored: true,
    });
    let first = compile_rebuilt_v3_content(&snapshot).expect("compile content.json");
    let second = compile_rebuilt_v3_content(&snapshot).expect("repeat content.json");

    assert_eq!(first, second);
    assert_eq!(first.document.kind, "realmz2.content");
    assert_eq!(first.document.schema_version, 3);
    assert_eq!(first.document.items.len(), 999);
    assert_eq!(first.document.spells.len(), 420);
    assert_eq!(first.document.races.len(), 30);
    assert_eq!(first.document.castes.len(), 30);
    assert!(first.document.treasures.is_empty());
    assert!(first.document.shops.is_empty());
    assert_eq!(first.document.option_labels[0].id, 7);
    assert_eq!(first.document.option_labels[0].text, "Proceed");
    assert_eq!(first.sha256.len(), 64);

    let value: Value = serde_json::from_slice(&first.canonical_json).unwrap();
    assert_eq!(value.as_object().unwrap().len(), 20);
    assert_eq!(value["kind"], "realmz2.content");
    assert_eq!(value["items"].as_array().unwrap().len(), 999);
    assert_eq!(value["itemTexts"], serde_json::json!([]));
    assert_eq!(value["items"][798]["name"], "Item 799");
    assert_eq!(value["items"][798]["unidentifiedName"], "Unknown item 799");
    assert_eq!(value["items"][798]["description"], "Description 799");
    assert_eq!(value["items"][798]["cursedItemId"], "");
    assert_eq!(value["items"][798]["specificRaceId"], "");
    assert_eq!(value["items"][798]["specificCasteId"], "");
    assert_eq!(value["spells"][0]["classicId"], 1101);
    let text = String::from_utf8(first.canonical_json.clone()).unwrap();
    for forbidden in ["sourceBlob", "textSourceBlob", "authored", "provenance"] {
        assert!(!text.contains(forbidden));
    }
    let reopened: RebuiltV3ContentDocument = serde_json::from_slice(&first.canonical_json).unwrap();
    assert_eq!(reopened, first.document);
}

#[test]
fn reachable_content_preserves_complete_source_owned_catalogs() {
    let mut snapshot = complete_content_snapshot();
    for (set_id, native_path) in [(-1, "Data MD-1"), (0, "Data MD"), (1, "Data MD1")] {
        snapshot.monster_sets.push(decode_monster_set(
            &vec![0; MONSTER_RECORD_BYTES * 2],
            native_path,
            set_id,
        ));
    }
    snapshot.monster_descriptions.push(MonsterDescription {
        identity: StableId("monster-description:1".into()),
        native_id: NativeRecordId(1),
        text: "Source-owned, not root-reachable".into(),
        authored: true,
    });
    snapshot.rogue_encounters =
        decode_rogue_encounters(&vec![0; ROGUE_ENCOUNTER_RECORD_BYTES * 2]).records;
    snapshot.scenario_spells =
        crate::codecs::decode_scenario_spells(&vec![0; crate::codecs::SCENARIO_SPELL_BYTES], None)
            .spells;
    let runtime =
        super::super::project_rebuilt_v3_reachable_runtime(&snapshot).expect("reachable runtime");
    let first = compile_rebuilt_v3_reachable_content(&snapshot, &runtime)
        .expect("preserved reachable content");
    let second = compile_rebuilt_v3_reachable_content(&snapshot, &runtime)
        .expect("repeat preserved reachable content");

    assert_eq!(first, second);
    assert!(first.monster_omissions.is_empty());
    assert_eq!(
        first.document.items,
        project_rebuilt_v3_combined_item_catalog(&snapshot).expect("combined items")
    );
    assert_eq!(
        first.document.spells,
        project_rebuilt_v3_combined_spell_catalog(&snapshot).expect("combined spells")
    );
    assert_eq!(
        first.document.messages,
        super::super::project_rebuilt_v3_messages(&snapshot).expect("messages")
    );
    let monster_catalog = project_rebuilt_v3_monster_catalog(&snapshot).expect("monsters");
    assert_eq!(first.document.monsters, monster_catalog.monsters);
    assert_eq!(first.document.monster_sets, monster_catalog.monster_sets);
    assert_eq!(
        first.document.monster_descriptions,
        monster_catalog.monster_descriptions
    );
    assert_eq!(
        first.document.thief_encounters,
        project_rebuilt_v3_rogue_encounters(&snapshot).expect("rogue encounters")
    );
}

#[test]
fn reachable_content_reports_unrepresentable_imported_monster_without_serializing_it() {
    let mut snapshot = complete_content_snapshot();
    let mut normal = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 2], "Data MD", 0);
    normal.monsters[1].attack_count = 88;
    snapshot.monster_sets.push(normal);
    let runtime =
        super::super::project_rebuilt_v3_reachable_runtime(&snapshot).expect("reachable runtime");

    let artifact =
        compile_rebuilt_v3_reachable_content(&snapshot, &runtime).expect("package content");
    assert_eq!(artifact.document.monsters.len(), 1);
    assert_eq!(artifact.monster_omissions.len(), 1);
    assert_eq!(artifact.monster_omissions[0].native_id, 1);
    assert!(!String::from_utf8_lossy(&artifact.canonical_json).contains("monster_omissions"));
    assert_eq!(snapshot.monster_sets[0].monsters.len(), 2);
}

#[test]
fn content_items_match_rebuilt_required_string_contract() {
    let mut snapshot = complete_content_snapshot();
    snapshot.item_rules[258].definition.name.clear();
    snapshot.item_rules[258]
        .definition
        .unidentified_name
        .clear();
    snapshot.item_rules[258].definition.cursed_item_id = None;
    snapshot.item_rules[258].definition.specific_race_id = None;
    snapshot.item_rules[258].definition.specific_caste_id = None;

    let artifact = compile_rebuilt_v3_content(&snapshot).expect("compile content.json");
    let value: Value = serde_json::from_slice(&artifact.canonical_json).unwrap();
    let item = &value["items"][258];

    assert_eq!(item["name"], "Unnamed Classic item 259");
    assert_eq!(item["unidentifiedName"], "Unidentified item 259");
    for field in ["cursedItemId", "specificRaceId", "specificCasteId"] {
        assert!(item[field].is_string(), "{field} must be a JSON string");
        assert_eq!(item[field], "");
    }
}

#[test]
fn content_document_names_the_first_invalid_section() {
    let mut snapshot = complete_content_snapshot();
    snapshot.scenario_application = None;
    assert!(matches!(
        project_rebuilt_v3_content(&snapshot),
        Err(RebuiltV3ContentError::InvalidSection {
            section: "scenario",
            ..
        })
    ));

    let mut snapshot = complete_content_snapshot();
    snapshot.item_rules.pop();
    assert!(matches!(
        project_rebuilt_v3_content(&snapshot),
        Err(RebuiltV3ContentError::InvalidSection {
            section: "items",
            ..
        })
    ));
}

#[test]
fn option_label_catalog_satisfies_opcode_three_choice_prompts() {
    let mut snapshot = complete_content_snapshot();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 3,
            target_native_id: 0,
        }],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(0),
        values: [0, 0, 0, -7, 8],
    });
    snapshot.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:7".into()),
        native_id: NativeRecordId(7),
        text: "Proceed".into(),
        authored: true,
    });
    assert!(matches!(
        project_rebuilt_v3_content(&snapshot),
        Err(RebuiltV3ContentError::InvalidSection { section: "optionLabels", reason })
            if reason.contains("Option Label 8")
    ));
    snapshot.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:8".into()),
        native_id: NativeRecordId(8),
        text: "Withdraw".into(),
        authored: true,
    });
    let document = project_rebuilt_v3_content(&snapshot).expect("resolved choice prompts");
    assert_eq!(document.option_labels.len(), 2);
}

#[test]
fn shop_catalog_satisfies_all_direct_program_targets() {
    for (opcode, extra_code) in [(6, None), (51, Some([0; 5])), (73, Some([0; 5]))] {
        let mut snapshot = complete_content_snapshot();
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId("extra-action-point:0".into()),
            native_id: NativeRecordId(0),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: opcode,
                target_native_id: 0,
            }],
        });
        if let Some(values) = extra_code {
            snapshot.extra_codes.push(ExtraCodeRow {
                native_id: NativeRecordId(0),
                values,
            });
        }
        assert!(matches!(
            project_rebuilt_v3_content(&snapshot),
            Err(RebuiltV3ContentError::InvalidSection {
                section: "shops",
                ..
            })
        ));
        snapshot.shops.push(ShopRecord {
            identity: StableId("shop:0".into()),
            native_id: NativeRecordId(0),
            item_ids: vec![-1; crate::codecs::SHOP_ITEM_SLOTS],
            quantities: vec![0; crate::codecs::SHOP_ITEM_SLOTS],
            inflation: 100,
            authored: true,
        });
        let document = project_rebuilt_v3_content(&snapshot).expect("owned shop target");
        assert_eq!(document.shops[0].id.0, "classic.shop.0");
        assert!(document.shops[0].stock.is_empty());
    }
}

#[test]
fn treasure_catalog_satisfies_direct_and_post_combat_program_targets() {
    for (opcode, extra_code) in [(10, None), (48, Some([0, 0, 0, 0, 2]))] {
        let mut snapshot = complete_content_snapshot();
        snapshot.treasures.push(TreasureRecord {
            identity: StableId("treasure:2".into()),
            native_id: NativeRecordId(2),
            item_ids: [1].into_iter().chain(std::iter::repeat_n(0, 19)).collect(),
            experience: -100,
            gold: 50,
            gems: 2,
            jewelry: 1,
            authored: true,
        });
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId("extra-action-point:0".into()),
            native_id: NativeRecordId(0),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: opcode,
                target_native_id: 2,
            }],
        });
        if let Some(values) = extra_code {
            snapshot.extra_codes.push(ExtraCodeRow {
                native_id: NativeRecordId(2),
                values,
            });
        }
        let document = project_rebuilt_v3_content(&snapshot).expect("owned treasure target");
        assert_eq!(document.treasures[0].id.0, "classic.treasure.2");
        assert_eq!(document.treasures[0].item_ids[0].0, "classic.item.1");
    }
}

#[test]
fn missing_direct_treasure_target_is_named() {
    let mut snapshot = complete_content_snapshot();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 10,
            target_native_id: 7,
        }],
    });
    assert!(matches!(
        project_rebuilt_v3_content(&snapshot),
        Err(RebuiltV3ContentError::InvalidSection { section: "treasures", reason })
            if reason.contains("missing Classic treasure 7")
    ));
}
