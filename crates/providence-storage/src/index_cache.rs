use crate::{ProjectStore, StoreError, blob_store::sha256, database::create_schema};
use rusqlite::{OptionalExtension, params};
use std::fs;

// Bump when indexed labels, entity coverage or reference interpretation changes.
pub(super) const INDEX_FORMAT_VERSION: &str = "1";

impl ProjectStore {
    pub(super) fn ensure_current_index(&self) -> Result<(), StoreError> {
        if !self.index_matches_snapshot()? {
            self.rebuild_index(&self.load_snapshot()?)?;
        }
        Ok(())
    }

    // Opening restores portable truth and history; index consumers rebuild on demand.
    pub(super) fn index_matches_snapshot(&self) -> Result<bool, StoreError> {
        let digest = sha256(&fs::read(self.snapshot_path())?);
        let connection = self.open_database()?;
        create_schema(&connection)?;
        let matches = connection
            .query_row(
                "SELECT 1 FROM metadata AS digest
                 JOIN metadata AS version ON version.key = 'index_format_version'
                 WHERE digest.key = 'snapshot_sha256' AND digest.value = ?1
                   AND version.value = ?2
                   AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = 'index_dirty')",
                params![digest, INDEX_FORMAT_VERSION],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        Ok(matches)
    }
}
