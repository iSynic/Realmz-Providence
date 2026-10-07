use super::*;
use crate::session::extra_action_point_commands::blank_extra_action_point;

#[test]
fn extra_action_point_links_are_typed_byte_provenanced_and_repairable() {
    let snapshot = snapshot_with_extra_action_links();
    let mut session = EditorSession::new(snapshot);

    assert_extra_action_link_provenance(&session);
    let repaired = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetActionReference {
                source: StableId("extra-action-point:40".into()),
                slot: 0,
                target_native_id: 1,
            },
        })
        .expect("repair missing message target");
    assert_eq!(
        repaired.changed_entities,
        [StableId("extra-action-point:40".into())]
    );
    assert!(repaired.reference_changes.iter().any(|reference| {
        reference.field.0 == "actions[0].target"
            && reference.resolution == ResolutionState::Resolved
    }));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpsertExtraCode {
                row: ExtraCodeRow {
                    native_id: NativeRecordId(9),
                    values: [6, 7, 8, 9, 10],
                },
            },
        })
        .expect("add required opcode 92 companion row");
    assert!(
        !session.diagnostics().iter().any(|diagnostic| {
            diagnostic.entity == Some(StableId("extra-action-point:40".into()))
        })
    );
}

#[test]
fn action_opcode_edit_and_complex_target_repair_are_revisioned_and_undoable() {
    let snapshot = snapshot_with_opcode_repair_targets();
    let mut session = EditorSession::new(snapshot);

    let opcode = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetActionOpcode {
                source: StableId("simple-encounter:7".into()),
                slot: 25,
                raw_opcode: 4,
            },
        })
        .expect("replace context-unsafe opcode");
    assert_eq!(
        opcode.changed_entities,
        [StableId("simple-encounter:7".into())]
    );
    assert_eq!(
        session.snapshot().simple_encounters[0].actions[0].raw_opcode,
        4
    );
    assert!(session.snapshot().simple_encounters[0].authored);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetActionReference {
                source: StableId("complex-encounter:0".into()),
                slot: 0,
                target_native_id: 4,
            },
        })
        .expect("repair Complex Encounter opcode 44 result");
    assert_eq!(
        session.snapshot().complex_encounters[0].actions[0].target_native_id,
        4
    );
    assert!(session.snapshot().complex_encounters[0].authored);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo Complex Encounter target repair");
    assert_eq!(
        session.snapshot().complex_encounters[0].actions[0].target_native_id,
        5
    );

    assert_out_of_range_opcode_rejected(&mut session);
}

#[test]
fn signed_message_action_preserves_raw_behavior_but_resolves_by_magnitude() {
    let mut snapshot = sample_snapshot();
    snapshot.extra_action_points = vec![ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 4040,
        post_action_level: 0,
        post_action_x: 4,
        post_action_y: 5,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: -1,
        }],
    }];

    let references = references_for(&snapshot);
    let message_link = references
        .iter()
        .find(|reference| {
            reference.source == StableId("extra-action-point:40".into())
                && reference.field.0 == "actions[0].target"
        })
        .expect("signed opcode 1 typed link");

    assert_eq!(message_link.target_kind, TargetKind::Message);
    assert_eq!(message_link.target_id, "1");
    assert_eq!(message_link.resolution, ResolutionState::Resolved);
    assert_eq!(
        snapshot.extra_action_points[0].actions[0].target_native_id,
        -1
    );
    assert_eq!(
        message_link.byte_provenance,
        Some(ByteProvenance {
            native_path: "Data ED3".into(),
            record_index: 40,
            byte_start: (40 * EXTRA_ACTION_POINT_RECORD_BYTES + 24) as u32,
            byte_end: (40 * EXTRA_ACTION_POINT_RECORD_BYTES + 26) as u32,
        })
    );
}

#[test]
fn extra_action_point_update_is_bounded_undoable_and_validated() {
    let mut snapshot = sample_snapshot();
    let original = ExtraActionPoint {
        identity: StableId("extra-action-point:7".into()),
        native_id: NativeRecordId(7),
        classic_door_id: 700,
        post_action_level: 0,
        post_action_x: 7,
        post_action_y: 8,
        chance_percent: 60,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 1,
        }],
    };
    snapshot.extra_action_points.push(original.clone());
    let mut session = EditorSession::new(snapshot);
    let mut edited = original.clone();
    edited.chance_percent = 85;
    edited.actions[0].target_native_id = 99;

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateExtraActionPoint {
                extra_action_point: Box::new(edited.clone()),
            },
        })
        .expect("bounded Extra AP update");
    assert_eq!(projection.changed_entities, [edited.identity.clone()]);
    assert_eq!(session.snapshot().extra_action_points[0], edited);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo Extra AP update");
    assert_eq!(session.snapshot().extra_action_points[0], original);

    let mut invalid = session.snapshot().extra_action_points[0].clone();
    invalid.actions.push(ClassicAction {
        slot: 0,
        raw_opcode: 1,
        target_native_id: 1,
    });
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::UpdateExtraActionPoint {
                extra_action_point: Box::new(invalid),
            },
        }),
        Err(SessionError::InvalidExtraActionPoint { .. })
    ));
}

