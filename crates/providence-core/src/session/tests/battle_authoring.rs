use super::*;
use crate::session::ChangeProjection;
use crate::session::battle_authoring::empty_battle;

fn execute_create(
    session: &mut EditorSession,
    plan: crate::session::BattleAllocation,
) -> Result<ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command: EditorCommand::CreateBattle {
            battle: Box::new(plan.battle),
            copy_source: plan.copy_source,
        },
    })
}

#[test]
fn vacant_allocation_is_pure_and_creation_has_one_durable_history_entry() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-allocation".into()));
    snapshot.battles = vec![
        empty_battle(NativeRecordId(0)),
        empty_battle(NativeRecordId(2)),
    ];
    let mut session = EditorSession::new(snapshot.clone());
    let plan = session.allocate_battle(None).unwrap();
    assert_eq!(plan.battle, empty_battle(NativeRecordId(1)));
    assert_eq!(session.snapshot(), &snapshot);
    assert!(session.undo_history().is_empty());
    execute_create(&mut session, plan).unwrap();
    assert_eq!(session.undo_history().len(), 1);
    let saved = session.snapshot().clone();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &saved);
}

#[test]
fn copy_retains_signed_fields_and_rejects_changed_source_or_occupied_destination_atomically() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-copy".into()));
    let mut source = empty_battle(NativeRecordId(4));
    source.grid[35] = -95;
    source.grid[119] = 96;
    source.distance = -128;
    source.battle_macro = 1;
    source.message_before = 148;
    source.authored = false;
    snapshot.battles.push(source.clone());
    let mut session = EditorSession::new(snapshot);
    let plan = session.allocate_battle(Some(NativeRecordId(4))).unwrap();
    assert_eq!(
        (
            plan.battle.grid[35],
            plan.battle.grid[119],
            plan.battle.distance,
            plan.battle.battle_macro
        ),
        (-95, 96, -128, 1)
    );
    let mut edited = source;
    edited.distance = 9;
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::UpdateBattle {
                battle: Box::new(edited),
            },
        })
        .unwrap();
    let before = session.snapshot().clone();
    let history = session.undo_history().len();
    assert!(execute_create(&mut session, plan).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.undo_history().len(), history);
    let plan = session.allocate_battle(None).unwrap();
    execute_create(&mut session, plan.clone()).unwrap();
    let before = session.snapshot().clone();
    let history = session.undo_history().len();
    assert!(execute_create(&mut session, plan).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.undo_history().len(), history);
}

#[test]
fn creation_rejects_false_identity_unrepresentable_id_and_runtime_overflow() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "battle-invalid".into(),
    )));
    for case in 0..3 {
        let mut plan = session.allocate_battle(None).unwrap();
        match case {
            0 => plan.battle.identity = StableId("battle:99".into()),
            1 => {
                plan.battle.native_id = NativeRecordId(32768);
                plan.battle.identity = StableId("battle:32768".into());
            }
            _ => plan.battle.grid[..101].fill(1),
        }
        assert!(execute_create(&mut session, plan).is_err());
        assert!(session.snapshot().battles.is_empty());
        assert_eq!(session.revision(), Revision(0));
    }
}

#[test]
fn complete_authorable_id_range_does_not_overwrite_or_drop_higher_imported_rows() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-full".into()));
    snapshot.battles = (0..=32768)
        .map(|id| empty_battle(NativeRecordId(id)))
        .collect();
    let session = EditorSession::new(snapshot);
    assert!(session.allocate_battle(None).is_err());
    assert_eq!(
        session.snapshot().battles.last().unwrap().native_id.0,
        32768
    );
}

#[test]
fn battle_settings_callers_are_visible_to_used_by_and_clear_impact() {
    use crate::model::{ClassicAction, ExtraActionPoint, ExtraCodeRow};
    use crate::references::TargetKind;

    for opcode in [2, 48, 56, 107] {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-callers".into()));
        snapshot.battles = vec![
            empty_battle(NativeRecordId(0)),
            empty_battle(NativeRecordId(4)),
        ];
        snapshot.extra_codes.push(ExtraCodeRow {
            native_id: NativeRecordId(1),
            values: [0, 4, 0, 0, 0],
        });
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId("extra-action-point:7".into()),
            native_id: NativeRecordId(7),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 3,
                raw_opcode: opcode,
                target_native_id: 1,
            }],
        });
        let session = EditorSession::new(snapshot.clone());
        let references = session
            .references()
            .into_iter()
            .filter(|reference| reference.target_kind == TargetKind::Battle)
            .collect::<Vec<_>>();
        assert_eq!(references.len(), 2, "opcode {opcode}");
        let low = references
            .iter()
            .find(|row| row.field.0 == "actions[3].settings.battleLow")
            .unwrap();
        let high = references
            .iter()
            .find(|row| row.field.0 == "actions[3].settings.battleHigh")
            .unwrap();
        assert_eq!(low.target_id, "0");
        assert_eq!(high.target_id, "4");
        assert_eq!(low.byte_provenance.as_ref().unwrap().byte_start, 10);
        assert_eq!(
            session.clear_battle_draft(NativeRecordId(0)).unwrap()["incomingUses"],
            1
        );
        assert_eq!(
            session.clear_battle_draft(NativeRecordId(4)).unwrap()["incomingUses"],
            1
        );
        assert_eq!(session.snapshot(), &snapshot);
        assert!(session.undo_history().is_empty());
    }
}

#[test]
fn interior_battle_range_uses_are_bounded_and_keep_the_exact_owning_field() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-range-uses".into()));
    snapshot.battles.push(empty_battle(NativeRecordId(2)));
    snapshot.extra_codes.push(crate::model::ExtraCodeRow {
        native_id: NativeRecordId(1),
        values: [0, 32767, 0, 0, 0],
    });
    snapshot
        .extra_action_points
        .push(crate::model::ExtraActionPoint {
            identity: StableId("extra-action-point:7".into()),
            native_id: NativeRecordId(7),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![crate::model::ClassicAction {
                slot: 3,
                raw_opcode: 2,
                target_native_id: 1,
            }],
        });
    let session = EditorSession::new(snapshot.clone());
    let uses = session.battle_uses(NativeRecordId(2));
    assert_eq!(uses.len(), 1);
    assert_eq!(uses[0].target_id, "2");
    assert_eq!(uses[0].field.0, "actions[3].settings.battleLow");
    assert_eq!(uses[0].source.0, "extra-action-point:7");
    assert_eq!(
        uses[0].resolution,
        crate::references::ResolutionState::Resolved
    );
    assert_eq!(uses[0].byte_provenance.as_ref().unwrap().byte_start, 10);
    assert_eq!(
        session.clear_battle_draft(NativeRecordId(2)).unwrap()["incomingUses"],
        1
    );
    assert_eq!(
        session
            .references()
            .iter()
            .filter(|row| row.target_kind == crate::references::TargetKind::Battle)
            .count(),
        2
    );
    assert_eq!(session.snapshot(), &snapshot);
    assert!(session.undo_history().is_empty());
}
