use super::{action, fixture, read};
use providence_core::{
    model::{
        ComplexEncounter, ExtraCodeRow, NativeRecordId, RogueEncounter, SimpleEncounter, StableId,
    },
    session::EditorSession,
};
use serde_json::json;

fn complex(id: u32) -> ComplexEncounter {
    ComplexEncounter {
        identity: StableId(format!("complex-encounter:{id}")),
        native_id: NativeRecordId(id),
        actions: vec![],
        action_result: 2,
        word_result: 3,
        groups: [0; 8],
        spell_ids: [1; 10],
        spell_results: [1; 10],
        item_ids: [1; 5],
        item_results: [2; 5],
        can_back_out: true,
        thief: true,
        max_times: 0,
        caste_success: 0,
        thief_success: 7,
        thief_fail: 1,
        prompt_message_native_id: 349,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    }
}

#[test]
fn discovery_complex_failure_and_rogue_returns_keep_exact_calling_owner() {
    let mut s = fixture().snapshot().clone();
    s.complex_encounters = vec![complex(3), complex(5)];
    s.rogue_encounters.push(rogue());
    let mut session = EditorSession::new(s);
    for id in [3, 5] {
        let failures = read(
            &mut session,
            "discovery.links",
            json!({"direction":"incoming", "kind":"complex-encounter-result", "id":format!("complex-encounter:{id}:result:3")}),
        );
        let rows = failures["items"].as_array().unwrap();
        for field in ["wordResult", "actionResult", "spellResults", "itemResults"] {
            assert!(rows.iter().any(
                |r| r["field"] == field && r["meaning"].as_str().unwrap().contains("Result 4")
            ));
        }
        assert!(rows.iter().any(|r| r["source"] == "rogue-encounter:7"
            && r["field"] == "failureCodes[0]"
            && r["targetIdentity"] == format!("complex-encounter:{id}:result:3")));
    }
    let outgoing = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"rogue-encounter:7"}),
    );
    assert!(
        outgoing["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["targetIdentity"] == "complex-encounter:3:result:1")
    );
    assert!(
        outgoing["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["targetIdentity"] == "complex-encounter:5:result:1")
    );
}

#[test]
fn discovery_mid_result_entry_excludes_earlier_steps_and_preserves_frontier_position() {
    let s = mid_result_fixture();
    let mut session = EditorSession::new(s);
    let earlier = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"12", "depthLimit":8}),
    );
    assert!(
        !earlier["trace"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["link"]["field"] == "actions[8].settings.target")
    );
    let later = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"91", "depthLimit":8}),
    );
    assert!(
        later["trace"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["link"]["field"] == "actions[8].settings.target"
                && r["link"]["codePosition"] == 3)
    );
    let frontier = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"12", "depthLimit":1}),
    );
    assert!(
        frontier["trace"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["link"]["source"] == "simple-encounter:3" && r["callerPosition"] == 0)
    );
    let continued = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"simple-encounter-result", "id":"simple-encounter:3:result:0", "requiredPosition":0, "depthLimit":8}),
    );
    assert!(
        !continued["trace"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["link"]["field"] == "actions[8].settings.target")
    );
}

#[test]
fn discovery_direct_ap_call_keeps_the_callers_map_and_xap_remains_contextual() {
    use providence_core::model::{ActionPoint, LevelType};
    let mut s = fixture().snapshot().clone();
    for level in [0, 5] {
        s.world.action_points.push(ActionPoint {
            identity: StableId(format!("action-point:land:{level}:7")),
            level_type: LevelType::Land,
            level_index: level,
            record_index: 7,
            classic_door_id: 0,
            coordinate: None,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![action(0, 8, 7)],
        });
    }
    s.extra_action_points[12].actions.push(action(2, 8, 7));
    let mut session = EditorSession::new(s);
    let direct = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"action-point:land:5:7"}),
    );
    let row = direct["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["field"] == "actions[0].target")
        .unwrap();
    assert_eq!(row["targetIdentity"], "action-point:land:5:7");
    let contextual = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"extra-action-point:12"}),
    );
    let row = contextual["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["field"] == "actions[2].target")
        .unwrap();
    assert!(row["targetIdentity"].is_null());
    assert!(row["activity"].as_str().unwrap().contains("contextual"));
}

fn mid_result_fixture() -> providence_core::model::ProjectSnapshot {
    let mut s = fixture().snapshot().clone();
    s.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: vec![action(0, 39, 12), action(5, 39, 91), action(8, 46, 6)],
        choice_results: [0; 4],
        can_back_out: true,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 349,
        texts: std::array::from_fn(|_| String::new()),
        authored: true,
    });
    s.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(6),
        values: [9, 1, 1, 0, 3],
    });
    s
}

fn rogue() -> RogueEncounter {
    RogueEncounter {
        identity: StableId("rogue-encounter:7".into()),
        native_id: NativeRecordId(7),
        type_flags: [true; 10],
        modifiers: [0; 8],
        success_codes: [2; 8],
        failure_codes: [4; 8],
        success_text: [0; 8],
        failure_text: [0; 8],
        success_sounds: [0; 8],
        failure_sounds: [0; 8],
        spell: 0,
        low_damage: 0,
        high_damage: 0,
        tumblers: 0,
        prompts: [0; 3],
        prompt_sounds: [0; 3],
        authored: true,
    }
}

