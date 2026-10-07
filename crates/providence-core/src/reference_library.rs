use serde::{Deserialize, Serialize};

use crate::model::{AssetDescriptor, BlobId, StableId};

pub const REFERENCE_CATALOG_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReferenceSourceKind {
    BagOfHolding,
    VaultOfArcana,
}

impl ReferenceSourceKind {
    pub fn entry_kind(self) -> &'static str {
        match self {
            Self::BagOfHolding => "bag-item",
            Self::VaultOfArcana => "vault-icon",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceCatalogSource {
    pub identity: StableId,
    pub kind: ReferenceSourceKind,
    pub native_name: String,
    pub blob: BlobId,
    pub byte_length: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceCatalogAsset {
    pub source: StableId,
    pub descriptor: AssetDescriptor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceCatalog {
    pub format_version: u32,
    pub library_id: StableId,
    pub sources: Vec<ReferenceCatalogSource>,
    pub assets: Vec<ReferenceCatalogAsset>,
}

impl ReferenceCatalog {
    pub fn empty(library_id: StableId) -> Self {
        Self {
            format_version: REFERENCE_CATALOG_FORMAT_VERSION,
            library_id,
            sources: Vec::new(),
            assets: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_kinds_have_stable_route_entry_kinds() {
        assert_eq!(ReferenceSourceKind::BagOfHolding.entry_kind(), "bag-item");
        assert_eq!(
            ReferenceSourceKind::VaultOfArcana.entry_kind(),
            "vault-icon"
        );
    }
}