#[test]
fn extra_action_point_creation_materializes_dense_classic_rows_and_is_undoable() {
    let mut snapshot = sample_snapshot();
    snapshot.extra_action_points = (0..8).map(blank_extra_action_point).collect();
    let source = vec![0; 8 * EXTRA_ACTION_POINT_RECORD_BYTES];
    let mut session = EditorSession::new(snapshot);

    let created = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateExtraActionPoint {
                native_id: Some(NativeRecordId(69)),
            },
        })
        .expect("create the missing door-item target and its physical padding rows");
    assert_eq!(created.changed_entities.len(), 62);
    assert_eq!(session.snapshot().extra_action_points.len(), 70);
    assert!(
        session
            .snapshot()
            .extra_action_points
            .iter()
            .enumerate()
            .all(|(index, row)| row.native_id.0 == index as u32)
    );
    let compiled = crate::codecs::encode_extra_action_points(
        &session.snapshot().extra_action_points,
        Some(&source),
    )
    .expect("compile extended Data ED3");
    assert_eq!(compiled.len(), 70 * EXTRA_ACTION_POINT_RECORD_BYTES);
    assert_eq!(
        crate::codecs::decode_extra_action_points(&compiled).records,
        session.snapshot().extra_action_points
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo dense Extra Action Point creation");
    assert_eq!(session.snapshot().extra_action_points.len(), 8);
    assert!(matches!(
        session.execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::CreateExtraActionPoint {
                native_id: Some(NativeRecordId(i16::MAX as u32 + 1)),
            },
        }),
        Err(SessionError::InvalidExtraActionPoint { .. })
    ));
}

#[test]
fn certified_foreign_suffix_is_never_used_for_xap_growth() {
    let mut snapshot = sample_snapshot();
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data ED3".into(),
        blob: BlobId(
            "sha256:ff82bb8ad3f1585b9cc70fd869ec0f89932e922c28bdfd826620af77c4d5a608".into(),
        ),
        byte_length: 86_040,
    });
    let before = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateExtraActionPoint {
                native_id: Some(NativeRecordId(394)),
            },
        })
        .expect_err("the foreign suffix is preserved source, not free XAP storage");
    assert!(
        error
            .to_string()
            .contains("certified foreign Data ED3 suffix")
    );
    assert_eq!(session.snapshot(), &before);
}

fn snapshot_with_extra_action_links() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.extra_action_points = vec![ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 4040,
        post_action_level: 0,
        post_action_x: 4,
        post_action_y: 5,
        chance_percent: 100,
        actions: vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 999,
            },
            ClassicAction {
                slot: 1,
                raw_opcode: 39,
                target_native_id: 40,
            },
            ClassicAction {
                slot: 2,
                raw_opcode: 92,
                target_native_id: 8,
            },
        ],
    }];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [1, 2, 3, 4, 5],
    });
    snapshot
}

fn snapshot_with_opcode_repair_targets() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:7".into()),
        native_id: NativeRecordId(7),
        actions: vec![ClassicAction {
            slot: 25,
            raw_opcode: 44,
            target_native_id: 4,
        }],
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    });
    let mut complex =
        crate::codecs::decode_complex_encounters(&vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    complex.actions.push(ClassicAction {
        slot: 0,
        raw_opcode: 44,
        target_native_id: 5,
    });
    snapshot.complex_encounters.push(complex);
    snapshot
}

fn assert_extra_action_link_provenance(session: &EditorSession) {
    let references = session.references();
    let self_link = references
        .iter()
        .find(|reference| reference.field.0 == "actions[1].target")
        .expect("opcode 39 typed link");
    assert_eq!(self_link.target_kind, TargetKind::ExtraActionPoint);
    assert_eq!(self_link.resolution, ResolutionState::Resolved);
    let message_link = references
        .iter()
        .find(|reference| reference.field.0 == "actions[0].target")
        .expect("opcode 1 typed link");
    assert_eq!(message_link.resolution, ResolutionState::Missing);
    assert_eq!(
        message_link.byte_provenance,
        Some(ByteProvenance {
            native_path: "Data ED3".into(),
            record_index: 40,
            byte_start: (40 * EXTRA_ACTION_POINT_RECORD_BYTES + 24) as u32,
            byte_end: (40 * EXTRA_ACTION_POINT_RECORD_BYTES + 26) as u32,
        })
    );
    assert!(session.diagnostics().iter().any(|diagnostic| {
        diagnostic.code == "extra-code.opcode-92.secondary-missing"
            && diagnostic.entity == Some(StableId("extra-action-point:40".into()))
    }));
}

fn assert_out_of_range_opcode_rejected(session: &mut EditorSession) {
    let revision = session.revision();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: revision,
            command: EditorCommand::SetActionOpcode {
                source: StableId("simple-encounter:7".into()),
                slot: 25,
                raw_opcode: 200,
            },
        })
        .expect_err("Simple Encounter opcodes use signed-byte storage");
    assert!(matches!(error, SessionError::InvalidSimpleEncounter { .. }));
    assert_eq!(session.revision(), revision);
}
