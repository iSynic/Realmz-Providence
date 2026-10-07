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
            invalid_result_context(program, instruction, deferred_references);
            invalid_item_buffer(program, instruction, deferred_references);
            unsupported_opcode(program, instruction, deferred_references);
        }
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
