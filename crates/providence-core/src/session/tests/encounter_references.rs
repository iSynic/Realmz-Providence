use super::*;

#[test]
fn battle_links_are_typed_byte_provenanced_repairable_and_preserve_side_flip() {
    let snapshot = battle_links_snapshot();
    let mut session = EditorSession::new(snapshot);
    assert_battle_link_provenance(&session);

    let repaired = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetBattleReference {
                source: StableId("battle:2".into()),
                field: "grid[84].monster".into(),
                target_id: 1,
            },
        })
        .expect("repair monster target");
    assert_eq!(repaired.changed_entities, [StableId("battle:2".into())]);
    assert_eq!(session.snapshot().battles[0].grid[84], -1);
    assert!(session.snapshot().battles[0].authored);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetBattleReference {
                source: StableId("battle:2".into()),
                field: "messageBefore".into(),
                target_id: 4,
            },
        })
        .expect("repair message target");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::RetargetBattleReference {
                source: StableId("battle:2".into()),
                field: "battleMacro".into(),
                target_id: 6,
            },
        })
        .expect("repair macro target");
    assert_eq!(session.snapshot().battles[0].battle_macro, -6);
    assert!(
        session
            .references()
            .iter()
            .filter(|reference| reference.source.0 == "battle:2")
            .all(|reference| reference.resolution == ResolutionState::Resolved)
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::Undo,
        })
        .expect("undo macro repair");
    assert_eq!(session.snapshot().battles[0].battle_macro, 8);
}

#[test]
fn complex_encounter_references_are_byte_provenanced_repairable_and_undoable() {
    let snapshot = complex_links_snapshot();
    let mut session = EditorSession::new(snapshot);
    assert_complex_link_provenance(&session);

    assert_complex_prompt_repair(&mut session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetComplexEncounterReference {
                source: StableId("complex-encounter:2".into()),
                field: "actions[9].target".into(),
                target_id: 7,
            },
        })
        .expect("repair action target");
    assert_eq!(
        session.snapshot().complex_encounters[0].actions[0].target_native_id,
        7
    );
    assert!(session.references().iter().all(|reference| {
        reference.source != StableId("complex-encounter:2".into())
            || reference.resolution == ResolutionState::Resolved
    }));

    assert_complex_text_overflow_rejected(&mut session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo action repair");
    assert_eq!(
        session.snapshot().complex_encounters[0].actions[0].target_native_id,
        99
    );
    assert_eq!(
        session.snapshot().complex_encounters[0].prompt_message_native_id,
        7
    );
}

#[test]
fn complex_any_item_literal_is_not_an_item_record_reference() {
    let mut snapshot = complex_links_snapshot();
    snapshot.complex_encounters[0].item_ids = [9999, 888, 0, 0, 0];
    snapshot.complex_encounters[0].item_results = [4, 1, 0, 0, 0];

    let references = EditorSession::new(snapshot).references();
    assert!(!references.iter().any(|reference| {
        reference.source == StableId("complex-encounter:2".into())
            && reference.field.0 == "itemIds[0]"
    }));
    assert!(references.iter().any(|reference| {
        reference.source == StableId("complex-encounter:2".into())
            && reference.field.0 == "itemIds[1]"
            && reference.target_id == "888"
            && reference.resolution == ResolutionState::Missing
    }));
}

#[test]
fn rogue_encounter_links_are_canonical_byte_provenanced_and_undoable() {
    let snapshot = rogue_links_snapshot();
    let mut session = EditorSession::new(snapshot);
    let row_start = ROGUE_ENCOUNTER_RECORD_BYTES;

    assert!(session.references().iter().any(|reference| {
        reference.source == StableId("rogue-encounter:1".into())
            && reference.field.0 == "prompts[0]"
            && reference.resolution == ResolutionState::Missing
            && reference.byte_provenance.as_ref().is_some_and(|bytes| {
                bytes.native_path == "Data TD2"
                    && bytes.byte_start == (row_start + 106) as u32
                    && bytes.byte_end == (row_start + 108) as u32
            })
    }));
    assert!(session.references().iter().any(|reference| {
        reference.source == StableId("complex-encounter:0".into())
            && reference.field.0 == "thiefSuccess"
            && reference.resolution == ResolutionState::Resolved
    }));
    assert!(
        session
            .diagnostics()
            .iter()
            .any(|diagnostic| { diagnostic.code == "rogue-encounter.damage.inverted" })
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetRogueEncounterReference {
                source: StableId("rogue-encounter:1".into()),
                field: "prompts[0]".into(),
                target_id: 7,
            },
        })
        .expect("repair prompt");
    assert_eq!(session.snapshot().rogue_encounters[0].prompts[0], 7);
    assert!(session.snapshot().rogue_encounters[0].authored);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo prompt repair");
    assert_eq!(session.snapshot().rogue_encounters[0].prompts[0], 99);
}

