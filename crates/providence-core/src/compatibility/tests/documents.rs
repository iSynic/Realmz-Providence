use super::*;

#[test]
fn rebuilt_content_names_missing_shop_dependencies() {
    for opcode in [6, 51, 73] {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("content-blocker".into()));
        snapshot.campaign = Some(CampaignMetadata {
            name: "Content blocker".into(),
            version: String::new(),
            author: String::new(),
            creator_user_check: String::new(),
            contact: CampaignContact {
                title: String::new(),
                email: String::new(),
                web: String::new(),
                date: String::new(),
                fee: String::new(),
            },
            contact_provenance: Default::default(),
            description: String::new(),
            splash_asset_id: String::new(),
            recommended_party_levels: 0,
            maximum_party_levels: 0,
            guidance_authored: false,
            restrictions: CampaignRestrictions {
                description: String::new(),
                max_party_size: 6,
                max_level: 0,
                banned_races: Vec::new(),
                banned_castes: Vec::new(),
            },
        });
        snapshot.scenario_application = Some(ScenarioApplicationContract {
            hooks: ScenarioApplicationHooks::default(),
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
                target_native_id: 0,
            }],
        });

        let blocker = classify_rebuilt_v3(&snapshot)
            .blockers
            .into_iter()
            .find(|blocker| blocker.code == "rebuilt.content-document.invalid-catalog-reference")
            .expect("content dependency blocker");
        assert!(blocker.message.contains("shops"));
    }
}

#[test]
fn rebuilt_v3_names_every_current_certification_input_gap() {
    let classification = classify_rebuilt_v3(&slice_snapshot(47));
    assert_eq!(classification.status, CompatibilityStatus::Blocked);
    let codes = classification
        .blockers
        .iter()
        .map(|blocker| blocker.code.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        codes,
        [
            "rebuilt.application-hooks.unavailable",
            "rebuilt.asset-index.unavailable",
            "rebuilt.campaign-metadata.missing",
            "rebuilt.item-catalog.unavailable",
            "rebuilt.map-runtime-metadata.unavailable",
            "rebuilt.rules-catalog.unavailable",
            "rebuilt.scenario-item-catalog.unavailable",
            "rebuilt.standard-spell-catalog.invalid",
            "rebuilt.start-location.missing",
            "rebuilt.terrain-catalog.unavailable",
        ]
    );
}

#[test]
fn reachability_failure_blocks_publication_only_after_prerequisites_pass() {
    assert!(actionable_reachability_blocker(false, "missing input".into()).is_none());

    let blocker = actionable_reachability_blocker(
        true,
        "reachable combat selection refused an unresolved source reference".into(),
    )
    .expect("actionable reachability blocker");
    assert_eq!(blocker.code, "rebuilt.reachability.invalid");
    assert!(blocker.message.contains("unresolved source reference"));
    assert!(blocker.entity.is_none());
}

#[test]
fn explicit_empty_application_contract_retires_only_the_hook_blocker() {
    let mut snapshot = slice_snapshot(47);
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract::default());

    let codes = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<Vec<_>>();
    assert!(!codes.contains(&"rebuilt.application-hooks.unavailable".into()));
    assert!(!codes.contains(&"rebuilt.application-hooks.invalid".into()));
}

#[test]
fn missing_hook_program_is_a_precise_application_blocker() {
    let mut snapshot = slice_snapshot(47);
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: crate::model::ScenarioApplicationHooks {
            start_game: Some(StableId("extra-action-point:40".into())),
            ..Default::default()
        },
    });

    let blocker = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .find(|blocker| blocker.code == "rebuilt.application-hooks.invalid")
        .expect("precise application blocker");
    assert!(blocker.message.contains("xap:40"));
    assert!(blocker.message.contains("not emitted"));
}

#[test]
fn unsupported_trigger_opcode_is_a_precise_rebuilt_blocker() {
    let mut snapshot = slice_snapshot(47);
    snapshot.world.action_points[0].actions[0].raw_opcode = 80;

    let blocker = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .find(|blocker| blocker.code == "rebuilt.trigger-program.invalid-input")
        .expect("trigger-program blocker");

    assert!(blocker.message.contains("opcode 80"));
    assert!(blocker.message.contains("cannot execute"));
}

#[test]
fn partial_rule_catalog_is_named_invalid_instead_of_unavailable() {
    let mut snapshot = slice_snapshot(47);
    snapshot.race_rules.push(SourcedRaceRule {
        source: "controlled fixture".into(),
        source_blob: None,
        definition: RaceRuleDefinition {
            id: StableId("classic.race.1".into()),
            classic_id: 1,
            name: "Human".into(),
            description: String::new(),
            eligible_caste_ids: Vec::new(),
            hit_modifiers: vec![0; 8],
            ability_bonuses: vec![0; 14],
            save_bonuses: vec![0; 8],
            attribute_bonuses: vec![0; 6],
            attribute_limits: vec![18; 12],
            condition_levels: vec![0; 40],
            age_ranges: vec![vec![1, 100]; 5],
            age_changes: vec![vec![0; 15]; 5],
            maximum_age: 100,
            does_not_die: false,
            base_movement: 12,
            magic_resistance: 0,
            two_hand_bonus: 0,
            missile_bonus: 0,
            base_attacks: 1,
            maximum_attacks: 4,
            can_regenerate: false,
            default_icon_set: 1,
            item_category_masks: vec![0, 0],
            descriptor_flags: 0,
        },
    });

    let codes = classify_rebuilt_v3(&snapshot)
        .blockers
        .into_iter()
        .map(|blocker| blocker.code)
        .collect::<Vec<_>>();
    assert!(codes.contains(&"rebuilt.rules-catalog.invalid".into()));
    assert!(!codes.contains(&"rebuilt.rules-catalog.unavailable".into()));
}

