use super::*;
use crate::codecs::{decode_extra_codes, encode_extra_codes};
use crate::model::{ActionPoint, ComplexEncounter, ExtraActionPoint, LevelType, SimpleEncounter};
use crate::session::{
    ChangeProjection, EditorCommand, EditorSession, ExpectedRevisionCommand, Revision,
};
use crate::validation::action_settings;

fn action(opcode: i16, target: i16) -> ClassicAction {
    ClassicAction {
        slot: 0,
        raw_opcode: opcode,
        target_native_id: target,
    }
}

fn extra(id: u32, opcode: i16, target: i16) -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId(format!("extra-action-point:{id}")),
        native_id: NativeRecordId(id),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 73,
        actions: vec![action(opcode, target)],
    }
}

fn project(opcode: i16, target: i16) -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("settings-apply".into()));
    snapshot.extra_action_points.push(extra(0, opcode, target));
    snapshot
}

fn edit(target: i16, paired: bool) -> ActionSettingsEdit {
    ActionSettingsEdit {
        source: StableId("extra-action-point:0".into()),
        slot: 0,
        target_native_id: target,
        values: [i16::MIN, -2, 0, 1, i16::MAX],
        secondary_values: paired.then_some([1, 2, 3, 4, 5]),
        allow_shared_updates: false,
        scope: super::super::ActionSettingsWriteScope::Isolate,
        guard: None,
    }
}

fn command(edit: ActionSettingsEdit) -> EditorCommand {
    EditorCommand::ApplyActionSettings { edit }
}

fn run(session: &mut EditorSession, command: EditorCommand) -> ChangeProjection {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command,
        })
        .unwrap()
}

fn reject(session: &mut EditorSession, edit: ActionSettingsEdit, expected: &str) {
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: command(edit),
        })
        .unwrap_err();
    assert!(error.to_string().contains(expected), "{error}");
    assert_eq!(
        serde_json::to_value(session.persisted_state()).unwrap(),
        before
    );
}

fn history_round_trip(session: &mut EditorSession, before: &ProjectSnapshot) {
    let after = session.snapshot().clone();
    assert_eq!(session.undo_history().len(), 1);
    run(session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), before);
    run(session, EditorCommand::Redo);
    assert_eq!(session.snapshot(), &after);
}

#[test]
fn complete_pair_is_one_command_with_exact_undo_and_signed_boundary_values() {
    for target in [0, 32767] {
        for existing in [0, 1, 2] {
            let mut snapshot = project(-92, -1);
            for id in 0..existing {
                snapshot.extra_codes.push(ExtraCodeRow {
                    native_id: NativeRecordId(target as u32 + id),
                    values: [7; 5],
                });
            }
            let mut session = EditorSession::new(snapshot);
            let before = session.snapshot().clone();
            let edit = edit(target, true);
            let delta = run(&mut session, command(edit.clone()));
            assert_eq!(delta.previous_revision, Revision(0));
            assert_eq!(delta.revision, Revision(1));
            assert_eq!(delta.changed_entities_total, 3);
            assert!(!delta.truncated);
            let expected = vec![
                ExtraCodeRow {
                    native_id: NativeRecordId(target as u32),
                    values: edit.values,
                },
                ExtraCodeRow {
                    native_id: NativeRecordId(target as u32 + 1),
                    values: edit.secondary_values.unwrap(),
                },
            ];
            assert_eq!(session.snapshot().extra_codes, expected);
            let mut expected_caller = before.extra_action_points[0].clone();
            expected_caller.actions[0].target_native_id = target;
            assert_eq!(session.snapshot().extra_action_points, [expected_caller]);
            assert!(action_settings::diagnostics(session.snapshot()).is_empty());
            history_round_trip(&mut session, &before);
        }
    }
}

