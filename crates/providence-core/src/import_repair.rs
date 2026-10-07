//! Repairs compare source interpretations before touching current authored values.
mod assessment;
mod changes;
mod contracts;
mod items;
mod retained_sources;
mod review;
mod shops;
mod spells;

pub use assessment::assess;
pub use changes::apply;
pub use contracts::{RepairAssessment, RepairChange, RepairCommand, RepairEntry};

pub const INTERPRETATION_VERSION: u32 = 2;

#[cfg(test)]
mod item_tests;
#[cfg(test)]
mod shop_tests;
#[cfg(test)]
mod tests;

#[cfg(test)]
mod item_fixtures;