#[test]
fn imported_native_monster_values_select_package_v4_without_blocking_readiness() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-v4".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].magic_to_hit = i8::MIN;
    set.monsters[0].weapon = i16::MIN;
    snapshot.monster_sets.push(set);

    let classification = classify_rebuilt_v3(&snapshot);

    assert_eq!(classification.target, CompileTarget::RebuiltPackageV4);
    assert!(
        !classification
            .blockers
            .iter()
            .any(|blocker| { blocker.code == "rebuilt.monsters.invalid" })
    );
}

#[test]
fn rebuilt_classification_requires_a_valid_battle_projection() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-rebuilt-blocker".into()));
    let mut grid = vec![0; crate::codecs::BATTLE_GRID_SLOTS];
    grid[0] = 1;
    snapshot.battles.push(crate::model::BattleRecord {
        identity: StableId("battle:0".into()),
        native_id: NativeRecordId(0),
        grid,
        distance: 4,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });

    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.battles.invalid")
    );

    snapshot
        .monster_sets
        .push(crate::codecs::decode_monster_set(
            &vec![0; crate::codecs::MONSTER_RECORD_BYTES * 2],
            "Data MD",
            0,
        ));
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .all(|blocker| !blocker.code.starts_with("rebuilt.battles."))
    );
}

#[test]
fn rebuilt_classification_requires_a_valid_monster_projection() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-rebuilt-blocker".into()));
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].death_macro = -6;
    snapshot.monster_sets.push(set);
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.monsters.invalid")
    );

    snapshot
        .extra_action_points
        .push(crate::model::ExtraActionPoint {
            identity: StableId("extra-action-point:6".into()),
            native_id: NativeRecordId(6),
            classic_door_id: 6,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        });
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .all(|blocker| !blocker.code.starts_with("rebuilt.monsters."))
    );
}

#[test]
fn rebuilt_classification_never_silently_drops_complex_encounters() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complex-rebuilt-blocker".into()));
    let mut encounter = crate::codecs::decode_complex_encounters(&vec![
        0;
        crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES
    ])
    .records
    .remove(0);
    encounter.authored = true;
    encounter.thief = true;
    encounter.thief_success = 6;
    snapshot.complex_encounters.push(encounter);
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: String::new(),
        authored: true,
    });

    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.complex-encounters.invalid")
    );

    let mut rogue = crate::codecs::decode_rogue_encounters(&vec![
        0;
        crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES
            * 7
    ])
    .records;
    snapshot.rogue_encounters.push(rogue.remove(6));
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .all(|blocker| !blocker.code.starts_with("rebuilt.complex-encounters."))
    );
}

#[test]
fn rebuilt_classification_never_silently_drops_rogue_encounters() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-rebuilt-blocker".into()));
    let mut encounter =
        crate::codecs::decode_rogue_encounters(&[0; crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    encounter.identity = StableId("rogue-encounter:wrong".into());
    encounter.authored = true;
    snapshot.rogue_encounters.push(encounter);

    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.rogue-encounters.invalid")
    );

    snapshot.rogue_encounters[0].identity = StableId("rogue-encounter:0".into());
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .all(|blocker| !blocker.code.starts_with("rebuilt.rogue-encounters."))
    );
}

#[test]
fn rebuilt_classification_never_silently_drops_timed_encounters() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-rebuilt-blocker".into()));
    let mut encounter =
        crate::codecs::decode_timed_encounters(&[0; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    encounter.day = 1;
    encounter.door = 4;
    encounter.authored = true;
    snapshot.timed_encounters.push(encounter);
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.timed-encounters.invalid")
    );

    snapshot
        .extra_action_points
        .push(crate::model::ExtraActionPoint {
            identity: StableId("extra-action-point:4".into()),
            native_id: crate::model::NativeRecordId(4),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        });
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .all(|blocker| !blocker.code.starts_with("rebuilt.timed-encounters."))
    );
}

#[test]
fn rebuilt_classification_validates_scenario_spells_through_the_schema_projection() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("spell-blocker".into()));
    snapshot.scenario_spells =
        crate::codecs::decode_scenario_spells(&vec![0; crate::codecs::SCENARIO_SPELL_BYTES], None)
            .spells;

    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .all(|blocker| !blocker.code.starts_with("rebuilt.spell-catalog."))
    );

    snapshot.scenario_spells[4].definition.name.clear();
    let blockers = classify_rebuilt_v3(&snapshot).blockers;
    assert!(
        blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.spell-catalog.invalid")
    );
}

#[test]
fn rebuilt_classification_requires_runtime_valid_simple_responses() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("simple-rebuilt-blocker".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:7".into()),
        native_id: NativeRecordId(7),
        text: "Choose.".into(),
        authored: true,
    });
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:2".into()),
        native_id: NativeRecordId(2),
        actions: Vec::new(),
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 7,
        texts: [
            "Continue".into(),
            String::new(),
            String::new(),
            String::new(),
        ],
        authored: true,
    });

    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "rebuilt.simple-encounters.invalid")
    );
    snapshot.simple_encounters[0].choice_results[0] = 1;
    assert!(
        classify_rebuilt_v3(&snapshot)
            .blockers
            .iter()
            .all(|blocker| !blocker.code.starts_with("rebuilt.simple-encounters."))
    );
}
