use crate::demo::demo_snapshot;
use crate::dispatch_result;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::decode_monster_set;
use providence_core::codecs::decode_timed_encounters;
use providence_core::model::ClassicAction;
use providence_core::model::ExtraCodeRow;
use providence_core::model::NativeRecordId;
use providence_core::session::EditorSession;
use serde_json::json;

#[test]
fn rebuilt_trigger_program_inspection_returns_owner_matched_fragments() {
    let mut session = EditorSession::new(demo_snapshot());
    let result = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-trigger-programs",
        json!({}),
    )
    .expect("inspect trigger programs");

    assert_eq!(result["triggers"][0]["id"], "Data DD:0:17");
    let program_id = result["triggers"][0]["programId"].as_str().unwrap();
    let program = result["programs"]
        .as_array()
        .unwrap()
        .iter()
        .find(|program| program["id"] == program_id)
        .expect("owner-matched trigger program");
    assert_eq!(program["ownerId"], result["triggers"][0]["id"]);
    assert!(
        result["programs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|program| {
                program["id"] == "xap:40" && program["ownerKind"] == "extra-action-point"
            })
    );
}

#[test]
fn rebuilt_reachability_inspection_is_bounded_and_omits_project_state() {
    let mut snapshot = demo_snapshot();
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 2,
        raw_opcode: 39,
        target_native_id: 99,
    });
    let mut session = EditorSession::new(snapshot);

    let result = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"offset": 0, "limit": 1}),
    )
    .expect("inspect bounded reachability");

    assert_eq!(result["revision"], 0);
    assert_eq!(result["counts"]["unresolved"], 1);
    assert_eq!(result["total"], 1);
    assert_eq!(result["limit"], 1);
    assert_eq!(result["truncated"], false);
    assert_eq!(result["problems"].as_array().unwrap().len(), 1);
    assert_eq!(
        result["problems"][0]["target"],
        json!({"kind": "program", "id": "xap:99"})
    );
    assert_eq!(result["problems"][0]["source"], "action-point:land:0:17");
    assert_eq!(result["problems"][0]["field"], "actions[2].target");
    assert_eq!(
        result["problems"][0]["navigation"]["documentKind"],
        "action-point"
    );
    assert_eq!(
        result["problems"][0]["repair"]["method"],
        "action-reference.retarget"
    );
    assert_eq!(
        result["problems"][0]["byteProvenance"]["nativePath"],
        "Data DD"
    );
    assert!(result.get("snapshot").is_none());
    assert!(result.get("reachableProgramIds").is_none());
    assert!(result.get("references").is_none());
    assert!(result.get("unresolved").is_none());
}

#[test]
fn rebuilt_reachability_extra_code_problem_has_one_narrow_repair_command() {
    let mut session = EditorSession::new(monster_extra_code_snapshot());

    let before = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 10}),
    )
    .expect("inspect reachability problem");
    assert_monster_extra_code_problem(&before);

    let repaired = dispatch_result(
        &mut session,
        "extra-code-value.retarget",
        json!({
            "expectedRevision": 0,
            "source": "extra-code:8",
            "index": 1,
            "targetId": 0
        }),
    )
    .expect("retarget one Data EDCD value");
    assert_eq!(repaired["revision"], 1);
    assert_eq!(repaired["changedEntities"], json!(["extra-code:8"]));
    assert_eq!(
        session
            .snapshot()
            .extra_codes
            .iter()
            .find(|row| row.native_id == NativeRecordId(8))
            .unwrap()
            .values[1],
        0
    );

    let after = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 10}),
    )
    .expect("reinspect repaired reachability");
    assert!(
        after["problems"]
            .as_array()
            .unwrap()
            .iter()
            .all(|problem| problem["source"] != "extra-code:8")
    );
}

fn monster_extra_code_snapshot() -> providence_core::model::ProjectSnapshot {
    let mut snapshot = demo_snapshot();
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 2,
        raw_opcode: 120,
        target_native_id: 8,
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(8),
        values: [0, 99, 0, 0, 0],
    });
    snapshot.monster_sets.push(decode_monster_set(
        &vec![0; MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    ));
    snapshot
}