fn owner_projects() -> Vec<(ProjectSnapshot, StableId, u8)> {
    let mut cases = Vec::new();
    for level_type in [LevelType::Land, LevelType::Dungeon] {
        let mut snapshot = project(-23, 90);
        snapshot.extra_action_points.clear();
        let identity = StableId(format!("placed:{level_type:?}"));
        snapshot.world.action_points.push(ActionPoint {
            identity: identity.clone(),
            level_type,
            level_index: 4,
            record_index: 5,
            classic_door_id: -4,
            coordinate: None,
            post_action_level: 3,
            post_action_x: 2,
            post_action_y: 1,
            chance_percent: 89,
            actions: vec![ClassicAction {
                slot: 7,
                ..action(-23, 90)
            }],
        });
        cases.push((snapshot, identity, 7));
    }
    let mut snapshot = project(-23, 90);
    snapshot.extra_action_points[0].actions[0].slot = 7;
    cases.push((snapshot, StableId("extra-action-point:0".into()), 7));
    let mut snapshot = project(-23, 90);
    snapshot.extra_action_points.clear();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple:1".into()),
        native_id: NativeRecordId(1),
        actions: vec![ClassicAction {
            slot: 31,
            ..action(-23, 90)
        }],
        choice_results: [4, 0, 0, 0],
        can_back_out: true,
        max_times: 3,
        caste_success: 7,
        prompt_message_native_id: 2,
        texts: ["Open".into(), "".into(), "".into(), "".into()],
        authored: false,
    });
    cases.push((snapshot.clone(), StableId("simple:1".into()), 31));
    snapshot.simple_encounters.clear();
    snapshot.complex_encounters.push(ComplexEncounter {
        identity: StableId("complex:1".into()),
        native_id: NativeRecordId(1),
        actions: vec![ClassicAction {
            slot: 31,
            ..action(-23, 90)
        }],
        action_result: 1,
        word_result: 0,
        groups: [0; 8],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: true,
        thief: false,
        max_times: 2,
        caste_success: 5,
        thief_success: 3,
        thief_fail: 2,
        prompt_message_native_id: 7,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    });
    cases.push((snapshot, StableId("complex:1".into()), 31));
    cases
}

#[test]
fn every_canonical_owner_repairs_its_last_slot_without_changing_other_fields() {
    for (snapshot, source, slot) in owner_projects() {
        let mut session = EditorSession::new(snapshot);
        let before = session.snapshot().clone();
        let edit = ActionSettingsEdit {
            source,
            slot,
            ..edit(3, false)
        };
        let delta = run(&mut session, command(edit.clone()));
        assert_eq!(delta.changed_entities_total, 2);
        let mut expected = before.clone();
        if let Some(owner) = expected.world.action_points.first_mut() {
            owner.actions[0].target_native_id = 3;
        }
        if let Some(owner) = expected.extra_action_points.first_mut() {
            owner.actions[0].target_native_id = 3;
        }
        if let Some(owner) = expected.simple_encounters.first_mut() {
            owner.actions[0].target_native_id = 3;
            owner.authored = true;
        }
        if let Some(owner) = expected.complex_encounters.first_mut() {
            owner.actions[0].target_native_id = 3;
            owner.authored = true;
        }
        expected.extra_codes.push(ExtraCodeRow {
            native_id: NativeRecordId(3),
            values: edit.values,
        });
        assert_eq!(session.snapshot(), &expected);
        history_round_trip(&mut session, &before);
    }
}

#[test]
fn guided_random_area_repair_supports_each_owner_and_preserves_its_complete_record() {
    use crate::action_settings_repair as repair;
    for (mut snapshot, source, slot) in owner_projects() {
        for owner in &mut snapshot.world.action_points {
            owner.actions[0].raw_opcode = -92;
        }
        for owner in &mut snapshot.extra_action_points {
            owner.actions[0].raw_opcode = -92;
        }
        for owner in &mut snapshot.simple_encounters {
            owner.actions[0].raw_opcode = -92;
        }
        for owner in &mut snapshot.complex_encounters {
            owner.actions[0].raw_opcode = -92;
        }
        snapshot.world.maps.push(serde_json::from_value(serde_json::json!({
            "identity":"land:1","levelType":"land","nativeIndex":1,"name":"North road","tiles":[],
            "runtime":{"source":"authored","sourceBlob":null,"dark":false,"usesLos":false,
                "landlook":null,"baseScale":null,"tilesetId":"test-tiles","baseTile":null,
                "randomRectangles":[{"identity":"land:1:rect:3","top":1,"left":2,"bottom":3,"right":4,
                    "chanceTenThousand":500,"battleRange":[0,0],"randomDoors":[0,0,0],"randomDoorPercent":[0,0,0],
                    "only":false,"option":0,"soundId":0,"textId":0}]}
        })).unwrap());
        let mut session = EditorSession::new(snapshot);
        let before = session.snapshot().clone();
        let mut draft = repair::prepare(&before, Revision(0), source, slot).unwrap();
        for (field, value) in [
            ("mapKind", "land"),
            ("map", "land:1"),
            ("area", "land:1:rect:3"),
            ("chanceAdjustment", "2.50"),
            ("shapeMode", "0"),
            ("bound0", "9"),
            ("bound1", "18"),
            ("bound2", "13"),
            ("bound3", "24"),
        ] {
            repair::change(&before, &mut draft, field, value).unwrap();
        }
        let (edit, intent) = repair::plan(&before, Revision(0), &draft).unwrap();
        run(&mut session, command(edit));
        let mut expected = before.clone();
        expected.extra_codes.extend([
            ExtraCodeRow {
                native_id: NativeRecordId(90),
                values: [1, 3, 0, 250, 0],
            },
            ExtraCodeRow {
                native_id: NativeRecordId(91),
                values: [9, 18, 13, 24, 0],
            },
        ]);
        if let Some(owner) = expected.simple_encounters.first_mut() {
            owner.authored = true;
        }
        if let Some(owner) = expected.complex_encounters.first_mut() {
            owner.authored = true;
        }
        assert_eq!(session.snapshot(), &expected);
        assert_eq!(
            repair::reconcile(session.snapshot(), session.revision(), &intent, true),
            repair::RepairOutcome::MatchesRepair
        );
        history_round_trip(&mut session, &before);
    }
}

