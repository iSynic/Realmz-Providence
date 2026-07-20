mod builder;
mod common;
mod ed3;
mod map_names;
mod metadata;
mod opcodes;
mod records;
pub(crate) mod resources;
mod triggers;

pub use builder::{build_canonical_project_semantic_schema, build_semantic_schema};
pub use map_names::apply_map_name_hints;
