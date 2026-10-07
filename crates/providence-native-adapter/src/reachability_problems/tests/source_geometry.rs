use super::*;

mod fixtures;

struct ExpectedSource {
    program: &'static str,
    source: &'static str,
    native_path: &'static str,
    record_index: u32,
    target_start: u32,
    opcode_start: u32,
    opcode_width: u32,
    slot: u8,
}

#[test]
fn runtime_action_targets_navigate_to_original_native_words() {
    let snapshot = fixtures::snapshot();
    for case in cases() {
        let reference = RebuiltV3ReachabilityReference {
            source: StableId(case.program.into()),
            field: "actions[2].target".into(),
            relation: RebuiltV3ReachabilityRelation::CallsProgram,
            target: RebuiltV3ReachabilityTarget::Program(StableId("xap:149".into())),
            resolved: false,
        };
        let problem = reachability_problem_projection(&snapshot, &[], &reference);
        assert_source(&problem, &case);
    }
}

#[test]
fn invalid_owner_context_uses_native_opcode_widths() {
    let snapshot = fixtures::opcode_context_snapshot();
    for case in cases().into_iter().take(4) {
        let problem = invalid_opcode_context_problem_projection(
            &snapshot,
            &StableId(case.program.into()),
            2,
            5,
        )
        .expect("opcode context finding");
        assert_eq!(problem["source"], case.source);
        assert_eq!(problem["field"], format!("actions[{}].opcode", case.slot));
        assert_eq!(problem["byteProvenance"]["nativePath"], case.native_path);
        assert_eq!(problem["byteProvenance"]["byteStart"], case.opcode_start);
        assert_eq!(
            problem["byteProvenance"]["byteEnd"],
            case.opcode_start + case.opcode_width
        );
        assert_eq!(problem["repair"]["method"], "action.set-opcode");
        assert_eq!(problem["repair"]["targetParameter"], "rawOpcode");
        assert_eq!(problem["repair"]["params"]["slot"], case.slot);
    }
}

fn cases() -> [ExpectedSource; 5] {
    [
        ExpectedSource {
            program: "trigger:Data DD:2:3",
            source: "action-point:land:2:3",
            native_path: "Data DD",
            record_index: 203,
            target_start: 8148,
            opcode_start: 8132,
            opcode_width: 2,
            slot: 2,
        },
        ExpectedSource {
            program: "trigger:Data DDD:2:3",
            source: "action-point:dungeon:2:3",
            native_path: "Data DDD",
            record_index: 203,
            target_start: 8148,
            opcode_start: 8132,
            opcode_width: 2,
            slot: 2,
        },
        ExpectedSource {
            program: "xap:7",
            source: "extra-action-point:7",
            native_path: "Data ED3",
            record_index: 7,
            target_start: 308,
            opcode_start: 292,
            opcode_width: 2,
            slot: 2,
        },
        ExpectedSource {
            program: "simple:7:result:2",
            source: "simple-encounter:7",
            native_path: "Data ED",
            record_index: 7,
            target_start: 3050,
            opcode_start: 3000,
            opcode_width: 1,
            slot: 18,
        },
        ExpectedSource {
            program: "complex:7:result:2",
            source: "complex-encounter:7",
            native_path: "Data ED2",
            record_index: 7,
            target_start: 3708,
            opcode_start: 3658,
            opcode_width: 1,
            slot: 18,
        },
    ]
}

fn assert_source(problem: &Value, case: &ExpectedSource) {
    assert_eq!(problem["source"], case.source);
    assert_eq!(problem["field"], format!("actions[{}].target", case.slot));
    assert_eq!(problem["runtimeSource"], case.program);
    assert_eq!(problem["byteProvenance"]["nativePath"], case.native_path);
    assert_eq!(problem["byteProvenance"]["recordIndex"], case.record_index);
    assert_eq!(problem["byteProvenance"]["byteStart"], case.target_start);
    assert_eq!(problem["byteProvenance"]["byteEnd"], case.target_start + 2);
    assert_eq!(problem["repair"]["method"], "action-reference.retarget");
    assert_eq!(problem["repair"]["params"]["source"], case.source);
    assert_eq!(problem["repair"]["params"]["slot"], case.slot);
}