#[test]
fn timed_encounter_repair_is_byte_provenanced_and_undoable() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-session".into()));
    snapshot.timed_encounters.push(TimedEncounter {
        identity: StableId("timed-encounter:2".into()),
        native_id: NativeRecordId(2),
        day: 4,
        increment: 2,
        percent: 125,
        door: 99,
        required_level: 0,
        required_random_rect: -1,
        required_x: -1,
        required_y: -1,
        required_item: 0,
        required_quest: -1,
        location_kind: crate::model::TimedEncounterLocationKind::Any,
        authored: false,
    });
    let mut session = EditorSession::new(snapshot);
    let reference = session
        .references()
        .into_iter()
        .find(|reference| reference.field.0 == "door")
        .unwrap();
    assert_eq!(reference.resolution, ResolutionState::Missing);
    assert_eq!(
        reference.byte_provenance.unwrap().byte_start,
        (2 * 40 + 6) as u32
    );
    assert!(
        session
            .diagnostics()
            .iter()
            .any(|diagnostic| diagnostic.code == "timed-encounter.percent.out-of-range")
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetTimedEncounterReference {
                source: StableId("timed-encounter:2".into()),
                field: "door".into(),
                target_id: 7,
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().timed_encounters[0].door, 7);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot().timed_encounters[0].door, 99);
}

fn battle_links_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-session".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:4".into()),
        native_id: NativeRecordId(4),
        text: "The drowned watch closes ranks.".into(),
        authored: true,
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:6".into()),
        native_id: NativeRecordId(6),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    let mut normal = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES * 2],
        "Data MD",
        0,
    );
    normal.monsters[1].hit_dice = 1;
    normal.monsters[1].display_name = "Drowned Captain".into();
    snapshot.monster_sets.push(normal);
    let mut grid = vec![0; BATTLE_GRID_SLOTS];
    grid[84] = -9;
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:2".into()),
        native_id: NativeRecordId(2),
        grid,
        distance: 4,
        message_before: -99,
        message_after: 0,
        battle_macro: 8,
        authored: false,
    });
    snapshot
}

fn complex_links_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("complex-session".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:7".into()),
        native_id: NativeRecordId(7),
        text: "The sealed archive opens.".into(),
        authored: true,
    });
    snapshot.complex_encounters.push(ComplexEncounter {
        identity: StableId("complex-encounter:2".into()),
        native_id: NativeRecordId(2),
        actions: vec![crate::model::ClassicAction {
            slot: 9,
            raw_opcode: 1,
            target_native_id: 99,
        }],
        action_result: 1,
        word_result: 2,
        groups: [1, 0, 0, 0, 0, 0, 0, 0],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [9999, -1, 0, 0, 0],
        item_results: [0; 5],
        can_back_out: true,
        thief: false,
        max_times: 2,
        caste_success: 0,
        thief_success: 0,
        thief_fail: 6,
        prompt_message_native_id: 98,
        texts: std::array::from_fn(|slot| {
            if slot == 8 {
                "moonstone".into()
            } else {
                String::new()
            }
        }),
        authored: false,
    });
    snapshot
}

