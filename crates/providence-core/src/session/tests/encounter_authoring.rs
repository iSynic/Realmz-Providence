use super::*;

#[test]
fn encounter_authoring_reachability_uses_direct_signed_rogue_caller() {
    let mut snapshot = sample_snapshot();
    let mut rogue = crate::codecs::decode_rogue_encounters(&[0; 118])
        .records
        .remove(0);
    rogue.success_codes[0] = 2;
    let mut complex = crate::codecs::decode_complex_encounters(&[0; 520])
        .records
        .remove(0);
    complex.thief = true;
    snapshot.rogue_encounters.push(rogue.clone());
    snapshot.complex_encounters.push(complex);
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 0,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 5,
            target_native_id: 0,
        }],
    });
    let result = StableId("complex:0:result:1".into());
    let zero = crate::rebuilt::derive_rebuilt_v3_reachability(&snapshot).unwrap();
    assert!(zero.reachable_program_ids.contains(&result));
    rogue.native_id.0 = 1;
    rogue.identity = StableId("rogue-encounter:1".into());
    snapshot.rogue_encounters.push(rogue);
    snapshot.complex_encounters[0].thief_success = -1;
    let negative = crate::rebuilt::derive_rebuilt_v3_reachability(&snapshot).unwrap();
    assert!(!negative.reachable_program_ids.contains(&result));
    snapshot.complex_encounters[0].thief_success = 1;
    let positive = crate::rebuilt::derive_rebuilt_v3_reachability(&snapshot).unwrap();
    assert!(positive.reachable_program_ids.contains(&result));
}

#[test]
fn encounter_authoring_rogue_zero_is_resolved_and_negative_caller_is_not_wrapped() {
    let mut snapshot = sample_snapshot();
    let rogue = crate::codecs::decode_rogue_encounters(&[0; 118])
        .records
        .remove(0);
    let mut complex = crate::codecs::decode_complex_encounters(&[0; 520])
        .records
        .remove(0);
    complex.thief = true;
    snapshot.rogue_encounters.push(rogue);
    snapshot.complex_encounters.push(complex);
    let zero_session = EditorSession::new(snapshot.clone());
    assert!(
        !zero_session
            .diagnostics()
            .iter()
            .any(|d| d.code == "complex-encounter.rogue.missing")
    );
    let resolved = zero_session.references();
    let link = resolved
        .iter()
        .find(|r| r.field.0 == "thiefSuccess")
        .unwrap();
    assert_eq!(link.target_id, "0");
    assert_eq!(link.resolution, ResolutionState::Resolved);
    snapshot.complex_encounters[0].thief_success = -1;
    let missing = EditorSession::new(snapshot).references();
    let link = missing
        .iter()
        .find(|r| r.field.0 == "thiefSuccess")
        .unwrap();
    assert_eq!(link.target_id, "-1");
    assert_eq!(link.resolution, ResolutionState::Missing);
}

#[test]
fn encounter_authoring_never_allocates_a_rogue_id_outside_signed_caller_range() {
    let mut snapshot = sample_snapshot();
    snapshot.rogue_encounters = crate::codecs::decode_rogue_encounters(&vec![0; 128 * 118]).records;
    let mut session = EditorSession::new(snapshot.clone());
    assert!(apply(&mut session, EditorCommand::CreateRogueEncounter).is_err());
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision(), Revision(0));
}

fn apply(
    session: &mut EditorSession,
    command: EditorCommand,
) -> Result<crate::session::ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command,
    })
}

