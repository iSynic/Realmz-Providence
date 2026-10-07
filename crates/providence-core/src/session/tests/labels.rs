use super::*;

#[test]
fn option_labels_are_revisioned_and_opcode_three_uses_are_typed_and_provenanced() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("option-session".into()));
    snapshot.option_labels.push(OptionLabelRecord {
        identity: StableId("option-label:7".into()),
        native_id: NativeRecordId(7),
        text: "Proceed".into(),
        authored: false,
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(5),
        values: [0, 0, 0, -7, 99],
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 2,
            raw_opcode: 3,
            target_native_id: 5,
        }],
    });
    let mut session = EditorSession::new(snapshot);
    let references = session.references();
    let resolved = references
        .iter()
        .find(|reference| reference.target_id == "7")
        .unwrap();
    assert_eq!(resolved.target_kind, TargetKind::OptionLabel);
    assert_eq!(resolved.resolution, ResolutionState::Resolved);
    assert_eq!(resolved.byte_provenance.as_ref().unwrap().byte_start, 56);
    assert!(
        references
            .iter()
            .any(|reference| reference.target_id == "99"
                && reference.resolution == ResolutionState::Missing)
    );

    let mut edited = session.snapshot().option_labels[0].clone();
    edited.text = "Advance".into();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateOptionLabel { label: edited },
        })
        .unwrap();
    assert_eq!(session.snapshot().option_labels[0].text, "Advance");
    assert!(session.snapshot().option_labels[0].authored);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot().option_labels[0].text, "Proceed");
}

#[test]
fn option_label_create_and_duplicate_allocate_the_first_unused_record() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("option-allocation".into()));
    snapshot.option_labels.extend([
        OptionLabelRecord {
            identity: StableId("option-label:0".into()),
            native_id: NativeRecordId(0),
            text: "First".into(),
            authored: false,
        },
        OptionLabelRecord {
            identity: StableId("option-label:2".into()),
            native_id: NativeRecordId(2),
            text: "Third".into(),
            authored: false,
        },
    ]);
    let mut session = EditorSession::new(snapshot);

    let created = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateOptionLabel,
        })
        .unwrap();
    assert_eq!(
        created.changed_entities,
        [StableId("option-label:1".into())]
    );
    assert_eq!(session.snapshot().option_labels[1].text, "");
    assert!(session.snapshot().option_labels[1].authored);

    let duplicated = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::DuplicateOptionLabel {
                source: StableId("option-label:2".into()),
            },
        })
        .unwrap();
    assert_eq!(
        duplicated.changed_entities,
        [StableId("option-label:3".into())]
    );
    assert_eq!(session.snapshot().option_labels[3].text, "Third");
    assert!(session.snapshot().option_labels[3].authored);

    let before = session.snapshot().clone();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::DuplicateOptionLabel {
                source: StableId("option-label:999".into()),
            },
        })
        .unwrap_err();
    assert!(matches!(error, SessionError::OptionLabelNotFound(_)));
    assert_eq!(session.revision(), Revision(2));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn quest_labels_are_durable_metadata_and_uses_come_from_classic_fields() {
    let snapshot = quest_reference_snapshot();
    let mut session = EditorSession::new(snapshot);
    assert_classic_quest_references(&session);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertQuestLabel {
                label: QuestLabel {
                    id: 9,
                    label: "Gate opened".into(),
                    note: "Set after the eastern watchtower.".into(),
                },
            },
        })
        .unwrap();
    assert_eq!(session.snapshot().quest_labels[0].identity().0, "quest:9");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::DeleteQuestLabel { id: 9 },
        })
        .unwrap();
    assert!(session.snapshot().quest_labels.is_empty());
    assert!(session.references().iter().any(|reference| {
        reference.target_kind == TargetKind::QuestFlag
            && reference.target_id == "9"
            && reference.resolution == ResolutionState::Resolved
    }));
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::UpsertQuestLabel {
                label: QuestLabel {
                    id: 0,
                    label: "Reserved".into(),
                    note: String::new(),
                },
            },
        })
        .unwrap_err();
    assert!(matches!(
        error,
        SessionError::InvalidQuestLabel { id: 0, .. }
    ));
    assert_eq!(session.revision(), Revision(2));
}

