use crate::APPLICATION_MEDIA_CATALOG_FILE;
use crate::atomic_file::atomic_write;
use crate::blob_store::put_content_addressed_blob;
use crate::blob_store::read_content_addressed_blob;
use crate::blob_store::sha256;
use crate::errors::StoreError;
use crate::packed_blobs::PackedBlobs;
use providence_core::model::BlobId;
use providence_core::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION;
use providence_core::rebuilt::ApplicationMediaCatalog;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;

/// Maintainer libraries keep loose blobs; shipped libraries read them from `blobs.zip`.
#[derive(Debug, Clone)]
pub struct ReferenceLibraryStore {
    root: PathBuf,
    packed: Option<Arc<PackedBlobs>>,
}

impl ReferenceLibraryStore {
    pub fn create(root: impl Into<PathBuf>) -> Result<Self, StoreError> {
        let store = Self {
            root: root.into(),
            packed: None,
        };
        if store.root.join(crate::PACKED_BLOBS_FILE).exists() {
            return Err(StoreError::InvalidPackedBlobs(
                "a packed library is read-only".into(),
            ));
        }
        fs::create_dir_all(&store.root)?;
        Ok(store)
    }

    pub fn open(root: impl Into<PathBuf>) -> Result<(Self, ApplicationMediaCatalog), StoreError> {
        let store = Self::at(root.into())?;
        let catalog = store.load_catalog()?;
        Ok((store, catalog))
    }

    fn at(root: PathBuf) -> Result<Self, StoreError> {
        let packed = PackedBlobs::open(&root)?;
        Ok(Self { root, packed })
    }

    pub fn is_packed(&self) -> bool {
        self.packed.is_some()
    }

