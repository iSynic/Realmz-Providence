use super::*;

#[test]
fn explicit_application_contract_projects_exact_schema_v3_document() {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks {
            start_game: Some(StableId("trigger:action-point:land:0:5".into())),
            ..ScenarioApplicationHooks::default()
        },
    });

    let projection = project_rebuilt_v3_scenario(&snapshot).expect("scenario projection");
    let encoded = serde_json::to_string(&projection).expect("serialize scenario");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_scenario(&snapshot).unwrap()).unwrap()
    );
    let value = serde_json::to_value(&projection).expect("scenario JSON");
    assert_eq!(value["kind"], "realmz2.scenario");
    assert_eq!(value["schemaVersion"], 3);
    assert_eq!(
        value["applicationHooks"]["startGame"],
        "trigger:Data DD:0:5"
    );
    assert!(value["applicationHooks"]["partyDeath"].is_null());
    assert_eq!(value["programs"].as_array().unwrap().len(), 6);
    assert!(value["programs"].as_array().unwrap().iter().any(|program| {
        program["id"] == "simple:3:result:0" && program["ownerKind"] == "simple-encounter-result"
    }));
    assert_eq!(value["scenarioActions"], serde_json::json!([]));
    assert_eq!(value["stateDefinitions"], serde_json::json!([]));
    assert_eq!(value["migrations"], serde_json::json!([]));

    let reopened: RebuiltV3ScenarioDocument =
        serde_json::from_str(&encoded).expect("reimport scenario projection");
    assert_eq!(reopened, projection);
}

#[test]
fn application_hook_must_resolve_to_an_emitted_program() {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks {
            shop: Some(StableId("extra-action-point:40".into())),
            ..ScenarioApplicationHooks::default()
        },
    });

    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingApplicationHookProgram {
            hook: "shop".into(),
            program: StableId("xap:40".into()),
        })
    );
}

#[test]
fn scenario_rejects_a_program_targeting_an_excluded_simple_encounter() {
    let mut snapshot = snapshot();
    snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 4)
        .expect("Simple Encounter action")
        .target_native_id = 9;
    snapshot.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:9".into()),
        native_id: NativeRecordId(9),
        actions: Vec::new(),
        choice_results: [0; 4],
        can_back_out: true,
        max_times: 1,
        caste_success: 0,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|_| String::new()),
        authored: false,
    });
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });

    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingSimpleEncounterTarget {
            program: StableId("trigger:Data DD:0:5".into()),
            encounter_id: 9,
        })
    );
}

#[test]
fn scenario_rejects_missing_direct_message_complex_and_xap_targets() {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    let action = snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 4)
        .expect("direct target action");
    action.raw_opcode = 1;
    action.target_native_id = -47;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingProgramMessage {
            program: StableId("trigger:Data DD:0:5".into()),
            message_id: -47,
        })
    );

    let action = snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 1)
        .expect("direct target action");
    action.raw_opcode = 5;
    action.target_native_id = 7;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingComplexEncounterTarget {
            program: StableId("trigger:Data DD:0:5".into()),
            encounter_id: 7,
        })
    );

    let action = snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 5)
        .expect("direct target action");
    action.raw_opcode = 39;
    action.target_native_id = 40;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingExtraActionPointTarget {
            program: StableId("trigger:Data DD:0:5".into()),
            native_id: 40,
        })
    );
}

#[test]
fn scenario_rejects_duplicate_runtime_program_ids() {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    snapshot.extra_action_points = [
        ExtraActionPoint {
            identity: StableId("extra-action-point:first".into()),
            native_id: NativeRecordId(40),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        },
        ExtraActionPoint {
            identity: StableId("extra-action-point:second".into()),
            native_id: NativeRecordId(40),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        },
    ]
    .into();

    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::DuplicateTriggerId(StableId(
            "Data ED3:macro:40".into()
        )))
    );
}

#[test]
fn opcode_62_requires_the_exact_text_resource_key() {
    let mut snapshot = snapshot();
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: ScenarioApplicationHooks::default(),
    });
    let action = snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 4)
        .expect("direct target action");
    action.raw_opcode = 62;
    action.target_native_id = 128;
    snapshot.assets.push(text_asset("TEXT", 128));
    project_rebuilt_v3_scenario(&snapshot).expect("exact TEXT key resolves");

    snapshot.assets[0]
        .classic_resource
        .as_mut()
        .expect("Classic resource")
        .resource_type = "Text".into();
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingTextResourceTarget {
            program: StableId("trigger:Data DD:0:5".into()),
            resource_id: 128,
        })
    );
}

#[test]
fn trigger_failure_precedes_encounter_and_program_reference_failures() {
    let mut snapshot = branch_snapshot();
    snapshot.world.action_points[0].post_action_level = 99;
    snapshot.simple_encounters[0].texts = std::array::from_fn(|_| String::new());
    snapshot.world.action_points[0].actions[0].target_native_id = -1;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingDestinationMap(
            snapshot.world.action_points[0].identity.clone(),
            99,
        ))
    );
}

#[test]
fn duplicate_trigger_failure_precedes_instruction_reference_validation() {
    let mut snapshot = branch_snapshot();
    let mut duplicate = snapshot.extra_action_points[0].clone();
    duplicate.identity = StableId("extra-action-point:duplicate".into());
    snapshot.extra_action_points.push(duplicate);
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 1,
        target_native_id: 999,
    }];
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::DuplicateTriggerId(StableId(
            "Data ED3:macro:40".into()
        ),))
    );
}
