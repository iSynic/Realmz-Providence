use super::*;

#[test]
fn monster_death_macro_repair_compiles_only_one_owned_word_and_reimports() {
    let (mut session, source, data_ed3) = combat_fixtures::missing_death_macro();
    let row_start = crate::codecs::MONSTER_RECORD_BYTES * 29;

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetMonsterReference {
                source: StableId("monster:0:29".into()),
                field: "deathMacro".into(),
                target_id: 1,
            },
        })
        .expect("retarget imported Monster death macro");
    let sources = ClassicCompatibilitySources {
        data_md: Some(&source),
        data_ed3: Some(&data_ed3),
        ..Default::default()
    };
    let first = compile_classic_slice(session.snapshot(), sources).expect("compile repair");
    let second = compile_classic_slice(session.snapshot(), sources).expect("repeat repair");
    assert_eq!(first, second);
    let output = &first.get("Data MD").expect("Data MD output").bytes;
    let differences = output
        .iter()
        .zip(&source)
        .enumerate()
        .filter_map(|(offset, (after, before))| (after != before).then_some(offset))
        .collect::<Vec<_>>();
    assert_eq!(differences, vec![row_start + 167]);
    assert_eq!(&output[output.len() - 3..], &[0xde, 0xad, 0xbe]);
    assert_eq!(
        reimport_classic_slice(&first).monster_sets[0].monsters[29].death_macro,
        1
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo imported Monster repair");
    assert_eq!(
        encode_monster_set(&session.snapshot().monster_sets[0], Some(&source))
            .expect("encode unresolved Monster source after undo"),
        source
    );
}

#[test]
fn battle_range_repair_compiles_only_two_owned_words_and_reimports() {
    let mut source = vec![0u8; crate::codecs::EXTRA_CODE_RECORD_BYTES * 9 + 3];
    let row_start = crate::codecs::EXTRA_CODE_RECORD_BYTES * 8;
    source[row_start..row_start + 10].copy_from_slice(&[0x03, 0x2e, 0, 0, 0, 3, 0, 4, 0, 5]);
    let tail_start = source.len() - 3;
    source[tail_start..].copy_from_slice(&[0xa5, 0x5a, 0xc3]);
    let decoded = decode_extra_codes(&source);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("range-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:range-repair-annex".into()),
    };
    snapshot.extra_codes = decoded.rows;
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetExtraCodeBattleRange {
                source: StableId("extra-code:8".into()),
                low_id: -12,
                high_id: -18,
            },
        })
        .expect("retarget imported signed Battle range");
    let sources = ClassicCompatibilitySources {
        data_edcd: Some(&source),
        ..Default::default()
    };
    let first = compile_classic_slice(session.snapshot(), sources).expect("compile repair");
    let second = compile_classic_slice(session.snapshot(), sources).expect("repeat repair");
    assert_eq!(first, second);
    let output = &first.get("Data EDCD").expect("Data EDCD output").bytes;
    let differences = output
        .iter()
        .zip(&source)
        .enumerate()
        .filter_map(|(offset, (after, before))| (after != before).then_some(offset))
        .collect::<Vec<_>>();
    assert_eq!(
        differences,
        vec![row_start, row_start + 1, row_start + 2, row_start + 3]
    );
    assert_eq!(&output[output.len() - 3..], &[0xa5, 0x5a, 0xc3]);
    assert_eq!(
        reimport_classic_slice(&first).extra_codes[8].values,
        [-12, -18, 3, 4, 5]
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo imported Battle range repair");
    let undone = compile_classic_slice(session.snapshot(), sources).expect("compile undo");
    assert_eq!(
        undone.get("Data EDCD").expect("Data EDCD undo").bytes,
        source
    );
}

#[test]
fn monster_families_compile_deterministically_and_reimport_canonical_semantics() {
    let mut normal = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    normal.monsters[0].authored = true;
    normal.monsters[0].display_name = "Drowned Captain".into();
    normal.monsters[0].hit_dice = 9;
    normal.monsters[0].missile_percent = 35;
    let mut monster = normal.clone();
    monster.set_id = 1;
    monster.native_path = "Data MD1".into();
    monster.monsters[0].identity = StableId("monster:1:0".into());
    monster.monsters[0].hit_dice = 12;
    let mut mega = normal.clone();
    mega.set_id = -1;
    mega.native_path = "Data MD-1".into();
    mega.monsters[0].identity = StableId("monster:-1:0".into());
    mega.monsters[0].hit_dice = 18;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-certification".into()));
    snapshot.monster_sets = vec![normal, monster, mega];
    snapshot.monster_descriptions = vec![crate::model::MonsterDescription {
        identity: StableId("monster-description:0".into()),
        native_id: NativeRecordId(0),
        text: "A salt-stained commander of the drowned watch.".into(),
        authored: true,
    }];

    let first = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("compile monster families");
    let second = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("repeat monster compile");
    assert_eq!(first, second);
    assert_eq!(
        first.files().map(|(path, _)| path).collect::<Vec<_>>(),
        ["Data DES", "Data MD", "Data MD-1", "Data MD1"]
    );
    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.monster_sets.len(), 3);
    assert_eq!(
        reimported.monster_sets[0].monsters[0].display_name,
        "Drowned Captain"
    );
    assert_eq!(reimported.monster_sets[1].monsters[0].hit_dice, 12);
    assert_eq!(reimported.monster_sets[2].monsters[0].hit_dice, 18);
    assert_eq!(
        reimported.monster_descriptions[0].text,
        snapshot.monster_descriptions[0].text
    );
}

#[test]
fn battle_compiles_deterministically_and_reimports_signed_grid_semantics() {
    let mut normal = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES * 2],
        "Data MD",
        0,
    );
    for monster in &mut normal.monsters {
        monster.authored = true;
    }
    normal.monsters[1].display_name = "Drowned Captain".into();
    normal.monsters[1].hit_dice = 9;
    let mut grid = vec![0; crate::codecs::BATTLE_GRID_SLOTS];
    grid[84] = -1;
    let battle = BattleRecord {
        identity: StableId("battle:3".into()),
        native_id: NativeRecordId(3),
        grid,
        distance: 6,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    };
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-certification".into()));
    snapshot.monster_sets.push(normal);
    snapshot.battles.push(battle.clone());

    let first = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("compile battle");
    let second = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("repeat battle compile");
    assert_eq!(first, second);
    assert_eq!(
        first.files().map(|(path, _)| path).collect::<Vec<_>>(),
        ["Data BD", "Data MD"]
    );
    let data_bd = &first.get("Data BD").unwrap().bytes;
    assert_eq!(data_bd.len(), 4 * crate::codecs::BATTLE_RECORD_BYTES);
    assert_eq!(data_bd[3 * crate::codecs::BATTLE_RECORD_BYTES + 339], 0);
    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.battles[3].grid[84], -1);
    assert_eq!(reimported.battles[3].distance, battle.distance);
}
