use crate::model::{ClassicAction, StableId};
use crate::rebuilt::scenario::{
    RebuiltV3ProgramOwnerKind, RebuiltV3ScenarioError, RebuiltV3ScenarioProgram,
    instructions_projection, instructions_projection_with_policy,
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) enum ResultFamily {
    Simple,
    Complex,
}

impl ResultFamily {
    fn prefix(&self) -> &'static str {
        match self {
            Self::Simple => "simple",
            Self::Complex => "complex",
        }
    }

    fn owner_kind(&self) -> RebuiltV3ProgramOwnerKind {
        match self {
            Self::Simple => RebuiltV3ProgramOwnerKind::SimpleEncounterResult,
            Self::Complex => RebuiltV3ProgramOwnerKind::ComplexEncounterResult,
        }
    }
}

pub(super) struct ResultPrograms<'a> {
    pub extra_codes: &'a BTreeMap<u32, [i16; 5]>,
    pub defer_missing_extra_code: bool,
    pub selected_programs: Option<&'a BTreeSet<StableId>>,
}

impl ResultPrograms<'_> {
    pub(super) fn append(
        &self,
        output: &mut Vec<RebuiltV3ScenarioProgram>,
        family: ResultFamily,
        native_id: u32,
        actions: &[ClassicAction],
    ) -> Result<(), RebuiltV3ScenarioError> {
        for result_index in 0..4u8 {
            let program_id = StableId(format!(
                "{}:{native_id}:result:{result_index}",
                family.prefix()
            ));
            if self
                .selected_programs
                .is_some_and(|ids| !ids.contains(&program_id))
            {
                continue;
            }
            let actions = actions
                .iter()
                .filter(|action| action.slot / 8 == result_index)
                .map(|action| ClassicAction {
                    slot: action.slot % 8,
                    raw_opcode: action.raw_opcode,
                    target_native_id: action.target_native_id,
                })
                .collect::<Vec<_>>();
            output.push(RebuiltV3ScenarioProgram {
                id: program_id.clone(),
                owner_kind: family.owner_kind(),
                owner_id: StableId(native_id.to_string()),
                instructions: if self.defer_missing_extra_code {
                    instructions_projection_with_policy(
                        &program_id,
                        &actions,
                        self.extra_codes,
                        true,
                    )?
                } else {
                    instructions_projection(&program_id, &actions, self.extra_codes)?
                },
            });
        }
        Ok(())
    }
}
