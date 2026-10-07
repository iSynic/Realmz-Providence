use std::{fs, io::Read, path::PathBuf};

use providence_core::{
    model::BlobId,
    personal_library::{
        LibraryChange, LibraryCommand, LibraryDelta, LibraryError, PersonalAsset, PersonalLibrary,
    },
};
use rusqlite::{Connection, TransactionBehavior};

use crate::StoreError;
use crate::atomic_file::atomic_write;
use crate::blob_store::{content_addressed_blob_path, put_content_addressed_blob, sha256};

const MANIFEST: &str = "personal-library.providence.json";
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;
const MAX_ORIGINAL_BYTES: u64 = 64 * 1024 * 1024;

/// Portable personal content; SQLite coordinates writers but stores no authored facts.
#[derive(Debug)]
pub struct PersonalLibraryStore {
    root: PathBuf,
}

#[derive(Debug)]
pub enum PersonalLibraryWriteError {
    Store(StoreError),
    Command(LibraryError),
}

impl From<StoreError> for PersonalLibraryWriteError {
    fn from(value: StoreError) -> Self {
        Self::Store(value)
    }
}

impl std::fmt::Display for PersonalLibraryWriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Store(error) => write!(f, "{error}"),
            Self::Command(error) => write!(f, "Personal library command rejected: {error:?}"),
        }
    }
}

impl std::error::Error for PersonalLibraryWriteError {}

impl PersonalLibraryStore {
    pub fn root(&self) -> &std::path::Path {
        &self.root
    }

    pub fn create(root: impl Into<PathBuf>) -> Result<Self, StoreError> {
        let root = root.into();
        if root.try_exists()? && (!root.is_dir() || fs::read_dir(&root)?.next().is_some()) {
            return Err(invalid("Personal library directory must be empty"));
        }
        fs::create_dir_all(&root)?;
        let store = Self { root };
        let mut coordinator = store.writer_connection()?;
        let _guard = coordinator.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if store.root.join(MANIFEST).try_exists()? {
            return Err(invalid("Personal library already exists"));
        }
        store.persist(&PersonalLibrary::default())?;
        Ok(store)
    }

    pub fn open(root: impl Into<PathBuf>) -> Result<(Self, PersonalLibrary), StoreError> {
        let store = Self { root: root.into() };
        let library = store.load_manifest()?;
        Ok((store, library))
    }

    pub fn put_original(&self, bytes: &[u8]) -> Result<BlobId, StoreError> {
        if bytes.len() as u64 > MAX_ORIGINAL_BYTES {
            return Err(invalid(
                "Personal content must contain at most 67108864 bytes",
            ));
        }
        put_content_addressed_blob(&self.root, bytes)
    }

    pub fn read_original(&self, id: &BlobId) -> Result<Vec<u8>, StoreError> {
        let bytes = bounded_read(
            content_addressed_blob_path(&self.root, id)?,
            MAX_ORIGINAL_BYTES,
        )?;
        if format!("sha256:{}", sha256(&bytes)) != id.0 {
            return Err(StoreError::BlobDigestMismatch(id.clone()));
        }
        Ok(bytes)
    }

    pub fn load(&self) -> Result<PersonalLibrary, StoreError> {
        let library = self.load_manifest()?;
        self.validate(&library)?;
        Ok(library)
    }

    pub fn load_manifest(&self) -> Result<PersonalLibrary, StoreError> {
        let bytes = bounded_read(self.root.join(MANIFEST), MAX_MANIFEST_BYTES)?;
        let library: PersonalLibrary = serde_json::from_slice(&bytes)?;
        library
            .validate()
            .map_err(|error| invalid(&format!("Invalid personal library: {error:?}")))?;
        Ok(library)
    }

    pub fn apply(
        &self,
        expected: u64,
        command: LibraryCommand,
    ) -> Result<LibraryDelta, PersonalLibraryWriteError> {
        let mut coordinator = self.writer_connection()?;
        let _guard = coordinator
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(StoreError::from)?;
        let mut library = self.load_manifest()?;
        let validate_content = matches!(
            command,
            LibraryCommand::Import(_) | LibraryCommand::Undo | LibraryCommand::Redo
        );
        let delta = library
            .apply(expected, command)
            .map_err(PersonalLibraryWriteError::Command)?;
        if validate_content && let LibraryChange::Upsert { asset } = &delta.change {
            self.validate_original(asset)?;
        }
        self.persist(&library)?;
        Ok(delta)
    }

