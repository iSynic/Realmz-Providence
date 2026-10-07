use super::{ReachabilityBuilder, StableId};

pub(super) fn dependency_extra_code_opcode(opcode: i16) -> bool {
    matches!(
        opcode,
        2 | 3
            | 7
            | 21
            | 31
            | 33
            | 38
            | 40
            | 42
            | 46
            | 48
            | 55
            | 56
            | 58
            | 59
            | 64
            | 67
            | 72
            | 75
            | 76
            | 77
            | 78
            | 81
            | 85
            | 86
            | 87
            | 107
            | 120
            | 123
            | 124
            | 125
            | 126
    )
}

impl ReachabilityBuilder<'_> {
    pub(super) fn visit_take_gold_branch(
        &mut self,
        program: &StableId,
        field: &str,
        values: [i16; 5],
    ) {
        if (0..=2).contains(&values[1]) {
            // Opcode 33 uses the same forced destination contract as the
            // other result-branch opcodes.  Destination mode 1/2 means a
            // result program in the issuing encounter, not a new encounter
            // record; the issuing program identity supplies that context.
            self.add_force_branch(program, field, values[2], values[3]);
        }
    }

    pub(super) fn visit_choice_pair_branch(
        &mut self,
        program: &StableId,
        field: &str,
        values: [i16; 5],
    ) {
        self.add_zero_based_branch(
            program,
            &format!("{field}.extraCode[3]"),
            values[1],
            values[3],
        );
        if values[2] == 0 {
            self.add_zero_based_branch(
                program,
                &format!("{field}.extraCode[4]"),
                values[1],
                values[4],
            );
        }
    }
}