#[test]
fn encounter_authoring_creates_stable_safe_rows_copies_and_undoes_atomically() {
    let mut session = EditorSession::new(sample_snapshot());
    let before = session.snapshot().clone();
    apply(&mut session, EditorCommand::CreateRogueEncounter).unwrap();
    let rogue = session.snapshot().rogue_encounters[0].clone();
    assert_eq!(rogue.identity.0, "rogue-encounter:0");
    assert!(rogue.type_flags.iter().all(|v| !v));
    apply(
        &mut session,
        EditorCommand::CopyRogueEncounter {
            source: rogue.identity.clone(),
        },
    )
    .unwrap();
    assert_eq!(
        session.snapshot().rogue_encounters[1].identity.0,
        "rogue-encounter:1"
    );
    apply(&mut session, EditorCommand::CreateTimedEncounter).unwrap();
    assert_eq!(session.snapshot().timed_encounters[0].day, -1);
    assert_eq!(session.snapshot().timed_encounters[0].required_quest, -1);
    assert_eq!(
        session.snapshot().timed_encounters[0].location_kind,
        crate::model::TimedEncounterLocationKind::Any
    );
    apply(&mut session, EditorCommand::Undo).unwrap();
    assert!(session.snapshot().timed_encounters.is_empty());
    apply(&mut session, EditorCommand::Redo).unwrap();
    assert_eq!(session.snapshot().timed_encounters[0].native_id.0, 0);
    assert_eq!(session.snapshot().messages, before.messages);
}

#[test]
fn encounter_authoring_rejection_does_not_publish_partial_rows_or_advance_revision() {
    let mut session = EditorSession::new(sample_snapshot());
    apply(&mut session, EditorCommand::CreateRogueEncounter).unwrap();
    let before = session.snapshot().clone();
    let revision = session.revision();
    let mut row = before.rogue_encounters[0].clone();
    row.modifiers[2] = -20;
    row.low_damage = 12;
    row.high_damage = 4;
    assert!(
        apply(
            &mut session,
            EditorCommand::ApplyRogueEncounterDraft {
                encounter: Box::new(row)
            }
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), revision);
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::CreateTimedEncounter
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn encounter_authoring_unrelated_edits_retain_unknown_imported_values_and_signed_feedback() {
    let mut snapshot = sample_snapshot();
    let mut rogue = crate::codecs::decode_rogue_encounters(&[0; 118])
        .records
        .remove(0);
    rogue.success_codes[3] = -91;
    rogue.success_text[2] = -99;
    rogue.failure_sounds[7] = -32768;
    snapshot.rogue_encounters.push(rogue);
    let mut session = EditorSession::new(snapshot);
    let mut row = session.snapshot().rogue_encounters[0].clone();
    row.modifiers[0] = -12;
    apply(
        &mut session,
        EditorCommand::ApplyRogueEncounterDraft {
            encounter: Box::new(row),
        },
    )
    .unwrap();
    let row = &session.snapshot().rogue_encounters[0];
    assert_eq!(
        (
            row.success_codes[3],
            row.success_text[2],
            row.failure_sounds[7]
        ),
        (-91, -99, -32768)
    );
    let mut invalid = row.clone();
    invalid.failure_codes[0] = 99;
    let before = session.snapshot().clone();
    assert!(
        apply(
            &mut session,
            EditorCommand::ApplyRogueEncounterDraft {
                encounter: Box::new(invalid)
            }
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn encounter_authoring_timed_creation_is_dormant_until_schedule_barrier_is_repaired() {
    let mut session = EditorSession::new(sample_snapshot());
    apply(&mut session, EditorCommand::CreateTimedEncounter).unwrap();
    let mut row = session.snapshot().timed_encounters[0].clone();
    row.day = 0;
    apply(
        &mut session,
        EditorCommand::ApplyTimedEncounterDraft {
            encounter: Box::new(row),
        },
    )
    .unwrap();
    apply(&mut session, EditorCommand::CreateTimedEncounter).unwrap();
    let before = session.snapshot().clone();
    let mut activated = before.timed_encounters[1].clone();
    activated.day = 3;
    assert!(
        apply(
            &mut session,
            EditorCommand::ApplyTimedEncounterDraft {
                encounter: Box::new(activated.clone())
            }
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    let mut barrier = before.timed_encounters[0].clone();
    barrier.day = -1;
    apply(
        &mut session,
        EditorCommand::ApplyTimedEncounterDraft {
            encounter: Box::new(barrier),
        },
    )
    .unwrap();
    apply(
        &mut session,
        EditorCommand::ApplyTimedEncounterDraft {
            encounter: Box::new(activated),
        },
    )
    .unwrap();
    assert_eq!(session.snapshot().timed_encounters[1].native_id.0, 1);
}
