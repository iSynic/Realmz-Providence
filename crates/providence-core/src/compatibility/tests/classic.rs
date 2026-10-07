use super::*;

#[test]
fn classic_slice_is_ready_only_after_typed_references_resolve() {
    let blocked = classify_classic_slice(&slice_snapshot(999));
    assert_eq!(blocked.status, CompatibilityStatus::Blocked);
    assert_eq!(blocked.blockers[0].code, "reference.unresolved");

    let ready = classify_classic_slice(&slice_snapshot(47));
    assert_eq!(ready.status, CompatibilityStatus::Ready);
    assert!(ready.blockers.is_empty());
}

#[test]
fn classic_player_maps_require_their_separate_resource_name_catalog() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("player-map-names".into()));
    let mut record =
        crate::codecs::decode_player_maps(&vec![0; crate::codecs::PLAYER_MAP_RECORD_BYTES])
            .records
            .remove(0);
    record.note = "The northern road.".into();
    snapshot.world.player_maps.push(record);

    let missing = classify_classic_slice(&snapshot);
    assert!(
        missing
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.player-map-names.missing")
    );

    snapshot.player_map_names = Some(crate::model::PlayerMapNameCatalog {
        source_blob: None,
        available_names: (1..=19).map(|index| format!("Known Map {index}")).collect(),
        unavailable_names: (1..=19)
            .map(|index| format!("Unknown Map {index}"))
            .collect(),
    });
    assert!(
        !classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code.starts_with("classic.player-map-names"))
    );

    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    assert!(
        !classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.player-map-names.missing")
    );
    snapshot.player_map_names.as_mut().unwrap().available_names[0] = "Uncharted 🐈".into();
    let invalid = classify_classic_slice(&snapshot);
    assert!(
        invalid
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.player-map-names.invalid")
    );
}

#[test]
fn classic_dungeon_requires_exact_map_and_data_rdd_runtime_record() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-readiness".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("dungeon:0".into()),
        level_type: LevelType::Dungeon,
        native_index: 0,
        name: "Vault of Embers".into(),
        tiles: vec![0; 17],
        runtime: None,
    });

    let missing = classify_classic_slice(&snapshot);
    assert!(
        missing
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.dungeon-map.cell-count")
    );
    assert!(
        missing
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.dungeon-random-level.missing")
    );

    snapshot.world.maps[0].tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    snapshot.world.maps[0].runtime = Some(MapRuntimeMetadata {
        source: "Data RDD".into(),
        source_blob: None,
        dark: false,
        uses_los: false,
        landlook: None,
        base_scale: None,
        tileset_id: StableId("dungeon-top-down-302".into()),
        base_tile: None,
        random_rectangles: Vec::new(),
    });
    let missing_landlook = classify_classic_slice(&snapshot);
    assert_eq!(
        missing_landlook
            .blockers
            .iter()
            .map(|blocker| blocker.code.as_str())
            .collect::<Vec<_>>(),
        ["classic.dungeon-random-level.landlook"]
    );

    snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(-1);
    assert_eq!(
        classify_classic_slice(&snapshot).status,
        CompatibilityStatus::Ready
    );
}

#[test]
fn opcode_92_requires_both_consecutive_extra_code_rows() {
    let mut snapshot = slice_snapshot(47);
    snapshot
        .extra_action_points
        .push(crate::model::ExtraActionPoint {
            identity: StableId("extra-action-point:5".into()),
            native_id: NativeRecordId(5),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: 92,
                target_native_id: 8,
            }],
        });

    let missing_both = classify_classic_slice(&snapshot);
    assert!(
        missing_both
            .blockers
            .iter()
            .any(|blocker| { blocker.code == "classic.edcd.opcode-92-primary-missing" })
    );
    assert!(
        missing_both
            .blockers
            .iter()
            .any(|blocker| { blocker.code == "classic.edcd.opcode-92-secondary-missing" })
    );

    snapshot.extra_codes.push(crate::model::ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [1, 2, 3, 4, 5],
    });
    let missing_companion = classify_classic_slice(&snapshot);
    assert!(
        !missing_companion
            .blockers
            .iter()
            .any(|blocker| { blocker.code == "classic.edcd.opcode-92-primary-missing" })
    );
    assert!(
        missing_companion
            .blockers
            .iter()
            .any(|blocker| { blocker.code == "classic.edcd.opcode-92-secondary-missing" })
    );

    snapshot.extra_codes.push(crate::model::ExtraCodeRow {
        native_id: NativeRecordId(9),
        values: [6, 7, 8, 9, 10],
    });
    assert_eq!(
        classify_classic_slice(&snapshot).status,
        CompatibilityStatus::Ready
    );
}

#[test]
fn authored_monster_cannot_use_the_classic_bestiary_terminator() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-blocker".into()));
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].authored = true;
    set.monsters[0].hit_dice = u8::MAX;
    snapshot.monster_sets.push(set);

    let classification = classify_classic_slice(&snapshot);

    assert_eq!(classification.status, CompatibilityStatus::Blocked);
    assert!(
        classification
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.monster.hit-dice-terminator")
    );
}

#[test]
fn authored_battle_cannot_exceed_the_runtime_monster_limit() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-blocker".into()));
    let mut grid = vec![0; crate::codecs::BATTLE_GRID_SLOTS];
    grid[..101].fill(1);
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

    let classification = classify_classic_slice(&snapshot);

    assert_eq!(classification.status, CompatibilityStatus::Blocked);
    assert!(
        classification
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.battle.invalid")
    );
}

#[test]
fn invalid_complex_encounter_identity_is_a_classic_blocker() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complex-blocker".into()));
    let mut encounter = crate::codecs::decode_complex_encounters(&vec![
        0;
        crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES
    ])
    .records
    .remove(0);
    encounter.identity = StableId("complex-encounter:wrong".into());
    encounter.authored = true;
    snapshot.complex_encounters.push(encounter);

    assert!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.complex-encounter.invalid")
    );
}

#[test]
fn invalid_rogue_encounter_identity_is_a_classic_blocker() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-blocker".into()));
    let mut encounter =
        crate::codecs::decode_rogue_encounters(&[0; crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    encounter.identity = StableId("rogue-encounter:wrong".into());
    encounter.authored = true;
    snapshot.rogue_encounters.push(encounter);

    assert!(
        classify_classic_slice(&snapshot)
            .blockers
            .iter()
            .any(|blocker| blocker.code == "classic.rogue-encounter.invalid")
    );
}
