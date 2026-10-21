use super::{
    EncounterContext, ReachabilityBuilder, RebuiltV3ReachabilityRelation,
    RebuiltV3ReachabilityTarget, StableId, xap_program,
};
impl ReachabilityBuilder<'_> {
    pub(super) fn visit_extra_code_action(
        &mut self,
        program: &StableId,
        field: &str,
        opcode: i16,
        raw_id: i16,
    ) {
        let Ok(row_id) = u32::try_from(raw_id) else {
            self.reference(
                program.clone(),
                format!("{field}.extraCode"),
                RebuiltV3ReachabilityRelation::UsesExtraCode,
                RebuiltV3ReachabilityTarget::Invalid(format!("Data EDCD row {raw_id}")),
            );
            return;
        };
        let target = RebuiltV3ReachabilityTarget::ExtraCode(row_id);
        self.reference(
            program.clone(),
            format!("{field}.extraCode"),
            RebuiltV3ReachabilityRelation::UsesExtraCode,
            target,
        );
        let Some(values) = self.catalog.extra_codes.get(&row_id).copied() else {
            return;
        };
        if !self.visit_record_dependencies(program, field, opcode, values) {
            self.visit_branch_dependencies(program, field, opcode, values);
        }
    }

    fn visit_record_dependencies(
        &mut self,
        program: &StableId,
        field: &str,
        opcode: i16,
        values: [i16; 5],
    ) -> bool {
        let e = |index| format!("{field}.extraCode[{index}]");
        match opcode {
            2 | 48 | 56 | 107 => {
                self.add_battle_range(program, field, values);
                match opcode {
                    2 if values[4] == 10 && values[2] >= 0 => {
                        self.add_xap(program, e(2), values[2])
                    }
                    56 => self.add_xap(program, e(2), values[2]),
                    107 => self.add_xap(program, e(4), values[4]),
                    _ => {}
                }
            }
            23 | -23 => self.visit_random_region_battles(program, field, opcode, values),
            120 | 124 => self.add_monster(program, e(1), values[1]),
            123 => {
                for (index, value) in values.into_iter().enumerate() {
                    self.add_monster(program, e(index), value);
                }
            }
            125 => self.add_monster(program, e(0), values[0]),
            _ => return false,
        }
        true
    }

    fn visit_branch_dependencies(
        &mut self,
        program: &StableId,
        field: &str,
        opcode: i16,
        values: [i16; 5],
    ) {
        let e = |index| format!("{field}.extraCode[{index}]");
        match opcode {
            3 => self.add_choice_branch(program, &e(2), values[1], values[2]),
            33 => self.visit_take_gold_branch(program, &e(3), values),
            40 => self.add_one_based_branch(program, &e(2), values[1], values[2]),
            7 => self.visit_copied_result(program, field, values),
            21 | 87 => self.visit_choice_pair_branch(program, field, values),
            31 | 64 | 81 => {
                self.add_xap(program, e(3), values[3]);
                self.add_xap(program, e(4), values[4]);
            }
            38 | 42 | 46 | 58 | 59 => self.add_force_branch(program, &e(3), values[2], values[3]),
            54 => self.visit_rescheduled_timer(program, field, values),
            55 => {
                self.add_xap(program, e(3), values[3]);
                if values[1] == 1 {
                    self.add_xap(program, e(4), values[4]);
                }
            }
            67 => {
                self.add_zero_based_branch(program, &e(3), values[1], values[3]);
                self.add_zero_based_branch(program, &e(4), values[1], values[4]);
            }
            72 | 75 => self.add_zero_based_branch(program, &e(4), values[3], values[4]),
            76 => {
                if values[3] != 0 {
                    self.add_one_based_branch(program, &e(4), values[2], values[4]);
                }
            }
            77 | 78 | 86 => self.visit_nonzero_destinations(program, field, values),
            85 => self.add_zero_based_range(program, field, values[0], values[1], values[2]),
            126 => self.visit_macro_range(program, field, values),
            _ => {}
        }
    }

    fn visit_copied_result(&mut self, program: &StableId, field: &str, values: [i16; 5]) {
        let original = self.current_context;
        self.current_context = EncounterContext::default();
        let owner = u32::try_from(values[1]).ok();
        if let Some(owner) = owner.filter(|_| values[0] == -1 || values[0] == -2) {
            let target = if values[0] == -1 {
                self.current_context = self.current_context.with_simple(owner);
                RebuiltV3ReachabilityTarget::SimpleEncounter(owner)
            } else {
                self.current_context = self.current_context.with_complex(owner);
                RebuiltV3ReachabilityTarget::ComplexEncounter(owner)
            };
            self.reference(
                program.clone(),
                format!("{field}.copiedResultOwner"),
                RebuiltV3ReachabilityRelation::CallsProgram,
                target,
            );
        }
        if values[2] >= 0 {
            self.add_xap(program, format!("{field}.extraCode[2]"), values[2]);
        }
        // The copy loads Castle's global encounter record even though
        // its copied instructions run only on a later invocation.
        self.current_context = match (values[0], owner) {
            (-1, Some(id)) => original.with_simple(id),
            (-2, Some(id)) => original.with_complex(id),
            _ => original,
        };
    }

    fn visit_rescheduled_timer(&mut self, program: &StableId, field: &str, values: [i16; 5]) {
        let row = self
            .snapshot
            .timed_encounters
            .iter()
            .find(|row| i64::from(row.native_id.0) == i64::from(values[0]));
        let target = row.map_or_else(
            || RebuiltV3ReachabilityTarget::Invalid(format!("timed encounter {}", values[0])),
            |row| RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(row.door))),
        );
        let original = self.current_context;
        self.current_context = EncounterContext::default();
        self.reference(
            program.clone(),
            format!("{field}.rescheduledTimed"),
            RebuiltV3ReachabilityRelation::CallsProgram,
            target,
        );
        self.current_context = original;
    }

    fn visit_nonzero_destinations(&mut self, program: &StableId, field: &str, values: [i16; 5]) {
        for index in [3, 4] {
            if values[index] != 0 {
                self.add_zero_based_branch(
                    program,
                    &format!("{field}.extraCode[{index}]"),
                    values[2],
                    values[index],
                );
            }
        }
    }

    fn visit_macro_range(&mut self, program: &StableId, field: &str, values: [i16; 5]) {
        if values[2] == 2 {
            self.add_xap_range(program, field, values[3], values[4]);
        } else {
            self.add_xap(program, format!("{field}.extraCode[3]"), values[3]);
        }
    }
}
