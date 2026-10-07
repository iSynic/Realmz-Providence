use super::references::ProgramReferences;
use super::{RebuiltV3ClassicInstruction, RebuiltV3ScenarioError, RebuiltV3ScenarioProgram};
use crate::model::StableId;

pub(super) fn validate_branch_instruction(
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    references: &ProgramReferences,
) -> Result<(), RebuiltV3ScenarioError> {
    let Some(extra_code) = instruction
        .extra_code
        .as_deref()
        .filter(|values| values.len() >= 5)
    else {
        if references.allow_deferred {
            return Ok(());
        }
        return Err(RebuiltV3ScenarioError::MissingProgramExtraCode {
            program: program.id.clone(),
            opcode: instruction.opcode,
            native_id: instruction.id,
        });
    };
    match instruction.opcode {
        67 => {
            if !references.allow_deferred && !references.classic_item_ids.contains(&extra_code[0]) {
                return Err(RebuiltV3ScenarioError::MissingClassicItemTarget {
                    program: program.id.clone(),
                    item_id: extra_code[0],
                });
            }
            for target_id in [extra_code[3], extra_code[4]] {
                validate_branch_destination(&program.id, 67, extra_code[1], target_id, references)?;
            }
        }
        72 | 75 => validate_branch_destination(
            &program.id,
            instruction.opcode,
            extra_code[3],
            extra_code[4],
            references,
        )?,
        78 => {
            for target_id in [extra_code[3], extra_code[4]] {
                validate_branch_destination(&program.id, 78, extra_code[2], target_id, references)?;
            }
        }
        85 => validate_destination_range(program, extra_code, references)?,

        _ => unreachable!("caller restricts branch opcodes"),
    }
    Ok(())
}

fn validate_branch_destination(
    program: &StableId,
    opcode: i16,
    mode: i16,
    target_id: i16,
    references: &ProgramReferences,
) -> Result<(), RebuiltV3ScenarioError> {
    match mode {
        0 if target_id == 0
            || references
                .program_ids
                .contains(&StableId(format!("xap:{target_id}"))) =>
        {
            Ok(())
        }
        0 if references.allow_deferred => Ok(()),
        0 => Err(
            RebuiltV3ScenarioError::MissingBranchExtraActionPointTarget {
                program: program.clone(),
                opcode,
                native_id: target_id,
            },
        ),
        1 if u32::try_from(target_id).is_ok_and(|id| references.simple_ids.contains(&id)) => Ok(()),
        1 if references.allow_deferred => Ok(()),
        1 => Err(RebuiltV3ScenarioError::MissingBranchSimpleEncounterTarget {
            program: program.clone(),
            opcode,
            encounter_id: target_id,
        }),
        2 if u32::try_from(target_id).is_ok_and(|id| references.complex_ids.contains(&id)) => {
            Ok(())
        }
        2 if references.allow_deferred => Ok(()),
        2 => Err(
            RebuiltV3ScenarioError::MissingBranchComplexEncounterTarget {
                program: program.clone(),
                opcode,
                encounter_id: target_id,
            },
        ),
        _ => Err(RebuiltV3ScenarioError::InvalidBranchDestinationMode {
            program: program.clone(),
            opcode,
            mode,
        }),
    }
}

fn validate_destination_range(
    program: &RebuiltV3ScenarioProgram,
    extra_code: &[i16],
    references: &ProgramReferences,
) -> Result<(), RebuiltV3ScenarioError> {
    let mode = extra_code[0];
    let low_id = extra_code[1];
    let high_id = extra_code[2];
    if !(0..=2).contains(&mode) || low_id < 0 || high_id < low_id {
        return Err(RebuiltV3ScenarioError::InvalidBranchDestinationRange {
            program: program.id.clone(),
            mode,
            low_id,
            high_id,
        });
    }
    if !references.allow_deferred
        && extra_code[4] != 0
        && !references
            .message_ids
            .contains(&u32::from(extra_code[4].unsigned_abs()))
    {
        return Err(RebuiltV3ScenarioError::MissingBranchMessage {
            program: program.id.clone(),
            message_id: extra_code[4],
        });
    }
    for target_id in low_id..=high_id {
        validate_branch_destination(&program.id, 85, mode, target_id, references)?;
    }

    Ok(())
}
