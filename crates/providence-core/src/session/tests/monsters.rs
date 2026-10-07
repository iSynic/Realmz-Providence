use super::*;

#[test]
fn certified_monster_suffix_is_never_reused_as_an_authoring_slot() {
    assert_monster_suffix_guard(
        "griloch-tail-guard",
        "Data MD",
        0,
        175,
        "6a1496e62e7c0b96c4d5b6e532c2a8c8d99fdbbd54048b73ba386dbb2e43df6d",
        52_710,
    );
    assert_monster_suffix_guard(
        "griloch-strong-tail-guard",
        "Data MD1",
        1,
        171,
        "176c493a4e21e420eded7370fadd2eb298629ef17ed1618459f9526373ff6c99",
        36_750,
    );
    assert_monster_suffix_guard(
        "bywater-tail-guard",
        "Data MD",
        0,
        137,
        "b1badaf44c9e48f51f143310bce20b28a18f779b1e4fb9914993885e40c746bf",
        32_550,
    );
    assert_monster_suffix_guard(
        "prelude-mega-tail-guard",
        "Data MD-1",
        -1,
        171,
        "d36b2de09c45d27fed70617f27cbecb88b0678e7367104f99c563f984a24db2f",
        36_120,
    );
}

fn assert_monster_suffix_guard(
    project_id: &str,
    native_path: &str,
    set_id: i16,
    first_suffix_row: u32,
    digest: &str,
    byte_length: u64,
) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId(project_id.into()));
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: native_path.into(),
        blob: BlobId(digest.into()),
        byte_length,
    });
    let mut session = EditorSession::new(snapshot);
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMonster {
                set_id,
                native_id: NativeRecordId(first_suffix_row),
            },
        })
        .expect_err("certified foreign suffix cannot become a monster row");
    assert!(
        error
            .to_string()
            .contains("preserved compatibility payload")
    );
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().monster_sets.is_empty());
}

#[test]
fn monster_death_action_is_typed_byte_provenanced_repairable_and_undoable() {
    let snapshot = monster_reference_snapshot();
    let mut session = EditorSession::new(snapshot);
    assert_monster_reference_provenance(&session);

    let repaired = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetMonsterReference {
                source: StableId("monster:0:0".into()),
                field: "deathMacro".into(),
                target_id: 77,
            },
        })
        .expect("repair death action");
    assert_eq!(repaired.changed_entities, [StableId("monster:0:0".into())]);
    assert!(repaired.affected_diagnostics.is_empty());
    assert!(
        repaired
            .reference_changes
            .iter()
            .any(|reference| reference.field.0 == "deathMacro"
                && reference.resolution == ResolutionState::Resolved)
    );
    assert!(session.snapshot().monster_sets[0].monsters[0].authored);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo repair");
    assert_eq!(
        session.snapshot().monster_sets[0].monsters[0].death_macro,
        99
    );
}

#[test]
fn negative_monster_icon_id_is_missing_not_a_stock_fallback_alias() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("negative-icon".into()));
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].icon_id = -400;
    snapshot.monster_sets.push(set);

    let reference = references_for(&snapshot)
        .into_iter()
        .find(|reference| reference.field.0 == "icon")
        .expect("typed monster icon reference");

    assert_eq!(reference.target_id, "-400");
    assert_eq!(reference.resolution, ResolutionState::Missing);
    assert!(reference.stock_fallback.is_none());
}

#[test]
fn monster_lifecycle_is_revisioned_bounded_and_keeps_battle_repair_explicit() {
    let snapshot = battle_monsters_snapshot();
    let mut session = EditorSession::new(snapshot);

    create_and_duplicate_monster_with_description(&mut session);

    assert_monster_allocation_rejections_are_atomic(&mut session);

    switch_monster_payloads_without_retargeting_battles(&mut session);

    generate_and_check_saturated_variants(&mut session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(4),
            command: EditorCommand::ClearMonster {
                set_id: 0,
                native_id: NativeRecordId(1),
            },
        })
        .expect("clear record without silently rewriting battles");
    assert_eq!(session.snapshot().battles[0].grid[..2], [1, -2]);
    assert_eq!(
        monster_for_set(session.snapshot(), 0, NativeRecordId(1))
            .unwrap()
            .hit_dice,
        0
    );
    assert!(session.references().iter().any(|reference| {
        reference.source.0 == "battle:0"
            && reference.field.0 == "grid[0].monster"
            && reference.resolution == ResolutionState::Missing
    }));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(5),
            command: EditorCommand::RewriteBattleMonsterReferences {
                rewrite: BattleMonsterReferenceRewrite::Replace {
                    from_id: 1,
                    to_id: 2,
                },
            },
        })
        .expect("repair battle placements explicitly");
    assert_eq!(session.snapshot().battles[0].grid[..2], [2, -2]);
    assert!(session.snapshot().battles[0].authored);

    assert_monster_copy_to_all_sets(&mut session);
}

