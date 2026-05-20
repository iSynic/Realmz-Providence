mod builder;
mod common;
mod map_names;
mod metadata;
mod opcodes;
mod records;
pub(crate) mod resources;
mod triggers;

pub use builder::build_semantic_schema;
pub use map_names::apply_map_name_hints;
