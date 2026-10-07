use super::*;

#[test]
fn a_shared_macro_retains_each_loaded_simple_encounters_result_destination() {
    let mut snapshot = prelude_payment_fixture();
    snapshot.world.action_points[0].actions = vec![action(0, 4, 3), action(1, 4, 4)];
    snapshot.simple_encounters[0].actions = vec![action(28, 39, 149)];
    let mut second = snapshot.simple_encounters[0].clone();
    second.identity = StableId("simple-encounter:4".into());
    second.native_id = NativeRecordId(4);
    snapshot.simple_encounters.push(second);
    snapshot.extra_action_points[0].actions = vec![action(0, 3, 75)];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(75),
        values: [1, 2, 3, 0, 0],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("both loaded encounters");
    assert!(report.unresolved_references.is_empty());
    for id in [3, 4] {
        assert!(report.references.iter().any(|reference| {
            reference.source == StableId("xap:149".into())
                && reference.target
                    == RebuiltV3ReachabilityTarget::Program(StableId(format!(
                        "simple:{id}:result:3"
                    )))
        }));
    }
    snapshot.world.action_points[0].actions.reverse();
    assert_eq!(
        report,
        derive_rebuilt_v3_reachability(&snapshot).expect("reordered roots")
    );
}

fn messages() -> Vec<ScenarioMessage> {
    [0, 368]
        .into_iter()
        .map(|id| ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("Message {id}"),
            authored: true,
        })
        .collect()
}

fn prelude_payment_fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("prelude-payment".into()));
    snapshot.scenario_application = Some(ScenarioApplicationContract::default());
    snapshot.messages = messages();
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: String::new(),
        tiles: vec![],
        runtime: None,
    });
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:9".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 9,
        classic_door_id: 9,
        coordinate: Some(MapCoordinate { x: 23, y: 12 }),
        post_action_level: 0,
        post_action_x: 23,
        post_action_y: 12,
        chance_percent: 100,
        actions: vec![action(0, 4, 3), action(1, 5, 3)],
    });
    add_payment_encounters(&mut snapshot);
    add_payment_programs(&mut snapshot);
    snapshot
}

fn add_payment_encounters(snapshot: &mut ProjectSnapshot) {
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: vec![action(28, 33, 73)],
        choice_results: [4, 0, 0, 0],
        can_back_out: false,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: ["Pay".into(), String::new(), String::new(), String::new()],
        authored: true,
    });
    snapshot.complex_encounters.push(ComplexEncounter {
        identity: StableId("complex-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: vec![action(28, 33, 74)],
        action_result: 1,
        word_result: 0,
        groups: [0; 8],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: false,
        thief: false,
        max_times: 0,
        caste_success: 0,
        thief_success: 0,
        thief_fail: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
}

fn add_payment_programs(snapshot: &mut ProjectSnapshot) {
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(73),
        values: [3, 0, 0, 149, 0],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(74),
        values: [3, 2, 2, 3, 4],
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:149".into()),
        native_id: NativeRecordId(149),
        classic_door_id: 149,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![action(0, 1, 368)],
    });
}

#[test]
fn take_gold_failure_in_simple_encounter_reaches_authored_extra_action_point() {
    let mut snapshot = prelude_payment_fixture();
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("reachability");
    assert!(
        report
            .reachable_program_ids
            .contains(&StableId("xap:149".into()))
    );
    assert!(report.unresolved_references.is_empty());
    assert!(report.references.iter().any(|reference| {
        reference.source == StableId("simple:3:result:3".into())
            && reference.field == "actions[4].extraCode[3]"
            && reference.target == RebuiltV3ReachabilityTarget::Program(StableId("xap:149".into()))
    }));
    let (scenario, _, _) =
        crate::rebuilt::scenario::project_rebuilt_v3_selected_scenario(&snapshot, &report)
            .expect("selected scenario document");
    assert!(
        scenario
            .programs
            .iter()
            .any(|program| program.id == StableId("xap:149".into()))
    );

    for selector in [1, 2] {
        snapshot.extra_codes[0].values[1] = selector;
        let report = derive_rebuilt_v3_reachability(&snapshot).expect("selected branch");
        assert!(
            report
                .reachable_program_ids
                .contains(&StableId("xap:149".into()))
        );
    }
}

