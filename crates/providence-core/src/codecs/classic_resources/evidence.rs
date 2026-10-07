use super::{
    contracts::{
        ResourceEntry, ResourceEntryChange, ResourceEntryEvidence, ResourceEntryVersion,
        ResourceForkDiffReport, ResourceForkError, ResourceIdentity,
    },
    reader::{parse_resource_entries_preserving_duplicates, visit_resource_entries},
};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub fn inspect_resource_entry(
    bytes: &[u8],
    identity: &ResourceIdentity,
) -> Result<Option<ResourceEntryEvidence>, ResourceForkError> {
    let mut result = None;
    visit_resource_entries(
        bytes,
        true,
        |resource_type, id, name, attributes, data, offset| {
            if resource_type == identity.resource_type && id == identity.id {
                result = Some(ResourceEntryEvidence {
                    name,
                    attributes,
                    byte_length: data.len(),
                    fork_offset: offset,
                    sha256: format!("{:x}", Sha256::digest(data)),
                    preview: data.iter().take(20).copied().collect(),
                });
            }
        },
    )?;
    Ok(result)
}

pub fn inspect_resource_fork_diff(
    before: &[u8],
    after: &[u8],
    declared_owned: &BTreeSet<ResourceIdentity>,
) -> Result<ResourceForkDiffReport, ResourceForkError> {
    let before_entries = parse_resource_entries_preserving_duplicates(before)?;
    let after_entries = parse_resource_entries_preserving_duplicates(after)?;
    let changed_resources = resource_changes(&before_entries, &after_entries, declared_owned);
    let declared_owned_change_count = changed_resources
        .iter()
        .filter(|change| change.declared_owned)
        .count();
    let unexpected_change_count = changed_resources
        .iter()
        .filter(|change| !change.declared_owned)
        .count();
    let ambiguous_owned_change_count = changed_resources
        .iter()
        .filter(|change| change.ambiguous_owned_identity)
        .count();
    Ok(ResourceForkDiffReport {
        exact_container_bytes: before == after,
        before_entries: before_entries.len(),
        after_entries: after_entries.len(),
        changed_resource_count: changed_resources.len(),
        declared_owned_change_count,
        unexpected_change_count,
        ambiguous_owned_change_count,
        within_declared_ownership: unexpected_change_count == 0
            && ambiguous_owned_change_count == 0,
        changed_resources,
    })
}

fn resource_changes(
    before_entries: &[ResourceEntry],
    after_entries: &[ResourceEntry],
    declared_owned: &BTreeSet<ResourceIdentity>,
) -> Vec<ResourceEntryChange> {
    let before_groups = group_resource_entries(before_entries);
    let after_groups = group_resource_entries(after_entries);
    let identities = before_groups
        .keys()
        .chain(after_groups.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut changed_resources = Vec::new();
    for identity in identities {
        let before_group = before_groups
            .get(&identity)
            .map(Vec::as_slice)
            .unwrap_or_default();
        let after_group = after_groups
            .get(&identity)
            .map(Vec::as_slice)
            .unwrap_or_default();
        if before_group == after_group {
            continue;
        }
        let is_owned = declared_owned.contains(&identity);
        changed_resources.push(ResourceEntryChange {
            resource_type: String::from_utf8_lossy(&identity.resource_type).into_owned(),
            resource_id: identity.id,
            before: resource_entry_version(before_group),
            after: resource_entry_version(after_group),
            declared_owned: is_owned,
            ambiguous_owned_identity: is_owned && (before_group.len() > 1 || after_group.len() > 1),
        });
    }
    changed_resources
}

fn group_resource_entries(
    entries: &[ResourceEntry],
) -> BTreeMap<ResourceIdentity, Vec<ResourceEntry>> {
    let mut groups = BTreeMap::new();
    for entry in entries {
        groups
            .entry(ResourceIdentity {
                resource_type: entry.resource_type,
                id: entry.id,
            })
            .or_insert_with(Vec::new)
            .push(entry.clone());
    }
    groups
}

fn resource_entry_version(entries: &[ResourceEntry]) -> ResourceEntryVersion {
    ResourceEntryVersion {
        occurrences: entries.len(),
        names: entries.iter().map(|entry| entry.name.clone()).collect(),
        attributes: entries.iter().map(|entry| entry.attributes).collect(),
        payload_byte_lengths: entries.iter().map(|entry| entry.data.len()).collect(),
        payload_sha256: entries
            .iter()
            .map(|entry| format!("{:x}", Sha256::digest(&entry.data)))
            .collect(),
    }
}
