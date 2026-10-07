use super::*;
use crate::model::{
    ActionPoint, AssetDescriptor, BlobId, ClassicResourceKey, ExtraActionPoint, ExtraCodeRow,
    NativeRecordId, SourcedCasteRule, SourcedRaceRule, StableId,
};

fn media_asset(
    identity: &str,
    kind: &str,
    resource_type: &str,
    resource_id: i32,
) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(identity.into()),
        label: identity.into(),
        kind: kind.into(),
        mime_type: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: resource_type.into(),
            resource_id,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 1,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: None,
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled action-reference fixture".into(),
    }
}

fn specialized_direct_snapshot() -> ProjectSnapshot {
    let actions = vec![
        ClassicAction {
            slot: 0,
            raw_opcode: 9,
            target_native_id: 700,
        },
        ClassicAction {
            slot: 1,
            raw_opcode: 27,
            target_native_id: 30_000,
        },
        ClassicAction {
            slot: 2,
            raw_opcode: 89,
            target_native_id: 7,
        },
    ];
    let mut snapshot = ProjectSnapshot::new_authored(StableId("specialized-links".into()));
    snapshot.assets.extend([
        media_asset("sound:700", "sound", "snd ", 700),
        media_asset("picture:30000", "picture", "PICT", 30_000),
    ]);
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:3".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 3,
        classic_door_id: 0,
        coordinate: None,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: actions.clone(),
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:5".into()),
        native_id: NativeRecordId(5),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions,
    });
    snapshot
}

fn character_rules(snapshot: &mut ProjectSnapshot) {
    snapshot.race_rules.push(
        serde_json::from_value::<SourcedRaceRule>(serde_json::json!({
            "source": "Data Race", "sourceBlob": null,
            "definition": {
                "id": "classic.race.7", "classicId": 7, "name": "Dwarf",
                "description": "Stout mountain folk", "eligibleCasteIds": [],
                "hitModifiers": [], "abilityBonuses": [], "saveBonuses": [],
                "attributeBonuses": [], "attributeLimits": [], "conditionLevels": [],
                "ageRanges": [], "ageChanges": [], "maximumAge": 0,
                "doesNotDie": false, "baseMovement": 0, "magicResistance": 0,
                "twoHandBonus": 0, "missileBonus": 0, "baseAttacks": 0,
                "maximumAttacks": 0, "canRegenerate": false, "defaultIconSet": 0,
                "itemCategoryMasks": [], "descriptorFlags": 0
            }
        }))
        .unwrap(),
    );
    snapshot.caste_rules.push(
        serde_json::from_value::<SourcedCasteRule>(serde_json::json!({
            "source": "Data Caste", "sourceBlob": null,
            "definition": {
                "id": "classic.caste.4", "classicId": 4, "name": "Archer",
                "description": "Missile specialist", "eligibleRaceIds": [],
                "initialAbilityValues": [], "levelAbilityDice": [], "victoryThresholds": [],
                "saveBonuses": [], "attributeBonuses": [], "attributeLimits": [],
                "conditionLevels": [], "staminaDice": [], "strengthValues": [],
                "dodgeValues": [], "toHitValues": [], "missileValues": [],
                "handToHandValues": [], "spellcasterRows": [], "attackLevels": [],
                "startingItemIds": [], "casteClass": 3, "minimumAgeGroup": 0,
                "movementBonus": 0, "magicResistanceMultiplier": 0, "twoHandBonus": 0,
                "maximumStaminaBonus": 0, "bonusAttacks": 0, "maximumAttacks": 0,
                "startMoney": 0, "canUseMissile": true, "getsMissileBonus": true,
                "defaultIcon": 0, "itemCategoryMasks": []
            }
        }))
        .unwrap(),
    );
}

fn character_selection_snapshot(words: [i16; 5]) -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("character-links".into()));
    character_rules(&mut snapshot);
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:5".into()),
        native_id: NativeRecordId(5),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 2,
            raw_opcode: 50,
            target_native_id: 12,
        }],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: words,
    });
    snapshot
}