#[test]
fn take_gold_result_branches_use_loaded_encounter_context() {
    let mut snapshot = prelude_payment_fixture();
    snapshot.extra_codes[0].values = [3, 1, 1, 3, 4];
    let report = derive_rebuilt_v3_reachability(&snapshot).expect("Simple result branch");
    assert!(report.unresolved_references.is_empty());
    assert!(report.references.iter().any(|reference| {
        reference.source == StableId("simple:3:result:3".into())
            && reference.field == "actions[4].extraCode[3]"
            && reference.target
                == RebuiltV3ReachabilityTarget::Program(StableId("simple:3:result:3".into()))
    }));
    assert!(!report.references.iter().any(|reference| {
        reference.source == StableId("simple:3:result:3".into())
            && reference.relation == RebuiltV3ReachabilityRelation::StartsSimpleEncounter
    }));

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("Complex result branch");
    assert!(report.unresolved_references.is_empty());
    assert!(
        report.references.iter().any(|reference| {
            reference.source == StableId("complex:3:result:3".into())
                && reference.field == "actions[4].extraCode[3]"
                && reference.target
                    == RebuiltV3ReachabilityTarget::Program(StableId("complex:3:result:3".into()))
        }),
        "references: {:?}",
        report.references
    );
    let (scenario, _, _) =
        crate::rebuilt::scenario::project_rebuilt_v3_selected_scenario(&snapshot, &report)
            .expect("selected complex result scenario document");
    let branch = scenario
        .programs
        .iter()
        .find(|program| program.id == StableId("simple:3:result:3".into()))
        .expect("issuing Simple result program");
    assert_eq!(branch.instructions[0].extra_code, Some(vec![3, 1, 1, 3, 4]));
    assert_eq!(branch.instructions[0].slot, 4);
    assert!(
        scenario
            .programs
            .iter()
            .any(|program| program.id == StableId("complex:3:result:3".into()))
    );
}

#[test]
fn take_gold_nonbranching_modes_add_no_external_program() {
    let mut snapshot = prelude_payment_fixture();
    snapshot.extra_codes[0].values = [3, 1, 1, 3, 4];
    for (selector, mode) in [(-1, 0), (0, 3)] {
        snapshot.extra_codes[0].values[1] = selector;
        snapshot.extra_codes[0].values[2] = mode;
        let report = derive_rebuilt_v3_reachability(&snapshot).expect("no external branch");
        assert!(
            !report
                .reachable_program_ids
                .contains(&StableId("xap:149".into()))
        );
    }
}

#[test]
fn xap_transfer_keeps_the_loaded_simple_result_context() {
    let mut snapshot = prelude_payment_fixture();
    snapshot.world.action_points[0].actions = vec![action(0, 4, 3)];
    snapshot.simple_encounters[0].actions = vec![action(28, 39, 149)];
    snapshot.extra_action_points[0].actions = vec![action(0, 3, 75)];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(75),
        values: [1, 2, 3, 0, 0],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("loaded Simple context");
    assert!(report.unresolved_references.is_empty());
    assert!(report.references.iter().any(|reference| {
        reference.source == StableId("xap:149".into())
            && reference.field == "actions[0].extraCode[2]"
            && reference.target
                == RebuiltV3ReachabilityTarget::Program(StableId("simple:3:result:3".into()))
    }));

    snapshot.world.action_points[0]
        .actions
        .push(action(1, 39, 149));
    let mixed = derive_rebuilt_v3_reachability(&snapshot).expect("independent root path");
    assert!(mixed.unresolved_references.iter().any(|reference| {
        reference.source == StableId("xap:149".into())
            && reference.field == "actions[0].extraCode[2]"
            && reference.target
                == RebuiltV3ReachabilityTarget::Invalid(
                    "inline encounter result mode 1 row 3".into(),
                )
    }));
}

#[test]
fn xap_transfer_keeps_the_loaded_complex_result_context() {
    let mut snapshot = prelude_payment_fixture();
    snapshot.world.action_points[0].actions = vec![action(0, 5, 3)];
    snapshot.complex_encounters[0].actions = vec![action(0, 39, 149)];
    snapshot.extra_action_points[0].actions = vec![action(0, 33, 75)];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(75),
        values: [3, 2, 2, 3, 4],
    });

    let report = derive_rebuilt_v3_reachability(&snapshot).expect("loaded Complex context");
    assert!(report.unresolved_references.is_empty());
    assert!(report.references.iter().any(|reference| {
        reference.source == StableId("xap:149".into())
            && reference.field == "actions[0].extraCode[3]"
            && reference.target
                == RebuiltV3ReachabilityTarget::Program(StableId("complex:3:result:3".into()))
    }));
}