#[test]
fn discovery_forward_branch_in_the_same_result_is_not_a_cycle() {
    let mut s = mid_result_fixture();
    s.simple_encounters[0].actions = vec![action(0, 46, 6), action(5, 39, 12)];
    let mut session = EditorSession::new(s);
    let page = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"12","depthLimit":8}),
    );
    let branch = page["trace"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["link"]["field"] == "actions[0].settings.target")
        .unwrap();
    assert_eq!(branch["cycle"], false);
    assert_eq!(branch["callerPosition"], 0);
    assert!(branch["positions"].as_array().unwrap().contains(&json!(5)));
}

#[test]
fn discovery_disabled_tests_are_evidence_and_rogue_actions_can_become_available() {
    let mut s = fixture().snapshot().clone();
    let mut owner = complex(3);
    owner.spell_ids[0] = 0;
    owner.item_ids[0] = 0;
    let mut rogue = rogue();
    rogue.type_flags = [false; 10];
    rogue.type_flags[1] = true;
    rogue.type_flags[9] = true;
    rogue.success_codes[1] = 0;
    rogue.prompt_sounds[1] = 100;
    s.complex_encounters.push(owner);
    s.rogue_encounters.push(rogue);
    let mut session = EditorSession::new(s);
    let disabled = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"complex-encounter:3"}),
    );
    let rows = disabled["items"].as_array().unwrap();
    assert!(
        !rows
            .iter()
            .any(|r| r["field"].as_str().unwrap().starts_with("spellResults"))
    );
    assert!(
        !rows
            .iter()
            .any(|r| r["field"].as_str().unwrap().starts_with("itemResults"))
    );
    let returns = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"rogue-encounter:7"}),
    );
    let rows = returns["items"].as_array().unwrap();
    assert!(rows.iter().any(|r| r["field"] == "successCodes[2]"));
    assert!(rows.iter().any(|r| r["field"] == "failureCodes[2]"));
    assert!(!rows.iter().any(|r| r["field"] == "successCodes[6]"));
}

#[test]
fn discovery_shared_rogue_trace_keeps_owner_in_continuations() {
    let mut s = fixture().snapshot().clone();
    s.complex_encounters = vec![complex(3), complex(5)];
    s.rogue_encounters.push(rogue());
    let mut session = EditorSession::new(s);
    let direct = read(
        &mut session,
        "discovery.links",
        json!({"direction":"incoming", "kind":"rogue-encounter", "id":"7"}),
    );
    for owner in [3, 5] {
        assert!(
            direct["items"]
                .as_array()
                .unwrap()
                .iter()
                .any(|r| r["source"] == format!("complex-encounter:{owner}"))
        );
    }
    let traced = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"complex-encounter-result", "id":"complex-encounter:5:result:3", "depthLimit":8}),
    );
    for row in traced["trace"]["items"].as_array().unwrap() {
        if row["path"]
            .as_array()
            .unwrap()
            .contains(&json!("rogue-encounter:7"))
        {
            assert!(
                !row["path"]
                    .as_array()
                    .unwrap()
                    .contains(&json!("complex-encounter:3"))
            );
        }
    }
    let continued = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"rogue-encounter", "id":"7", "identity":"rogue-encounter:7", "callerContext":"complex-encounter:5", "ancestors":["complex-encounter:5:result:3","rogue-encounter:7"], "ancestorContexts":[null,"complex-encounter:5"], "ancestorPositions":[null,null], "depthLimit":1}),
    );
    assert!(!continued["trace"]["items"].as_array().unwrap().is_empty());
    assert!(
        continued["trace"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["link"]["source"] == "complex-encounter:5")
    );
}

#[test]
fn discovery_persisted_detect_flag_makes_later_disarm_return_possible() {
    let mut s = fixture().snapshot().clone();
    s.complex_encounters.push(complex(3));
    let mut r = rogue();
    r.type_flags = [false; 10];
    r.type_flags[1] = true;
    r.type_flags[9] = true;
    r.success_codes[1] = 2;
    s.rogue_encounters.push(r);
    let mut session = EditorSession::new(s);
    let page = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"rogue-encounter:7"}),
    );
    let row = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["field"] == "successCodes[2]")
        .unwrap();
    assert!(
        row["meaning"]
            .as_str()
            .unwrap()
            .contains("later invocation")
    );
}

#[test]
fn discovery_invalid_result_position_is_visible_but_cannot_be_traced_or_opened() {
    let mut s = mid_result_fixture();
    s.extra_codes
        .iter_mut()
        .find(|r| r.native_id.0 == 6)
        .unwrap()
        .values[4] = 9;
    let mut session = EditorSession::new(s);
    let page = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"simple-encounter:3"}),
    );
    let row = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["field"] == "actions[8].settings.target")
        .unwrap();
    assert!(row["targetIdentity"].is_null());
    assert_eq!(row["resolution"], "missing");
    let trace = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"simple-encounter-result","id":"simple-encounter:3:result:0"}),
    );
    assert!(
        !trace["trace"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["link"]["codePosition"] == 9)
    );
}
