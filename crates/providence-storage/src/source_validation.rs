//! Many imported records share one source fork. Verify each unique blob once per operation.

use super::{ProjectStore, StoreError};
use providence_core::model::{BlobId, ProjectOrigin, ProjectSnapshot};
use std::collections::{BTreeMap, BTreeSet};

impl ProjectStore {
    pub fn validate_source_blobs(&self, snapshot: &ProjectSnapshot) -> Result<(), StoreError> {
        providence_core::snapshot::authoring_metadata::validate(snapshot)?;
        if let Some(context) = &snapshot.classic_rule_selection
            && !matches!(
                context.evidence_origin,
                providence_core::model::ClassicRuleSelectionEvidence::OwnerConfigured
            )
        {
            return Err(StoreError::InvalidPortableSnapshot(
                "captured native selection has no installed verified capture channel".into(),
            ));
        }
        let mut lengths = BTreeMap::new();
        for id in source_blob_ids(snapshot) {
            lengths.insert(id, self.read_blob(id)?.len() as u64);
        }
        for source in &snapshot.classic_sources {
            check_length(
                &source.native_path,
                source.byte_length,
                lengths[&source.blob],
            )?;
        }
        for catalog in &snapshot.landlook_catalogs {
            check_length(
                &catalog.source,
                catalog.byte_length,
                lengths[&catalog.source_blob],
            )?;
        }
        Ok(())
    }
}

fn check_length(path: &str, expected: u64, actual: u64) -> Result<(), StoreError> {
    if actual != expected {
        return Err(StoreError::SourceBlobLengthMismatch {
            native_path: path.to_owned(),
            expected,
            actual,
        });
    }
    Ok(())
}

fn source_blob_ids(snapshot: &ProjectSnapshot) -> BTreeSet<&BlobId> {
    let mut ids = rule_source_blob_ids(snapshot);
    if let Some(context) = &snapshot.classic_rule_selection {
        ids.extend(context.witness_blobs());
    }
    ids.extend(
        snapshot
            .terrain_catalog
            .iter()
            .filter_map(|profile| profile.source_blob.as_ref()),
    );
    ids.extend(
        snapshot
            .landlook_catalogs
            .iter()
            .map(|catalog| &catalog.source_blob),
    );
    ids.extend(
        snapshot
            .world
            .maps
            .iter()
            .filter_map(|map| map.runtime.as_ref()?.source_blob.as_ref()),
    );
    ids.extend(snapshot.classic_sources.iter().map(|source| &source.blob));
    ids.extend(
        snapshot
            .player_map_names
            .iter()
            .filter_map(|catalog| catalog.source_blob.as_ref()),
    );
    if let ProjectOrigin::Imported {
        compatibility_annex,
    } = &snapshot.origin
    {
        ids.insert(compatibility_annex);
    }
    ids
}

fn rule_source_blob_ids(snapshot: &ProjectSnapshot) -> BTreeSet<&BlobId> {
    let mut ids = BTreeSet::new();
    ids.extend(
        snapshot
            .race_rules
            .iter()
            .filter_map(|rule| rule.source_blob.as_ref()),
    );
    ids.extend(
        snapshot
            .caste_rules
            .iter()
            .filter_map(|rule| rule.source_blob.as_ref()),
    );
    ids.extend(
        snapshot
            .rule_names
            .iter()
            .map(|catalog| &catalog.source_blob),
    );
    ids.extend(
        snapshot
            .item_rules
            .iter()
            .flat_map(|rule| [&rule.source_blob, &rule.text_source_blob]),
    );
    ids.extend(
        snapshot.scenario_item_rules.iter().flat_map(|rule| {
            std::iter::once(&rule.source_blob).chain(rule.text_source_blob.iter())
        }),
    );
    for spell in snapshot
        .standard_spells
        .iter()
        .chain(&snapshot.scenario_spells)
    {
        ids.extend(
            spell
                .source_blob
                .iter()
                .chain(spell.text_source_blob.iter()),
        );
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::model::{ClassicSourceBlob, StableId};

    #[test]
    fn shared_sources_are_verified_once_but_each_declared_length_is_checked() {
        let temporary = tempfile::tempdir().unwrap();
        let mut snapshot = ProjectSnapshot::new_authored(StableId("shared-source".into()));
        let store = ProjectStore::create(temporary.path(), &snapshot).unwrap();
        let blob = store.put_blob(b"shared fork").unwrap();
        snapshot.classic_sources = (0..100)
            .map(|index| ClassicSourceBlob {
                native_path: format!("source-{index}"),
                blob: blob.clone(),
                byte_length: 11,
            })
            .collect();
        assert_eq!(source_blob_ids(&snapshot).len(), 1);
        store.validate_source_blobs(&snapshot).unwrap();
        snapshot.classic_sources[99].byte_length = 12;
        assert!(matches!(
            store.validate_source_blobs(&snapshot),
            Err(StoreError::SourceBlobLengthMismatch { .. })
        ));
        fs_corrupt(&store, &blob);
        assert!(matches!(
            store.validate_source_blobs(&snapshot),
            Err(StoreError::BlobDigestMismatch(_))
        ));
    }

    fn fs_corrupt(store: &ProjectStore, id: &BlobId) {
        std::fs::write(store.blob_path(id).unwrap(), b"changed fork").unwrap();
    }
}
