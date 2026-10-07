//! Durable local preferences use their own revision; no scenario history is added.
use crate::{ProjectStore, StoreError, atomic_file::atomic_write};
use providence_core::paint_resources::{PaintResourceChange, PaintResources};
use rusqlite::TransactionBehavior;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, time::Duration};

const FILE: &str = "paint-resources.json";
const MAX_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaintResourceReceipt {
    pub operation_id: String,
    pub intent_sha256: String,
    pub committed: bool,
    pub resource_revision: u64,
    pub error: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredResources {
    resources: PaintResources,
    operations: Vec<PaintResourceReceipt>,
}

impl ProjectStore {
    pub fn read_paint_resources(&self) -> Result<PaintResources, StoreError> {
        Ok(self.read_resource_file()?.resources)
    }

    fn read_resource_file(&self) -> Result<StoredResources, StoreError> {
        let path = self.root.join(crate::LOCAL_DIRECTORY).join(FILE);
        if !path.try_exists()? {
            return Ok(StoredResources::default());
        }
        let file = fs::File::open(path)?;
        let mut bytes = Vec::new();
        file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(invalid("The local collection is larger than 2 MiB."));
        }
        let stored: StoredResources = serde_json::from_slice(&bytes)?;
        stored.resources.validate().map_err(invalid)?;
        let mut ids = std::collections::BTreeSet::new();
        if stored.operations.len() > 32
            || stored.operations.iter().any(|receipt| {
                !valid_operation_id(&receipt.operation_id)
                    || !valid_operation_id(&receipt.intent_sha256)
                    || !ids.insert(&receipt.operation_id)
                    || receipt.resource_revision > stored.resources.revision
                    || receipt
                        .error
                        .as_ref()
                        .is_some_and(|error| error.len() > 4096)
            })
        {
            return Err(invalid("Invalid local paint operation receipts."));
        }
        Ok(stored)
    }

    pub fn change_paint_resources(
        &self,
        expected: u64,
        change: PaintResourceChange,
    ) -> Result<PaintResources, StoreError> {
        self.change_resources(expected, change, None)
    }

    pub fn change_paint_resources_recorded(
        &self,
        expected: u64,
        change: PaintResourceChange,
        operation_id: &str,
    ) -> Result<PaintResources, StoreError> {
        if !valid_operation_id(operation_id) {
            return Err(invalid("Use a 64-digit hexadecimal operation identity."));
        }
        self.change_resources(expected, change, Some(operation_id))
    }

    fn change_resources(
        &self,
        expected: u64,
        change: PaintResourceChange,
        operation_id: Option<&str>,
    ) -> Result<PaintResources, StoreError> {
        // Every writer takes the same local database lock before reading the JSON
        // revision. Atomic replacement owns durability; SQLite only serializes writers.
        let mut connection = self.open_database()?;
        connection.busy_timeout(Duration::from_secs(2))?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut stored = self.read_resource_file()?;
        if operation_id.is_some_and(|id| {
            stored
                .operations
                .iter()
                .any(|entry| entry.operation_id == id)
        }) {
            return Err(invalid(
                "This operation was already recorded. Check its original result; do not replay it.",
            ));
        }
        let intent_sha256 = intent_hash(expected, &change)?;
        let result = stored.resources.changed(expected, change);
        if let Ok(resources) = &result {
            stored.resources = resources.clone();
        }
        if let Some(id) = operation_id {
            stored.operations.push(PaintResourceReceipt {
                operation_id: id.into(),
                intent_sha256,
                committed: result.is_ok(),
                resource_revision: stored.resources.revision,
                error: result.as_ref().err().cloned(),
            });
            if stored.operations.len() > 32 {
                stored.operations.remove(0);
            }
            self.write_resource_file(&stored)?;
        } else if result.is_ok() {
            self.write_resource_file(&stored)?;
        }
        drop(transaction);
        result.map_err(invalid)
    }

    pub fn paint_resource_operation_status(
        &self,
        operation_id: &str,
        expected: u64,
        change: &PaintResourceChange,
    ) -> Result<Option<PaintResourceReceipt>, StoreError> {
        if !valid_operation_id(operation_id) {
            return Err(invalid("Invalid operation identity."));
        }
        let intent = intent_hash(expected, change)?;
        let receipt = self
            .read_resource_file()?
            .operations
            .into_iter()
            .find(|entry| entry.operation_id == operation_id);
        if receipt
            .as_ref()
            .is_some_and(|entry| entry.intent_sha256 != intent)
        {
            return Err(invalid(
                "The recorded operation belongs to a different collection change.",
            ));
        }
        Ok(receipt)
    }

    pub(super) fn copy_paint_resources_to(&self, target: &ProjectStore) -> Result<(), StoreError> {
        let resources = self.read_paint_resources()?;
        if resources != PaintResources::default() {
            target.write_resource_file(&StoredResources {
                resources,
                operations: vec![],
            })?;
        }
        Ok(())
    }

    fn write_resource_file(&self, stored: &StoredResources) -> Result<(), StoreError> {
        let bytes = serde_json::to_vec(stored)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(invalid("The local collection is larger than 2 MiB."));
        }
        atomic_write(&self.root.join(crate::LOCAL_DIRECTORY).join(FILE), &bytes)
    }
}

fn invalid(reason: impl Into<String>) -> StoreError {
    StoreError::InvalidLocalSession(reason.into())
}

fn valid_operation_id(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn intent_hash(expected: u64, change: &PaintResourceChange) -> Result<String, StoreError> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&(expected, change))?)
    ))
}

#[cfg(test)]
mod tests;
