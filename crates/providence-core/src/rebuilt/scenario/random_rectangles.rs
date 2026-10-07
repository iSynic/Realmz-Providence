use super::{RebuiltV3ClassicInstruction, RebuiltV3ScenarioError, RebuiltV3ScenarioProgram};
use crate::model::{LevelType, ProjectSnapshot, StableId};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) fn opcode_92_random_rectangle_targets<'a>(
    snapshot: &ProjectSnapshot,
    programs: impl IntoIterator<Item = &'a RebuiltV3ScenarioProgram>,
) -> Result<BTreeMap<StableId, BTreeSet<usize>>, RebuiltV3ScenarioError> {
    let mut targets = BTreeMap::<StableId, BTreeSet<usize>>::new();
    for program in programs {
        for instruction in program
            .instructions
            .iter()
            .filter(|instruction| instruction.opcode == 92)
        {
            let (map, slot) = opcode_92_random_rectangle_target(snapshot, program, instruction)?;
            targets.entry(map).or_default().insert(slot);
        }
    }
    Ok(targets)
}

pub(crate) fn projectable_opcode_92_random_rectangle_targets<'a>(
    snapshot: &ProjectSnapshot,
    programs: impl IntoIterator<Item = &'a RebuiltV3ScenarioProgram>,
) -> BTreeMap<StableId, BTreeSet<usize>> {
    let mut targets = BTreeMap::<StableId, BTreeSet<usize>>::new();
    for program in programs {
        for instruction in program
            .instructions
            .iter()
            .filter(|instruction| instruction.opcode == 92)
        {
            if let Ok((map, slot)) =
                opcode_92_random_rectangle_target(snapshot, program, instruction)
            {
                targets.entry(map).or_default().insert(slot);
            }
        }
    }
    targets
}

fn opcode_92_random_rectangle_target(
    snapshot: &ProjectSnapshot,
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
) -> Result<(StableId, usize), RebuiltV3ScenarioError> {
    let extra_code = instruction
        .extra_code
        .as_deref()
        .filter(|values| values.len() >= 5)
        .ok_or_else(|| RebuiltV3ScenarioError::MissingProgramExtraCode {
            program: program.id.clone(),
            opcode: 92,
            native_id: instruction.id,
        })?;
    let level_type = if extra_code[2] == 0 {
        LevelType::Land
    } else {
        LevelType::Dungeon
    };
    let native_index = i32::from(extra_code[0].max(0));
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| {
            map.level_type == level_type
                && i32::try_from(map.native_index).ok() == Some(native_index)
        })
        .ok_or_else(|| RebuiltV3ScenarioError::MissingOpcodeMap {
            program: program.id.clone(),
            opcode: 92,
            level_type,
            native_index,
        })?;
    let slot = if (0..20).contains(&extra_code[1]) {
        extra_code[1] as usize
    } else {
        0
    };
    if map.runtime.is_none() {
        return Err(RebuiltV3ScenarioError::MissingOpcodeRandomRectangle {
            program: program.id.clone(),
            map: map.identity.clone(),
            native_index: slot,
        });
    }
    Ok((map.identity.clone(), slot))
}

pub(super) fn validate_random_rectangle_references(
    snapshot: &ProjectSnapshot,
    program_ids: &BTreeSet<StableId>,
) -> Result<(), RebuiltV3ScenarioError> {
    let available_battle_ids = snapshot
        .battles
        .iter()
        .map(|battle| battle.native_id.0)
        .collect::<BTreeSet<_>>();
    for rectangle in snapshot
        .world
        .maps
        .iter()
        .filter_map(|map| map.runtime.as_ref())
        .flat_map(|runtime| &runtime.random_rectangles)
    {
        for (native_id, percent) in rectangle
            .random_doors
            .into_iter()
            .zip(rectangle.random_door_percent)
        {
            if percent != 0
                && (native_id < 0 || !program_ids.contains(&StableId(format!("xap:{native_id}"))))
            {
                return Err(
                    RebuiltV3ScenarioError::MissingRandomRectangleExtraActionPoint {
                        rectangle: rectangle.identity.clone(),
                        native_id,
                    },
                );
            }
        }
        for battle_id in random_rectangle_battle_values(rectangle) {
            if !available_battle_ids.contains(&battle_id.unsigned_abs()) {
                return Err(RebuiltV3ScenarioError::MissingRandomRectangleBattle {
                    rectangle: rectangle.identity.clone(),
                    battle_id,
                });
            }
        }
    }
    Ok(())
}

pub fn rebuilt_v3_random_rectangle_battle_ids(snapshot: &ProjectSnapshot) -> BTreeSet<u32> {
    snapshot
        .world
        .maps
        .iter()
        .filter_map(|map| map.runtime.as_ref())
        .flat_map(|runtime| &runtime.random_rectangles)
        .flat_map(random_rectangle_battle_values)
        .map(i32::unsigned_abs)
        .collect()
}

pub(super) fn random_rectangle_battle_values(
    rectangle: &crate::model::RandomRectangle,
) -> impl Iterator<Item = i32> {
    let range = if rectangle.battle_range[0] == 0 {
        None
    } else {
        Some(classic_between_bounds(rectangle.battle_range))
    };
    range.into_iter().flat_map(|[low, high]| low..=high)
}

pub fn validate_rebuilt_v3_random_rectangle_references(
    snapshot: &ProjectSnapshot,
) -> Result<(), RebuiltV3ScenarioError> {
    let program_ids = snapshot
        .extra_action_points
        .iter()
        .map(|row| StableId(format!("xap:{}", row.native_id.0)))
        .collect::<BTreeSet<_>>();
    validate_random_rectangle_references(snapshot, &program_ids)
}

pub(super) fn classic_between_bounds([low, high]: [i16; 2]) -> [i32; 2] {
    let width = high.wrapping_sub(low).wrapping_add(1);
    let low = i32::from(low);
    match width.cmp(&0) {
        std::cmp::Ordering::Greater => [low, low + i32::from(width) - 1],
        std::cmp::Ordering::Equal => [low, low],
        std::cmp::Ordering::Less => [low + i32::from(width) + 1, low],
    }
}
