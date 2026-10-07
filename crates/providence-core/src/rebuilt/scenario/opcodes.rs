use crate::model::{ClassicAction, LevelType, ProjectSnapshot, StableId};

pub(super) const EXECUTABLE_CLASSIC_OPCODES: &[i16] = &[
    -23, -14, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
    48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
    72, 73, 74, 75, 76, 77, 78, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97,
    98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 111, 112, 119, 120, 121, 122, 123, 124,
    125, 126, 127,
];

pub(crate) fn source_resolved_runtime_noop_opcode(opcode: i16) -> bool {
    matches!(opcode, 200)
}

pub fn supported_classic_opcode(opcode: i16) -> bool {
    EXECUTABLE_CLASSIC_OPCODES.binary_search(&opcode).is_ok()
}

pub fn unsupported_classic_instructions(snapshot: &ProjectSnapshot) -> Vec<serde_json::Value> {
    let mut findings = Vec::new();
    let mut inspect = |owner: &StableId, native_path: &str, actions: &[ClassicAction]| {
        for action in actions {
            let opcode = action.opcode();
            if supported_classic_opcode(opcode)
                || source_resolved_runtime_noop_opcode(opcode)
                || matches!(opcode, 0 | 79 | 80 | 109 | 110 | 113..=118)
            {
                continue;
            }
            let extra = snapshot
                .extra_codes
                .iter()
                .find(|row| i64::from(row.native_id.0) == i64::from(action.target_native_id));
            findings.push(serde_json::json!({
                "sourceIdentity":owner, "nativePath":native_path, "slot":action.slot,
                "rawOpcode":action.raw_opcode, "opcode":opcode, "operand":action.target_native_id,
                "extraCode":extra.map(|row| row.values), "gosub":action.gosub(),
                "classification":"unknown-native-value",
                "message":format!("{} slot {}: unrecognized raw opcode {} (normalized {}), operand {}, Extra Code {:?}; preserved and skipped using Castle fallthrough", owner.0, action.slot, action.raw_opcode, opcode, action.target_native_id, extra.map(|row| row.values)),
            }));
        }
    };
    for point in &snapshot.world.action_points {
        inspect(
            &point.identity,
            if point.level_type == LevelType::Land {
                "Data DD"
            } else {
                "Data DDD"
            },
            &point.actions,
        );
    }
    for point in &snapshot.extra_action_points {
        inspect(&point.identity, "Data ED3", &point.actions);
    }
    for encounter in &snapshot.simple_encounters {
        inspect(&encounter.identity, "Data ED", &encounter.actions);
    }
    for encounter in &snapshot.complex_encounters {
        inspect(&encounter.identity, "Data ED2", &encounter.actions);
    }
    findings
}