fn quest_reference_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("quest-session".into()));
    snapshot.extra_codes.extend([
        ExtraCodeRow {
            native_id: NativeRecordId(5),
            values: [9, 1, 0, 0, 0],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(6),
            values: [10, 12, 0, 0, 0],
        },
    ]);
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 47,
                target_native_id: -7,
            },
            ClassicAction {
                slot: 1,
                raw_opcode: 46,
                target_native_id: 5,
            },
            ClassicAction {
                slot: 2,
                raw_opcode: 72,
                target_native_id: 6,
            },
        ],
    });
    snapshot.timed_encounters.push(TimedEncounter {
        identity: StableId("timed-encounter:0".into()),
        native_id: NativeRecordId(0),
        day: 1,
        increment: 0,
        percent: 100,
        door: 0,
        required_level: -1,
        required_random_rect: -1,
        required_x: -1,
        required_y: -1,
        required_item: -1,
        required_quest: 11,
        location_kind: crate::model::TimedEncounterLocationKind::Any,
        authored: false,
    });
    snapshot
}

fn assert_classic_quest_references(session: &EditorSession) {
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.target_kind == TargetKind::QuestFlag)
        .collect::<Vec<_>>();
    assert_eq!(references.len(), 6);
    let direct = references
        .iter()
        .find(|reference| reference.target_id == "7")
        .unwrap();
    assert_eq!(direct.field.0, "actions[0].questFlag.clear");
    assert_eq!(
        direct.byte_provenance.as_ref().unwrap().native_path,
        "Data ED3"
    );
    let tested = references
        .iter()
        .find(|reference| reference.target_id == "9")
        .unwrap();
    assert_eq!(
        tested.byte_provenance.as_ref().unwrap().native_path,
        "Data EDCD"
    );
    assert_eq!(tested.byte_provenance.as_ref().unwrap().byte_start, 50);
    assert!(
        references.iter().any(|reference| {
            reference.target_id == "11" && reference.field.0 == "requiredQuest"
        })
    );
}

#[test]
fn quest_consumers_follow_classic_reads_not_matching_numeric_ids() {
    // newland.c:2905 walks the stored range forwards; :3013 checks spell points,
    // not quests. misc.c:316 seeks the signed settings-row ID without abs().
    for (opcode, row_id, words, expected) in [
        (75, 5, [1, 33, 1, 0, 40], vec![]),
        (75, 5, [2, 999, 0, 2, 40], vec![]),
        (72, 5, [12, 10, 0, 0, 40], vec![]),
        (72, 5, [10, 12, 0, 0, 40], vec!["10", "11", "12"]),
        (72, 5, [33, 33, 0, 0, 40], vec!["33"]),
        (46, 5, [33, 2, 0, 40, 0], vec!["33"]),
        (76, 5, [33, 1, 0, 0, 0], vec!["33"]),
        (77, 5, [33, 1, 0, 0, 0], vec!["33"]),
        (46, -5, [33, 0, 0, 40, 0], vec![]),
    ] {
        let mut snapshot = quest_reference_snapshot();
        snapshot.timed_encounters.clear();
        snapshot.extra_codes[0].values = words;
        snapshot.extra_action_points[0].actions = vec![ClassicAction {
            slot: 1,
            raw_opcode: opcode,
            target_native_id: row_id,
        }];
        let before = snapshot.clone();
        let session = EditorSession::new(snapshot);
        let actual: Vec<_> = session
            .references()
            .into_iter()
            .filter(|reference| reference.target_kind == TargetKind::QuestFlag)
            .map(|reference| reference.target_id)
            .collect();
        assert_eq!(actual, expected, "opcode {opcode}, row {row_id}, {words:?}");
        assert_eq!(session.snapshot(), &before);
    }
}
