#![forbid(unsafe_code)]

mod application_library;
mod atomic_file;
mod blob_retention;
mod blob_store;
mod database;
mod errors;
mod index_cache;
mod monster_library;
mod monster_operations;
mod portable_snapshot;
mod project_index;
mod project_open;
mod reference_catalog;
mod save_as;
mod session_history;
mod snapshot_backup;
mod snapshot_segments;
pub use application_library::ReferenceLibraryStore;
pub use errors::StoreError;
pub use monster_library::MonsterLibraryStore;
pub use monster_operations::MonsterOperationStore;
pub use project_open::ProjectOpenTiming;
use providence_core::{
    model::{BlobId, ProjectSnapshot},
    session::{Revision, SESSION_HISTORY_ENTRY_LIMIT},
};
pub use reference_catalog::ReferenceCatalogStore;
use serde::{Deserialize, Serialize};
use snapshot_segments::SNAPSHOT_SEGMENTS;
use std::{
    fs,
    path::{Path, PathBuf},
};

mod history_checkpoint;
mod history_preparation;
#[cfg(test)]
mod import_history_tests;
mod paint_resources;
mod personal_library;
mod project_checkpoint;
mod source_validation;
pub use paint_resources::PaintResourceReceipt;
pub use personal_library::{PersonalLibraryStore, PersonalLibraryWriteError};

const SNAPSHOT_FILE: &str = "project.providence.json";
const LOCAL_DIRECTORY: &str = ".providence";
const LOCAL_DATABASE: &str = "local.sqlite3";
const LOCAL_SESSION_DIRECTORY: &str = "session";
const BLOB_ALGORITHM: &str = "sha256";
const PORTABLE_SNAPSHOT_KIND: &str = "providence.portable-snapshot";
const PORTABLE_SNAPSHOT_FORMAT_VERSION: u32 = 1;
const PRE_QUEST_LABEL_SNAPSHOT_FORMAT_VERSION: u32 = 31;
const PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION: u32 = 32;
const PRE_SCRIPT_DESCRIPTOR_SNAPSHOT_FORMAT_VERSION: u32 = 33;
const PRE_STARTUP_AUTHORING_SNAPSHOT_FORMAT_VERSION: u32 = 34;
const APPLICATION_MEDIA_CATALOG_FILE: &str = "classic-application-media.json";
const REFERENCE_CATALOG_FILE: &str = "reference-catalog.providence.json";
const MONSTER_LIBRARY_CATALOG_FILE: &str = "monster-library.providence.json";
const MONSTER_LIBRARY_SESSION_FILE: &str = "monster-library-session.json.zlib";
const LEGACY_LOCAL_SESSION_FORMAT_VERSION: u32 = 1;
const LOCAL_SESSION_FORMAT_VERSION: u32 = 2;
const MAX_LOCAL_SESSION_SNAPSHOT_BYTES: u64 = 512 * 1024 * 1024;
const COMMAND_JOURNAL_ENTRY_LIMIT: usize = 256;
const PROJECT_BLOB_PRUNE_INTERVAL: u64 = SESSION_HISTORY_ENTRY_LIMIT as u64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckpointOutcome {
    pub snapshot_sha256: String,
    pub session_state_blob: Option<BlobId>,
    pub infrastructure_warning: Option<String>,
    pub history_snapshot_reused: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSessionHistoryEntry {
    snapshot: BlobId,
    changed_entities: Vec<providence_core::model::StableId>,
    #[serde(default)]
    references_unchanged: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSessionManifest {
    format_version: u32,
    snapshot_sha256: String,
    revision: Revision,
    undo: Vec<StoredSessionHistoryEntry>,
    redo: Vec<StoredSessionHistoryEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableSnapshotManifest {
    kind: String,
    format_version: u32,
    snapshot_format_version: u32,
    segments: std::collections::BTreeMap<String, BlobId>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexSummary {
    pub entities: u64,
    pub references: u64,
    pub journal_entries: u64,
    pub snapshot_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub identity: String,
    pub kind: String,
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct ProjectStore {
    root: PathBuf,
}

impl ProjectStore {
    pub fn create_new(
        root: impl Into<PathBuf>,
        snapshot: &ProjectSnapshot,
    ) -> Result<Self, StoreError> {
        let root = root.into();
        if root.try_exists()? && (!root.is_dir() || fs::read_dir(&root)?.next().is_some()) {
            return Err(StoreError::ProjectDirectoryNotEmpty(root));
        }
        Self::create(root, snapshot)
    }

    pub fn create(
        root: impl Into<PathBuf>,
        snapshot: &ProjectSnapshot,
    ) -> Result<Self, StoreError> {
        let store = Self { root: root.into() };
        fs::create_dir_all(&store.root)?;
        store.save_snapshot(snapshot)?;
        store.rebuild_index(snapshot)?;
        Ok(store)
    }

    pub fn open(root: impl Into<PathBuf>) -> Result<(Self, ProjectSnapshot), StoreError> {
        let store = Self { root: root.into() };
        let snapshot = store.load_snapshot()?;
        store.index_matches_snapshot()?;
        Ok((store, snapshot))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn snapshot_path(&self) -> PathBuf {
        self.root.join(SNAPSHOT_FILE)
    }

    pub fn local_database_path(&self) -> PathBuf {
        self.root.join(LOCAL_DIRECTORY).join(LOCAL_DATABASE)
    }
}

#[cfg(test)]
mod tests;
