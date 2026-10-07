use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    codecs::ClassicMediaCatalogError,
    model::{AssetDescriptor, BlobId, ClassicResourceKey, StableId},
};

mod derivation;

pub use derivation::derive_application_media_library;

pub const APPLICATION_MEDIA_CATALOG_FORMAT_VERSION: u32 = 1;

pub const REALMZ_CLASSIC_APPLICATION_LIBRARY_ID: &str = "realmz-classic-application-library";

#[derive(Debug, Clone, Copy)]
pub struct ApplicationMediaSourceInput<'a> {
    pub identity: &'a str,
    pub native_name: &'a str,
    pub priority: u32,
    pub bytes: &'a [u8],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DerivedApplicationMediaLibrary {
    pub catalog: ApplicationMediaCatalog,
    pub runtime_payloads: BTreeMap<BlobId, Vec<u8>>,
}

#[derive(Debug)]
pub enum ApplicationMediaDerivationError {
    Decode {
        source: String,
        error: ClassicMediaCatalogError,
    },
    ConflictingPayload(BlobId),
}

impl std::fmt::Display for ApplicationMediaDerivationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Decode { source, error } => {
                write!(
                    formatter,
                    "could not decode application media source '{source}': {error}"
                )
            }
            Self::ConflictingPayload(blob) => write!(
                formatter,
                "application media blob '{}' has conflicting payloads",
                blob.0
            ),
        }
    }
}

