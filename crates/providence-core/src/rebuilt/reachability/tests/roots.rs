use super::*;

#[test]
fn lifecycle_timed_random_and_door_item_roots_are_source_bounded() {
    let snapshot = root_fixture();
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    assert_eq!(
        report.reachable_program_ids,
        vec![
            StableId("xap:1".into()),
            StableId("xap:2".into()),
            StableId("xap:3".into()),
            StableId("xap:4".into()),
        ]
    );
    assert_eq!(report.reachable_battle_ids, vec![1, 2, 3]);
    assert!(report.unresolved_references.is_empty());
}

#[test]
fn dormant_timed_rows_need_a_rescheduling_caller_before_their_macro_is_reachable() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-dormancy".into()));
    let timed = |id: u32, day: i16, door: i16| TimedEncounter {
        identity: StableId(format!("timed-encounter:{id}")),
        native_id: NativeRecordId(id),
        day,
        increment: 0,
        percent: 100,
        door,
        required_level: -1,
        required_random_rect: -1,
        required_x: -1,
        required_y: -1,
        required_item: -1,
        required_quest: -1,
        location_kind: TimedEncounterLocationKind::Any,
        authored: false,
    };
    snapshot.timed_encounters = vec![
        timed(0, -1, -1),
        timed(1, 2, 7),
        timed(2, -1, 8),
        timed(3, 0, -1),
    ];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(12),
        values: [2, 100, 0, 1, 0],
    });
    snapshot.extra_action_points = vec![xap(7, vec![action(0, 54, 12)]), xap(8, vec![])];

    let reachable = derive_rebuilt_v3_reachability(&snapshot).expect("scheduled and mutable rows");
    assert_eq!(
        reachable.reachable_program_ids,
        vec![StableId("xap:7".into()), StableId("xap:8".into())]
    );
    assert!(reachable.unresolved_references.is_empty());

    snapshot.extra_action_points[0].actions.clear();
    let dormant = derive_rebuilt_v3_reachability(&snapshot).expect("unmutated dormant rows");
    assert_eq!(
        dormant.reachable_program_ids,
        vec![StableId("xap:7".into())]
    );
    assert!(dormant.unresolved_references.is_empty());

    snapshot.extra_action_points[0]
        .actions
        .push(action(0, 54, 12));
    snapshot.timed_encounters[2].door = -1;
    let invalid = derive_rebuilt_v3_reachability(&snapshot).expect("mutable invalid macro");
    assert!(invalid.unresolved_references.iter().any(|reference| {
        reference.source == StableId("timed-encounter:2".into())
            && reference.target == RebuiltV3ReachabilityTarget::Program(StableId("xap:-1".into()))
    }));
}
