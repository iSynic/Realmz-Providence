mod application_hooks;
mod assembly;
mod battle_references;
mod branches;
mod contracts;
mod error;
mod error_messages;
mod instructions;
mod map_references;
mod opcodes;
mod random_rectangles;
mod references;
mod triggers;

pub use assembly::project_rebuilt_v3_scenario;
pub(crate) use assembly::project_rebuilt_v3_selected_scenario;
pub use battle_references::rebuilt_v3_referenced_battle_ids;
pub use contracts::{
    RebuiltExtraCodeTail, RebuiltV3ApplicationHooks, RebuiltV3ClassicInstruction,
    RebuiltV3InstructionKind, RebuiltV3Migration, RebuiltV3ProgramOwnerKind,
    RebuiltV3ScenarioAction, RebuiltV3ScenarioDocument, RebuiltV3ScenarioProgram,
    RebuiltV3StateDefinition, RebuiltV3Trigger, RebuiltV3TriggerDestination,
    RebuiltV3TriggerPrograms, imported_extra_code_tail,
};
pub use error::RebuiltV3ScenarioError;
pub(crate) use instructions::{
    extra_code_index, instructions_projection, instructions_projection_with_policy,
};
pub(crate) use opcodes::source_resolved_runtime_noop_opcode;
pub use opcodes::{supported_classic_opcode, unsupported_classic_instructions};
pub(crate) use random_rectangles::projectable_opcode_92_random_rectangle_targets;
pub use random_rectangles::{
    rebuilt_v3_random_rectangle_battle_ids, validate_rebuilt_v3_random_rectangle_references,
};
pub use triggers::project_rebuilt_v3_trigger_programs;
pub(crate) use triggers::{
    extra_action_point_program_id, placed_trigger_is_defined,
    project_rebuilt_v3_selected_trigger_programs,
};

#[cfg(test)]
#[path = "scenario/tests/mod.rs"]
mod tests;