#[test]
fn invalid_callers_payloads_and_stale_revisions_leave_snapshot_and_both_histories_exact() {
    let mut session = EditorSession::new(project(92, 0));
    run(&mut session, command(edit(0, true)));
    run(&mut session, EditorCommand::Undo);
    reject(&mut session, edit(-1, true), "nonnegative");
    reject(&mut session, edit(1, false), "complete secondary");
    reject(
        &mut session,
        ActionSettingsEdit {
            source: StableId("absent".into()),
            ..edit(1, true)
        },
        "missing or ambiguous",
    );
    reject(
        &mut session,
        ActionSettingsEdit {
            slot: 8,
            ..edit(1, true)
        },
        "out of range",
    );
    reject(
        &mut session,
        ActionSettingsEdit {
            slot: 1,
            ..edit(1, true)
        },
        "does not exist",
    );
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: command(edit(0, true)),
        }),
        Err(SessionError::RevisionConflict { .. })
    ));
    assert_eq!(
        serde_json::to_value(session.persisted_state()).unwrap(),
        before
    );
    for opcode in [0, 39, -14, i16::MIN] {
        reject(
            &mut EditorSession::new(project(opcode, 0)),
            edit(1, false),
            "does not use editable",
        );
    }
    reject(
        &mut EditorSession::new(project(15, 0)),
        edit(1, true),
        "does not use secondary",
    );
    let mut duplicate = project(92, 0);
    duplicate
        .extra_action_points
        .push(duplicate.extra_action_points[0].clone());
    reject(
        &mut EditorSession::new(duplicate),
        edit(1, true),
        "missing or ambiguous",
    );
    let mut duplicate = project(92, 0);
    duplicate.extra_action_points[0].actions.push(action(92, 0));
    reject(
        &mut EditorSession::new(duplicate),
        edit(1, true),
        "slot is ambiguous",
    );
    let mut duplicate = project(92, 0);
    duplicate.extra_codes = vec![
        ExtraCodeRow {
            native_id: NativeRecordId(2),
            values: [3; 5]
        };
        2
    ];
    reject(
        &mut EditorSession::new(duplicate),
        edit(1, true),
        "settings #2 are ambiguous",
    );
    let (mut padding, source, slot) = owner_projects().remove(3);
    padding.simple_encounters[0].texts[0].clear();
    reject(
        &mut EditorSession::new(padding),
        ActionSettingsEdit {
            source,
            slot,
            ..edit(1, false)
        },
        "padding",
    );
}

#[test]
fn guided_random_message_repair_preserves_each_complete_caller_and_undo_history() {
    use crate::action_settings_repair as repair;
    use crate::model::ScenarioMessage;

    for (mut snapshot, source, slot) in owner_projects() {
        for actions in snapshot
            .world
            .action_points
            .iter_mut()
            .map(|owner| &mut owner.actions)
            .chain(
                snapshot
                    .extra_action_points
                    .iter_mut()
                    .map(|owner| &mut owner.actions),
            )
            .chain(
                snapshot
                    .simple_encounters
                    .iter_mut()
                    .map(|owner| &mut owner.actions),
            )
            .chain(
                snapshot
                    .complex_encounters
                    .iter_mut()
                    .map(|owner| &mut owner.actions),
            )
        {
            actions[0].raw_opcode = -19;
        }
        snapshot.messages.extend((2..=4).map(|id| ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("Authored message {id}"),
            authored: true,
        }));
        let mut session = EditorSession::new(snapshot);
        let before = session.snapshot().clone();
        let mut draft = repair::prepare_random_message(&before, Revision(0), source, slot).unwrap();
        repair::change(&before, &mut draft, "firstMessage", "2").unwrap();
        repair::change(&before, &mut draft, "lastMessage", "4").unwrap();
        let (edit, intent) = repair::plan(&before, Revision(0), &draft).unwrap();
        let delta = run(&mut session, command(edit));
        assert_eq!(delta.changed_entities_total, 2);
        let mut expected = before.clone();
        expected.extra_codes.push(ExtraCodeRow {
            native_id: NativeRecordId(90),
            values: [2, 4, 0, 0, 0],
        });
        if let Some(owner) = expected.simple_encounters.first_mut() {
            owner.authored = true;
        }
        if let Some(owner) = expected.complex_encounters.first_mut() {
            owner.authored = true;
        }
        assert_eq!(session.snapshot(), &expected);
        assert_eq!(
            repair::reconcile(session.snapshot(), session.revision(), &intent, true),
            repair::RepairOutcome::MatchesRepair
        );
        history_round_trip(&mut session, &before);
    }
}

