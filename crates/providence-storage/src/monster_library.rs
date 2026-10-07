use crate::LOCAL_DIRECTORY;
use crate::LOCAL_SESSION_DIRECTORY;
use crate::MONSTER_LIBRARY_CATALOG_FILE;
use crate::MONSTER_LIBRARY_SESSION_FILE;
use crate::atomic_file::atomic_write;
use crate::blob_store::put_content_addressed_blob;
use crate::blob_store::read_content_addressed_blob;
use crate::blob_store::sha256;
use crate::errors::StoreError;
use crate::session_history::compress_local_session_snapshot;
use crate::session_history::decompress_local_session_snapshot;
use providence_core::model::BlobId;
use providence_core::monster_library::MONSTER_LIBRARY_FORMAT_VERSION;
use providence_core::monster_library::MonsterLibraryCatalog;
use providence_core::monster_library::MonsterLibrarySession;
use providence_core::monster_library::PersistedMonsterLibrarySession;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct MonsterLibraryStore {
    root: PathBuf,
}

impl MonsterLibraryStore {
    pub fn create(
        root: impl Into<PathBuf>,
        library_id: providence_core::model::StableId,
    ) -> Result<(Self, MonsterLibrarySession), StoreError> {
        let root = root.into();
        if root.try_exists()? && (!root.is_dir() || fs::read_dir(&root)?.next().is_some()) {
            return Err(StoreError::MonsterLibraryDirectoryNotEmpty(root));
        }
        let store = Self { root };
        fs::create_dir_all(&store.root)?;
        let session = MonsterLibrarySession::new(MonsterLibraryCatalog::new(library_id))
            .map_err(|error| StoreError::InvalidMonsterLibrary(error.to_string()))?;
        store.checkpoint_session(&session)?;
        Ok((store, session))
    }

    pub fn open_session(
        root: impl Into<PathBuf>,
    ) -> Result<(Self, MonsterLibrarySession), StoreError> {
        let store = Self { root: root.into() };
        let catalog = store.load_catalog()?;
        let local_path = store.local_session_path();
        if local_path.is_file() {
            let bytes = decompress_local_session_snapshot(&fs::read(&local_path)?)?;
            let state = serde_json::from_slice::<PersistedMonsterLibrarySession>(&bytes)?;
            if state.catalog == catalog {
                let session = MonsterLibrarySession::from_persisted_state(state)
                    .map_err(|error| StoreError::InvalidMonsterLibrary(error.to_string()))?;
                return Ok((store, session));
            }
        }
        let session = MonsterLibrarySession::new(catalog)
            .map_err(|error| StoreError::InvalidMonsterLibrary(error.to_string()))?;
        Ok((store, session))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn catalog_path(&self) -> PathBuf {
        self.root.join(MONSTER_LIBRARY_CATALOG_FILE)
    }

    pub fn put_blob(&self, bytes: &[u8]) -> Result<BlobId, StoreError> {
        put_content_addressed_blob(&self.root, bytes)
    }

    pub fn read_blob(&self, id: &BlobId) -> Result<Vec<u8>, StoreError> {
        read_content_addressed_blob(&self.root, id)
    }

    pub fn load_catalog(&self) -> Result<MonsterLibraryCatalog, StoreError> {
        let path = self.catalog_path();
        if !path.is_file() {
            return Err(StoreError::MissingMonsterLibraryCatalog(path));
        }
        let catalog = serde_json::from_slice::<MonsterLibraryCatalog>(&fs::read(path)?)?;
        self.validate_catalog(&catalog)?;
        Ok(catalog)
    }

    pub fn save_catalog(&self, catalog: &MonsterLibraryCatalog) -> Result<String, StoreError> {
        self.validate_catalog(catalog)?;
        let mut bytes = serde_json::to_vec_pretty(catalog)?;
        bytes.push(b'\n');
        let digest = sha256(&bytes);
        atomic_write(&self.catalog_path(), &bytes)?;
        Ok(digest)
    }

    pub fn checkpoint_session(
        &self,
        session: &MonsterLibrarySession,
    ) -> Result<String, StoreError> {
        fs::create_dir_all(&self.root)?;
        let digest = self.save_catalog(session.catalog())?;
        let local_path = self.local_session_path();
        if let Some(parent) = local_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let bytes =
            compress_local_session_snapshot(&serde_json::to_vec(&session.persisted_state())?)?;
        atomic_write(&local_path, &bytes)?;
        Ok(digest)
    }

    pub fn validate_catalog(&self, catalog: &MonsterLibraryCatalog) -> Result<(), StoreError> {
        if catalog.format_version != MONSTER_LIBRARY_FORMAT_VERSION {
            return Err(StoreError::InvalidMonsterLibrary(format!(
                "format version {} is not supported",
                catalog.format_version
            )));
        }
        catalog
            .validate()
            .map_err(|error| StoreError::InvalidMonsterLibrary(error.to_string()))?;
        for source in &catalog.sources {
            let bytes = self.read_blob(&source.blob)?;
            if bytes.len() as u64 != source.byte_length {
                return Err(StoreError::SourceBlobLengthMismatch {
                    native_path: source.native_name.clone(),
                    expected: source.byte_length,
                    actual: bytes.len() as u64,
                });
            }
            if sha256(&bytes) != source.sha256 {
                return Err(StoreError::InvalidMonsterLibrary(format!(
                    "source '{}' does not match its declared SHA-256",
                    source.native_name
                )));
            }
        }
        Ok(())
    }

    fn local_session_path(&self) -> PathBuf {
        self.root
            .join(LOCAL_DIRECTORY)
            .join(LOCAL_SESSION_DIRECTORY)
            .join(MONSTER_LIBRARY_SESSION_FILE)
    }
}
