use super::*;

#[test]
fn deleting_sqlite_loses_no_authored_truth_and_rebuilds_the_same_index() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let initial = snapshot("The western gate is sealed.");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    let blob = store.put_blob(b"raw source bytes").expect("store blob");
    let outcome = store
        .checkpoint(
            &initial,
            Revision(1),
            &json!({"method": "message.update", "identity": "message:12"}),
        )
        .expect("checkpoint");
    assert!(outcome.infrastructure_warning.is_none());
    let before = store.index_summary().expect("summary");
    assert_eq!(before.entities, 2);
    assert_eq!(before.journal_entries, 1);
    assert_eq!(store.search("Thornwatch", 10).unwrap().len(), 1);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_snapshot) =
        ProjectStore::open(temporary.path()).expect("reopen from portable truth");
    assert_eq!(reopened_snapshot, initial);
    assert_eq!(reopened.read_blob(&blob).unwrap(), b"raw source bytes");
    let after = reopened.index_summary().expect("rebuilt summary");
    assert_eq!(after.entities, before.entities);
    assert_eq!(after.references, before.references);
    assert_eq!(after.snapshot_sha256, before.snapshot_sha256);
    assert_eq!(after.journal_entries, 0);
}

#[test]
fn option_labels_rebuild_as_searchable_entities() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Resolved message");
    project.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:4".into()),
        native_id: NativeRecordId(4),
        text: "Take the narrow passage".into(),
        authored: true,
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    assert_eq!(store.search("narrow passage", 10).unwrap().len(), 1);
    let before = store.index_summary().unwrap();
    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) = ProjectStore::open(temporary.path()).expect("rebuild index");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn quest_labels_rebuild_as_searchable_entities() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Resolved message");
    project.quest_labels.push(QuestLabel {
        id: 9,
        label: "Eastern gate opened".into(),
        note: "Editor-only explanation".into(),
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    assert_eq!(store.search("Eastern gate", 10).unwrap().len(), 1);
    let before = store.index_summary().unwrap();
    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) = ProjectStore::open(temporary.path()).expect("rebuild index");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn player_maps_rebuild_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Resolved message");
    project.world.player_maps.push(PlayerMapRecord {
        identity: StableId("player-map:3".into()),
        native_id: NativeRecordId(3),
        markers: Vec::new(),
        start_x: 4,
        start_y: 5,
        level: 0,
        picture_id: 0,
        icon_size: 16,
        show: -12,
        is_dungeon: false,
        picture_rect: PlayerMapRect::default(),
        note: "The hidden causeway is revealed.".into(),
        authored: true,
    });
    project.player_map_names = Some(PlayerMapNameCatalog {
        source_blob: None,
        available_names: (1..=20)
            .map(|index| {
                if index == 4 {
                    "Hidden Causeway".into()
                } else {
                    format!("Known Map {index}")
                }
            })
            .collect(),
        unavailable_names: (1..=20)
            .map(|index| format!("Unknown Map {index}"))
            .collect(),
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    assert_eq!(store.search("Hidden Causeway", 10).unwrap().len(), 1);
    let before = store.index_summary().unwrap();
    assert_eq!(before.entities, 3);
    assert_eq!(before.references, 1);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) = ProjectStore::open(temporary.path()).expect("rebuild index");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn extra_action_points_rebuild_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Resolved message");
    project.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 12,
        }],
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let before = store.index_summary().expect("summary");
    assert_eq!(before.entities, 3);
    assert_eq!(before.references, 1);
    assert_eq!(store.search("Extra Action Point 40", 10).unwrap().len(), 1);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) =
        ProjectStore::open(temporary.path()).expect("rebuild from portable truth");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap().entities, 3);
    assert_eq!(reopened.index_summary().unwrap().references, 1);
}

