use super::branches::validate_branch_instruction;
use super::{RebuiltV3ClassicInstruction, RebuiltV3ScenarioError, RebuiltV3ScenarioProgram};
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::{RebuiltV3ComplexEncounterProjection, RebuiltV3SimpleEncounterProjection};
use std::collections::BTreeSet;

pub(super) struct ProgramReferences {
    pub message_ids: BTreeSet<u32>,
    pub simple_ids: BTreeSet<u32>,
    pub complex_ids: BTreeSet<u32>,
    pub classic_item_ids: BTreeSet<i16>,
    pub program_ids: BTreeSet<StableId>,
    pub text_resource_ids: BTreeSet<i32>,
    pub allow_deferred: bool,
}

impl ProgramReferences {
    pub(super) fn new(
        snapshot: &ProjectSnapshot,
        simple: &RebuiltV3SimpleEncounterProjection,
        complex: &RebuiltV3ComplexEncounterProjection,
        program_ids: BTreeSet<StableId>,
        selected: bool,
    ) -> Self {
        let message_ids = if selected {
            snapshot
                .messages
                .iter()
                .map(|message| message.native_id.0)
                .collect()
        } else {
            simple.messages.iter().map(|message| message.id).collect()
        };
        Self {
            message_ids,
            simple_ids: simple
                .simple_encounters
                .iter()
                .map(|encounter| encounter.id)
                .collect(),
            complex_ids: complex
                .complex_encounters
                .iter()
                .map(|encounter| encounter.id)
                .collect(),
            classic_item_ids: snapshot
                .item_rules
                .iter()
                .map(|item| item.definition.classic_id)
                .chain(
                    snapshot
                        .scenario_item_rules
                        .iter()
                        .map(|item| item.definition.classic_id),
                )
                .collect(),
            text_resource_ids: snapshot
                .assets
                .iter()
                .filter_map(|asset| asset.classic_resource.as_ref())
                .filter(|resource| resource.resource_type == "TEXT")
                .map(|resource| resource.resource_id)
                .collect(),
            program_ids,
            allow_deferred: selected
                && matches!(
                    snapshot.origin,
                    crate::model::ProjectOrigin::Imported { .. }
                ),
        }
    }

    pub(super) fn validate(
        &self,
        programs: &[RebuiltV3ScenarioProgram],
    ) -> Result<(), RebuiltV3ScenarioError> {
        for program in programs {
            for instruction in &program.instructions {
                self.validate_instruction(program, instruction)?;
            }
        }
        Ok(())
    }

    fn validate_instruction(
        &self,
        program: &RebuiltV3ScenarioProgram,
        instruction: &RebuiltV3ClassicInstruction,
    ) -> Result<(), RebuiltV3ScenarioError> {
        match instruction.opcode {
            1 if !self.allow_deferred
                && !self
                    .message_ids
                    .contains(&u32::from(instruction.id.unsigned_abs())) =>
            {
                return Err(RebuiltV3ScenarioError::MissingProgramMessage {
                    program: program.id.clone(),
                    message_id: instruction.id,
                });
            }
            4 | 5 => self.validate_encounter(program, instruction)?,
            39 if !self.allow_deferred
                && !self
                    .program_ids
                    .contains(&StableId(format!("xap:{}", instruction.id))) =>
            {
                return Err(RebuiltV3ScenarioError::MissingExtraActionPointTarget {
                    program: program.id.clone(),
                    native_id: instruction.id,
                });
            }
            62 if !self.allow_deferred
                && !self.text_resource_ids.contains(&i32::from(instruction.id)) =>
            {
                return Err(RebuiltV3ScenarioError::MissingTextResourceTarget {
                    program: program.id.clone(),
                    resource_id: instruction.id,
                });
            }
            67 | 72 | 75 | 78 | 85 => validate_branch_instruction(program, instruction, self)?,
            _ => {}
        }
        Ok(())
    }
    fn validate_encounter(
        &self,
        program: &RebuiltV3ScenarioProgram,
        instruction: &RebuiltV3ClassicInstruction,
    ) -> Result<(), RebuiltV3ScenarioError> {
        match instruction.opcode {
            4 if !self.allow_deferred
                && !u32::try_from(instruction.id)
                    .is_ok_and(|encounter_id| self.simple_ids.contains(&encounter_id)) =>
            {
                return Err(RebuiltV3ScenarioError::MissingSimpleEncounterTarget {
                    program: program.id.clone(),
                    encounter_id: instruction.id,
                });
            }
            5 if !self.allow_deferred
                && !u32::try_from(instruction.id)
                    .is_ok_and(|encounter_id| self.complex_ids.contains(&encounter_id)) =>
            {
                return Err(RebuiltV3ScenarioError::MissingComplexEncounterTarget {
                    program: program.id.clone(),
                    encounter_id: instruction.id,
                });
            }
            _ => {}
        }
        Ok(())
    }
}
