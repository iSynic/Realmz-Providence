use super::{
    container::replace_resource_fork_payload,
    contracts::{ResourceEntry, ResourceForkError, ResourceIdentity},
    reader::{parse_resource_entries, parse_resource_entries_preserving_duplicates},
    writer::{write_resource_fork, write_resource_fork_preserving_duplicates},
};
use std::collections::BTreeSet;

pub fn merge_resource_entries(
    original: &[u8],
    updates: Vec<ResourceEntry>,
) -> Result<Vec<u8>, ResourceForkError> {
    let mut entries = parse_resource_entries(original)?;
    let before = entries.clone();
    for update in updates {
        if let Some(existing) = entries
            .iter_mut()
            .find(|entry| entry.resource_type == update.resource_type && entry.id == update.id)
        {
            *existing = update;
        } else {
            entries.push(update);
        }
    }
    if entries == before {
        return Ok(original.to_vec());
    }
    let fork = write_resource_fork(&entries)?;
    replace_resource_fork_payload(original, &fork)
}

pub fn merge_resource_entries_preserving_unowned_duplicates(
    original: &[u8],
    updates: Vec<ResourceEntry>,
) -> Result<Vec<u8>, ResourceForkError> {
    let mut entries = parse_resource_entries_preserving_duplicates(original)?;
    let before = entries.clone();
    let mut update_identities = BTreeSet::new();
    for update in updates {
        if !update_identities.insert((update.resource_type, update.id)) {
            return Err(ResourceForkError::DuplicateResource {
                resource_type: update.resource_type,
                id: update.id,
            });
        }
        let matches = entries
            .iter()
            .enumerate()
            .filter(|(_, entry)| {
                entry.resource_type == update.resource_type && entry.id == update.id
            })
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        match matches.as_slice() {
            [] => entries.push(update),
            [index] => entries[*index] = update,
            _ => {
                return Err(ResourceForkError::DuplicateResource {
                    resource_type: update.resource_type,
                    id: update.id,
                });
            }
        }
    }
    if entries == before {
        return Ok(original.to_vec());
    }
    let fork = write_resource_fork_preserving_duplicates(&entries)?;
    replace_resource_fork_payload(original, &fork)
}

pub fn remove_resource_entries_preserving_container(
    original: &[u8],
    removals: &BTreeSet<ResourceIdentity>,
) -> Result<Vec<u8>, ResourceForkError> {
    if removals.is_empty() {
        return Ok(original.to_vec());
    }
    let mut entries = parse_resource_entries_preserving_duplicates(original)?;
    let before = entries.len();
    entries.retain(|entry| {
        !removals.contains(&ResourceIdentity {
            resource_type: entry.resource_type,
            id: entry.id,
        })
    });
    if entries.len() == before {
        return Ok(original.to_vec());
    }
    let fork = write_resource_fork_preserving_duplicates(&entries)?;
    replace_resource_fork_payload(original, &fork)
}
