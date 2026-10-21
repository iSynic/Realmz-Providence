use super::{
    ReachabilityBuilder, RebuiltV3ReachabilityRelation, RebuiltV3ReachabilityTarget, StableId,
    complex_program, simple_program, xap_program,
};
impl ReachabilityBuilder<'_> {
    pub(super) fn add_xap(&mut self, source: &StableId, field: String, id: i16) {
        if id < 0 {
            return;
        }
        self.reference(
            source.clone(),
            field,
            RebuiltV3ReachabilityRelation::CallsProgram,
            RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(id))),
        );
    }

    pub(super) fn add_xap_range(&mut self, source: &StableId, field: &str, low: i16, high: i16) {
        if high < 0 || high < low {
            self.invalid_range(source, field, low, high);
            return;
        }
        for id in low.max(0)..=high {
            self.add_xap(source, format!("{field}.extraCode[3..=4]"), id);
        }
    }

    pub(super) fn add_one_based_branch(
        &mut self,
        source: &StableId,
        field: &str,
        mode: i16,
        id: i16,
    ) {
        match mode {
            -1 | 0 => {}
            1 => self.add_xap(source, field.into(), id),
            2 => self.record_nonnegative_target(
                source,
                field,
                id,
                RebuiltV3ReachabilityRelation::StartsSimpleEncounter,
                RebuiltV3ReachabilityTarget::SimpleEncounter,
            ),
            3 => self.record_nonnegative_target(
                source,
                field,
                id,
                RebuiltV3ReachabilityRelation::StartsComplexEncounter,
                RebuiltV3ReachabilityTarget::ComplexEncounter,
            ),
            _ => self.runtime_noop_mode(source, field, mode),
        }
    }

    pub(super) fn add_zero_based_branch(
        &mut self,
        source: &StableId,
        field: &str,
        mode: i16,
        id: i16,
    ) {
        match mode {
            -1 => {}
            0 => self.add_xap(source, field.into(), id),
            1 => self.record_nonnegative_target(
                source,
                field,
                id,
                RebuiltV3ReachabilityRelation::StartsSimpleEncounter,
                RebuiltV3ReachabilityTarget::SimpleEncounter,
            ),
            2 => self.record_nonnegative_target(
                source,
                field,
                id,
                RebuiltV3ReachabilityRelation::StartsComplexEncounter,
                RebuiltV3ReachabilityTarget::ComplexEncounter,
            ),
            _ => self.runtime_noop_mode(source, field, mode),
        }
    }

    pub(super) fn add_force_branch(&mut self, source: &StableId, field: &str, mode: i16, id: i16) {
        match mode {
            0 => self.add_xap(source, field.into(), id),
            1 | 2 => self.add_inline_result(source, field, mode, id),
            -1 | 3 => {}
            _ => self.runtime_noop_mode(source, field, mode),
        }
    }

    pub(super) fn add_choice_branch(&mut self, source: &StableId, field: &str, mode: i16, id: i16) {
        match mode {
            1 => self.add_xap(source, field.into(), id),
            2 | 3 => self.add_inline_result(source, field, mode - 1, id),
            0 | 4 => {}
            _ => self.runtime_noop_mode(source, field, mode),
        }
    }

    pub(super) fn add_inline_result(
        &mut self,
        source: &StableId,
        field: &str,
        mode: i16,
        result: i16,
    ) {
        if self.add_retained_inline_result(source, field, mode, result) {
            return;
        }
        let program = match (
            mode,
            self.current_context.simple,
            self.current_context.complex,
        ) {
            (1, Some(id), _) if (0..=3).contains(&result) => Some(simple_program(id, result as u8)),
            (2, _, Some(id)) if (0..=3).contains(&result) => {
                Some(complex_program(id, result as u8))
            }
            _ => None,
        };
        if let Some(program) = program {
            self.reference(
                source.clone(),
                field,
                RebuiltV3ReachabilityRelation::CallsProgram,
                RebuiltV3ReachabilityTarget::Program(program),
            );
        } else {
            self.reference(
                source.clone(),
                field,
                RebuiltV3ReachabilityRelation::CallsProgram,
                RebuiltV3ReachabilityTarget::Invalid(format!(
                    "inline encounter result mode {mode} row {result}"
                )),
            );
        }
    }

    fn add_retained_inline_result(
        &mut self,
        source: &StableId,
        field: &str,
        mode: i16,
        result: i16,
    ) -> bool {
        // Castle retains global encounter records across separate AP calls.
        // When the current call chain has no owner, preserve the finite native
        // domain rather than declaring a potentially valid retained call invalid.
        let retained_ids = match mode {
            1 if self.current_context.simple.is_none() => Some(
                self.snapshot
                    .simple_encounters
                    .iter()
                    .map(|row| row.native_id.0)
                    .collect(),
            ),
            2 if self.current_context.complex.is_none() => Some(self.catalog.complex.ids.clone()),
            _ => None,
        };
        if let Some(ids) = retained_ids.filter(|_| (0..=3).contains(&result)) {
            let original = self.current_context;
            for id in ids {
                let (target, owner) = if mode == 1 {
                    self.current_context = original.with_simple(id);
                    (
                        simple_program(id, result as u8),
                        RebuiltV3ReachabilityTarget::SimpleEncounter(id),
                    )
                } else {
                    self.current_context = original.with_complex(id);
                    (
                        complex_program(id, result as u8),
                        RebuiltV3ReachabilityTarget::ComplexEncounter(id),
                    )
                };
                if mode != 1 || self.catalog.simple.ids.contains(&id) {
                    self.reference(
                        source.clone(),
                        format!("{field}.retainedEncounter"),
                        RebuiltV3ReachabilityRelation::CallsProgram,
                        owner,
                    );
                } else {
                    self.reachable_simple.insert(id);
                }
                self.reference(
                    source.clone(),
                    format!("{field}.retainedResult"),
                    RebuiltV3ReachabilityRelation::CallsProgram,
                    RebuiltV3ReachabilityTarget::Program(target),
                );
            }
            self.current_context = original;
            return true;
        }
        false
    }

    pub(super) fn add_zero_based_range(
        &mut self,
        source: &StableId,
        field: &str,
        mode: i16,
        low: i16,
        high: i16,
    ) {
        if high < 0 || high < low {
            self.invalid_range(source, field, low, high);
            return;
        }
        for id in low.max(0)..=high {
            self.add_zero_based_branch(source, &format!("{field}.extraCode[1..=2]"), mode, id);
        }
    }

    pub(super) fn runtime_noop_mode(&mut self, source: &StableId, field: &str, mode: i16) {
        self.reference(
            source.clone(),
            field,
            RebuiltV3ReachabilityRelation::RuntimeNoOp,
            RebuiltV3ReachabilityTarget::RuntimeNoOp(format!("branch mode {mode}")),
        );
    }

    pub(super) fn runtime_noop_opcode(&mut self, source: &StableId, field: &str, opcode: i16) {
        self.reference(
            source.clone(),
            field,
            RebuiltV3ReachabilityRelation::RuntimeNoOp,
            RebuiltV3ReachabilityTarget::RuntimeNoOp(format!("opcode {opcode}")),
        );
    }

    pub(super) fn invalid_range(&mut self, source: &StableId, field: &str, low: i16, high: i16) {
        self.reference(
            source.clone(),
            field,
            RebuiltV3ReachabilityRelation::CallsProgram,
            RebuiltV3ReachabilityTarget::Invalid(format!("branch range {low}..={high}")),
        );
    }

    pub(super) fn record_nonnegative_target(
        &mut self,
        source: &StableId,
        field: &str,
        id: i16,
        relation: RebuiltV3ReachabilityRelation,
        constructor: fn(u32) -> RebuiltV3ReachabilityTarget,
    ) {
        let target = u32::try_from(id)
            .map(constructor)
            .unwrap_or_else(|_| RebuiltV3ReachabilityTarget::Invalid(format!("negative ID {id}")));
        self.reference(source.clone(), field, relation, target);
    }
}
