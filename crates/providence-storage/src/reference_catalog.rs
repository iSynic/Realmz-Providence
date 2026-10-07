use crate::BLOB_ALGORITHM;
use crate::REFERENCE_CATALOG_FILE;
use crate::atomic_file::atomic_write;
use crate::blob_store::content_addressed_blob_path;
use crate::blob_store::put_content_addressed_blob;
use crate::blob_store::read_content_addressed_blob;
use crate::blob_store::sha256;
use crate::errors::StoreError;
use providence_core::model::BlobId;
use providence_core::reference_library::REFERENCE_CATALOG_FORMAT_VERSION;
use providence_core::reference_library::ReferenceCatalog;
use providence_core::reference_library::ReferenceSourceKind;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ReferenceCatalogStore {
    root: PathBuf,
}

impl ReferenceCatalogStore {
    pub fn read_blob_bounded(
        &self,
        id: &BlobId,
        maximum_bytes: u64,
    ) -> Result<Vec<u8>, StoreError> {
        let file = fs::File::open(content_addressed_blob_path(&self.root, id)?)?;
        let too_large = || {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("reference catalog blob exceeds {maximum_bytes} bytes"),
            )
        };
        if file.metadata()?.len() > maximum_bytes {
            return Err(too_large().into());
        }
        let mut bytes = Vec::new();
        file.take(maximum_bytes.saturating_add(1))
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > maximum_bytes {
            return Err(too_large().into());
        }
        if format!("{BLOB_ALGORITHM}:{}", sha256(&bytes)) != id.0 {
            return Err(StoreError::BlobDigestMismatch(id.clone()));
        }
        Ok(bytes)
    }

    pub fn create(root: impl Into<PathBuf>) -> Result<Self, StoreError> {
        let root = root.into();
        if root.try_exists()? && (!root.is_dir() || fs::read_dir(&root)?.next().is_some()) {
            return Err(StoreError::ReferenceCatalogDirectoryNotEmpty(root));
        }
        let store = Self { root };
        fs::create_dir_all(&store.root)?;
        Ok(store)
    }

    pub fn open(root: impl Into<PathBuf>) -> Result<(Self, ReferenceCatalog), StoreError> {
        let store = Self { root: root.into() };
        let catalog = store.load_catalog()?;
        Ok((store, catalog))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn catalog_path(&self) -> PathBuf {
        self.root.join(REFERENCE_CATALOG_FILE)
    }

    pub fn put_blob(&self, bytes: &[u8]) -> Result<BlobId, StoreError> {
        put_content_addressed_blob(&self.root, bytes)
    }

    pub fn read_blob(&self, id: &BlobId) -> Result<Vec<u8>, StoreError> {
        read_content_addressed_blob(&self.root, id)
    }

    pub fn save_catalog(&self, catalog: &ReferenceCatalog) -> Result<String, StoreError> {
        self.validate_catalog(catalog)?;
        let mut bytes = serde_json::to_vec_pretty(catalog)?;
        bytes.push(b'\n');
        let digest = sha256(&bytes);
        atomic_write(&self.catalog_path(), &bytes)?;
        Ok(digest)
    }

    pub fn load_catalog(&self) -> Result<ReferenceCatalog, StoreError> {
        let path = self.catalog_path();
        if !path.is_file() {
            return Err(StoreError::MissingReferenceCatalog(path));
        }
        let catalog = serde_json::from_slice::<ReferenceCatalog>(&fs::read(path)?)?;
        self.validate_catalog(&catalog)?;
        Ok(catalog)
    }

    pub fn validate_catalog(&self, catalog: &ReferenceCatalog) -> Result<(), StoreError> {
        if catalog.format_version != REFERENCE_CATALOG_FORMAT_VERSION {
            return Err(StoreError::InvalidReferenceCatalog(format!(
                "format version {} is not supported",
                catalog.format_version
            )));
        }
        let source_kinds = self.validate_sources(catalog)?;
        self.validate_assets(catalog, &source_kinds)
    }

    fn validate_sources(
        &self,
        catalog: &ReferenceCatalog,
    ) -> Result<
        std::collections::BTreeMap<providence_core::model::StableId, ReferenceSourceKind>,
        StoreError,
    > {
        let mut source_ids = std::collections::BTreeSet::new();
        let mut source_kinds = std::collections::BTreeMap::new();
        for source in &catalog.sources {
            if !source_ids.insert(source.identity.clone()) {
                return Err(StoreError::InvalidReferenceCatalog(format!(
                    "duplicate source identity '{}'",
                    source.identity.0
                )));
            }
            source_kinds.insert(source.identity.clone(), source.kind);
            let actual = self.read_blob(&source.blob)?.len() as u64;
            if actual != source.byte_length {
                return Err(StoreError::SourceBlobLengthMismatch {
                    native_path: source.native_name.clone(),
                    expected: source.byte_length,
                    actual,
                });
            }
        }
        let required_kinds = [
            ReferenceSourceKind::BagOfHolding,
            ReferenceSourceKind::VaultOfArcana,
        ];
        for kind in required_kinds {
            if !catalog.sources.iter().any(|source| source.kind == kind) {
                return Err(StoreError::InvalidReferenceCatalog(format!(
                    "missing required {kind:?} source"
                )));
            }
        }
        Ok(source_kinds)
    }

    fn validate_assets(
        &self,
        catalog: &ReferenceCatalog,
        source_kinds: &std::collections::BTreeMap<
            providence_core::model::StableId,
            ReferenceSourceKind,
        >,
    ) -> Result<(), StoreError> {
        let mut asset_ids = std::collections::BTreeSet::new();
        let mut resource_keys = std::collections::BTreeSet::new();
        for asset in &catalog.assets {
            let source_kind = source_kinds.get(&asset.source).ok_or_else(|| {
                StoreError::InvalidReferenceCatalog(format!(
                    "asset '{}' names an unknown source",
                    asset.descriptor.identity.0
                ))
            })?;
            if asset.descriptor.kind != source_kind.entry_kind() {
                return Err(StoreError::InvalidReferenceCatalog(format!(
                    "asset '{}' kind '{}' does not match its source",
                    asset.descriptor.identity.0, asset.descriptor.kind
                )));
            }
            if !asset_ids.insert(asset.descriptor.identity.clone()) {
                return Err(StoreError::InvalidReferenceCatalog(format!(
                    "duplicate asset identity '{}'",
                    asset.descriptor.identity.0
                )));
            }
            let resource = asset.descriptor.classic_resource.as_ref().ok_or_else(|| {
                StoreError::InvalidReferenceCatalog(format!(
                    "asset '{}' has no Classic resource identity",
                    asset.descriptor.identity.0
                ))
            })?;
            if resource.resource_type != "cicn"
                || !resource_keys.insert((asset.source.clone(), resource.clone()))
            {
                return Err(StoreError::InvalidReferenceCatalog(format!(
                    "asset '{}' has an invalid or duplicate cicn identity",
                    asset.descriptor.identity.0
                )));
            }
            self.validate_asset_payload(&asset.descriptor)?;
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
        let classic_blob = descriptor.classic_payload_blob.as_ref().ok_or_else(|| {
            StoreError::InvalidReferenceCatalog(format!(
                "asset '{}' has no native payload",
                descriptor.identity.0
            ))
        })?;
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
}
