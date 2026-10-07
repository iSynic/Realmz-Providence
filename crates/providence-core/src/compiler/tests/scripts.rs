use super::*;

#[test]
fn timed_door_repair_compiles_only_one_owned_word_and_reimports() {
    let mut source = vec![0u8; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES + 3];
    source[0..2].copy_from_slice(&5i16.to_be_bytes());
    source[6..8].copy_from_slice(&(-1i16).to_be_bytes());
    source[20..22].copy_from_slice(&(-1i16).to_be_bytes());
    source[22..40].fill(0xa5);
    let tail_start = source.len() - 3;
    source[tail_start..].copy_from_slice(&[0xde, 0xad, 0xbe]);
    let decoded = decode_timed_encounters(&source);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-door-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:timed-door-repair-annex".into()),
    };
    snapshot.timed_encounters = decoded.records;
    let data_ed3 = vec![0u8; crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES];
    snapshot.extra_action_points = decode_extra_action_points(&data_ed3).records;
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetTimedEncounterReference {
                source: StableId("timed-encounter:0".into()),
                field: "door".into(),
                target_id: 0,
            },
        })
        .expect("retarget imported Timed Encounter door");
    let sources = ClassicCompatibilitySources {
        data_td3: Some(&source),
        data_ed3: Some(&data_ed3),
        ..Default::default()
    };
    let first = compile_classic_slice(session.snapshot(), sources).expect("compile repair");
    let second = compile_classic_slice(session.snapshot(), sources).expect("repeat repair");
    assert_eq!(first, second);
    let output = &first.get("Data TD3").expect("Data TD3 output").bytes;
    let differences = output
        .iter()
        .zip(&source)
        .enumerate()
        .filter_map(|(offset, (after, before))| (after != before).then_some(offset))
        .collect::<Vec<_>>();
    assert_eq!(differences, vec![6, 7]);
    assert_eq!(&output[22..40], &[0xa5; 18]);
    assert_eq!(&output[output.len() - 3..], &[0xde, 0xad, 0xbe]);
    assert_eq!(reimport_classic_slice(&first).timed_encounters[0].door, 0);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo imported Timed Encounter repair");
    assert_eq!(
        encode_timed_encounters(&session.snapshot().timed_encounters, Some(&source))
            .expect("encode unresolved source after undo"),
        source
    );
}

#[test]
fn extra_action_target_repair_compiles_only_one_owned_word_and_reimports() {
    let mut source = vec![0u8; crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES * 2 + 3];
    let row_start = crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES;
    source[row_start + 8..row_start + 10].copy_from_slice(&127i16.to_be_bytes());
    source[row_start + 24..row_start + 26].copy_from_slice(&2473i16.to_be_bytes());
    let tail_start = source.len() - 3;
    source[tail_start..].copy_from_slice(&[0xa5, 0x5a, 0xc3]);
    let decoded = decode_extra_action_points(&source);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("extra-action-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:extra-action-repair-annex".into()),
    };
    snapshot.extra_action_points = decoded.records;
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetActionReference {
                source: StableId("extra-action-point:1".into()),
                slot: 0,
                target_native_id: 1,
            },
        })
        .expect("retarget imported Extra Action Point");
    let sources = ClassicCompatibilitySources {
        data_ed3: Some(&source),
        ..Default::default()
    };
    let first = compile_classic_slice(session.snapshot(), sources).expect("compile repair");
    let second = compile_classic_slice(session.snapshot(), sources).expect("repeat repair");
    assert_eq!(first, second);
    let output = &first.get("Data ED3").expect("Data ED3 output").bytes;
    let differences = output
        .iter()
        .zip(&source)
        .enumerate()
        .filter_map(|(offset, (after, before))| (after != before).then_some(offset))
        .collect::<Vec<_>>();
    assert_eq!(differences, vec![row_start + 24, row_start + 25]);
    assert_eq!(&output[output.len() - 3..], &[0xa5, 0x5a, 0xc3]);
    assert_eq!(
        reimport_classic_slice(&first).extra_action_points[1].actions[0].target_native_id,
        1
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo imported Extra Action Point repair");
    let undone = compile_classic_slice(session.snapshot(), sources).expect("compile undo");
    assert_eq!(undone.get("Data ED3").expect("Data ED3 undo").bytes, source);
}

#[test]
fn scalar_extra_code_repair_compiles_only_one_owned_word_and_reimports() {
    let mut source = vec![0u8; crate::codecs::EXTRA_CODE_RECORD_BYTES * 9 + 3];
    let row_start = crate::codecs::EXTRA_CODE_RECORD_BYTES * 8;
    source[row_start..row_start + 10].copy_from_slice(&[0, 1, 0, 2, 0, 15, 0, 4, 0, 5]);
    let tail_start = source.len() - 3;
    source[tail_start..].copy_from_slice(&[0xa5, 0x5a, 0xc3]);
    let decoded = decode_extra_codes(&source);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scalar-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:scalar-repair-annex".into()),
    };
    snapshot.extra_codes = decoded.rows;
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetExtraCodeValue {
                source: StableId("extra-code:8".into()),
                index: 2,
                target_id: -7,
            },
        })
        .expect("retarget imported signed scalar");
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
    assert_eq!(differences, vec![row_start + 4, row_start + 5]);
    assert_eq!(&output[output.len() - 3..], &[0xa5, 0x5a, 0xc3]);
    assert_eq!(
        reimport_classic_slice(&first).extra_codes[8].values,
        [1, 2, -7, 4, 5]
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo imported scalar repair");
    let undone = compile_classic_slice(session.snapshot(), sources).expect("compile undo");
    assert_eq!(
        undone.get("Data EDCD").expect("Data EDCD undo").bytes,
        source
    );
}

