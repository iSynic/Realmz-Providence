use super::*;

#[test]
fn land_triggers_and_owner_matched_programs_project_exact_schema_fields() {
    let mut snapshot = snapshot();
    snapshot.world.action_points[1].actions.push(ClassicAction {
        slot: 0,
        raw_opcode: 1,
        target_native_id: 0,
    });
    let projection = project_rebuilt_v3_trigger_programs(&snapshot).expect("projection");
    let encoded = serde_json::to_string(&projection).expect("serialize");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_trigger_programs(&snapshot).unwrap()).unwrap()
    );
    assert_eq!(
        projection.triggers.len(),
        2,
        "dormant placed rows remain available for script activation"
    );
    let value = serde_json::to_value(&projection).expect("JSON");
    assert_eq!(value["triggers"][0]["programId"], "trigger:Data DD:0:5");
    assert_eq!(value["triggers"][0]["mapId"], "land:0");
    assert_eq!(value["triggers"][0]["active"], true);
    assert_eq!(value["triggers"][1]["active"], false);
    assert_eq!(value["triggers"][1]["chancePercent"], 0);
    assert_eq!(value["programs"][1]["instructions"][0]["opcode"], 1);
    assert_eq!(
        value["triggers"][0]["postActionLocation"]["mapId"],
        "land:1"
    );
    assert_eq!(value["programs"][0]["ownerKind"], "trigger");
    assert_eq!(value["programs"][0]["ownerId"], value["triggers"][0]["id"]);
    assert_eq!(value["programs"][0]["instructions"][0]["slot"], 0);
    assert_eq!(value["programs"][0]["instructions"][0]["rawOpcode"], -4);
    assert_eq!(value["programs"][0]["instructions"][0]["opcode"], 4);
    assert_eq!(value["programs"][0]["instructions"][0]["gosub"], true);
    assert_eq!(
        value["programs"][0]["instructions"][0]["extraCode"],
        serde_json::json!([30, 31, 32, 33, 34])
    );
    assert_eq!(
        value["programs"][0]["instructions"][1]["extraCode"],
        serde_json::json!([0, 0, 0, 83, 84, 90, 91, 92, 93, 94])
    );

    let reopened: RebuiltV3TriggerPrograms =
        serde_json::from_str(&encoded).expect("reimport projection");
    assert_eq!(reopened, projection);

    let mut negative = snapshot;
    negative.world.action_points[1].chance_percent = -1;
    let negative_projection =
        project_rebuilt_v3_trigger_programs(&negative).expect("negative chance projection");
    assert!(!negative_projection.triggers[1].active);
    assert_eq!(negative_projection.triggers[1].chance_percent, -1);
    assert_eq!(
        negative_projection.programs.len(),
        projection.programs.len()
    );
}
