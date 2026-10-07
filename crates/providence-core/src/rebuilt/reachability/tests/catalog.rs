use super::*;

#[test]
fn conflicting_catalogs_report_the_first_native_failure_before_traversal() {
    let mut snapshot = fixed_point_fixture();
    snapshot
        .world
        .action_points
        .push(snapshot.world.action_points[0].clone());
    snapshot
        .extra_action_points
        .push(snapshot.extra_action_points[0].clone());
    snapshot.battles.push(snapshot.battles[0].clone());
    let duplicate_monster = snapshot.monster_sets[0].monsters[0].clone();
    snapshot.monster_sets[0].monsters.push(duplicate_monster);
    snapshot.extra_codes.push(snapshot.extra_codes[0].clone());

    assert_eq!(
        derive_rebuilt_v3_reachability(&snapshot),
        Err(RebuiltV3ReachabilityError::DuplicateProgramId(StableId(
            "trigger:Data DD:0:0".into()
        )))
    );
    snapshot.world.action_points.pop();
    assert_eq!(
        derive_rebuilt_v3_reachability(&snapshot),
        Err(RebuiltV3ReachabilityError::DuplicateProgramId(StableId(
            "xap:1".into()
        )))
    );
    snapshot.extra_action_points.pop();
    assert_eq!(
        derive_rebuilt_v3_reachability(&snapshot),
        Err(RebuiltV3ReachabilityError::DuplicateBattleId(2))
    );
    snapshot.battles.pop();
    assert_eq!(
        derive_rebuilt_v3_reachability(&snapshot),
        Err(RebuiltV3ReachabilityError::DuplicateMonsterId(3))
    );
    snapshot.monster_sets[0].monsters.pop();
    assert_eq!(
        derive_rebuilt_v3_reachability(&snapshot),
        Err(RebuiltV3ReachabilityError::DuplicateExtraCodeId(10))
    );
    snapshot.extra_codes.pop();
    assert_eq!(
        derive_rebuilt_v3_reachability(&snapshot),
        derive_rebuilt_v3_reachability(&fixed_point_fixture())
    );
}
