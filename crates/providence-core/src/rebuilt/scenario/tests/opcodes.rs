use super::*;

#[test]
fn unknown_opcode_inventory_includes_unreachable_source_occurrences() {
    let mut snapshot = snapshot();
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 0,
                target_native_id: 0,
            },
            ClassicAction {
                slot: 1,
                raw_opcode: 173,
                target_native_id: 2,
            },
            ClassicAction {
                slot: 6,
                raw_opcode: -2823,
                target_native_id: 2,
            },
        ],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(2),
        values: [1, -2, 3, 4, 5],
    });
    let findings = unsupported_classic_instructions(&snapshot);
    assert_eq!(findings.len(), 2);
    assert_eq!(findings[1]["sourceIdentity"], "extra-action-point:40");
    assert_eq!(findings[1]["nativePath"], "Data ED3");
    assert_eq!(findings[1]["slot"], 6);
    assert_eq!(findings[1]["rawOpcode"], -2823);
    assert_eq!(findings[1]["opcode"], 2823);
    assert_eq!(
        findings[1]["extraCode"],
        serde_json::json!([1, -2, 3, 4, 5])
    );
    assert_eq!(findings[1]["gosub"], true);
}

#[test]
fn source_resolved_classic_noop_is_retained_in_source_and_omitted_from_runtime_program() {
    let mut snapshot = snapshot();
    snapshot.world.action_points[0].actions.push(ClassicAction {
        slot: 7,
        raw_opcode: 200,
        target_native_id: 99,
    });

    let projection = project_rebuilt_v3_trigger_programs(&snapshot).expect("projection");
    let program = projection
        .programs
        .iter()
        .find(|program| program.id.0 == "trigger:Data DD:0:5")
        .expect("placed trigger program");
    assert!(
        program
            .instructions
            .iter()
            .all(|instruction| instruction.raw_opcode != 200)
    );
    assert!(
        snapshot.world.action_points[0]
            .actions
            .iter()
            .any(|action| action.raw_opcode == 200)
    );
}