#[test]
fn shared_rows_are_isolated_but_exact_reuse_preserves_the_reference() {
    for missing in [true, false] {
        let mut snapshot = project(15, 4);
        snapshot.extra_action_points.push(extra(1, -16, 4));
        if !missing {
            snapshot.extra_codes.push(ExtraCodeRow {
                native_id: NativeRecordId(4),
                values: [0; 5],
            });
        }
        let before = snapshot.clone();
        let mut session = EditorSession::new(snapshot);
        reject(
            &mut session,
            ActionSettingsEdit {
                allow_shared_updates: true,
                ..edit(4, false)
            },
            "legacy shared-write request is unsupported",
        );
        run(&mut session, command(edit(4, false)));
        assert_eq!(
            session.snapshot().extra_action_points[1],
            before.extra_action_points[1]
        );
        for row in &before.extra_codes {
            assert!(session.snapshot().extra_codes.contains(row));
        }
        history_round_trip(&mut session, &before);
        let target = session.snapshot().extra_action_points[0].actions[0].target_native_id;
        let delta = run(&mut session, command(edit(target, false)));
        assert_eq!(
            delta.changed_entities,
            [StableId("extra-action-point:0".into())]
        );
    }
}

#[test]
fn secondary_conflict_rejects_before_primary_write_and_separation_preserves_old_rows_and_callers() {
    let mut snapshot = project(92, 4);
    snapshot.extra_action_points.push(extra(1, 15, 5));
    snapshot.extra_codes = vec![
        ExtraCodeRow {
            native_id: NativeRecordId(4),
            values: [4; 5],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(5),
            values: [5; 5],
        },
    ];
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    reject(
        &mut session,
        ActionSettingsEdit {
            allow_shared_updates: true,
            ..edit(4, true)
        },
        "legacy shared-write request is unsupported",
    );
    let delta = run(&mut session, command(edit(9, true)));
    assert!(
        delta
            .affected_entities
            .contains(&StableId("extra-action-point:1".into()))
    );
    assert_eq!(&session.snapshot().extra_codes[..2], before.extra_codes);
    assert_eq!(
        session.snapshot().extra_action_points[1],
        before.extra_action_points[1]
    );
    assert!(action_settings::diagnostics(session.snapshot()).is_empty());
    history_round_trip(&mut session, &before);
}

#[test]
fn paired_local_edit_keeps_all_other_callers_and_bounds_the_projection() {
    let mut snapshot = project(92, 3);
    snapshot
        .extra_action_points
        .extend((1..260).map(|id| extra(id, -92, 3)));
    let before = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    reject(
        &mut session,
        ActionSettingsEdit {
            allow_shared_updates: true,
            ..edit(3, true)
        },
        "legacy shared-write request is unsupported",
    );
    let delta = run(&mut session, command(edit(3, true)));
    assert_eq!(delta.changed_entities_total, 3);
    assert_eq!(delta.affected_entities.len(), 128);
    assert!(delta.truncated);
    assert_eq!(
        &session.snapshot().extra_action_points[1..],
        &before.extra_action_points[1..]
    );
    assert_eq!(action_settings::diagnostics(session.snapshot()).len(), 518);
    history_round_trip(&mut session, &before);
}

#[test]
fn repaired_settings_encode_only_authored_rows_and_preserve_imported_body_and_tail() {
    let source: Vec<u8> = (0u8..23).collect();
    for target in [0, 4] {
        let mut snapshot = project(-92, 0);
        snapshot.extra_codes = decode_extra_codes(&source).rows;
        let mut session = EditorSession::new(snapshot);
        let edit = edit(target, true);
        run(&mut session, command(edit.clone()));
        let actual = encode_extra_codes(&session.snapshot().extra_codes, Some(&source)).unwrap();
        let mut expected = source[..20].to_vec();
        expected.resize(expected.len().max((target as usize + 2) * 10), 0);
        for (index, value) in edit
            .values
            .into_iter()
            .chain(edit.secondary_values.unwrap())
            .enumerate()
        {
            let offset = target as usize * 10 + index * 2;
            expected[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
        }
        expected.extend_from_slice(&source[20..]);
        assert_eq!(actual, expected);
        if target == 4 {
            assert_eq!(&actual[..20], &source[..20]);
        }
    }
}
