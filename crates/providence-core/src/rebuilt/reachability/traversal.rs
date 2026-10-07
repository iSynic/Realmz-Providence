use super::{
    EncounterContext, ProjectSnapshot, ReachabilityBuilder, RebuiltV3ReachabilityError,
    RebuiltV3ReachabilityReference, RebuiltV3ReachabilityRelation, RebuiltV3ReachabilityReport,
    RebuiltV3ReachabilityTarget, StableId, Work, complex_program, simple_program,
};
use std::collections::{BTreeSet, VecDeque};

impl<'a> ReachabilityBuilder<'a> {
    pub(super) fn new(snapshot: &'a ProjectSnapshot) -> Result<Self, RebuiltV3ReachabilityError> {
        let catalog = super::catalog::ReachabilityCatalog::new(snapshot)?;
        Ok(Self {
            snapshot,
            catalog,
            references: BTreeSet::new(),
            reachable_programs: BTreeSet::new(),
            reachable_simple: BTreeSet::new(),
            reachable_complex: BTreeSet::new(),
            reachable_battles: BTreeSet::new(),
            reachable_monsters: BTreeSet::new(),
            visited_program_states: BTreeSet::new(),
            visited_simple_states: BTreeSet::new(),
            visited_complex_states: BTreeSet::new(),
            visited_battle_states: BTreeSet::new(),
            visited_monster_states: BTreeSet::new(),
            current_context: EncounterContext::default(),
            work: VecDeque::new(),
        })
    }
}

impl ReachabilityBuilder<'_> {
    pub(super) fn run(&mut self) {
        while let Some(work) = self.work.pop_front() {
            match work {
                Work::Program(id, context) => {
                    self.current_context = context;
                    self.visit_program(&id);
                }
                Work::Simple(id, context) => {
                    self.current_context = context;
                    let results = self
                        .catalog
                        .simple
                        .results
                        .get(&id)
                        .cloned()
                        .unwrap_or_default();
                    for result in results {
                        self.reference(
                            StableId(format!("simple-encounter:{id}")),
                            format!("resultPrograms[{result}]"),
                            RebuiltV3ReachabilityRelation::CallsProgram,
                            RebuiltV3ReachabilityTarget::Program(simple_program(id, result)),
                        );
                    }
                }
                Work::Complex(id, context) => {
                    self.current_context = context;
                    let results = self
                        .catalog
                        .complex
                        .results
                        .get(&id)
                        .cloned()
                        .unwrap_or_default();
                    for result in results {
                        self.reference(
                            StableId(format!("complex-encounter:{id}")),
                            format!("resultPrograms[{result}]"),
                            RebuiltV3ReachabilityRelation::CallsProgram,
                            RebuiltV3ReachabilityTarget::Program(complex_program(id, result)),
                        );
                    }
                }
                Work::Battle(id, context) => {
                    self.current_context = context;
                    self.visit_battle(id);
                }
                Work::Monster(id, context) => {
                    self.current_context = context;
                    self.visit_monster(id);
                }
            }
        }
    }

    pub(super) fn reference(
        &mut self,
        source: StableId,
        field: impl Into<String>,
        relation: RebuiltV3ReachabilityRelation,
        target: RebuiltV3ReachabilityTarget,
    ) {
        let resolved = self.catalog.resolves(&target, &relation);
        let reference = RebuiltV3ReachabilityReference {
            source,
            field: field.into(),
            relation,
            target: target.clone(),
            resolved,
        };
        self.references.insert(reference);
        if !resolved {
            return;
        }
        self.queue_target(target);
    }

    fn queue_target(&mut self, target: RebuiltV3ReachabilityTarget) {
        match target {
            RebuiltV3ReachabilityTarget::Program(id) => {
                self.reachable_programs.insert(id.clone());
                if self
                    .visited_program_states
                    .insert((id.clone(), self.current_context))
                {
                    self.work.push_back(Work::Program(id, self.current_context));
                }
            }
            RebuiltV3ReachabilityTarget::SimpleEncounter(id) => {
                self.reachable_simple.insert(id);
                let context = self.current_context.with_simple(id);
                if self.visited_simple_states.insert((id, context)) {
                    self.work.push_back(Work::Simple(id, context));
                }
            }
            RebuiltV3ReachabilityTarget::ComplexEncounter(id) => {
                self.reachable_complex.insert(id);
                let context = self.current_context.with_complex(id);
                if self.visited_complex_states.insert((id, context)) {
                    self.work.push_back(Work::Complex(id, context));
                }
            }
            RebuiltV3ReachabilityTarget::Battle(id) => {
                self.reachable_battles.insert(id);
                if self
                    .visited_battle_states
                    .insert((id, self.current_context))
                {
                    self.work.push_back(Work::Battle(id, self.current_context));
                }
            }
            RebuiltV3ReachabilityTarget::Monster(id) if self.catalog.monsters.contains_key(&id) => {
                self.reachable_monsters.insert(id);
                if self
                    .visited_monster_states
                    .insert((id, self.current_context))
                {
                    self.work.push_back(Work::Monster(id, self.current_context));
                }
            }
            _ => {}
        }
    }

    pub(super) fn finish(self) -> RebuiltV3ReachabilityReport {
        let references = self.references.into_iter().collect::<Vec<_>>();
        let unresolved_references = references
            .iter()
            .filter(|reference| !reference.resolved)
            .cloned()
            .collect();
        RebuiltV3ReachabilityReport {
            reachable_program_ids: self.reachable_programs.into_iter().collect(),
            reachable_simple_encounter_ids: self.reachable_simple.into_iter().collect(),
            reachable_complex_encounter_ids: self.reachable_complex.into_iter().collect(),
            reachable_battle_ids: self.reachable_battles.into_iter().collect(),
            reachable_monster_ids: self.reachable_monsters.into_iter().collect(),
            references,
            unresolved_references,
        }
    }
}