#[test]
fn branch_repair_compiles_only_its_mode_target_pair_and_reimports() {
    let mut source = vec![0u8; crate::codecs::EXTRA_CODE_RECORD_BYTES * 9 + 3];
    let row_start = crate::codecs::EXTRA_CODE_RECORD_BYTES * 8;
    source[row_start..row_start + 10].copy_from_slice(&[0, 1, 0, 2, 0, 0, 0, 106, 0, 107]);
    let tail_start = source.len() - 3;
    source[tail_start..].copy_from_slice(&[0xa5, 0x5a, 0xc3]);
    let decoded = decode_extra_codes(&source);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("branch-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:branch-repair-annex".into()),
    };
    snapshot.extra_codes = decoded.rows;
    let mut session = EditorSession::new(snapshot);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetExtraCodeBranch {
                source: StableId("extra-code:8".into()),
                layout: crate::session::ExtraCodeBranchLayout::Choice,
                mode: 1,
                target_id: 40,
            },
        })
        .expect("retarget imported choice branch");
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
    assert_eq!(differences, vec![row_start + 3, row_start + 5]);
    assert_eq!(&output[output.len() - 3..], &[0xa5, 0x5a, 0xc3]);
    assert_eq!(
        reimport_classic_slice(&first).extra_codes[8].values,
        [1, 1, 40, 106, 107]
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo imported branch repair");
    let undone = compile_classic_slice(session.snapshot(), sources).expect("compile undo");
    assert_eq!(
        undone.get("Data EDCD").expect("Data EDCD undo").bytes,
        source
    );
}

#[test]
fn complex_encounter_compiles_deterministically_and_reimports_semantics() {
    let encounter = scripts_fixtures::complex_encounter();

    let mut snapshot =
        ProjectSnapshot::new_authored(StableId("complex-encounter-certification".into()));
    snapshot.complex_encounters.push(encounter.clone());

    let first = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("compile complex encounter");
    let second = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("repeat complex encounter compile");
    assert_eq!(first, second);
    assert_eq!(
        first.files().map(|(path, _)| path).collect::<Vec<_>>(),
        ["Data ED2"]
    );
    let data_ed2 = &first.get("Data ED2").unwrap().bytes;
    assert_eq!(
        data_ed2.len(),
        3 * crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES
    );
    assert_eq!(
        data_ed2[2 * crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES + 157],
        0
    );
    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.complex_encounters.len(), 1);
    assert_eq!(
        reimported.complex_encounters[0].native_id,
        NativeRecordId(2)
    );
    assert_eq!(reimported.complex_encounters[0].actions, encounter.actions);
    assert_eq!(reimported.complex_encounters[0].texts, encounter.texts);
    assert_eq!(reimported.complex_encounters[0].thief_fail, 7);
}

#[test]
fn rogue_encounter_compiles_deterministically_and_reimports_semantics() {
    let encounter = RogueEncounter {
        identity: StableId("rogue-encounter:2".into()),
        native_id: NativeRecordId(2),
        type_flags: [
            true, false, true, false, true, false, true, false, true, true,
        ],
        modifiers: [-1, 2, -3, 4, -5, 6, -7, 8],
        success_codes: [1, 2, 3, 4, -1, -2, -3, -4],
        failure_codes: [4, 3, 2, 1, -4, -3, -2, -1],
        success_text: [0; 8],
        failure_text: [0; 8],
        success_sounds: [0; 8],
        failure_sounds: [0; 8],
        spell: 0,
        low_damage: 3,
        high_damage: 9,
        tumblers: 4,
        prompts: [0, 0, 2],
        prompt_sounds: [0; 3],
        authored: true,
    };
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-certification".into()));
    snapshot.rogue_encounters.push(encounter.clone());

    let first = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("compile Rogue encounter");
    let second = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("repeat Rogue encounter compile");
    assert_eq!(first, second);
    assert_eq!(
        first.files().map(|(path, _)| path).collect::<Vec<_>>(),
        ["Data TD2"]
    );
    assert_eq!(
        first.get("Data TD2").unwrap().bytes.len(),
        3 * crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES
    );
    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.rogue_encounters.len(), 1);
    assert_eq!(reimported.rogue_encounters[0].native_id, NativeRecordId(2));
    assert_eq!(
        reimported.rogue_encounters[0].success_text,
        encounter.success_text
    );
    assert_eq!(reimported.rogue_encounters[0].spell, 0);
}

#[test]
fn timed_encounter_compiles_deterministically_and_reimports_semantics() {
    let encounter = TimedEncounter {
        identity: StableId("timed-encounter:2".into()),
        native_id: NativeRecordId(2),
        day: 12,
        increment: 3,
        percent: 75,
        door: 0,
        required_level: 0,
        required_random_rect: -1,
        required_x: -1,
        required_y: -1,
        required_item: 0,
        required_quest: -1,
        location_kind: crate::model::TimedEncounterLocationKind::Any,
        authored: true,
    };
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-certification".into()));
    snapshot.timed_encounters.push(encounter.clone());
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let first = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("compile Timed Encounter");
    let second = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("repeat Timed Encounter compile");
    assert_eq!(first, second);
    assert_eq!(
        first.get("Data TD3").unwrap().bytes.len(),
        3 * crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES
    );
    assert_eq!(
        &first.get("Data TD3").unwrap().bytes[2 * 40 + 22..3 * 40],
        &[0; 18]
    );
    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.timed_encounters.len(), 1);
    assert_eq!(reimported.timed_encounters[0].day, 12);
    assert_eq!(reimported.timed_encounters[0].required_random_rect, -1);
}