    fn writer_connection(&self) -> Result<Connection, StoreError> {
        let local = self.root.join(".providence");
        fs::create_dir_all(&local)?;
        let connection = Connection::open(local.join("writer.sqlite3"))?;
        connection.busy_timeout(std::time::Duration::ZERO)?;
        Ok(connection)
    }

    fn persist(&self, library: &PersonalLibrary) -> Result<String, StoreError> {
        let mut bytes = serde_json::to_vec_pretty(library)?;
        bytes.push(b'\n');
        if bytes.len() as u64 > MAX_MANIFEST_BYTES {
            return Err(invalid("Personal library manifest exceeds 16 MiB"));
        }
        atomic_write(&self.root.join(MANIFEST), &bytes)?;
        Ok(sha256(&bytes))
    }

    fn validate(&self, library: &PersonalLibrary) -> Result<(), StoreError> {
        library
            .validate()
            .map_err(|error| invalid(&format!("Invalid personal library: {error:?}")))?;
        for asset in library.assets() {
            self.validate_original(asset)?;
        }
        Ok(())
    }

    fn validate_original(&self, asset: &PersonalAsset) -> Result<(), StoreError> {
        self.validate_blob(asset, &asset.original, asset.byte_length)?;
        if let Some(media) = &asset.media {
            for resource in media.resources() {
                self.validate_blob(asset, &resource.blob, resource.byte_length)?;
                if let (Some(blob), Some(length)) = (
                    &resource.classic_payload_blob,
                    resource.classic_payload_byte_length,
                ) {
                    self.validate_blob(asset, blob, length)?;
                }
            }
        }
        Ok(())
    }

    fn validate_blob(
        &self,
        asset: &PersonalAsset,
        blob: &BlobId,
        expected: u64,
    ) -> Result<(), StoreError> {
        let actual = self.read_original(blob)?.len() as u64;
        if actual != expected {
            return Err(StoreError::AssetBlobLengthMismatch {
                asset: asset.identity.0.clone(),
                expected,
                actual,
            });
        }
        Ok(())
    }
}

