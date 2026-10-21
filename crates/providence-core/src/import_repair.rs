//! Repairs compare source interpretations before touching current authored values.
mod assessment;
mod changes;
mod contracts;
mod items;
mod native_text;
#[cfg(test)]
mod native_text_tests;
mod retained_sources;
mod review;
mod shops;
mod spells;

pub use assessment::assess;
pub use changes::apply;
pub use contracts::{RepairAssessment, RepairChange, RepairCommand, RepairEntry};

pub const INTERPRETATION_VERSION: u32 = 3;

#[cfg(test)]
mod item_tests;
#[cfg(test)]
mod shop_tests;
#[cfg(test)]
mod tests;

#[cfg(test)]
mod item_fixtures;
