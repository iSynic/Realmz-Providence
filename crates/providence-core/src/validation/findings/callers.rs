use crate::{discovery::DiscoveryIndex, model::StableId};
use std::collections::BTreeSet;

/// Direct incoming uses, including dormant callers. This is deliberately not a
/// reachability test: automatic runtime roots may have no incoming references.
pub fn records_without_callers(index: &DiscoveryIndex) -> BTreeSet<StableId> {
    index
        .records
        .iter()
        .filter(|record| index.incoming_record(record).is_empty())
        .map(|record| StableId(record.identity.clone()))
        .collect()
}
