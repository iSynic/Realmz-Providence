use super::random_rectangles::opcode_92_random_rectangle_targets;
use super::{
    RebuiltV3ClassicInstruction, RebuiltV3ProgramOwnerKind, RebuiltV3ScenarioError,
    RebuiltV3ScenarioProgram,
};
use crate::model::{LevelType, ProjectSnapshot};

pub(super) fn validate_program_context_and_map_references(
    snapshot: &ProjectSnapshot,
    programs: &[RebuiltV3ScenarioProgram],
    allow_deferred: bool,
) -> Result<(), RebuiltV3ScenarioError> {
    if !allow_deferred {
        opcode_92_random_rectangle_targets(snapshot, programs)?;
    }
    let requires_battle_terrain = programs.iter().any(|program| {
        program
            .instructions
            .iter()
            .any(|instruction| instruction.opcode == 57)
    });
    let battle_terrain_sets = if requires_battle_terrain {
        crate::rebuilt::project_rebuilt_v3_battle_terrain_sets(snapshot)
            .map_err(|error| RebuiltV3ScenarioError::InvalidBattleTerrain(error.to_string()))?
    } else {
        Vec::new()
    };
    for program in programs {
        for instruction in &program.instructions {
            match instruction.opcode {
                44 if !allow_deferred
                    && (!matches!(
                        program.owner_kind,
                        RebuiltV3ProgramOwnerKind::SimpleEncounterResult
                            | RebuiltV3ProgramOwnerKind::ComplexEncounterResult
                    ) || !(1..=4).contains(&instruction.id)) =>
                {
                    return Err(RebuiltV3ScenarioError::InvalidEncounterResultOpcode {
                        program: program.id.clone(),
                        slot: instruction.slot,
                        result: instruction.id,
                    });
                }
                57 => validate_landlook(
                    snapshot,
                    program,
                    instruction,
                    &battle_terrain_sets,
                    allow_deferred,
                )?,
                92 => {}
                _ => {}
            }
        }
    }
    Ok(())
}

fn validate_landlook(
    snapshot: &ProjectSnapshot,
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    battle_terrain_sets: &[crate::rebuilt::RebuiltV3BattleTerrainSet],
    allow_deferred: bool,
) -> Result<(), RebuiltV3ScenarioError> {
    let Some(extra_code) = instruction
        .extra_code
        .as_deref()
        .filter(|values| values.len() >= 5)
    else {
        if allow_deferred {
            return Ok(());
        }
        return Err(RebuiltV3ScenarioError::MissingProgramExtraCode {
            program: program.id.clone(),
            opcode: 57,
            native_id: instruction.id,
        });
    };
    if !allow_deferred && !matches!(extra_code[1], 0 | 1) {
        return Err(RebuiltV3ScenarioError::InvalidLandlookOpcode {
            program: program.id.clone(),
            darkness: extra_code[1],
        });
    }
    validate_landlook_map(snapshot, program, extra_code[2], allow_deferred)?;
    if !battle_terrain_sets
        .iter()
        .any(|set| set.landlook.map(i16::from) == Some(extra_code[0]))
    {
        if allow_deferred {
            return Ok(());
        }
        return Err(RebuiltV3ScenarioError::MissingLandlookBattleTerrain {
            program: program.id.clone(),
            landlook: extra_code[0],
        });
    }

    Ok(())
}

fn validate_landlook_map(
    snapshot: &ProjectSnapshot,
    program: &RebuiltV3ScenarioProgram,
    level: i16,
    allow_deferred: bool,
) -> Result<(), RebuiltV3ScenarioError> {
    let native_index = i32::from(level);
    if native_index < 0
        || !snapshot.world.maps.iter().any(|map| {
            map.level_type == LevelType::Land
                && i32::try_from(map.native_index).ok() == Some(native_index)
        })
    {
        if allow_deferred {
            return Ok(());
        }
        return Err(RebuiltV3ScenarioError::MissingOpcodeMap {
            program: program.id.clone(),
            opcode: 57,
            level_type: LevelType::Land,
            native_index,
        });
    }

    Ok(())
}
