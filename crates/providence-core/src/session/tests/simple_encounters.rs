use super::*;

#[test]
fn imported_simple_encounter_residue_is_not_runtime_content() {
    let mut encounter = SimpleEncounter {
        identity: StableId("simple-encounter:139".into()),
        native_id: NativeRecordId(139),
        actions: vec![],
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    };
    encounter.choice_results = [-4, -1, -20, -61];
    encounter.texts = ["binary residue".into(), "".into(), "".into(), "".into()];
    assert!(!encounter.has_semantics());

    encounter.choice_results = [-4, 0, 0, 0];
    assert!(encounter.has_semantics());
}

#[test]
fn simple_encounter_prompt_and_action_repairs_mark_imported_record_authored() {
    let snapshot = encounter_with_missing_targets();
    let mut session = EditorSession::new(snapshot);

    let prompt = session
        .references()
        .into_iter()
        .find(|reference| reference.field.0 == "promptMessage")
        .expect("prompt reference");
    assert_eq!(prompt.resolution, ResolutionState::Missing);
    assert_eq!(prompt.byte_provenance.unwrap().byte_start, 1382);

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetSimpleEncounterPrompt {
                source: StableId("simple-encounter:3".into()),
                target_native_id: 1,
            },
        })
        .expect("repair encounter prompt");
    assert_eq!(projection.revision, Revision(1));
    assert!(projection.affected_diagnostics.iter().all(|item| {
        item.field.as_ref().map(|field| field.0.as_str()) != Some("promptMessage")
    }));
    assert!(session.snapshot().simple_encounters[0].authored);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetActionReference {
                source: StableId("simple-encounter:3".into()),
                slot: 0,
                target_native_id: 1,
            },
        })
        .expect("repair encounter action");
    assert_eq!(
        session.snapshot().simple_encounters[0].actions[0].target_native_id,
        1
    );
    assert!(session.snapshot().simple_encounters[0].authored);
    assert!(session.diagnostics().is_empty());
}

#[test]
fn unauthored_simple_encounter_annex_bytes_do_not_invent_references() {
    let mut snapshot = sample_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(102),
        values: [930, 0, 0, 0, 0],
    });
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:19".into()),
        native_id: NativeRecordId(19),
        actions: vec![ClassicAction {
            slot: 21,
            raw_opcode: 51,
            target_native_id: 102,
        }],
        choice_results: [51, 83, 0, 102],
        can_back_out: true,
        max_times: 83,
        caste_success: 0,
        prompt_message_native_id: 22_835,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    });

    assert!(!snapshot.simple_encounters[0].has_semantics());
    assert!(
        references_for(&snapshot)
            .iter()
            .all(|reference| { reference.source != StableId("simple-encounter:19".into()) })
    );
    assert_eq!(
        snapshot.simple_encounters[0].prompt_message_native_id,
        22_835
    );

    snapshot.simple_encounters[0].authored = true;
    assert!(snapshot.simple_encounters[0].has_semantics());
    assert!(references_for(&snapshot).iter().any(|reference| {
        reference.source == StableId("simple-encounter:19".into())
            && reference.field.0 == "promptMessage"
            && reference.resolution == ResolutionState::Missing
    }));
}

#[test]
fn unauthored_simple_encounter_control_text_is_preserved_as_residue() {
    let mut snapshot = sample_snapshot();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:18".into()),
        native_id: NativeRecordId(18),
        actions: vec![ClassicAction {
            slot: 1,
            raw_opcode: 3,
            target_native_id: -22_528,
        }],
        choice_results: [2, 0, 0, 0],
        can_back_out: true,
        max_times: 0,
        caste_success: -8,
        prompt_message_native_id: 17_441,
        texts: [
            "apparently valid\0native residue".into(),
            "".into(),
            "".into(),
            "".into(),
        ],
        authored: false,
    });

    assert!(!snapshot.simple_encounters[0].has_semantics());
    assert!(
        references_for(&snapshot)
            .iter()
            .all(|reference| reference.source != StableId("simple-encounter:18".into()))
    );

    snapshot.simple_encounters[0].authored = true;
    assert!(snapshot.simple_encounters[0].has_semantics());
}

#[test]
fn simple_encounter_update_is_bounded_undoable_and_rejects_lossy_text() {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.clear();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: Vec::new(),
        choice_results: [1, 0, 0, 0],
        can_back_out: true,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 1,
        texts: ["Continue".into(), "".into(), "".into(), "".into()],
        authored: false,
    });
    let mut session = EditorSession::new(snapshot);
    let mut edited = session.snapshot().simple_encounters[0].clone();
    edited.texts[0] = "Pay the toll".into();
    edited.choice_results[0] = 2;

    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateSimpleEncounter {
                encounter: Box::new(edited),
            },
        })
        .expect("update one encounter");
    assert_eq!(
        projection.changed_entities,
        [StableId("simple-encounter:3".into())]
    );
    assert!(!projection.truncated);
    assert_eq!(
        session.snapshot().simple_encounters[0].texts[0],
        "Pay the toll"
    );
    assert!(session.snapshot().simple_encounters[0].authored);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo encounter edit");
    assert_eq!(session.snapshot().simple_encounters[0].texts[0], "Continue");

    let mut invalid = session.snapshot().simple_encounters[0].clone();
    invalid.texts[0] = "Café".into();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::UpdateSimpleEncounter {
                encounter: Box::new(invalid),
            },
        })
        .expect_err("uncertified encoding must fail before mutation");
    assert!(error.to_string().contains("certified ASCII subset"));
    assert_eq!(session.revision(), Revision(2));
}

