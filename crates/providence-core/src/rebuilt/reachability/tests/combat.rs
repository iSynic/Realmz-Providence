use super::*;

#[test]
fn fixed_point_follows_program_battle_monster_and_macro_dependencies() {
    let snapshot = fixed_point_fixture();
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    assert_eq!(report.reachable_battle_ids, vec![2]);
    assert_eq!(report.reachable_monster_ids, vec![3]);
    assert_eq!(
        report.reachable_program_ids,
        vec![
            StableId("trigger:Data DD:0:0".into()),
            StableId("xap:1".into()),
            StableId("xap:4".into()),
            StableId("xap:5".into()),
            StableId("xap:6".into()),
        ]
    );
    assert!(report.unresolved_references.is_empty());
    assert_eq!(
        report,
        derive_rebuilt_v3_reachability(&snapshot).expect("repeat")
    );
}

#[test]
fn reachable_missing_extra_code_and_target_are_explicit() {
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
        actions: vec![action(0, 39, 9), action(1, 56, 22)],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    assert_eq!(report.unresolved_references.len(), 2);
    assert!(report.unresolved_references.iter().any(|reference| {
        reference.target == RebuiltV3ReachabilityTarget::Program(StableId("xap:9".into()))
    }));
    assert!(
        report
            .unresolved_references
            .iter()
            .any(|reference| { reference.target == RebuiltV3ReachabilityTarget::ExtraCode(22) })
    );
}

#[test]
fn opcode_127_tests_runtime_roster_without_requiring_a_source_monster() {
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
        actions: vec![action(0, 127, 99)],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    let reference = report
        .references
        .iter()
        .find(|reference| reference.target == RebuiltV3ReachabilityTarget::Monster(99))
        .expect("opcode 127 roster presence test");
    assert_eq!(
        reference.relation,
        RebuiltV3ReachabilityRelation::TestsMonsterPresence
    );
    assert!(reference.resolved);
    assert!(report.unresolved_references.is_empty());
    assert!(report.reachable_monster_ids.is_empty());
}

#[test]
fn opcode_89_ally_target_selects_its_source_monster() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("ally-reachability".into()));
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
        actions: vec![action(0, 89, 7)],
    });
    snapshot.monster_sets.push(MonsterSet {
        set_id: 0,
        native_path: "Data MD".into(),
        monsters: vec![monster(7, 12)],
    });
    snapshot.extra_action_points.push(xap(12, vec![]));

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("ally reachability");
    assert_eq!(report.reachable_monster_ids, vec![7]);
    assert!(
        report
            .reachable_program_ids
            .contains(&StableId("xap:12".into()))
    );
    assert!(report.references.iter().any(|reference| {
        reference.relation == RebuiltV3ReachabilityRelation::SpawnsMonster
            && reference.target == RebuiltV3ReachabilityTarget::Monster(7)
            && reference.resolved
    }));

    snapshot.monster_sets.clear();
    let missing = derive_rebuilt_v3_reachability(&snapshot).expect("missing ally");
    assert_eq!(missing.unresolved_references.len(), 1);
    assert_eq!(
        missing.unresolved_references[0].target,
        RebuiltV3ReachabilityTarget::Monster(7)
    );
}
