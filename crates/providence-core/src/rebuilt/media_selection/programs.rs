use super::RebuiltV3ScenarioDocument;
use super::scenario_resolution::{push_resource, push_sound};
use super::{RebuiltV3MediaRelation, RebuiltV3MediaRequirement, RebuiltV3RuntimeMediaReference};
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::RebuiltV3ClassicInstruction;

pub(super) fn append(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
) {
    for program in &scenario.programs {
        for instruction in &program.instructions {
            if scenario.incomplete_extra_code_for(instruction).is_some() {
                continue;
            }
            append_text(references, snapshot, &program.id, instruction);
            append_sound(references, snapshot, &program.id, instruction);
        }
    }
}

fn append_text(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: &StableId,
    instruction: &RebuiltV3ClassicInstruction,
) {
    if instruction.opcode == 62 {
        push_resource(
            references,
            snapshot,
            source.clone(),
            format!("actions[{}].id", instruction.slot),
            RebuiltV3MediaRelation::TextResource,
            RebuiltV3MediaRequirement::PackageRequired,
            "TEXT",
            i32::from(instruction.id),
        );
        push_resource(
            references,
            snapshot,
            source.clone(),
            format!("actions[{}].style", instruction.slot),
            RebuiltV3MediaRelation::TextResource,
            RebuiltV3MediaRequirement::OptionalCompanion,
            "styl",
            i32::from(instruction.id),
        );
    }
}

fn append_sound(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: &StableId,
    instruction: &RebuiltV3ClassicInstruction,
) {
    let field = |index: usize| format!("actions[{}].extraCode[{index}]", instruction.slot);
    let Some(extra) = instruction.extra_code.as_deref() else {
        return;
    };
    let sound = match instruction.opcode {
        2 | 48 | 107 => extra.get(2).copied().map(|value| (2, value)),
        15 | 43 | 56 | 85 | 124 => extra.get(3).copied().map(|value| (3, value)),
        74 if extra.get(3).copied().unwrap_or(0) != 0 => {
            extra.get(1).copied().map(|value| (1, value))
        }
        122 => extra.get(1).copied().map(|value| (1, value)),
        _ => None,
    };
    if let Some((index, sound_id)) = sound {
        push_sound(
            references,
            snapshot,
            source.clone(),
            field(index),
            sound_id,
            RebuiltV3MediaRelation::ProgramSound,
        );
    }
}
