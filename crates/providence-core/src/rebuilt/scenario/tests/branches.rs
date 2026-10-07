use super::*;

#[test]
fn branch_opcodes_resolve_all_three_pinned_runtime_destination_modes() {
    let snapshot = branch_snapshot();
    let scenario = project_rebuilt_v3_scenario(&snapshot).expect("branch targets resolve");
    let program = scenario
        .programs
        .iter()
        .find(|program| program.id.0 == "trigger:Data DD:0:5")
        .expect("trigger program");
    assert_eq!(
        program
            .instructions
            .iter()
            .map(|instruction| instruction.opcode)
            .collect::<Vec<_>>(),
        [67, 72, 75, 78, 85]
    );
}

#[test]
fn branch_opcodes_require_extra_code_and_an_available_classic_item() {
    let mut snapshot = branch_snapshot();
    snapshot.world.action_points[0].actions[0].target_native_id = -1;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingProgramExtraCode {
            program: StableId("trigger:Data DD:0:5".into()),
            opcode: 67,
            native_id: -1,
        })
    );

    let mut snapshot = branch_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 10)
        .expect("opcode 67 E-code")
        .values[0] = 999;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingClassicItemTarget {
            program: StableId("trigger:Data DD:0:5".into()),
            item_id: 999,
        })
    );
}

#[test]
fn branch_opcodes_reject_invalid_or_dangling_destinations() {
    let program = StableId("trigger:Data DD:0:5".into());

    let mut snapshot = branch_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 11)
        .expect("opcode 72 E-code")
        .values[3] = 9;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::InvalidBranchDestinationMode {
            program: program.clone(),
            opcode: 72,
            mode: 9,
        })
    );

    let mut snapshot = branch_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 12)
        .expect("opcode 75 E-code")
        .values[4] = 41;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(
            RebuiltV3ScenarioError::MissingBranchExtraActionPointTarget {
                program: program.clone(),
                opcode: 75,
                native_id: 41,
            }
        )
    );
}

#[test]
fn branch_opcodes_reject_unavailable_encounter_destinations() {
    let program = StableId("trigger:Data DD:0:5".into());
    let mut snapshot = branch_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 13)
        .expect("opcode 78 E-code")
        .values[3] = 4;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingBranchSimpleEncounterTarget {
            program: program.clone(),
            opcode: 78,
            encounter_id: 4,
        })
    );

    let mut snapshot = branch_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 11)
        .expect("opcode 72 E-code")
        .values[4] = 7;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(
            RebuiltV3ScenarioError::MissingBranchComplexEncounterTarget {
                program,
                opcode: 72,
                encounter_id: 7,
            }
        )
    );
}

#[test]
fn opcode_85_rejects_invalid_ranges_and_missing_optional_messages() {
    let program = StableId("trigger:Data DD:0:5".into());
    let mut snapshot = branch_snapshot();
    let extra_code = &mut snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 14)
        .expect("opcode 85 E-code")
        .values;
    extra_code[1] = 41;
    extra_code[2] = 40;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::InvalidBranchDestinationRange {
            program: program.clone(),
            mode: 0,
            low_id: 41,
            high_id: 40,
        })
    );

    let mut snapshot = branch_snapshot();
    snapshot
        .extra_codes
        .iter_mut()
        .find(|row| row.native_id.0 == 14)
        .expect("opcode 85 E-code")
        .values[4] = -47;
    assert_eq!(
        project_rebuilt_v3_scenario(&snapshot),
        Err(RebuiltV3ScenarioError::MissingBranchMessage {
            program,
            message_id: -47,
        })
    );
}