#[test]
fn simple_encounter_draft_commits_all_columns_and_settings_atomically() {
    let mut session = EditorSession::new(simple_encounter_draft_snapshot());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplySimpleEncounterDraft {
                draft: Box::new(complete_simple_encounter_draft()),
            },
        })
        .expect("apply complete encounter draft");

    assert_complete_simple_encounter_draft(&session);
    assert_invalid_simple_encounter_draft_is_atomic(&mut session);
}

fn simple_encounter_draft_snapshot() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.clear();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:1".into()),
        native_id: NativeRecordId(1),
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 1,
        }],
        choice_results: [1, 2, 3, 4],
        can_back_out: true,
        max_times: 99,
        caste_success: 0,
        prompt_message_native_id: 1,
        texts: ["One".into(), "Two".into(), "Three".into(), "Four".into()],
        authored: false,
    });
    snapshot
}

fn complete_simple_encounter_draft() -> SimpleEncounterRecordDraft {
    SimpleEncounterRecordDraft {
        source: StableId("simple-encounter:1".into()),
        native_id: NativeRecordId(1),
        prompt_message_native_id: 1,
        can_back_out: false,
        max_times: 3,
        caste_success: 0,
        texts: [
            "Ask one".into(),
            "Ask two".into(),
            "Ask three".into(),
            "Ask four".into(),
        ],
        choice_results: [1, 2, 3, 4],
        steps: vec![
            ActionStepDraft {
                slot: 0,
                action_identity: "realmz.action.1".into(),
                gosub: false,
                target_native_id: 1,
                settings: None,
            },
            ActionStepDraft {
                slot: 31,
                action_identity: "realmz.action.19".into(),
                gosub: false,
                target_native_id: 0,
                settings: Some(ActionStepDraftSettings {
                    values: action_step_fixtures::typed(&[("messageLow", 4), ("messageHigh", 6)]),
                    secondary_values: None,
                    scope: ActionSettingsWriteScope::Isolate,
                }),
            },
        ],
    }
}

fn assert_complete_simple_encounter_draft(session: &EditorSession) {
    let encounter = &session.snapshot().simple_encounters[0];
    assert_eq!(encounter.texts[3], "Ask four");
    assert_eq!(encounter.max_times, 3);
    assert_eq!(
        encounter
            .actions
            .iter()
            .map(|action| action.slot)
            .collect::<Vec<_>>(),
        vec![0, 31]
    );
    let settings_id = encounter.actions[1].target_native_id as u32;
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == settings_id)
            .unwrap()
            .values[..2],
        [4, 6]
    );
}

fn assert_invalid_simple_encounter_draft_is_atomic(session: &mut EditorSession) {
    let mut invalid = session.snapshot().simple_encounters[0].clone();
    invalid.texts[0] = "Café".into();
    let before = session.snapshot().clone();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplySimpleEncounterDraft {
                draft: Box::new(SimpleEncounterRecordDraft {
                    source: invalid.identity.clone(),
                    native_id: invalid.native_id,
                    prompt_message_native_id: invalid.prompt_message_native_id,
                    can_back_out: invalid.can_back_out,
                    max_times: invalid.max_times,
                    caste_success: invalid.caste_success,
                    texts: invalid.texts,
                    choice_results: invalid.choice_results,
                    steps: vec![],
                }),
            },
        })
        .expect_err("invalid text rejects the entire transaction");
    assert!(error.to_string().contains("certified ASCII subset"));
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn simple_encounter_auto_result_four_preserves_the_signed_classic_byte() {
    let encounter = SimpleEncounter {
        identity: StableId("simple-encounter:0".into()),
        native_id: NativeRecordId(0),
        actions: vec![],
        choice_results: [-4, 0, 0, 0],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    };

    let bytes = crate::codecs::encode_simple_encounters(&[encounter], None)
        .expect("signed result should encode");
    assert_eq!(bytes[96], 0xfc);
    let decoded = crate::codecs::decode_simple_encounters(&bytes);
    assert_eq!(decoded.records[0].choice_results, [-4, 0, 0, 0]);
    assert!(decoded.records[0].has_semantics());
}

fn encounter_with_missing_targets() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.clear();
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 999,
        }],
        choice_results: [1, 0, 0, 0],
        can_back_out: true,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 999,
        texts: ["Continue".into(), "".into(), "".into(), "".into()],
        authored: false,
    });
    snapshot
}
