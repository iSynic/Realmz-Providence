use crate::model::{ProjectSnapshot, StableId};
use std::collections::{BTreeSet, VecDeque};

mod action_dependencies;
mod battle_ranges;
mod branches;
mod catalog;
mod combat;
mod contracts;
mod extra_code_actions;
mod identities;
mod programs;
mod roots;
mod traversal;

pub use contracts::{
    RebuiltV3ReachabilityError, RebuiltV3ReachabilityReference, RebuiltV3ReachabilityRelation,
    RebuiltV3ReachabilityReport, RebuiltV3ReachabilityTarget,
};
use identities::{complex_program, simple_program, xap_program};

#[derive(Clone, Copy, Default, Eq, PartialEq, Ord, PartialOrd)]
struct EncounterContext {
    simple: Option<u32>,
    complex: Option<u32>,
}

impl EncounterContext {
    fn with_simple(self, id: u32) -> Self {
        Self {
            simple: Some(id),
            ..self
        }
    }

    fn with_complex(self, id: u32) -> Self {
        Self {
            complex: Some(id),
            ..self
        }
    }
}

enum Work {
    Program(StableId, EncounterContext),
    Simple(u32, EncounterContext),
    Complex(u32, EncounterContext),
    Battle(u32, EncounterContext),
    Monster(u32, EncounterContext),
}

struct ReachabilityBuilder<'a> {
    snapshot: &'a ProjectSnapshot,
    catalog: catalog::ReachabilityCatalog<'a>,
    references: BTreeSet<RebuiltV3ReachabilityReference>,
    reachable_programs: BTreeSet<StableId>,
    reachable_simple: BTreeSet<u32>,
    reachable_complex: BTreeSet<u32>,
    reachable_battles: BTreeSet<u32>,
    reachable_monsters: BTreeSet<u32>,
    visited_program_states: BTreeSet<(StableId, EncounterContext)>,
    visited_simple_states: BTreeSet<(u32, EncounterContext)>,
    visited_complex_states: BTreeSet<(u32, EncounterContext)>,
    visited_battle_states: BTreeSet<(u32, EncounterContext)>,
    visited_monster_states: BTreeSet<(u32, EncounterContext)>,
    // A queued visit carries loaded encounter context; roots are seeded before visits.
    current_context: EncounterContext,
    work: VecDeque<Work>,
}

pub fn derive_rebuilt_v3_reachability(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3ReachabilityReport, RebuiltV3ReachabilityError> {
    let mut builder = ReachabilityBuilder::new(snapshot)?;
    builder.add_roots();
    builder.run();
    Ok(builder.finish())
}

#[cfg(test)]
#[path = "reachability/tests/mod.rs"]
mod tests;
