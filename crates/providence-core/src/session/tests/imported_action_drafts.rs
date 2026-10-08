use super::action_step_fixtures::*;
use super::*;

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = placed_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId("retained-source".into()),
    };
    let row = &mut snapshot.world.action_points[0];
    row.coordinate = None;
    row.classic_door_id = -1_576_992_688;
    row.post_action_level = 59;
    row.post_action_x = 187;
    row.post_action_y = 241;
    row.chance_percent = 121;
    // Lord of the Abyss Data DDD level 1, row 28 contains these first two words.
    row.actions = vec![
        ClassicAction {
            slot: 0,
            raw_opcode: 17090,
            target_native_id: -29372,
        },
        ClassicAction {
            slot: 1,
            raw_opcode: 60,
            target_native_id: 22075,
        },
    ];
    snapshot
}

fn drafts() -> Vec<ActionStepDraft> {
    vec![
        ActionStepDraft {
            slot: 0,
            action_identity: "realmz.action.17090".into(),
            gosub: false,
            target_native_id: -29372,
            settings: None,
        },
        ActionStepDraft {
            slot: 1,
            action_identity: "realmz.action.60".into(),
            gosub: false,
            target_native_id: 22075,
            settings: Some(ActionStepDraftSettings {
                values: typed(&[("moneyType", 2), ("pickedOnly", 0)]),
                secondary_values: None,
                scope: ActionSettingsWriteScope::PreserveReferences,
            }),
        },
    ]
}

#[test]
fn imported_unknown_words_and_unplaced_header_survive_supported_edit_and_history() {
    let original = snapshot();
    let row = original.world.action_points[0].clone();
    let mut session = EditorSession::new(original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointDraft {
                draft: ActionPointRecordDraft {
                    source: row.identity.clone(),
                    descriptor: String::new(),
                    header: ActionPointHeaderDraft {
                        coordinate: None,
                        post_action_level: row.post_action_level,
                        post_action_x: row.post_action_x,
                        post_action_y: row.post_action_y,
                        chance_percent: row.chance_percent,
                    },
                    steps: drafts(),
                },
            },
        })
        .unwrap();
    let updated = &session.snapshot().world.action_points[0];
    assert_eq!(updated.classic_door_id, row.classic_door_id);
    assert_eq!(updated.coordinate, None);
    assert_eq!(updated.actions[0], row.actions[0]);
    assert_eq!(session.snapshot().extra_codes[0].values[0], 2);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot().world.action_points[0], row);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(
        session.snapshot().world.action_points[0].actions[0],
        row.actions[0]
    );
}

#[test]
fn unchanged_missing_settings_do_not_fabricate_an_extra_code_row() {
    let original = snapshot();
    let mut session = EditorSession::new(original.clone());
    let mut steps = drafts();
    steps[1]
        .settings
        .as_mut()
        .unwrap()
        .values
        .insert("moneyType".into(), 0);
    apply_action_draft(&mut session, steps).unwrap();
    assert_eq!(
        session.snapshot().world.action_points[0].actions,
        original.world.action_points[0].actions
    );
    assert_eq!(session.snapshot().extra_codes, original.extra_codes);
}

#[test]
fn unknown_instruction_edits_and_fresh_instructions_are_rejected_atomically() {
    for authored in [false, true] {
        let mut original = snapshot();
        if authored {
            original.origin = ProjectOrigin::Authored;
        }
        let mut session = EditorSession::new(original.clone());
        let mut steps = drafts();
        if !authored {
            steps[0].target_native_id += 1;
        }
        assert!(apply_action_draft(&mut session, steps).is_err());
        assert_eq!(session.snapshot(), &original);
    }
}
