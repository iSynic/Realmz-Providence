use super::*;
use std::collections::BTreeSet;

#[test]
fn random_rectangles_resolve_enabled_xaps_and_classic_wrapped_battle_ranges() {
    assert_eq!(classic_between_bounds([147, 145]), [147, 147]);
    let snapshot = random_rectangle_snapshot();
    project_rebuilt_v3_scenario(&snapshot)
        .expect("disabled negative door and inverted Classic range are valid");
}

#[test]
fn referenced_battles_are_derived_from_random_regions_and_all_action_owners() {
    let mut snapshot = random_rectangle_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id == NativeRecordId(9))
        .expect("controlled extra-code row")
        .values = [-2, 4, 0, 0, 0];
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 2,
        target_native_id: 9,
    }];
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:9".into()),
        native_id: NativeRecordId(9),
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 56,
            target_native_id: 9,
        }],
        choice_results: [0; 4],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
    add_battle_range(&mut snapshot, 2..=4);

    assert_eq!(
        rebuilt_v3_referenced_battle_ids(&snapshot).unwrap(),
        BTreeSet::from([2, 3, 4, 147])
    );

    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id == NativeRecordId(9))
        .expect("controlled extra-code row")
        .values = [999, 0, 0, 0, 0];
    assert_eq!(
        rebuilt_v3_referenced_battle_ids(&snapshot),
        Err(RebuiltV3ScenarioError::MissingReferencedBattle {
            owner: snapshot.world.action_points[0].identity.clone(),
            opcode: 2,
            battle_id: 999,
        })
    );
}

#[test]
fn random_rectangles_reject_enabled_negative_doors_and_missing_battles() {
    let rectangle = StableId("land:0:rect:0".into());
    let mut snapshot = random_rectangle_snapshot();
    snapshot.world.maps[0]
        .runtime
        .as_mut()
        .expect("runtime metadata")
        .random_rectangles[0]
        .random_door_percent[1] = 25;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(
            RebuiltV3ScenarioError::MissingRandomRectangleExtraActionPoint {
                rectangle: rectangle.clone(),
                native_id: -99,
            }
        )
    );

    let mut snapshot = random_rectangle_snapshot();
    snapshot.world.maps[0]
        .runtime
        .as_mut()
        .expect("runtime metadata")
        .random_rectangles[0]
        .battle_range = [147, 148];
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingRandomRectangleBattle {
            rectangle,
            battle_id: 148,
        })
    );
}

#[test]
fn opcode_44_is_bounded_to_complex_results_one_through_four() {
    project_rebuilt_v3_scenario(&complex_result_snapshot(4))
        .expect("Complex result opcode resolves");

    assert_eq!(
        project_rebuilt_v3_scenario(&complex_result_snapshot(5)),
        Err(RebuiltV3ScenarioError::InvalidEncounterResultOpcode {
            program: StableId("complex:0:result:0".into()),
            slot: 0,
            result: 5,
        })
    );

    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    let action = snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 4)
        .expect("trigger action");
    action.raw_opcode = 44;
    action.target_native_id = 1;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::InvalidEncounterResultOpcode {
            program: StableId("trigger:Data DD:0:5".into()),
            slot: 0,
            result: 1,
        })
    );
}

#[test]
fn opcode_57_requires_a_land_map_darkness_flag_and_projected_landlook_set() {
    project_rebuilt_v3_scenario(&opcode_57_snapshot())
        .expect("land map and battle-terrain set resolve");

    let program = StableId("trigger:Data DD:0:5".into());
    let mut snapshot = opcode_57_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 15)
        .expect("opcode 57 E-code")
        .values[1] = 2;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::InvalidLandlookOpcode {
            program: program.clone(),
            darkness: 2,
        })
    );

    let mut snapshot = opcode_57_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 15)
        .expect("opcode 57 E-code")
        .values[2] = 7;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingOpcodeMap {
            program: program.clone(),
            opcode: 57,
            level_type: LevelType::Land,
            native_index: 7,
        })
    );

    let mut snapshot = opcode_57_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 15)
        .expect("opcode 57 E-code")
        .values[0] = 3;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingLandlookBattleTerrain {
            program,
            landlook: 3,
        })
    );
}

#[test]
fn opcode_92_uses_pinned_map_and_random_rectangle_normalization() {
    let mut sparse = snapshot();
    sparse.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    sparse.world.maps[0]
        .runtime
        .as_mut()
        .unwrap()
        .random_rectangles[0]
        .identity = StableId("land:0:rect:2".into());
    sparse
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 8)
        .expect("opcode 92 E-code")
        .values[1] = 2;
    project_rebuilt_v3_scenario(&sparse)
        .expect("opcode 92 resolves the native slot identity, not vector position");

    let mut normalized = snapshot();
    normalized.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    let extra_code = &mut normalized
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 8)
        .expect("opcode 92 E-code")
        .values;
    extra_code[0] = -4;
    extra_code[1] = -2;
    project_rebuilt_v3_scenario(&normalized)
        .expect("negative map and rectangle values normalize to zero");
}

#[test]
fn opcode_92_requires_a_map_but_allows_empty_physical_rectangle_slots() {
    let mut missing_map = snapshot();
    missing_map.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    missing_map
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 8)
        .expect("opcode 92 E-code")
        .values[2] = 1;
    assert_eq!(
        project_rebuilt_v3_scenario(&missing_map),
        Err(RebuiltV3ScenarioError::MissingOpcodeMap {
            program: StableId("trigger:Data DD:0:5".into()),
            opcode: 92,
            level_type: LevelType::Dungeon,
            native_index: 0,
        })
    );

    let mut physically_empty_rectangle = snapshot();
    physically_empty_rectangle.scenario_application =
        Some(crate::model::ScenarioApplicationContract {
            hooks: ScenarioApplicationHooks::default(),
        });
    physically_empty_rectangle
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 8)
        .expect("opcode 92 E-code")
        .values[1] = 1;
    project_rebuilt_v3_scenario(&physically_empty_rectangle)
        .expect("opcode 92 can address an all-zero physical rectangle slot");
}

fn add_battle_range(snapshot: &mut ProjectSnapshot, range: std::ops::RangeInclusive<u32>) {
    for native_id in range {
        snapshot.battles.push(BattleRecord {
            identity: StableId(format!("battle:{native_id}")),
            native_id: NativeRecordId(native_id),
            grid: vec![0; BATTLE_GRID_SLOTS],
            distance: 0,
            message_before: 0,
            message_after: 0,
            battle_macro: 0,
            authored: true,
        });
    }
}