impl std::error::Error for ApplicationMediaDerivationError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationMediaSource {
    pub identity: StableId,
    pub native_name: String,
    pub priority: u32,
    pub blob: BlobId,
    pub byte_length: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationMediaAsset {
    pub source: StableId,
    pub source_priority: u32,
    pub descriptor: AssetDescriptor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationMediaAmbiguity {
    pub source: StableId,
    pub source_priority: u32,
    pub resource: ClassicResourceKey,
    pub occurrences: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationMediaFailure {
    pub source: StableId,
    pub source_priority: u32,
    pub resource: ClassicResourceKey,
    pub label: String,
    pub classic_payload_bytes: usize,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationMediaCatalog {
    pub format_version: u32,
    pub library_id: StableId,
    pub sources: Vec<ApplicationMediaSource>,
    pub assets: Vec<ApplicationMediaAsset>,
    pub ambiguous_resources: Vec<ApplicationMediaAmbiguity>,
    pub failures: Vec<ApplicationMediaFailure>,
}

pub fn rebuilt_application_media_identity(resource: &ClassicResourceKey, kind: &str) -> StableId {
    match (resource.resource_type.as_str(), resource.resource_id, kind) {
        ("cicn", id @ 257..=376, "portrait") => StableId(format!("realmz-portrait-{id}")),
        ("cicn", id @ 9000..=9119, "combat-icon") => StableId(format!("realmz-combat-icon-{id}")),
        ("cicn", id @ ..=-1, "special-land-tile") => {
            rebuilt_application_special_land_identity(id as i16)
                .expect("negative CICN has a special-land identity")
        }
        ("cicn", id, _) => rebuilt_application_cicn_identity(id),
        ("PICT", 302, "tileset") => StableId("dungeon-top-down-302".into()),
        ("PICT", id @ 300..=310, "tileset") => StableId(format!("classic.landlook.{}", id - 300)),
        ("PICT", id, _) => StableId(format!("realmz-application-pict-{id}")),
        ("snd ", id, _) => StableId(format!("realmz-application-snd-{id}")),
        (resource_type, id, _) => StableId(format!(
            "realmz-application-{}-{id}",
            resource_type.trim().to_ascii_lowercase()
        )),
    }
}

fn blob_id(bytes: &[u8]) -> BlobId {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    BlobId(format!("sha256:{:x}", hasher.finalize()))
}

impl ApplicationMediaCatalog {
    pub fn empty(library_id: StableId) -> Self {
        Self {
            format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
            library_id,
            sources: Vec::new(),
            assets: Vec::new(),
            ambiguous_resources: Vec::new(),
            failures: Vec::new(),
        }
    }

    /// Resolves an exact Classic resource through the application resource chain.
    /// Higher-priority sources shadow lower-priority sources before presentation
    /// roles are checked, matching Castle's resource ownership semantics.
    pub fn resolve_resource(
        &self,
        resource: &ClassicResourceKey,
        expected_kind: Option<&str>,
    ) -> ApplicationMediaResolution<'_> {
        let mut priorities = self
            .sources
            .iter()
            .map(|source| source.priority)
            .collect::<Vec<_>>();
        priorities.sort_unstable();
        priorities.dedup();
        for priority in priorities.into_iter().rev() {
            if self.ambiguous_resources.iter().any(|ambiguity| {
                ambiguity.source_priority == priority && ambiguity.resource == *resource
            }) {
                return ApplicationMediaResolution::Ambiguous;
            }
            let matches = self
                .assets
                .iter()
                .filter(|asset| {
                    asset.source_priority == priority
                        && asset.descriptor.classic_resource.as_ref() == Some(resource)
                })
                .collect::<Vec<_>>();
            match matches.as_slice() {
                [] => {}
                [asset]
                    if expected_kind.is_none_or(|kind| asset.descriptor.kind.as_str() == kind) =>
                {
                    return ApplicationMediaResolution::Resolved(asset);
                }
                [_] => return ApplicationMediaResolution::WrongKind,
                _ => return ApplicationMediaResolution::Ambiguous,
            }
        }
        ApplicationMediaResolution::Missing
    }

    /// Resolves the canonical runtime identity for a stock Classic landlook
    /// without making the decoded application PICT part of scenario truth.
    /// PICT 300 is landlook zero, and the same offset applies through 310.
    /// PICT 302 is the dungeon/battle sheet and is intentionally not accepted
    /// as a landlook atlas.
    pub fn resolve_landlook_tileset(
        &self,
        tileset_id: &StableId,
    ) -> ApplicationMediaResolution<'_> {
        let Some(resource) = crate::map_artwork::resource_key(tileset_id) else {
            return ApplicationMediaResolution::Missing;
        };
        if resource.resource_id == 302 {
            return ApplicationMediaResolution::Missing;
        }
        match self.resolve_resource(&resource, None) {
            ApplicationMediaResolution::Resolved(asset)
                if asset.descriptor.mime_type.as_deref() == Some("image/png")
                    && asset.descriptor.width == Some(640)
                    && asset.descriptor.height == Some(320) =>
            {
                ApplicationMediaResolution::Resolved(asset)
            }
            ApplicationMediaResolution::Resolved(_) => ApplicationMediaResolution::WrongKind,
            resolution => resolution,
        }
    }

    pub fn resolve_map_tileset(&self, tileset_id: &StableId) -> ApplicationMediaResolution<'_> {
        if tileset_id.0 != "dungeon-top-down-302" {
            return self.resolve_landlook_tileset(tileset_id);
        }
        let resource = ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 302,
        };
        match self.resolve_resource(&resource, Some("tileset")) {
            ApplicationMediaResolution::Resolved(asset)
                if asset.descriptor.mime_type.as_deref() == Some("image/png")
                    && asset.descriptor.width == Some(640)
                    && asset.descriptor.height == Some(640)
                    && asset.descriptor.tile_width == Some(32)
                    && asset.descriptor.tile_height == Some(32)
                    && asset.descriptor.columns == Some(20)
                    && asset.descriptor.rows == Some(20) =>
            {
                ApplicationMediaResolution::Resolved(asset)
            }
            ApplicationMediaResolution::Resolved(_) => ApplicationMediaResolution::WrongKind,
            resolution => resolution,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplicationMediaResolution<'a> {
    Resolved(&'a ApplicationMediaAsset),
    Ambiguous,
    WrongKind,
    Missing,
}

/// Returns Rebuilt's product-stable identity for an application-owned CICN.
///
/// Reference-library descriptor identities remain source-qualified so two
/// pinned native containers can be audited independently. Runtime documents
/// must not leak that machine/library provenance: Rebuilt's application media
/// contract addresses stock CICNs by their exact Classic resource identity.
pub fn rebuilt_application_cicn_identity(resource_id: i32) -> StableId {
    StableId(format!("realmz-application-cicn-{resource_id}"))
}

/// Returns the presentation alias Rebuilt derives for a negative Special Land
/// CICN. The alias is intentionally role-specific; ordinary uses of the same
/// CICN continue to use `rebuilt_application_cicn_identity`.
pub fn rebuilt_application_special_land_identity(resource_id: i16) -> Option<StableId> {
    (resource_id < 0).then(|| {
        StableId(format!(
            "realmz-special-land-neg-{}",
            -i32::from(resource_id)
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rebuilt_application_identities_are_source_independent_and_role_specific() {
        assert_eq!(
            rebuilt_application_cicn_identity(143),
            StableId("realmz-application-cicn-143".into())
        );
        assert_eq!(
            rebuilt_application_special_land_identity(-18),
            Some(StableId("realmz-special-land-neg-18".into()))
        );
        assert_eq!(rebuilt_application_special_land_identity(18), None);
        assert_eq!(
            rebuilt_application_media_identity(
                &ClassicResourceKey {
                    resource_type: "cicn".into(),
                    resource_id: 257,
                },
                "portrait",
            ),
            StableId("realmz-portrait-257".into())
        );
        assert_eq!(
            rebuilt_application_media_identity(
                &ClassicResourceKey {
                    resource_type: "cicn".into(),
                    resource_id: 9000,
                },
                "combat-icon",
            ),
            StableId("realmz-combat-icon-9000".into())
        );
        assert_eq!(
            rebuilt_application_media_identity(
                &ClassicResourceKey {
                    resource_type: "PICT".into(),
                    resource_id: 300,
                },
                "tileset",
            ),
            StableId("classic.landlook.0".into())
        );
        assert_eq!(
            rebuilt_application_media_identity(
                &ClassicResourceKey {
                    resource_type: "snd ".into(),
                    resource_id: 11,
                },
                "sound",
            ),
            StableId("realmz-application-snd-11".into())
        );
    }

    fn source(id: &str, priority: u32) -> ApplicationMediaSource {
        ApplicationMediaSource {
            identity: StableId(id.into()),
            native_name: format!("{id}.rsrc"),
            priority,
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 1,
        }
    }

    fn asset(source: &str, priority: u32, id: i32, kind: &str) -> ApplicationMediaAsset {
        ApplicationMediaAsset {
            source: StableId(source.into()),
            source_priority: priority,
            descriptor: AssetDescriptor {
                identity: StableId(format!("{source}:{id}")),
                label: format!("CICN {id}"),
                kind: kind.into(),
                mime_type: Some("image/png".into()),
                classic_resource: Some(ClassicResourceKey {
                    resource_type: "cicn".into(),
                    resource_id: id,
                }),
                scenario_music_slot: None,
                blob: BlobId(format!("sha256:{}", "b".repeat(64))),
                byte_length: 1,
                classic_payload_blob: Some(BlobId(format!("sha256:{}", "c".repeat(64)))),
                classic_payload_byte_length: Some(1),
                extension: Some("png".into()),
                width: Some(32),
                height: Some(32),
                duration_ms: None,
                sample_rate: None,
                channels: None,
                tile_width: None,
                tile_height: None,
                columns: None,
                rows: None,
                landlook: None,
                base_tile: None,
                source: source.into(),
            },
        }
    }

    #[test]
    fn exact_resource_priority_precedes_semantic_role_validation() {
        let resource = ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 257,
        };
        let catalog = ApplicationMediaCatalog {
            format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
            library_id: StableId("classic-application".into()),
            sources: vec![source("jewels", 0), source("portraits", 1)],
            assets: vec![
                asset("jewels", 0, 257, "portrait"),
                asset("portraits", 1, 257, "icon"),
            ],
            ambiguous_resources: Vec::new(),
            failures: Vec::new(),
        };
        assert_eq!(
            catalog.resolve_resource(&resource, Some("portrait")),
            ApplicationMediaResolution::WrongKind
        );
        assert!(matches!(
            catalog.resolve_resource(&resource, Some("icon")),
            ApplicationMediaResolution::Resolved(asset) if asset.source.0 == "portraits"
        ));
    }

    #[test]
    fn stock_landlook_identity_resolves_the_exact_application_pict() {
        let mut pict = asset("jewels", 0, 303, "picture");
        pict.descriptor.classic_resource = Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 303,
        });
        pict.descriptor.mime_type = Some("image/png".into());
        pict.descriptor.width = Some(640);
        pict.descriptor.height = Some(320);
        let catalog = ApplicationMediaCatalog {
            format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
            library_id: StableId("classic-application".into()),
            sources: vec![source("jewels", 0)],
            assets: vec![pict],
            ambiguous_resources: Vec::new(),
            failures: Vec::new(),
        };

        for identity in ["classic.landlook.3", "landlook-3"] {
            assert!(matches!(
                catalog.resolve_landlook_tileset(&StableId(identity.into())),
                ApplicationMediaResolution::Resolved(asset)
                    if asset.descriptor.classic_resource.as_ref().unwrap().resource_id == 303
            ));
        }
        assert_eq!(
            catalog.resolve_landlook_tileset(&StableId("classic.landlook.2".into())),
            ApplicationMediaResolution::Missing
        );
        assert_eq!(
            catalog.resolve_landlook_tileset(&StableId("dungeon-top-down-302".into())),
            ApplicationMediaResolution::Missing
        );
    }

    #[test]
    fn malformed_landlook_payload_is_not_accepted_as_a_runtime_atlas() {
        let mut pict = asset("jewels", 0, 300, "picture");
        pict.descriptor.classic_resource = Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 300,
        });
        pict.descriptor.mime_type = Some("image/png".into());
        pict.descriptor.width = Some(320);
        pict.descriptor.height = Some(320);
        let catalog = ApplicationMediaCatalog {
            format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
            library_id: StableId("classic-application".into()),
            sources: vec![source("jewels", 0)],
            assets: vec![pict],
            ambiguous_resources: Vec::new(),
            failures: Vec::new(),
        };

        assert_eq!(
            catalog.resolve_landlook_tileset(&StableId("classic.landlook.0".into())),
            ApplicationMediaResolution::WrongKind
        );
    }

    #[test]
    fn complete_shared_sheet_resolves_through_the_stable_dungeon_identity() {
        let mut dungeon = asset("jewels", 0, 302, "tileset");
        dungeon.descriptor.classic_resource = Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 302,
        });
        dungeon.descriptor.mime_type = Some("image/png".into());
        dungeon.descriptor.width = Some(640);
        dungeon.descriptor.height = Some(640);
        dungeon.descriptor.tile_width = Some(32);
        dungeon.descriptor.tile_height = Some(32);
        dungeon.descriptor.columns = Some(20);
        dungeon.descriptor.rows = Some(20);
        let catalog = ApplicationMediaCatalog {
            format_version: APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
            library_id: StableId("classic-application".into()),
            sources: vec![source("jewels", 0)],
            assets: vec![dungeon],
            ambiguous_resources: Vec::new(),
            failures: Vec::new(),
        };

        assert!(matches!(
            catalog.resolve_map_tileset(&StableId("dungeon-top-down-302".into())),
            ApplicationMediaResolution::Resolved(_)
        ));
        assert_eq!(
            catalog.resolve_landlook_tileset(&StableId("classic.landlook.2".into())),
            ApplicationMediaResolution::Missing
        );
    }
}