fn rogue_links_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rogue-session".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:7".into()),
        native_id: NativeRecordId(7),
        text: "The trap mechanism yields.".into(),
        authored: true,
    });
    snapshot.rogue_encounters.push(RogueEncounter {
        identity: StableId("rogue-encounter:1".into()),
        native_id: NativeRecordId(1),
        type_flags: [
            true, false, false, false, false, false, true, false, false, true,
        ],
        modifiers: [0; 8],
        success_codes: [0; 8],
        failure_codes: [0; 8],
        success_text: [99, 0, 0, 0, 0, 0, 0, 0],
        failure_text: [0; 8],
        success_sounds: [0; 8],
        failure_sounds: [0; 8],
        spell: 2712,
        low_damage: 9,
        high_damage: 3,
        tumblers: 4,
        prompts: [99, 0, 2],
        prompt_sounds: [0; 3],
        authored: false,
    });
    let mut complex =
        crate::codecs::decode_complex_encounters(&vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    complex.thief = true;
    complex.thief_success = 1;
    complex.authored = true;
    snapshot.complex_encounters.push(complex);
    snapshot
}

fn assert_battle_link_provenance(session: &EditorSession) {
    let references = session.references();
    let monster = references
        .iter()
        .find(|reference| reference.field.0 == "grid[84].monster")
        .expect("monster reference");
    assert_eq!(monster.target_kind, TargetKind::Monster);
    assert_eq!(monster.target_id, "monster:0:9");
    assert_eq!(monster.resolution, ResolutionState::Missing);
    assert_eq!(monster.byte_provenance.as_ref().unwrap().byte_start, 860);
    let before = references
        .iter()
        .find(|reference| reference.field.0 == "messageBefore")
        .expect("before-message reference");
    assert!(!before.required);
    assert_eq!(before.target_id, "99");
    assert_eq!(before.byte_provenance.as_ref().unwrap().byte_start, 1032);
    let macro_reference = references
        .iter()
        .find(|reference| reference.field.0 == "battleMacro")
        .expect("battle macro reference");
    assert_eq!(macro_reference.target_kind, TargetKind::ExtraActionPoint);
    assert_eq!(macro_reference.target_id, "8");
    assert_eq!(
        macro_reference.byte_provenance.as_ref().unwrap().byte_start,
        1036
    );
    assert!(
        session
            .diagnostics()
            .iter()
            .any(|diagnostic| diagnostic.code == "battle.macro.positive-import")
    );
}

fn assert_complex_link_provenance(session: &EditorSession) {
    let row_start = 2 * COMPLEX_ENCOUNTER_RECORD_BYTES;
    let references = session.references();
    assert!(
        !references
            .iter()
            .any(|reference| reference.field.0.starts_with("itemIds["))
    );
    assert!(references.iter().any(|reference| {
        reference.field.0 == "promptMessage"
            && reference.resolution == ResolutionState::Missing
            && reference.byte_provenance.as_ref().is_some_and(|bytes| {
                bytes.native_path == "Data ED2"
                    && bytes.byte_start == (row_start + 158) as u32
                    && bytes.byte_end == (row_start + 160) as u32
            })
    }));
    assert!(session.diagnostics().iter().any(|diagnostic| {
        diagnostic.code == "complex-encounter.rogue-reset.unconsumed"
            && diagnostic.severity == Severity::Information
    }));
    assert!(references.iter().any(|reference| {
        reference.field.0 == "actions[9].target"
            && reference.target_kind == TargetKind::Message
            && reference.byte_provenance.as_ref().is_some_and(|bytes| {
                bytes.byte_start == (row_start + 50) as u32
                    && bytes.byte_end == (row_start + 52) as u32
            })
    }));
}

fn assert_complex_text_overflow_rejected(session: &mut EditorSession) {
    let mut invalid = session.snapshot().complex_encounters[0].clone();
    invalid.texts[0] = "x".repeat(40);
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::UpdateComplexEncounter {
                encounter: Box::new(invalid),
            },
        })
        .expect_err("lossy text must fail");
    assert!(matches!(
        error,
        SessionError::InvalidComplexEncounter { .. }
    ));
    assert_eq!(session.revision(), Revision(2));
    assert_eq!(session.snapshot().complex_encounters[0].texts[0], "");
}

fn assert_complex_prompt_repair(session: &mut EditorSession) {
    let prompt = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetComplexEncounterReference {
                source: StableId("complex-encounter:2".into()),
                field: "promptMessage".into(),
                target_id: 7,
            },
        })
        .expect("repair prompt");
    assert_eq!(
        prompt.changed_entities,
        [StableId("complex-encounter:2".into())]
    );
    assert_eq!(
        session.snapshot().complex_encounters[0].prompt_message_native_id,
        7
    );
    assert!(session.snapshot().complex_encounters[0].authored);
}