#[test]
fn monster_library_copy_is_one_atomic_revision_with_explicit_replacement() {
    let snapshot = ProjectSnapshot::new_authored(StableId("monster-library-copy".into()));
    let mut session = EditorSession::new(snapshot);
    let template = bell_keeper_template();

    let copied = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyMonsterLibraryTemplate {
                target_id: NativeRecordId(42),
                template: Box::new(template.clone()),
                description: "Guards the western bell.".into(),
                mode: crate::monster_library::MonsterLibraryCopyMode::GenerateVariants,
                replace: false,
            },
        })
        .expect("copy and generate variants atomically");
    assert_eq!(copied.revision, Revision(1));
    assert_eq!(copied.changed_entities_total, 4);
    assert_copied_template_variants_and_lore(&session);

    let before = session.snapshot().clone();
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplyMonsterLibraryTemplate {
                target_id: NativeRecordId(42),
                template: Box::new(template.clone()),
                description: "Replacement".into(),
                mode: crate::monster_library::MonsterLibraryCopyMode::Normal,
                replace: false,
            },
        }),
        Err(SessionError::InvalidMonster { .. })
    ));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(1));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplyMonsterLibraryTemplate {
                target_id: NativeRecordId(42),
                template: Box::new(template),
                description: "Replacement".into(),
                mode: crate::monster_library::MonsterLibraryCopyMode::ExactAllSets,
                replace: true,
            },
        })
        .expect("explicit replacement");
    assert_eq!(session.revision(), Revision(2));
    assert_eq!(
        monster_for_set(session.snapshot(), -1, NativeRecordId(42))
            .unwrap()
            .hit_dice,
        8
    );
}

fn monster_reference_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-session".into()));
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:77".into()),
        native_id: NativeRecordId(77),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].death_macro = 99;
    set.monsters[0].items[0] = 5;
    set.monsters[0].items[1] = -6;
    set.monsters[0].spells[0] = 10;
    set.monsters[0].icon_id = 400;
    set.monsters[0].weapon = -1;
    snapshot.monster_sets.push(set);
    snapshot
}

fn battle_monsters_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-lifecycle".into()));
    let mut first = authored_monster(NativeRecordId(1), 0);
    first.display_name = "Ash Tyrant".into();
    first.hit_dice = 250;
    first.stamina_bonus = 250;
    first.agility = 254;
    first.movement_max = 254;
    first.armor = 120;
    first.magic_resistance = 120;
    first.damage_bonus = 126;
    first.saves.fill(120);
    first.spell_points = 800;
    first.max_spell_points = 850;
    first.experience = 30_000;
    let mut second = authored_monster(NativeRecordId(2), 0);
    second.display_name = "Bog Watcher".into();
    snapshot.monster_sets.push(MonsterSet {
        set_id: 0,
        native_path: "Data MD".into(),
        monsters: vec![first, second],
    });
    snapshot.monster_descriptions = vec![
        authored_monster_description(NativeRecordId(1), "First lore".into()),
        authored_monster_description(NativeRecordId(2), "Second lore".into()),
    ];
    let mut grid = vec![0; BATTLE_GRID_SLOTS];
    grid[0] = 1;
    grid[1] = -2;
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:0".into()),
        native_id: NativeRecordId(0),
        grid,
        distance: 0,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: false,
    });
    snapshot
}

fn assert_monster_reference_provenance(session: &EditorSession) {
    let references = session.references();
    let reference = references
        .iter()
        .find(|reference| reference.field.0 == "deathMacro")
        .expect("typed death-action reference");
    assert_eq!(reference.target_kind, TargetKind::ExtraActionPoint);
    assert_eq!(reference.resolution, ResolutionState::Missing);
    assert_eq!(reference.byte_provenance.as_ref().unwrap().byte_start, 166);
    for (field, kind, byte_start) in [
        ("items[0]", TargetKind::Item, 84),
        ("items[1]", TargetKind::Item, 86),
        ("weapon", TargetKind::Item, 96),
        ("spells[0]", TargetKind::Spell, 64),
        ("icon", TargetKind::Icon, 98),
    ] {
        let reference = references
            .iter()
            .find(|reference| reference.field.0 == field)
            .expect("typed monster field reference");
        assert_eq!(reference.target_kind, kind);
        assert_eq!(reference.resolution, ResolutionState::StockFallback);
        assert_eq!(
            reference.byte_provenance.as_ref().unwrap().byte_start,
            byte_start
        );
    }
    let signed_item = references
        .iter()
        .find(|reference| reference.field.0 == "items[1]")
        .expect("signed monster item reference");
    assert_eq!(signed_item.target_id, "6");
    assert_eq!(session.snapshot().monster_sets[0].monsters[0].items[1], -6);
}

