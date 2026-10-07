//! Authored native blobs overlay exports without replacing the original source annex.
use providence_core::{
    compiler::ClassicCompatibilitySources,
    model::{BlobId, ProjectSnapshot},
};
use providence_storage::ProjectStore;
use std::collections::BTreeSet;

pub(super) struct RuleSources {
    race: Option<Vec<u8>>,
    caste: Option<Vec<u8>>,
    authored_race: bool,
    authored_caste: bool,
}

impl RuleSources {
    pub fn read(snapshot: &ProjectSnapshot, store: &ProjectStore) -> Result<Self, String> {
        Ok(Self {
            race: family(
                snapshot
                    .race_rules
                    .iter()
                    .map(|r| r.source_blob.as_ref())
                    .collect(),
                store,
                "Race",
            )?,
            caste: family(
                snapshot
                    .caste_rules
                    .iter()
                    .map(|r| r.source_blob.as_ref())
                    .collect(),
                store,
                "Caste",
            )?,
            authored_race: snapshot
                .race_rules
                .iter()
                .any(|r| r.source.starts_with("Scenario ")),
            authored_caste: snapshot
                .caste_rules
                .iter()
                .any(|r| r.source.starts_with("Scenario ")),
        })
    }
    pub fn overlay<'a>(
        &'a self,
        mut sources: ClassicCompatibilitySources<'a>,
    ) -> ClassicCompatibilitySources<'a> {
        sources.application_data_race = self.race.as_deref();
        if self.authored_race {
            sources.current_data_race = self.race.as_deref();
        }
        if self.authored_caste {
            sources.current_data_caste = self.caste.as_deref();
        }
        sources
    }
}

fn family(
    blobs: BTreeSet<Option<&BlobId>>,
    store: &ProjectStore,
    label: &str,
) -> Result<Option<Vec<u8>>, String> {
    if blobs.len() > 1 {
        return Err(format!(
            "Classic {label} compilation requires one consistent native source blob."
        ));
    }
    blobs
        .first()
        .copied()
        .flatten()
        .map(|blob| store.read_blob(blob).map_err(|e| e.to_string()))
        .transpose()
}
