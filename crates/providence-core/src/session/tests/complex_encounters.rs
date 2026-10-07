use super::*;

fn complex(native_id: u32) -> ComplexEncounter {
    ComplexEncounter {
        identity: StableId(format!("complex-encounter:{native_id}")),
        native_id: NativeRecordId(native_id),
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 1,
        }],
        action_result: 1,
        word_result: 3,
        groups: [0, 1, 0, 0, 0, 0, 0, 0],
        spell_ids: [1100, 1101, 0, 0, 0, 0, 0, 0, 0, 0],
        spell_results: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
        item_ids: [9999, 214, 0, 0, 0],
        item_results: [0, 1, 0, 0, 0],
        can_back_out: true,
        thief: true,
        max_times: 4,
        caste_success: 7,
        thief_success: 4,
        thief_fail: 1,
        prompt_message_native_id: 1,
        texts: std::array::from_fn(|index| {
            if index == 8 {
                "arawn".into()
            } else {
                format!("Action {}", index + 1)
            }
        }),
        authored: false,
    }
}

fn draft(row: &ComplexEncounter) -> ComplexEncounterRecordDraft {
    ComplexEncounterRecordDraft {
        source: row.identity.clone(),
        native_id: row.native_id,
        prompt_message_native_id: row.prompt_message_native_id,
        can_back_out: row.can_back_out,
        max_times: row.max_times,
        action_result: row.action_result,
        word_result: row.word_result,
        groups: row.groups,
        spell_ids: row.spell_ids,
        spell_results: row.spell_results,
        item_ids: row.item_ids,
        item_results: row.item_results,
        thief: row.thief,
        caste_success: row.caste_success,
        thief_success: row.thief_success,
        thief_fail: row.thief_fail,
        texts: row.texts.clone(),
        steps: vec![ActionStepDraft {
            slot: 31,
            action_identity: "realmz.action.1".into(),
            gosub: false,
            target_native_id: 1,
            settings: None,
        }],
    }
}

#[test]
fn complex_draft_applies_all_response_families_and_result_slots_atomically() {
    let mut snapshot = sample_snapshot();
    snapshot.message_references.clear();
    snapshot.complex_encounters = vec![complex(0)];
    let mut session = EditorSession::new(snapshot);
    let mut next = draft(&session.snapshot().complex_encounters[0]);
    next.texts[7] = "Offer food".into();
    next.groups[7] = 1;
    next.spell_ids[9] = 6;
    next.spell_results[9] = 4;
    next.item_ids[4] = 88;
    next.item_results[4] = 2;
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyComplexEncounterDraft {
                draft: Box::new(next),
            },
        })
        .expect("apply complete Complex Encounter draft");
    let row = &session.snapshot().complex_encounters[0];
    assert_eq!(row.texts[7], "Offer food");
    assert_eq!(row.groups[7], 1);
    assert_eq!(row.spell_ids[9], 6);
    assert_eq!(row.item_ids[4], 88);
    assert_eq!(row.actions[0].slot, 31);

    let before = session.snapshot().clone();
    let mut invalid = draft(row);
    invalid.texts[0] = "x".repeat(40);
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::ApplyComplexEncounterDraft {
                    draft: Box::new(invalid)
                },
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn complex_create_and_copy_allocate_without_renumbering() {
    let mut snapshot = sample_snapshot();
    snapshot.complex_encounters = vec![complex(0), complex(2)];
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateComplexEncounter,
        })
        .expect("create fills the first available ID");
    assert!(
        session
            .snapshot()
            .complex_encounters
            .iter()
            .any(|row| row.native_id.0 == 1)
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::CopyComplexEncounter {
                source: StableId("complex-encounter:2".into()),
            },
        })
        .expect("copy allocates the next free ID");
    let copied = session
        .snapshot()
        .complex_encounters
        .iter()
        .find(|row| row.native_id.0 == 3)
        .unwrap();
    assert_eq!(copied.texts[8], "arawn");
    assert_eq!(copied.thief_success, 4);
}

#[test]
fn unchanged_unknown_imported_result_is_preserved_but_cannot_be_newly_authored() {
    let mut snapshot = sample_snapshot();
    let mut row = complex(0);
    row.word_result = 9;
    snapshot.complex_encounters = vec![row.clone()];
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyComplexEncounterDraft {
                draft: Box::new(draft(&row)),
            },
        })
        .expect("unchanged unknown imported value remains representable");
    let mut changed = draft(&session.snapshot().complex_encounters[0]);
    changed.word_result = 8;
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::ApplyComplexEncounterDraft {
                    draft: Box::new(changed)
                },
            })
            .is_err()
    );
}

#[test]
fn complex_settings_impact_accepts_all_four_result_groups_without_mutation() {
    let mut snapshot = sample_snapshot();
    snapshot.complex_encounters.push(complex(3));
    let session = EditorSession::new(snapshot.clone());
    let mut draft = draft(&snapshot.complex_encounters[0]);
    let step = draft.steps[0].clone();
    draft.steps = [0, 8, 16, 31]
        .into_iter()
        .map(|slot| ActionStepDraft {
            slot,
            ..step.clone()
        })
        .collect();
    let impact = session
        .action_settings_impact(crate::session::ActionSettingsImpactQuery {
            expected_revision: Revision(0),
            source: draft.source,
            steps: draft.steps,
            offset: 0,
            limit: 128,
        })
        .unwrap();
    assert_eq!(impact.steps.len(), 4);
    assert!(impact.steps.iter().any(|step| step.slot == 31));
    assert_eq!(session.snapshot(), &snapshot);
}
