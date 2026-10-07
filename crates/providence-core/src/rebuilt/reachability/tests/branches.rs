use super::*;

#[test]
fn choice_mode_four_eliminates_an_option_without_inventing_a_target() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("reachability".into()));
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 1,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![action(0, 4, 0)],
    });
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:0".into()),
        native_id: NativeRecordId(0),
        actions: vec![action(0, 3, 10)],
        choice_results: [1, 0, 0, 0],
        can_back_out: false,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: [
            "Continue".into(),
            String::new(),
            String::new(),
            String::new(),
        ],
        authored: true,
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(10),
        values: [0, 4, 0, 0, 0],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    assert!(report.unresolved_references.is_empty());
    assert!(
        !report.references.iter().any(|reference| {
            matches!(reference.target, RebuiltV3ReachabilityTarget::Invalid(_))
        })
    );
}

#[test]
fn unknown_external_branch_mode_is_a_source_resolved_runtime_noop() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("reachability".into()));
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 1,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![action(0, 40, 10)],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(10),
        values: [1, 72, 99, 0, 0],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    assert!(report.unresolved_references.is_empty());
    assert!(report.references.iter().any(|reference| {
        reference.relation == RebuiltV3ReachabilityRelation::RuntimeNoOp
            && reference.target == RebuiltV3ReachabilityTarget::RuntimeNoOp("branch mode 72".into())
    }));
}

#[test]
fn source_resolved_classic_noop_is_visible_without_becoming_a_blocker() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("reachability".into()));
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 1,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![action(0, 200, 99)],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    assert!(report.unresolved_references.is_empty());
    assert!(report.references.iter().any(|reference| {
        reference.relation == RebuiltV3ReachabilityRelation::RuntimeNoOp
            && reference.target == RebuiltV3ReachabilityTarget::RuntimeNoOp("opcode 200".into())
    }));
}