fn assert_monster_extra_code_problem(projection: &serde_json::Value) {
    let problem = projection["problems"]
        .as_array()
        .unwrap()
        .iter()
        .find(|problem| problem["source"] == "extra-code:8")
        .expect("missing monster problem from Data EDCD");
    assert_eq!(problem["field"], "values[1]");
    assert_eq!(problem["targetKind"], "monster");
    assert_eq!(problem["targetId"], "99");
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data EDCD");
    assert_eq!(problem["byteProvenance"]["byteStart"], 82);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 84);
    assert_eq!(problem["repair"]["method"], "extra-code-value.retarget");
    assert_eq!(problem["repair"]["params"]["index"], 1);
}

#[test]
fn direct_monster_presence_test_does_not_require_a_source_monster() {
    let mut snapshot = demo_snapshot();
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 2,
        raw_opcode: 39,
        target_native_id: 40,
    });
    snapshot.extra_action_points[0].actions.push(ClassicAction {
        slot: 3,
        raw_opcode: 127,
        target_native_id: 99,
    });
    snapshot.monster_sets.push(decode_monster_set(
        &vec![0; MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    ));
    let mut session = EditorSession::new(snapshot);

    let inspection = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("inspect runtime roster test");
    assert!(
        !inspection["problems"]
            .as_array()
            .unwrap()
            .iter()
            .any(|problem| {
                problem["source"] == "extra-action-point:40"
                    && problem["field"] == "actions[3].target"
            })
    );
    assert_eq!(inspection["counts"]["unresolved"], 0);
}

#[test]
fn timed_door_repair_removes_the_reachable_blocker() {
    let mut snapshot = demo_snapshot();
    let mut timed = decode_timed_encounters(&[0; TIMED_ENCOUNTER_RECORD_BYTES])
        .records
        .remove(0);
    timed.day = 5;
    timed.door = -1;
    snapshot.timed_encounters.push(timed);
    let mut session = EditorSession::new(snapshot);

    let before = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("inspect Timed Encounter blocker");
    let problem = before["problems"]
        .as_array()
        .unwrap()
        .iter()
        .find(|problem| problem["source"] == "timed-encounter:0" && problem["field"] == "door")
        .expect("missing Timed Encounter door problem");
    assert_eq!(problem["targetKind"], "extra-action-point");
    assert_eq!(problem["targetId"], "-1");
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data TD3");
    assert_eq!(problem["byteProvenance"]["byteStart"], 6);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 8);
    assert_eq!(
        problem["repair"]["method"],
        "timed-encounter.reference.retarget"
    );

    dispatch_result(
        &mut session,
        "timed-encounter.reference.retarget",
        json!({
            "expectedRevision": 0,
            "source": "timed-encounter:0",
            "field": "door",
            "targetId": 40
        }),
    )
    .expect("repair Timed Encounter door");
    let after = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("reinspect Timed Encounter repair");
    assert!(
        !after["problems"].as_array().unwrap().iter().any(|problem| {
            problem["source"] == "timed-encounter:0" && problem["field"] == "door"
        })
    );
}

#[test]
fn monster_death_macro_repair_removes_the_reachable_blocker() {
    let mut snapshot = demo_snapshot();
    snapshot.simple_encounters[0].actions.push(ClassicAction {
        slot: 1,
        raw_opcode: 127,
        target_native_id: 0,
    });
    let mut monsters = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES], "Data MD", 0);
    monsters.monsters[0].death_macro = 99;
    snapshot.monster_sets.push(monsters);
    let mut session = EditorSession::new(snapshot);

    let before = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("inspect Monster death-macro blocker");
    let problem = before["problems"]
        .as_array()
        .unwrap()
        .iter()
        .find(|problem| problem["source"] == "monster:0:0" && problem["field"] == "deathMacro")
        .expect("missing Monster death-macro problem");
    assert_eq!(problem["targetKind"], "extra-action-point");
    assert_eq!(problem["targetId"], "99");
    assert_eq!(problem["byteProvenance"]["nativePath"], "Data MD");
    assert_eq!(problem["byteProvenance"]["byteStart"], 166);
    assert_eq!(problem["byteProvenance"]["byteEnd"], 168);
    assert_eq!(problem["repair"]["method"], "monster-reference.retarget");

    dispatch_result(
        &mut session,
        "monster-reference.retarget",
        json!({
            "expectedRevision": 0,
            "source": "monster:0:0",
            "field": "deathMacro",
            "targetId": 40
        }),
    )
    .expect("repair Monster death macro");
    let after = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-reachability",
        json!({"limit": 100}),
    )
    .expect("reinspect Monster repair");
    assert!(
        !after["problems"].as_array().unwrap().iter().any(|problem| {
            problem["source"] == "monster:0:0" && problem["field"] == "deathMacro"
        })
    );
}
