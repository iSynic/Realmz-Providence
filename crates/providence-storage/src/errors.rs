use providence_core::model::BlobId;
use providence_core::snapshot::SnapshotError;
use std::path::PathBuf;

#[cfg(test)]
mod tests;

#[derive(Debug)]
pub enum StoreError {
    Io(std::io::Error),
    Snapshot(SnapshotError),
    Sqlite(rusqlite::Error),
    Json(serde_json::Error),
    MissingSnapshot(PathBuf),
    MissingApplicationMediaCatalog(PathBuf),
    MissingReferenceCatalog(PathBuf),
    MissingMonsterLibraryCatalog(PathBuf),
    ReferenceCatalogDirectoryNotEmpty(PathBuf),
    MonsterLibraryDirectoryNotEmpty(PathBuf),
    ProjectDirectoryNotEmpty(PathBuf),
    ProjectDestinationExists(PathBuf),
    ProjectDestinationInsideSource(PathBuf),
    InvalidProjectDestination(PathBuf),
    InvalidBlobId(String),
    BlobDigestMismatch(BlobId),
    AssetBlobLengthMismatch {
        asset: String,
        expected: u64,
        actual: u64,
    },
    AssetClassicPayloadLengthMismatch {
        asset: String,
        expected: u64,
        actual: u64,
    },
    SourceBlobLengthMismatch {
        native_path: String,
        expected: u64,
        actual: u64,
    },
    RevisionOutOfRange(u64),
    InvalidStoredRevision(i64),
    InvalidApplicationMediaCatalog(String),
    InvalidReferenceCatalog(String),
    InvalidMonsterLibrary(String),
    InvalidPortableSnapshot(String),
    InvalidLocalSession(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => error.fmt(formatter),
            Self::Snapshot(error) => error.fmt(formatter),
            Self::Sqlite(error) => error.fmt(formatter),
            Self::Json(error) => error.fmt(formatter),
            Self::MissingSnapshot(_)
            | Self::MissingApplicationMediaCatalog(_)
            | Self::MissingReferenceCatalog(_)
            | Self::MissingMonsterLibraryCatalog(_)
            | Self::MonsterLibraryDirectoryNotEmpty(_)
            | Self::ReferenceCatalogDirectoryNotEmpty(_)
            | Self::ProjectDirectoryNotEmpty(_)
            | Self::ProjectDestinationExists(_)
            | Self::ProjectDestinationInsideSource(_)
            | Self::InvalidProjectDestination(_) => self.fmt_path(formatter),
            Self::InvalidBlobId(_)
            | Self::BlobDigestMismatch(_)
            | Self::AssetBlobLengthMismatch { .. }
            | Self::AssetClassicPayloadLengthMismatch { .. }
            | Self::SourceBlobLengthMismatch { .. } => self.fmt_blob(formatter),
            Self::RevisionOutOfRange(revision) => {
                write!(
                    formatter,
                    "revision {revision} exceeds SQLite's signed integer range"
                )
            }
            Self::InvalidStoredRevision(revision) => {
                write!(formatter, "stored command revision {revision} is negative")
            }
            Self::InvalidApplicationMediaCatalog(reason) => {
                write!(
                    formatter,
                    "invalid Classic application media catalog: {reason}"
                )
            }
            Self::InvalidReferenceCatalog(reason) => {
                write!(formatter, "invalid reference catalog: {reason}")
            }
            Self::InvalidMonsterLibrary(reason) => {
                write!(formatter, "invalid portable Monster Library: {reason}")
            }
            Self::InvalidPortableSnapshot(reason) => {
                write!(formatter, "invalid portable snapshot: {reason}")
            }
            Self::InvalidLocalSession(reason) => {
                write!(formatter, "invalid local session checkpoint: {reason}")
            }
        }
    }
}

impl StoreError {
    fn fmt_path(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingSnapshot(path) => {
                write!(
                    formatter,
                    "portable snapshot is missing at {}",
                    path.display()
                )
            }
            Self::MissingApplicationMediaCatalog(path) => write!(
                formatter,
                "Classic application media catalog is missing at {}",
                path.display()
            ),
            Self::MissingReferenceCatalog(path) => write!(
                formatter,
                "reference catalog is missing at {}",
                path.display()
            ),
            Self::MissingMonsterLibraryCatalog(path) => write!(
                formatter,
                "portable Monster Library catalog is missing at {}",
                path.display()
            ),
            Self::MonsterLibraryDirectoryNotEmpty(path) => write!(
                formatter,
                "refusing to create a Monster Library in non-empty directory {}",
                path.display()
            ),
            Self::ReferenceCatalogDirectoryNotEmpty(path) => write!(
                formatter,
                "refusing to create a reference catalog in non-empty directory {}",
                path.display()
            ),
            Self::ProjectDirectoryNotEmpty(path) => write!(
                formatter,
                "refusing to create a Providence project in non-empty directory {}",
                path.display()
            ),
            Self::ProjectDestinationExists(path) => write!(
                formatter,
                "refusing to replace existing Save As destination {}",
                path.display()
            ),
            Self::ProjectDestinationInsideSource(path) => write!(
                formatter,
                "Save As destination must be outside the open project: {}",
                path.display()
            ),
            Self::InvalidProjectDestination(path) => write!(
                formatter,
                "Save As destination must name a project directory whose parent already exists: {}",
                path.display()
            ),
            _ => unreachable!("only path errors are dispatched here"),
        }
    }

    fn fmt_blob(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidBlobId(id) => write!(formatter, "invalid content-addressed blob id {id}"),
            Self::BlobDigestMismatch(id) => {
                write!(formatter, "stored blob {} does not match its digest", id.0)
            }
            Self::AssetBlobLengthMismatch {
                asset,
                expected,
                actual,
            } => write!(
                formatter,
                "asset '{asset}' declares {expected} bytes but its blob contains {actual}"
            ),
            Self::AssetClassicPayloadLengthMismatch {
                asset,
                expected,
                actual,
            } => write!(
                formatter,
                "asset '{asset}' declares {expected} Classic payload bytes but its blob contains {actual}"
            ),
            Self::SourceBlobLengthMismatch {
                native_path,
                expected,
                actual,
            } => write!(
                formatter,
                "Classic source '{native_path}' declares {expected} bytes but its blob contains {actual}"
            ),
            _ => unreachable!("only blob errors are dispatched here"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<std::io::Error> for StoreError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<SnapshotError> for StoreError {
    fn from(error: SnapshotError) -> Self {
        Self::Snapshot(error)
    }
}

impl From<rusqlite::Error> for StoreError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

impl From<serde_json::Error> for StoreError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}