#[test]
fn player_option_settings_emit_the_classic_xap_branch_reference() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("branch-links".into()));
    snapshot.extra_action_points = vec![
        ExtraActionPoint {
            identity: StableId("extra-action-point:157".into()),
            native_id: NativeRecordId(157),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 1,
                raw_opcode: 3,
                target_native_id: 609,
            }],
        },
        ExtraActionPoint {
            identity: StableId("extra-action-point:158".into()),
            native_id: NativeRecordId(158),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 7,
                raw_opcode: 24,
                target_native_id: 0,
            }],
        },
    ];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(609),
        values: [1, 1, 158, 0, 0],
    });

    let references = settings_action_references(&snapshot);
    assert_eq!(references.len(), 1);
    let reference = &references[0];
    assert_eq!(reference.source.0, "extra-action-point:157");
    assert_eq!(reference.field.0, "actions[1].settings.branchTarget");
    assert_eq!(reference.target_kind, TargetKind::ExtraActionPoint);
    assert_eq!(reference.target_id, "158");
    assert_eq!(reference.resolution, ResolutionState::Resolved);
    assert_eq!(reference.byte_provenance.as_ref().unwrap().byte_start, 6094);
}

#[test]
fn non_xap_choice_modes_do_not_claim_an_xap_reference() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("branch-links".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:157".into()),
        native_id: NativeRecordId(157),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 1,
            raw_opcode: 3,
            target_native_id: 609,
        }],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(609),
        values: [1, 2, 158, 0, 0],
    });
    assert!(settings_action_references(&snapshot).is_empty());
}

#[test]
fn character_selection_indexes_exact_race_and_caste_rules() {
    for (words, kind, identity) in [
        ([0, 2, 7, 0, 0], TargetKind::Race, "classic.race.7"),
        ([2, 2, 4, 0, 0], TargetKind::Caste, "classic.caste.4"),
    ] {
        let references = settings_action_references(&character_selection_snapshot(words));
        assert_eq!(references.len(), 1);
        assert_eq!(references[0].target_kind, kind);
        assert_eq!(references[0].target_id, identity);
        assert_eq!(references[0].resolution, ResolutionState::Resolved);
        assert_eq!(
            references[0].field.0,
            "actions[2].settings.raceCasteOrClass"
        );
    }
}

#[test]
fn character_selection_gender_and_class_numbers_never_become_rule_links() {
    for selector in [1, 3, 4] {
        assert!(
            settings_action_references(&character_selection_snapshot([selector, 7, 7, 0, 0]))
                .is_empty()
        );
    }
}

#[test]
fn direct_media_links_are_indexed_without_inventing_a_contextual_monster_target() {
    let snapshot = specialized_direct_snapshot();
    for references in [
        action_point_references(&snapshot),
        extra_action_point_references(&snapshot),
    ] {
        assert_eq!(references.len(), 2);
        assert!(references.iter().any(|reference| {
            reference.target_kind == TargetKind::Sound
                && reference.target_id == "sound:700"
                && reference.resolution == ResolutionState::Resolved
        }));
        assert!(references.iter().any(|reference| {
            reference.target_kind == TargetKind::Picture
                && reference.target_id == "picture:30000"
                && reference.resolution == ResolutionState::Resolved
        }));
        assert!(
            references
                .iter()
                .all(|reference| reference.target_kind != TargetKind::Monster)
        );
    }
}

#[test]
fn settings_monster_fields_do_not_invent_an_exact_runtime_set() {
    let mut snapshot = specialized_direct_snapshot();
    snapshot.extra_action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 123,
        target_native_id: 300,
    }];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(300),
        values: [7, 8, 9, 10, 11],
    });

    let references = settings_action_references(&snapshot);
    assert!(references.is_empty());
}
