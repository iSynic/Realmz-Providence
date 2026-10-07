mod byte_io;
mod container;
mod contracts;
mod evidence;
mod mutations;
mod reader;
mod writer;

pub use container::classic_resource_fork_candidate_paths;
pub use contracts::{
    ResourceEntry, ResourceEntryChange, ResourceEntryEvidence, ResourceEntryVersion,
    ResourceForkDiffReport, ResourceForkError, ResourceIdentity,
};
pub use evidence::{inspect_resource_entry, inspect_resource_fork_diff};
pub use mutations::{
    merge_resource_entries, merge_resource_entries_preserving_unowned_duplicates,
    remove_resource_entries_preserving_container,
};
pub use reader::{parse_resource_entries, parse_resource_entries_preserving_duplicates};
#[cfg(test)]
pub(super) use writer::write_resource_fork_preserving_duplicates;
pub use writer::{empty_resource_fork, write_resource_fork};

#[cfg(test)]
mod tests;
