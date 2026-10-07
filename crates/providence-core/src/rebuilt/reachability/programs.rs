use super::super::scenario::source_resolved_runtime_noop_opcode;
use super::action_dependencies::dependency_extra_code_opcode;
use super::{
    ReachabilityBuilder, RebuiltV3ReachabilityRelation, RebuiltV3ReachabilityTarget, StableId,
    xap_program,
};
impl ReachabilityBuilder<'_> {
    pub(super) fn visit_program(&mut self, id: &StableId) {
        let Some(source) = self.catalog.programs.get(id).copied() else {
            return;
        };
        for action in source.actions {
            if source
                .slot_group
                .is_some_and(|group| action.slot / 8 != group)
            {
                continue;
            }
            let slot = source.slot_group.map_or(action.slot, |_| action.slot % 8);
            let field = format!("actions[{slot}]");
            self.visit_action(id, &field, action);
        }
    }

    fn visit_action(&mut self, id: &StableId, field: &str, action: &crate::model::ClassicAction) {
        let target_field = format!("{field}.target");
        match action.opcode() {
            4 => self.record_nonnegative_target(
                id,
                &target_field,
                action.target_native_id,
                RebuiltV3ReachabilityRelation::StartsSimpleEncounter,
                RebuiltV3ReachabilityTarget::SimpleEncounter,
            ),
            5 => self.record_nonnegative_target(
                id,
                &target_field,
                action.target_native_id,
                RebuiltV3ReachabilityRelation::StartsComplexEncounter,
                RebuiltV3ReachabilityTarget::ComplexEncounter,
            ),
            39 => self.reference(
                id.clone(),
                target_field,
                RebuiltV3ReachabilityRelation::CallsProgram,
                RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(
                    action.target_native_id,
                ))),
            ),
            89 => self.record_nonnegative_target(
                id,
                &target_field,
                action.target_native_id,
                RebuiltV3ReachabilityRelation::SpawnsMonster,
                RebuiltV3ReachabilityTarget::Monster,
            ),
            127 => self.record_nonnegative_target(
                id,
                &target_field,
                action.target_native_id,
                RebuiltV3ReachabilityRelation::TestsMonsterPresence,
                RebuiltV3ReachabilityTarget::Monster,
            ),
            opcode if dependency_extra_code_opcode(opcode) => {
                self.visit_extra_code_action(id, field, opcode, action.target_native_id)
            }
            opcode if source_resolved_runtime_noop_opcode(opcode) => {
                self.runtime_noop_opcode(id, field, opcode)
            }
            _ => {}
        }
    }
}
