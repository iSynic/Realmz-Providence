use super::{
    RebuiltV3ReachableItemSpellError as Error, RebuiltV3RuntimeDefinitionRelation as Relation,
    RebuiltV3ScenarioDocument, selection::Selection,
};
use crate::{model::StableId, rebuilt::RebuiltV3ClassicInstruction};

pub(super) fn collect(
    scenario: &RebuiltV3ScenarioDocument,
    selection: &mut Selection,
) -> Result<(), Error> {
    for program in &scenario.programs {
        for instruction in &program.instructions {
            if scenario.incomplete_extra_code_for(instruction).is_none() {
                collect_instruction(&program.id, instruction, selection)?;
            }
        }
    }
    Ok(())
}

fn collect_instruction(
    source: &StableId,
    instruction: &RebuiltV3ClassicInstruction,
    selection: &mut Selection,
) -> Result<(), Error> {
    let values = || {
        instruction
            .extra_code
            .as_deref()
            .filter(|values| values.len() >= 5)
            .ok_or_else(|| Error::MissingExtraCode {
                program: source.clone(),
                opcode: instruction.opcode,
            })
    };
    let field = format!("actions[{}].extraCode", instruction.slot);
    match instruction.opcode {
        17 | 18 => selection.spell(
            source.clone(),
            format!("{field}[0]"),
            values()?[0],
            Relation::ProgramOperand,
        )?,
        21 | 38 | 67 => selection.item(
            source.clone(),
            format!("{field}[0]"),
            values()?[0],
            Relation::ProgramOperand,
        )?,
        22 => exchange_items(source, &field, values()?, selection)?,
        51 | 52 => conditional_item(source, &field, instruction.opcode, values()?, selection)?,
        65 => random_items(source, &field, values()?, selection)?,
        _ => {}
    }
    Ok(())
}

fn conditional_item(
    source: &StableId,
    field: &str,
    opcode: i16,
    values: &[i16],
    selection: &mut Selection,
) -> Result<(), Error> {
    let index = match opcode {
        51 if values[2] != 0 => Some(2),
        52 if matches!(values[0], 2 | 7) => Some(1),
        _ => None,
    };
    if let Some(index) = index {
        selection.item(
            source.clone(),
            format!("{field}[{index}]"),
            values[index],
            Relation::ProgramOperand,
        )?;
    }
    Ok(())
}

fn exchange_items(
    source: &StableId,
    field: &str,
    values: &[i16],
    selection: &mut Selection,
) -> Result<(), Error> {
    selection.item(
        source.clone(),
        format!("{field}[0]"),
        values[0],
        Relation::ProgramOperand,
    )?;
    if values[2] == 3 {
        selection.item(
            source.clone(),
            format!("{field}[4]"),
            values[4],
            Relation::ProgramOperand,
        )?;
    }
    Ok(())
}

fn random_items(
    source: &StableId,
    field: &str,
    values: &[i16],
    selection: &mut Selection,
) -> Result<(), Error> {
    if !selection.defers_missing() && values[0].unsigned_abs() > 20 {
        return Err(Error::InvalidRandomItemCount {
            program: source.clone(),
            count: values[0],
        });
    }
    let (low, high) = (values[1], values[2]);
    if low < 1 || high > 999 || low > high {
        if selection.defers_missing() {
            return Ok(());
        }
        return Err(Error::InvalidRandomItemRange {
            program: source.clone(),
            low,
            high,
        });
    }
    if values[0] != 0 {
        for classic_id in low..=high {
            selection.item(
                source.clone(),
                format!("{field}[1..=2]"),
                classic_id,
                Relation::ProgramOperand,
            )?;
        }
    }
    Ok(())
}
