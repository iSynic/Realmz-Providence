use super::action_step_fixtures::*;
use super::*;

#[test]
fn action_kind_change_with_same_layout_allocates_private_settings() {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: [1, 2, 3, 4, 5],
    });
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 1,
        raw_opcode: 20,
        target_native_id: 12,
    });
    let mut session = EditorSession::new(snapshot);
    let heal = ActionStepDraft {
        slot: 1,
        action_identity: "realmz.action.45".into(),
        gosub: false,
        target_native_id: 12,
        settings: Some(ActionStepDraftSettings {
            values: typed(&[
                ("levelOrKeep", 1),
                ("xOrKeep", 2),
                ("yOrKeep", 3),
                ("sound", 4),
                ("message", 5),
            ]),
            secondary_values: None,
            scope: ActionSettingsWriteScope::Isolate,
        }),
    };
    apply_action_draft(&mut session, vec![heal]).unwrap();
    let action = &session.snapshot().world.action_points[0].actions[0];
    assert_eq!(action.target_native_id, 0);
    assert_eq!(
        session.snapshot().extra_codes[0].native_id,
        NativeRecordId(0)
    );
    assert_eq!(
        session.snapshot().extra_codes[1].native_id,
        NativeRecordId(12)
    );
}