#[test]
fn monster_catalog_rebuilds_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Resolved message");
    let mut set = providence_core::codecs::decode_monster_set(
        &vec![0; providence_core::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].display_name = "Drowned Captain".into();
    set.monsters[0].icon_id = 400;
    project.monster_sets.push(set);
    project.monster_descriptions.push(MonsterDescription {
        identity: StableId("monster-description:0".into()),
        native_id: NativeRecordId(0),
        text: "Salt-stained commander".into(),
        authored: true,
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let before = store.index_summary().expect("summary");
    assert_eq!(before.entities, 4);
    assert_eq!(before.references, 1);
    assert_eq!(store.search("Drowned Captain", 10).unwrap().len(), 1);
    assert_eq!(store.search("Salt-stained", 10).unwrap().len(), 1);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) =
        ProjectStore::open(temporary.path()).expect("rebuild from portable truth");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn battle_catalog_rebuilds_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Battle warning message");
    let mut normal = providence_core::codecs::decode_monster_set(
        &vec![0; providence_core::codecs::MONSTER_RECORD_BYTES * 2],
        "Data MD",
        0,
    );
    normal.monsters[1].display_name = "Drowned Captain".into();
    project.monster_sets.push(normal);
    let mut grid = vec![0; providence_core::codecs::BATTLE_GRID_SLOTS];
    grid[84] = -1;
    project.battles.push(BattleRecord {
        identity: StableId("battle:7".into()),
        native_id: NativeRecordId(7),
        grid,
        distance: 4,
        message_before: 12,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let before = store.index_summary().expect("summary");
    assert_eq!(store.search("Battle 7", 10).unwrap().len(), 1);
    assert_eq!(before.references, 2);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) =
        ProjectStore::open(temporary.path()).expect("rebuild from portable truth");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn treasure_catalog_rebuilds_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Treasure item warning");
    let mut item_ids = vec![0; providence_core::codecs::TREASURE_ITEM_SLOTS];
    item_ids[0] = 7;
    project.treasures.push(TreasureRecord {
        identity: StableId("treasure:4".into()),
        native_id: NativeRecordId(4),
        item_ids,
        experience: -100,
        gold: 50,
        gems: 0,
        jewelry: 0,
        authored: true,
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let before = store.index_summary().expect("summary");
    assert_eq!(store.search("Treasure 4", 10).unwrap().len(), 1);
    assert_eq!(before.references, 1);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) =
        ProjectStore::open(temporary.path()).expect("rebuild from portable truth");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn shop_catalog_rebuilds_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Shop item warning");
    let mut item_ids = vec![0; providence_core::codecs::SHOP_ITEM_SLOTS];
    item_ids[0] = 7;
    item_ids[1] = -1;
    project.shops.push(ShopRecord {
        identity: StableId("shop:4".into()),
        native_id: NativeRecordId(4),
        item_ids,
        quantities: vec![0; providence_core::codecs::SHOP_ITEM_SLOTS],
        inflation: 125,
        authored: true,
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let before = store.index_summary().expect("summary");
    assert_eq!(store.search("Shop 4", 10).unwrap().len(), 1);
    assert_eq!(before.references, 1);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) =
        ProjectStore::open(temporary.path()).expect("rebuild from portable truth");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn complex_encounters_rebuild_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Archive prompt");
    project.complex_encounters.push(ComplexEncounter {
        identity: StableId("complex-encounter:4".into()),
        native_id: NativeRecordId(4),
        actions: Vec::new(),
        action_result: 0,
        word_result: 2,
        groups: [0; 8],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: true,
        thief: false,
        max_times: 2,
        caste_success: 0,
        thief_success: 0,
        thief_fail: 0,
        prompt_message_native_id: 12,
        texts: std::array::from_fn(|slot| {
            if slot == 8 {
                "moonstone".into()
            } else {
                String::new()
            }
        }),
        authored: true,
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let before = store.index_summary().expect("summary");
    assert_eq!(store.search("moonstone", 10).unwrap().len(), 1);
    assert_eq!(before.entities, 3);
    assert_eq!(before.references, 1);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) =
        ProjectStore::open(temporary.path()).expect("rebuild from portable truth");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}

#[test]
fn rogue_encounters_rebuild_as_searchable_entities_with_derived_links() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut project = snapshot("Trap prompt");
    project.rogue_encounters.push(RogueEncounter {
        identity: StableId("rogue-encounter:4".into()),
        native_id: NativeRecordId(4),
        type_flags: [
            true, false, false, false, false, false, true, false, false, true,
        ],
        modifiers: [0; 8],
        success_codes: [0; 8],
        failure_codes: [0; 8],
        success_text: [12, 0, 0, 0, 0, 0, 0, 0],
        failure_text: [0; 8],
        success_sounds: [0; 8],
        failure_sounds: [0; 8],
        spell: 0,
        low_damage: 2,
        high_damage: 8,
        tumblers: 4,
        prompts: [12, 0, 0],
        prompt_sounds: [0; 3],
        authored: true,
    });
    let store = ProjectStore::create(temporary.path(), &project).expect("create store");
    let before = store.index_summary().expect("summary");
    assert_eq!(store.search("Rogue Encounter 4", 10).unwrap().len(), 1);
    assert_eq!(before.entities, 3);
    assert_eq!(before.references, 2);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_project) =
        ProjectStore::open(temporary.path()).expect("rebuild from portable truth");
    assert_eq!(reopened_project, project);
    assert_eq!(reopened.index_summary().unwrap(), before);
}