fn bounded_read(path: PathBuf, maximum: u64) -> Result<Vec<u8>, StoreError> {
    let file = fs::File::open(path)?;
    if file.metadata()?.len() > maximum {
        return Err(invalid("Personal library file is too large"));
    }
    let mut bytes = Vec::new();
    file.take(maximum + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > maximum {
        return Err(invalid("Personal library file is too large"));
    }
    Ok(bytes)
}

fn invalid(message: &str) -> StoreError {
    std::io::Error::new(std::io::ErrorKind::InvalidData, message).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::{
        model::StableId,
        personal_library::{LibraryCommand, PersonalAsset},
    };

    fn import(store: &PersonalLibraryStore, library: &mut PersonalLibrary) -> PersonalAsset {
        let bytes = b"original artwork bytes";
        let asset = PersonalAsset {
            identity: StableId("personal:one".into()),
            name: "Woodland token".into(),
            collection: None,
            original: store.put_original(bytes).unwrap(),
            byte_length: bytes.len() as u64,
            mime_type: "application/octet-stream".into(),
            media: None,
            import_kind: None,
        };
        store
            .apply(0, LibraryCommand::Import((asset.clone()).into()))
            .unwrap();
        *library = store.load().unwrap();
        asset
    }

    #[test]
    fn personal_library_reopens_without_project_or_database() {
        let temp = tempfile::Builder::new()
            .prefix("providence-personal-library-")
            .tempdir()
            .unwrap();
        let root = temp.path().join("library");
        let store = PersonalLibraryStore::create(&root).unwrap();
        let mut library = store.load().unwrap();
        let asset = import(&store, &mut library);
        let digest = sha256(&fs::read(root.join(MANIFEST)).unwrap());
        let (reopened, loaded) = PersonalLibraryStore::open(&root).unwrap();
        assert_eq!(loaded, library);
        assert_eq!(reopened.persist(&loaded).unwrap(), digest);
        assert_eq!(
            reopened.read_original(&asset.original).unwrap(),
            b"original artwork bytes"
        );
        fs::remove_dir_all(root.join(".providence")).unwrap();
        assert_eq!(PersonalLibraryStore::open(&root).unwrap().1, library);
        reopened
            .apply(
                1,
                LibraryCommand::Rename {
                    identity: asset.identity,
                    name: "Renamed after rebuild".into(),
                },
            )
            .unwrap();
        assert_eq!(reopened.load().unwrap().revision(), 2);
    }

    #[test]
    fn invalid_save_preserves_last_durable_manifest() {
        let temp = tempfile::Builder::new()
            .prefix("providence-personal-library-")
            .tempdir()
            .unwrap();
        let store = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
        let mut library = store.load().unwrap();
        let mut asset = import(&store, &mut library);
        let original = fs::read(store.root.join(MANIFEST)).unwrap();
        asset.identity = StableId("personal:missing".into());
        asset.original = BlobId(format!("sha256:{}", "b".repeat(64)));
        assert!(
            store
                .apply(1, LibraryCommand::Import((asset).into()))
                .is_err()
        );
        assert_eq!(fs::read(store.root.join(MANIFEST)).unwrap(), original);
    }

    #[test]
    fn corruption_is_detected_and_removal_does_not_delete_original_bytes() {
        let temp = tempfile::Builder::new()
            .prefix("providence-personal-library-")
            .tempdir()
            .unwrap();
        let store = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
        let mut library = store.load().unwrap();
        let asset = import(&store, &mut library);
        store
            .apply(
                1,
                LibraryCommand::Remove {
                    identity: asset.identity,
                },
            )
            .unwrap();
        assert!(store.read_original(&asset.original).is_ok());
        fs::write(
            content_addressed_blob_path(&store.root, &asset.original).unwrap(),
            b"corrupt",
        )
        .unwrap();
        assert!(matches!(
            store.read_original(&asset.original),
            Err(StoreError::BlobDigestMismatch(_))
        ));
    }

    #[test]
    fn competing_handles_reject_stale_and_busy_writes_without_lost_updates() {
        let temp = tempfile::Builder::new()
            .prefix("providence-personal-library-")
            .tempdir()
            .unwrap();
        let root = temp.path().join("library");
        let first = PersonalLibraryStore::create(&root).unwrap();
        let (second, _) = PersonalLibraryStore::open(&root).unwrap();
        let mut library = first.load().unwrap();
        let asset = import(&first, &mut library);
        let rename = || LibraryCommand::Rename {
            identity: asset.identity.clone(),
            name: "Renamed".into(),
        };
        assert!(matches!(
            second.apply(0, rename()),
            Err(PersonalLibraryWriteError::Command(
                LibraryError::StaleRevision { actual: 1, .. }
            ))
        ));
        let mut coordinator = first.writer_connection().unwrap();
        let lock = coordinator
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
        assert!(matches!(
            second.apply(1, rename()),
            Err(PersonalLibraryWriteError::Store(StoreError::Sqlite(_)))
        ));
        assert_eq!(
            second.load().unwrap().asset(&asset.identity).unwrap().name,
            "Woodland token"
        );
        drop(lock);
        second.apply(1, rename()).unwrap();
        assert_eq!(
            first.load().unwrap().asset(&asset.identity).unwrap().name,
            "Renamed"
        );
        assert!(matches!(
            first.apply(1, rename()),
            Err(PersonalLibraryWriteError::Command(
                LibraryError::StaleRevision { actual: 2, .. }
            ))
        ));
    }

    #[test]
    fn metadata_edit_does_not_read_originals_but_explicit_validation_detects_damage() {
        let temp = tempfile::Builder::new()
            .prefix("providence-personal-library-")
            .tempdir()
            .unwrap();
        let store = PersonalLibraryStore::create(temp.path().join("library")).unwrap();
        let mut library = store.load().unwrap();
        let asset = import(&store, &mut library);
        fs::write(
            content_addressed_blob_path(&store.root, &asset.original).unwrap(),
            b"damaged",
        )
        .unwrap();
        store
            .apply(
                1,
                LibraryCommand::Rename {
                    identity: asset.identity.clone(),
                    name: "Still editable".into(),
                },
            )
            .unwrap();
        assert_eq!(
            store
                .load_manifest()
                .unwrap()
                .asset(&asset.identity)
                .unwrap()
                .name,
            "Still editable"
        );
        assert!(matches!(
            store.load(),
            Err(StoreError::BlobDigestMismatch(_))
        ));
        let (reopened, manifest) = PersonalLibraryStore::open(&store.root).unwrap();
        assert_eq!(
            manifest.asset(&asset.identity).unwrap().name,
            "Still editable"
        );
        assert!(reopened.read_original(&asset.original).is_err());
    }
}
