use super::action_step_fixtures::*;
use super::*;
use crate::model::ScriptDescriptor;

#[test]
fn extra_action_point_record_draft_commits_header_and_steps_atomically() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:3".into()),
        native_id: NativeRecordId(3),
        classic_door_id: -7,
        post_action_level: 8,
        post_action_x: 9,
        post_action_y: 10,
        chance_percent: 11,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 1,
            target_native_id: 1,
        }],
    });
    let before = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    apply_extra_record_draft(&mut session);
    let row = &session.snapshot().extra_action_points[0];
    assert_extra_header(row);
    assert_eq!(row.actions.len(), 2);
    assert_eq!(session.snapshot().script_descriptors.len(), 1);
    assert_eq!(
        session.snapshot().script_descriptors[0].text,
        "Moon Gate battle"
    );
    assert_eq!(session.revision(), Revision(1));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn extra_action_point_draft_accepts_battle_macro_only_actions() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:92".into()),
        native_id: NativeRecordId(92),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 0,
        actions: Vec::new(),
    });
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyExtraActionPointDraft {
                draft: battle_macro_record_draft(),
            },
        })
        .unwrap();

    let action = &session
        .snapshot()
        .extra_action_points
        .iter()
        .find(|point| point.native_id == NativeRecordId(92))
        .unwrap()
        .actions[0];
    assert_eq!(action.raw_opcode, 126);
    let row = session
        .snapshot()
        .extra_codes
        .iter()
        .find(|row| row.native_id.0 == u32::try_from(action.target_native_id).unwrap())
        .unwrap();
    assert_eq!(row.values, [1, 50, 1, 93, 0]);
}

fn battle_macro_record_draft() -> ExtraActionPointRecordDraft {
    ExtraActionPointRecordDraft {
        source: StableId("extra-action-point:92".into()),
        descriptor: "Battle-round macro".into(),
        header: ExtraActionPointHeaderDraft {
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
        },
        steps: vec![ActionStepDraft {
            slot: 0,
            action_identity: "realmz.action.126".into(),
            gosub: false,
            target_native_id: 0,
            settings: Some(ActionStepDraftSettings {
                values: typed(&[
                    ("mode", 1),
                    ("roundOrPercent", 50),
                    ("repeatMode", 1),
                    ("macroLow", 93),
                    ("macroHigh", 0),
                ]),
                secondary_values: None,
                scope: ActionSettingsWriteScope::Isolate,
            }),
        }],
    }
}

fn apply_extra_record_draft(session: &mut EditorSession) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyExtraActionPointDraft {
                draft: ExtraActionPointRecordDraft {
                    source: StableId("extra-action-point:3".into()),
                    descriptor: "Moon Gate battle".into(),
                    header: ExtraActionPointHeaderDraft {
                        classic_door_id: 17,
                        post_action_level: 2,
                        post_action_x: 3,
                        post_action_y: 4,
                        chance_percent: 81,
                    },
                    steps: vec![
                        ActionStepDraft {
                            slot: 0,
                            action_identity: "realmz.action.1".into(),
                            gosub: false,
                            target_native_id: 1,
                            settings: None,
                        },
                        random_message_step(4, 2, 6, ActionSettingsWriteScope::Isolate),
                    ],
                },
            },
        })
        .unwrap();
}

#[test]
fn action_point_descriptor_is_trimmed_and_an_empty_value_removes_it() {
    let mut session = EditorSession::new(placed_snapshot());
    let source = StableId("action-point:land:0:0".into());
    let draft = |descriptor: &str| ActionPointRecordDraft {
        source: source.clone(),
        descriptor: descriptor.into(),
        header: header(),
        steps: Vec::new(),
    };

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionPointDraft {
                draft: draft("  Moon Gate ambush  "),
            },
        })
        .unwrap();
    assert_eq!(
        session.snapshot().script_descriptors,
        vec![ScriptDescriptor {
            source: source.clone(),
            text: "Moon Gate ambush".into(),
        }]
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ApplyActionPointDraft { draft: draft(" ") },
        })
        .unwrap();
    assert!(session.snapshot().script_descriptors.is_empty());
}

fn assert_extra_header(row: &ExtraActionPoint) {
    assert_eq!(
        (
            row.classic_door_id,
            row.post_action_level,
            row.post_action_x,
            row.post_action_y,
            row.chance_percent
        ),
        (17, 2, 3, 4, 81)
    );
}
