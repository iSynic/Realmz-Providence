use super::{ProjectStore, StoreError};
use crate::atomic_file::atomic_write;
use std::fs;

impl ProjectStore {
    pub(super) fn backup_pre_selection_snapshot(&self) -> Result<(), StoreError> {
        let path = self.snapshot_path();
        if !path.is_file() {
            return Ok(());
        }
        let bytes = fs::read(path)?;
        let value: serde_json::Value = serde_json::from_slice(&bytes)?;
        let version = value
            .get("snapshotFormatVersion")
            .or_else(|| value.get("formatVersion"))
            .and_then(serde_json::Value::as_u64);
        if version != Some(35) {
            return Ok(());
        }
        let backup = self.root.join("snapshot-v35-backup.json");
        if backup.exists() {
            if fs::read(&backup)? != bytes {
                return Err(StoreError::InvalidPortableSnapshot("version-35 backup already exists with different contents; preserve or rename it before upgrading".into()));
            }
            return Ok(());
        }
        atomic_write(&backup, &bytes)
    }
}
