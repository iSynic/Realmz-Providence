use super::{
    RebuiltV3ReachableMessageError, RebuiltV3RuntimeMessageReference, RebuiltV3ScenarioDocument,
    references::add_reference,
};
use crate::rebuilt::{RebuiltV3ClassicInstruction, RebuiltV3ScenarioProgram};
use crate::{
    classic_random::signed_range_values,
    model::{ProjectOrigin, ProjectSnapshot},
};
use std::collections::BTreeSet;

pub(super) fn collect(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
    references: &mut BTreeSet<RebuiltV3RuntimeMessageReference>,
) -> Result<(), RebuiltV3ReachableMessageError> {
    for program in &scenario.programs {
        for instruction in &program.instructions {
            if scenario.incomplete_extra_code_for(instruction).is_none() {
                collect_instruction(snapshot, program, instruction, references)?;
            }
        }
    }
    Ok(())
}

fn collect_instruction(
    snapshot: &ProjectSnapshot,
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    references: &mut BTreeSet<RebuiltV3RuntimeMessageReference>,
) -> Result<(), RebuiltV3ReachableMessageError> {
    let needs_row = needs_extra_code(instruction.opcode);
    if matches!(snapshot.origin, ProjectOrigin::Imported { .. })
        && instruction.extra_code.is_none()
        && needs_row
    {
        // Preserve the absent row's caller without inventing message dependencies.
        return Ok(());
    }
    let action_field = format!("actions[{}]", instruction.slot);
    if instruction.opcode == 1 {
        add_reference(
            references,
            &program.id,
            Some(instruction.opcode),
            format!("{action_field}.targetNativeId"),
            instruction.id,
            false,
        );
    } else if needs_row {
        let values = extra_code(program, instruction)?;
        if instruction.opcode == 19 {
            for raw_id in signed_range_values(values[0], values[1]) {
                add_reference(
                    references,
                    &program.id,
                    Some(instruction.opcode),
                    format!("{action_field}.extraCode[0..=1]"),
                    raw_id,
                    true,
                );
            }
        } else {
            for field in message_fields(snapshot, instruction.opcode, values) {
                add_reference(
                    references,
                    &program.id,
                    Some(instruction.opcode),
                    format!("{action_field}.extraCode[{}]", field.index()),
                    values[field.index()],
                    matches!(field, MessageField::Optional(_)),
                );
            }
        }
    }
    Ok(())
}

fn needs_extra_code(opcode: i16) -> bool {
    matches!(
        opcode,
        2 | 3 | 15 | 16 | 19 | 20 | 21 | 45 | 48 | 55 | 56 | 74 | 85 | 87 | 107 | 122
    )
}

fn extra_code<'a>(
    program: &RebuiltV3ScenarioProgram,
    instruction: &'a RebuiltV3ClassicInstruction,
) -> Result<&'a [i16], RebuiltV3ReachableMessageError> {
    let required = if instruction.opcode == 19 { 2 } else { 5 };
    instruction
        .extra_code
        .as_deref()
        .filter(|values| values.len() >= required)
        .ok_or_else(|| RebuiltV3ReachableMessageError::MissingExtraCode {
            program: program.id.clone(),
            slot: instruction.slot,
            opcode: instruction.opcode,
            native_id: instruction.id,
        })
}

#[derive(Clone, Copy)]
enum MessageField {
    Optional(usize),
    Required(usize),
}

impl MessageField {
    fn index(self) -> usize {
        match self {
            Self::Optional(index) | Self::Required(index) => index,
        }
    }
}

// Optional native zero is a sentinel; required fields may address message zero.
fn message_fields(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    values: &[i16],
) -> &'static [MessageField] {
    match opcode {
        2 if values[1] == 0 && values[2] == -1 && (30_000..=30_005).contains(&values[3]) => &[],
        2 | 48 | 107 => &[MessageField::Optional(3)],
        3 if snapshot.option_labels.is_empty() && values[3] != 0 => {
            &[MessageField::Required(3), MessageField::Required(4)]
        }
        15 | 16 | 20 | 45 | 56 | 74 | 85 => &[MessageField::Optional(4)],
        21 | 87 if values[2] == 2 => &[MessageField::Required(4)],
        55 if values[1] == 2 => &[MessageField::Required(4)],
        122 => &[MessageField::Optional(0)],
        _ => &[],
    }
}
