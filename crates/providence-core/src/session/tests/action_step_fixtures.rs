use super::*;
use crate::session::ChangeProjection;
use std::collections::BTreeMap;

pub(super) fn placed_snapshot() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Test Land".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 101,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 7,
            raw_opcode: 24,
            target_native_id: 44,
        }],
    });
    snapshot
}

pub(super) fn typed(values: &[(&str, i16)]) -> BTreeMap<String, i16> {
    values
        .iter()
        .map(|(name, value)| ((*name).into(), *value))
        .collect()
}

pub(super) fn header() -> ActionPointHeaderDraft {
    ActionPointHeaderDraft {
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
    }
}

pub(super) fn random_message_step(
    slot: u8,
    low: i16,
    high: i16,
    scope: ActionSettingsWriteScope,
) -> ActionStepDraft {
    ActionStepDraft {
        slot,
        action_identity: "realmz.action.19".into(),
        gosub: false,
        target_native_id: 12,
        settings: Some(ActionStepDraftSettings {
            values: typed(&[("messageLow", low), ("messageHigh", high)]),
            secondary_values: None,
            scope,
        }),
    }
}

pub(super) fn apply_action_draft(
    session: &mut EditorSession,
    steps: Vec<ActionStepDraft>,
) -> Result<ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: Revision(0),
        command: EditorCommand::ApplyActionPointDraft {
            draft: ActionPointRecordDraft {
                source: StableId("action-point:land:0:0".into()),
                descriptor: String::new(),
                header: header(),
                steps,
            },
        },
    })
}

pub(super) fn shared_random_message_snapshot() -> ProjectSnapshot {
    let mut snapshot = placed_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: [1, 2, -7, -8, -9],
    });
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 1,
        raw_opcode: 19,
        target_native_id: 12,
    });
    let mut second = snapshot.world.action_points[0].clone();
    second.identity = StableId("action-point:land:0:1".into());
    second.record_index = 1;
    second.coordinate = Some(MapCoordinate { x: 2, y: 1 });
    second.classic_door_id = 102;
    second.actions = vec![ClassicAction {
        slot: 2,
        raw_opcode: 19,
        target_native_id: 12,
    }];
    snapshot.world.action_points.push(second);
    snapshot
}