fn create_and_duplicate_monster_with_description(session: &mut EditorSession) {
    let created = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMonster {
                set_id: 0,
                native_id: NativeRecordId(3),
            },
        })
        .expect("create monster");
    assert_eq!(created.changed_entities_total, 2);
    assert_eq!(
        monster_for_set(session.snapshot(), 0, NativeRecordId(3))
            .unwrap()
            .display_name,
        "Monster 3"
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::DuplicateMonster {
                set_id: 0,
                source_id: NativeRecordId(1),
                target_id: NativeRecordId(4),
            },
        })
        .expect("duplicate monster and description");
    assert_eq!(
        monster_for_set(session.snapshot(), 0, NativeRecordId(4))
            .unwrap()
            .display_name,
        "Ash Tyrant"
    );
    assert_eq!(
        session
            .snapshot()
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == NativeRecordId(4))
            .unwrap()
            .text,
        "First lore"
    );
}

fn assert_monster_allocation_rejections_are_atomic(session: &mut EditorSession) {
    let before_rejected = session.snapshot().clone();
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::DuplicateMonster {
                set_id: 0,
                source_id: NativeRecordId(1),
                target_id: NativeRecordId(2),
            },
        }),
        Err(SessionError::InvalidMonster { .. })
    ));
    assert_eq!(session.revision(), Revision(2));
    assert_eq!(session.snapshot(), &before_rejected);
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::CreateMonster {
                set_id: 0,
                native_id: NativeRecordId(32_768),
            },
        }),
        Err(SessionError::InvalidMonster { .. })
    ));
    assert_eq!(session.revision(), Revision(2));
    assert_eq!(session.snapshot(), &before_rejected);
}

fn switch_monster_payloads_without_retargeting_battles(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::SwitchMonsterRecords {
                set_id: 0,
                first_id: NativeRecordId(1),
                second_id: NativeRecordId(2),
            },
        })
        .expect("switch monster payloads and descriptions");
    assert_eq!(session.snapshot().battles[0].grid[..2], [1, -2]);
    assert_eq!(
        monster_for_set(session.snapshot(), 0, NativeRecordId(2))
            .unwrap()
            .display_name,
        "Ash Tyrant"
    );
    assert_eq!(
        session
            .snapshot()
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == NativeRecordId(1))
            .unwrap()
            .text,
        "Second lore"
    );
}

fn generate_and_check_saturated_variants(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::GenerateMonsterVariants {
                native_id: NativeRecordId(2),
            },
        })
        .expect("generate Monster and Mega variants");
    let monster_variant = monster_for_set(session.snapshot(), 1, NativeRecordId(2)).unwrap();
    assert_eq!(monster_variant.hit_dice, 255);
    assert_eq!(monster_variant.stamina_bonus, 255);
    assert_eq!(monster_variant.agility, 255);
    assert_eq!(monster_variant.armor, 127);
    assert_eq!(monster_variant.damage_bonus, 127);
    assert_eq!(monster_variant.saves, vec![127; 6]);
    assert_eq!(monster_variant.spell_points, 999);
    assert_eq!(monster_variant.max_spell_points, 999);
    assert_eq!(monster_variant.experience, 32_767);
    let mega_variant = monster_for_set(session.snapshot(), -1, NativeRecordId(2)).unwrap();
    assert_eq!(mega_variant.hit_dice, 255);
    assert_eq!(mega_variant.magic_resistance, 127);
    assert_eq!(mega_variant.spell_points, 999);
}

fn assert_copied_template_variants_and_lore(session: &EditorSession) {
    let normal = monster_for_set(session.snapshot(), 0, NativeRecordId(42)).unwrap();
    assert_eq!(normal.display_name, "Bell Keeper");
    assert_eq!(normal.hit_dice, 8);
    assert_eq!(
        monster_for_set(session.snapshot(), 1, NativeRecordId(42))
            .unwrap()
            .hit_dice,
        14
    );
    assert_eq!(
        monster_for_set(session.snapshot(), -1, NativeRecordId(42))
            .unwrap()
            .hit_dice,
        23
    );
    assert_eq!(
        session
            .snapshot()
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == NativeRecordId(42))
            .unwrap()
            .text,
        "Guards the western bell."
    );
}

fn assert_monster_copy_to_all_sets(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(6),
            command: EditorCommand::CopyMonsterToAllSets {
                source_set_id: 1,
                native_id: NativeRecordId(2),
            },
        })
        .expect("copy the selected record exactly to all three sets");
    let copied_hit_dice = monster_for_set(session.snapshot(), 0, NativeRecordId(2))
        .unwrap()
        .hit_dice;
    assert_eq!(copied_hit_dice, 255);
    assert_eq!(
        monster_for_set(session.snapshot(), -1, NativeRecordId(2))
            .unwrap()
            .hit_dice,
        copied_hit_dice
    );
}

fn bell_keeper_template() -> crate::model::MonsterRecord {
    let mut template = authored_monster(NativeRecordId(7), 0);
    template.display_name = "Bell Keeper".into();
    template.hit_dice = 8;
    template.stamina_bonus = 3;
    template.spell_points = 12;
    template.experience = 80;

    template
}
