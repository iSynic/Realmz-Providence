use crate::model::ProjectSnapshot;
use crate::rebuilt::scenario::{
    RebuiltV3ClassicInstruction, RebuiltV3ProgramOwnerKind, RebuiltV3ScenarioDocument,
    RebuiltV3ScenarioProgram,
};
use crate::rebuilt::{RebuiltV3DeferredDisposition, RebuiltV3DeferredReference};
use std::collections::BTreeSet;

pub(super) fn collect(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    deferred_references.extend(deferred_opcode_92_references(snapshot, scenario));
    for program in &scenario.programs {
        for instruction in &program.instructions {
            incomplete_extra_code(scenario, program, instruction, deferred_references);
            unavailable_extra_code(program, instruction, deferred_references);
            invalid_branch_operands(program, instruction, deferred_references);
            missing_text(snapshot, program, instruction, deferred_references);
            invalid_result_context(program, instruction, deferred_references);
            invalid_item_buffer(program, instruction, deferred_references);
            unsupported_opcode(program, instruction, deferred_references);
        }
    }
}

fn unavailable_extra_code(
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    deferred: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    if crate::rebuilt::scenario::classic_opcode_reads_extra_code(instruction.opcode)
        && instruction
            .extra_code
            .as_ref()
            .is_none_or(|values| values.len() < 5)
    {
        deferred.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}].extraCode", instruction.slot),
            target_kind: "extra-code".into(),
            target_id: instruction.id.to_string(),
            reason: "the authored instruction references an unavailable Data EDCD row".into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
}

fn invalid_branch_operands(
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    deferred: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    let Some(values) = instruction
        .extra_code
        .as_ref()
        .filter(|values| values.len() >= 5)
    else {
        return;
    };
    let mode = match instruction.opcode {
        67 => Some((1, values[1])),
        72 | 75 => Some((3, values[3])),
        78 => Some((2, values[2])),
        85 => Some((0, values[0])),
        _ => None,
    };
    if let Some((index, value)) = mode.filter(|(_, value)| !(0..=2).contains(value)) {
        deferred.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}].extraCode[{index}]", instruction.slot),
            target_kind: "classic-operand".into(),
            target_id: value.to_string(),
            reason: "the retained native branch has an unsupported destination mode".into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
    if instruction.opcode == 85 && (values[1] < 0 || values[2] < values[1]) {
        deferred.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}].extraCode[1..=2]", instruction.slot),
            target_kind: "classic-operand".into(),
            target_id: format!("{}..={}", values[1], values[2]),
            reason: "the retained native branch has an invalid destination range".into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
}

fn missing_text(
    snapshot: &ProjectSnapshot,
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    deferred: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    if instruction.opcode == 62
        && !snapshot.assets.iter().any(|asset| {
            asset.classic_resource.as_ref().is_some_and(|key| {
                key.resource_type == "TEXT" && key.resource_id == i32::from(instruction.id)
            })
        })
    {
        deferred.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}].id", instruction.slot),
            target_kind: "TEXT".into(),
            target_id: instruction.id.to_string(),
            reason: "the retained authored instruction references an unavailable runtime target"
                .into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
}

fn incomplete_extra_code(
    scenario: &RebuiltV3ScenarioDocument,
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    if let Some(tail) = scenario.incomplete_extra_code_for(instruction) {
        deferred_references.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}].extraCode", instruction.slot),
            target_kind: "extra-code".into(),
            target_id: tail.row_id.to_string(),
            reason: format!(
                "Data EDCD row {} has {} of 10 bytes; its caller is guarded before execution",
                tail.row_id, tail.available_bytes
            ),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
}

fn invalid_result_context(
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    if instruction.opcode == 44
        && (!(1..=4).contains(&instruction.id)
            || !matches!(
                program.owner_kind,
                RebuiltV3ProgramOwnerKind::SimpleEncounterResult
                    | RebuiltV3ProgramOwnerKind::ComplexEncounterResult
            ))
    {
        deferred_references.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}]", instruction.slot),
            target_kind: "classic-operand".into(),
            target_id: instruction.id.to_string(),
            reason: concat!(
                "opcode 44 retains an invalid result or caller context; ",
                "execution requires a Simple or Complex Encounter result from 1 through 4"
            )
            .into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
}

fn invalid_item_buffer(
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    if instruction.opcode == 65
        && instruction.extra_code.as_ref().is_some_and(|values| {
            values.len() >= 3
                && (values[0].unsigned_abs() > 20
                    || values[1] < 1
                    || values[2] > 999
                    || values[1] > values[2])
        })
    {
        deferred_references.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}]", instruction.slot),
            target_kind: "classic-operand".into(),
            target_id: instruction.id.to_string(),
            reason: concat!(
                "opcode 65 preserves an invalid native item count or range; ",
                "Castle writes past its twenty-item buffer for excessive counts, ",
                "which Rebuilt reports only if executed"
            )
            .into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
}

fn unsupported_opcode(
    program: &RebuiltV3ScenarioProgram,
    instruction: &RebuiltV3ClassicInstruction,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    if !crate::rebuilt::scenario::supported_classic_opcode(instruction.opcode) {
        deferred_references.insert(RebuiltV3DeferredReference {
            source: program.id.clone(),
            field: format!("instructions[{}]", instruction.slot),
            target_kind: "classic-opcode".into(),
            target_id: instruction.raw_opcode.to_string(),
            reason: concat!(
                "the native instruction is preserved; Castle skips an unmatched opcode ",
                "and continues, and Rebuilt records the skipped instruction"
            )
            .into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        });
    }
}
fn deferred_opcode_92_references(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
) -> Vec<RebuiltV3DeferredReference> {
    let mut references = Vec::new();
    for program in &scenario.programs {
        for instruction in &program.instructions {
            if instruction.opcode != 92 {
                continue;
            }
            let Some(extra_code) = instruction
                .extra_code
                .as_deref()
                .filter(|row| row.len() >= 5)
            else {
                continue;
            };
            let level_type = if extra_code[2] == 0 {
                crate::model::LevelType::Land
            } else {
                crate::model::LevelType::Dungeon
            };
            let native_index = i32::from(extra_code[0].max(0));
            let map = snapshot.world.maps.iter().find(|map| {
                map.level_type == level_type
                    && i32::try_from(map.native_index).ok() == Some(native_index)
            });
            if map.is_none() {
                references.push(RebuiltV3DeferredReference {
                    source: program.id.clone(),
                    field: format!("actions[{}].extraCode[0]", instruction.slot),
                    target_kind: match level_type {
                        crate::model::LevelType::Land => "land-map".into(),
                        crate::model::LevelType::Dungeon => "dungeon-map".into(),
                    },
                    target_id: native_index.to_string(),
                    reason: "the referenced Classic opcode 92 map is unavailable".into(),
                    disposition: RebuiltV3DeferredDisposition::Deferred,
                });
            }
        }
    }
    references
}