    /// Native browsing checks catalog ownership immediately. Every payload read
    /// remains hash verified, and complete inspection retains the strict path.
    pub fn open_structural(
        root: impl Into<PathBuf>,
    ) -> Result<(Self, ApplicationMediaCatalog), StoreError> {
        let store = Self::at(root.into())?;
        let catalog =
            serde_json::from_slice::<ApplicationMediaCatalog>(&fs::read(store.catalog_path())?)?;
        store.validate_catalog_structure(&catalog)?;
        Ok((store, catalog))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn catalog_path(&self) -> PathBuf {
        self.root.join(APPLICATION_MEDIA_CATALOG_FILE)
    }

    pub fn put_blob(&self, bytes: &[u8]) -> Result<BlobId, StoreError> {
        if self.packed.is_some() {
            return Err(StoreError::InvalidPackedBlobs(
                "a packed library is read-only".into(),
            ));
        }
        put_content_addressed_blob(&self.root, bytes)
    }

    pub fn read_blob(&self, id: &BlobId) -> Result<Vec<u8>, StoreError> {
        match &self.packed {
            Some(packed) => packed.read(&self.root, id),
            None => read_content_addressed_blob(&self.root, id),
        }
    }

    pub fn save_catalog(&self, catalog: &ApplicationMediaCatalog) -> Result<String, StoreError> {
        self.validate_catalog(catalog)?;
        let mut bytes = serde_json::to_vec_pretty(catalog)?;
        bytes.push(b'\n');
        let digest = sha256(&bytes);
        atomic_write(&self.catalog_path(), &bytes)?;
        Ok(digest)
    }

    pub fn load_catalog(&self) -> Result<ApplicationMediaCatalog, StoreError> {
        let path = self.catalog_path();
        if !path.is_file() {
            return Err(StoreError::MissingApplicationMediaCatalog(path));
        }
        let catalog = serde_json::from_slice::<ApplicationMediaCatalog>(&fs::read(path)?)?;
        self.validate_catalog(&catalog)?;
        Ok(catalog)
    }

    pub fn validate_catalog(&self, catalog: &ApplicationMediaCatalog) -> Result<(), StoreError> {
        self.validate_catalog_structure(catalog)?;
        for source in &catalog.sources {
            let actual = self.read_blob(&source.blob)?.len() as u64;
            if actual != source.byte_length {
                return Err(StoreError::SourceBlobLengthMismatch {
                    native_path: source.native_name.clone(),
                    expected: source.byte_length,
                    actual,
                });
            }
        }
        for asset in &catalog.assets {
            self.validate_asset_payload(&asset.descriptor)?;
        }
        Ok(())
    }

    pub fn validate_catalog_structure(
        &self,
        catalog: &ApplicationMediaCatalog,
    ) -> Result<(), StoreError> {
        if catalog.format_version != APPLICATION_MEDIA_CATALOG_FORMAT_VERSION {
            return Err(StoreError::InvalidApplicationMediaCatalog(format!(
                "format version {} is not supported",
                catalog.format_version
            )));
        }
        self.validate_sources(catalog)?;
        let source_by_id = catalog
            .sources
            .iter()
            .map(|source| (&source.identity, source.priority))
            .collect::<std::collections::BTreeMap<_, _>>();
        self.validate_assets(catalog, &source_by_id)?;
        Self::validate_diagnostics(catalog, &source_by_id)
    }

    fn validate_sources(&self, catalog: &ApplicationMediaCatalog) -> Result<(), StoreError> {
        let mut source_ids = std::collections::BTreeSet::new();
        let mut priorities = std::collections::BTreeSet::new();
        for source in &catalog.sources {
            if !source_ids.insert(source.identity.clone()) {
                return Err(StoreError::InvalidApplicationMediaCatalog(format!(
                    "duplicate source identity '{}'",
                    source.identity.0
                )));
            }
            if !priorities.insert(source.priority) {
                return Err(StoreError::InvalidApplicationMediaCatalog(format!(
                    "duplicate source priority {}",
                    source.priority
                )));
            }
            crate::blob_store::content_addressed_blob_path(&self.root, &source.blob)?;
        }
        Ok(())
    }

    fn validate_assets(
        &self,
        catalog: &ApplicationMediaCatalog,
        source_by_id: &std::collections::BTreeMap<&providence_core::model::StableId, u32>,
    ) -> Result<(), StoreError> {
        let mut asset_ids = std::collections::BTreeSet::new();
        for asset in &catalog.assets {
            if source_by_id.get(&asset.source).copied() != Some(asset.source_priority) {
                return Err(StoreError::InvalidApplicationMediaCatalog(format!(
                    "asset '{}' names an unknown or mismatched source",
                    asset.descriptor.identity.0
                )));
            }
            if !asset_ids.insert(asset.descriptor.identity.clone()) {
                return Err(StoreError::InvalidApplicationMediaCatalog(format!(
                    "duplicate asset identity '{}'",
                    asset.descriptor.identity.0
                )));
            }
            if asset.descriptor.classic_resource.is_none() {
                return Err(StoreError::InvalidApplicationMediaCatalog(format!(
                    "asset '{}' has no exact Classic resource identity",
                    asset.descriptor.identity.0
                )));
            }
            crate::blob_store::content_addressed_blob_path(&self.root, &asset.descriptor.blob)?;
            let native = asset
                .descriptor
                .classic_payload_blob
                .as_ref()
                .ok_or_else(|| {
                    StoreError::InvalidApplicationMediaCatalog(format!(
                        "asset '{}' has no native payload identity",
                        asset.descriptor.identity.0
                    ))
                })?;
            crate::blob_store::content_addressed_blob_path(&self.root, native)?;
        }
        Ok(())
    }

    fn validate_asset_payload(
        &self,
        descriptor: &providence_core::model::AssetDescriptor,
    ) -> Result<(), StoreError> {
        let actual = self.read_blob(&descriptor.blob)?.len() as u64;
        if actual != descriptor.byte_length {
            return Err(StoreError::AssetBlobLengthMismatch {
                asset: descriptor.identity.0.clone(),
                expected: descriptor.byte_length,
                actual,
            });
        }
        let Some(classic_blob) = &descriptor.classic_payload_blob else {
            return Err(StoreError::InvalidApplicationMediaCatalog(format!(
                "asset '{}' has no native payload identity",
                descriptor.identity.0
            )));
        };
        let actual = self.read_blob(classic_blob)?.len() as u64;
        let expected = descriptor.classic_payload_byte_length.unwrap_or(actual);
        if actual != expected {
            return Err(StoreError::AssetClassicPayloadLengthMismatch {
                asset: descriptor.identity.0.clone(),
                expected,
                actual,
            });
        }
        Ok(())
    }

    fn validate_diagnostics(
        catalog: &ApplicationMediaCatalog,
        source_by_id: &std::collections::BTreeMap<&providence_core::model::StableId, u32>,
    ) -> Result<(), StoreError> {
        for ambiguity in &catalog.ambiguous_resources {
            if source_by_id.get(&ambiguity.source).copied() != Some(ambiguity.source_priority)
                || ambiguity.occurrences < 2
            {
                return Err(StoreError::InvalidApplicationMediaCatalog(
                    "ambiguous resource has invalid source ownership or occurrence count".into(),
                ));
            }
        }
        for failure in &catalog.failures {
            if source_by_id.get(&failure.source).copied() != Some(failure.source_priority) {
                return Err(StoreError::InvalidApplicationMediaCatalog(
                    "decode failure names an unknown source".into(),
                ));
            }
        }
        Ok(())
    }
}
