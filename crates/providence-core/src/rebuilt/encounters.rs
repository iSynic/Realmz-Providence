mod complex;
mod contracts;
mod messages;
mod result_programs;
mod rogue;
mod simple;
mod timed_selection;

pub use complex::project_rebuilt_v3_complex_encounters;
pub(crate) use complex::project_rebuilt_v3_selected_complex_encounters;
pub use contracts::{
    RebuiltV3ComplexEncounter, RebuiltV3ComplexEncounterProjection, RebuiltV3Message,
    RebuiltV3RogueEncounter, RebuiltV3RogueEncounterError, RebuiltV3SimpleEncounter,
    RebuiltV3SimpleEncounterProjection, RebuiltV3SimpleEncounterResponse, RebuiltV3TimedEncounter,
    RebuiltV3TimedEncounterError, RebuiltV3TimedEncounterLocationKind,
    RebuiltV3TimedEncounterProjection,
};
pub use messages::project_rebuilt_v3_messages;
pub use rogue::project_rebuilt_v3_rogue_encounters;
pub(crate) use rogue::project_rebuilt_v3_selected_rogue_encounters;
pub use simple::project_rebuilt_v3_simple_encounters;
pub(crate) use simple::{
    project_rebuilt_v3_selected_simple_encounters, simple_encounter_is_runtime_representable,
};
pub use timed_selection::project_rebuilt_v3_timed_encounters;
pub(crate) use timed_selection::{
    project_rebuilt_v3_selected_timed_encounters, runtime_timed_encounter_ids,
};

#[cfg(test)]
mod tests;
