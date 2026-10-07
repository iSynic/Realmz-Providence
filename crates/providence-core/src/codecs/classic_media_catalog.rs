use std::collections::BTreeMap;

use crate::model::{ClassicResourceKey, StableId};

use super::{
    ResourceForkError, decode_cicn, decode_classic_pict, decode_classic_snd,
    encode_runtime_pcm_wav, encode_runtime_rgba_png, parse_resource_entries_preserving_duplicates,
};

pub const CLASSIC_SCENARIO_RESOURCE_SOURCE: &str = "Classic Scenario.rsrc import";
pub const CLASSIC_APPLICATION_MATERIALIZED_SOURCE_PREFIX: &str =
    "Classic application media materialized from ";
pub const AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX: &str = "Authored monster appearance import ";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassicMediaAsset {
    pub resource: ClassicResourceKey,
    pub label: String,
    pub attributes: u8,
    pub kind: String,
    pub mime_type: String,
    pub extension: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub runtime_payload: Vec<u8>,
    pub classic_payload: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassicMediaAmbiguity {
    pub resource: ClassicResourceKey,
    pub occurrences: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassicMediaFailure {
    pub resource: ClassicResourceKey,
    pub label: String,
    pub classic_payload_bytes: usize,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassicMediaCatalog {
    pub assets: Vec<ClassicMediaAsset>,
    pub ambiguous_resources: Vec<ClassicMediaAmbiguity>,
    pub failures: Vec<ClassicMediaFailure>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClassicMediaCatalogError {
    ResourceFork(ResourceForkError),
}

impl std::fmt::Display for ClassicMediaCatalogError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ResourceFork(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for ClassicMediaCatalogError {}

impl From<ResourceForkError> for ClassicMediaCatalogError {
    fn from(error: ResourceForkError) -> Self {
        Self::ResourceFork(error)
    }
}

/// Derives runtime-ready media from the three resource families consumed by the
/// scenario editor. The caller remains responsible for retaining the exact
/// `Scenario.rsrc` container as compatibility evidence.
pub fn derive_classic_media_catalog(
    scenario_resources: &[u8],
) -> Result<ClassicMediaCatalog, ClassicMediaCatalogError> {
    let entries = parse_resource_entries_preserving_duplicates(scenario_resources)?;
    let mut grouped = BTreeMap::<([u8; 4], i16), Vec<_>>::new();
    for entry in entries
        .into_iter()
        .filter(|entry| matches!(&entry.resource_type, b"PICT" | b"cicn" | b"snd "))
    {
        grouped
            .entry((entry.resource_type, entry.id))
            .or_default()
            .push(entry);
    }

    let mut assets = Vec::new();
    let mut ambiguous_resources = Vec::new();
    let mut failures = Vec::new();
    for ((resource_type, resource_id), entries) in grouped {
        let resource = ClassicResourceKey {
            resource_type: String::from_utf8_lossy(&resource_type).into_owned(),
            resource_id: i32::from(resource_id),
        };
        if entries.len() != 1 {
            ambiguous_resources.push(ClassicMediaAmbiguity {
                resource,
                occurrences: entries.len(),
            });
            continue;
        }
        let entry = &entries[0];
        let label = if entry.name.trim().is_empty() {
            format!(
                "{} {}",
                String::from_utf8_lossy(&resource_type),
                resource_id
            )
        } else {
            entry.name.clone()
        };
        match derive_asset(
            resource.clone(),
            label.clone(),
            entry.attributes,
            &entry.data,
        ) {
            Ok(asset) => assets.push(asset),
            Err(reason) => failures.push(ClassicMediaFailure {
                resource,
                label,
                classic_payload_bytes: entry.data.len(),
                reason,
            }),
        }
    }

    Ok(ClassicMediaCatalog {
        assets,
        ambiguous_resources,
        failures,
    })
}

fn derive_asset(
    resource: ClassicResourceKey,
    label: String,
    attributes: u8,
    classic_payload: &[u8],
) -> Result<ClassicMediaAsset, String> {
    match resource.resource_type.as_str() {
        "PICT" => {
            let decoded =
                decode_classic_pict(classic_payload).map_err(|error| error.to_string())?;
            let kind = match (resource.resource_id, decoded.width, decoded.height) {
                (302, 640, 640) | (300..=301 | 303..=310, 640, 320) => "tileset",
                _ => "picture",
            };
            let runtime_payload =
                encode_runtime_rgba_png(&decoded.rgba, decoded.width, decoded.height)
                    .map_err(|error| error.to_string())?;
            Ok(ClassicMediaAsset {
                resource,
                label,
                attributes,
                kind: kind.into(),
                mime_type: "image/png".into(),
                extension: "png".into(),
                width: Some(decoded.width),
                height: Some(decoded.height),
                duration_ms: None,
                sample_rate: None,
                channels: None,
                runtime_payload,
                classic_payload: classic_payload.to_vec(),
            })
        }
        "cicn" => {
            let decoded = decode_cicn(classic_payload).map_err(|error| error.to_string())?;
            let runtime_payload =
                encode_runtime_rgba_png(&decoded.rgba, decoded.width, decoded.height)
                    .map_err(|error| error.to_string())?;
            let kind = match resource.resource_id {
                i32::MIN..=-1 => "special-land-tile",
                257..=376 => "portrait",
                9000..=9119 => "combat-icon",
                _ => "icon",
            };
            Ok(ClassicMediaAsset {
                resource,
                label,
                attributes,
                kind: kind.into(),
                mime_type: "image/png".into(),
                extension: "png".into(),
                width: Some(decoded.width),
                height: Some(decoded.height),
                duration_ms: None,
                sample_rate: None,
                channels: None,
                runtime_payload,
                classic_payload: classic_payload.to_vec(),
            })
        }
        "snd " => {
            let decoded = decode_classic_snd(classic_payload).map_err(|error| error.to_string())?;
            let runtime_payload = encode_runtime_pcm_wav(
                &decoded.runtime_pcm,
                decoded.sample_rate,
                decoded.channels,
                decoded.bits_per_sample,
            )
            .map_err(|error| error.to_string())?;
            let duration_ms = u32::try_from(decoded.duration_ms()).map_err(|_| {
                "decoded sound duration exceeds the portable descriptor".to_string()
            })?;
            Ok(ClassicMediaAsset {
                resource,
                label,
                attributes,
                kind: "sound".into(),
                mime_type: "audio/wav".into(),
                extension: "wav".into(),
                width: None,
                height: None,
                duration_ms: Some(duration_ms),
                sample_rate: Some(decoded.sample_rate),
                channels: Some(decoded.channels),
                runtime_payload,
                classic_payload: classic_payload.to_vec(),
            })
        }
        _ => Err("resource family is not media".into()),
    }
}

pub fn classic_landlook_for_media_asset(asset: &ClassicMediaAsset) -> Option<i8> {
    (asset.kind == "tileset"
        && asset.resource.resource_type == "PICT"
        && asset.resource.resource_id != 302
        && (300..=310).contains(&asset.resource.resource_id)
        && asset.width == Some(640)
        && asset.height == Some(320))
    .then_some((asset.resource.resource_id - 300) as i8)
}

pub fn is_classic_dungeon_tileset(asset: &ClassicMediaAsset) -> bool {
    asset.kind == "tileset"
        && asset.resource.resource_type == "PICT"
        && asset.resource.resource_id == 302
        && asset.width == Some(640)
        && asset.height == Some(640)
}

pub fn classic_media_asset_identity(asset: &ClassicMediaAsset) -> StableId {
    if is_classic_dungeon_tileset(asset) {
        return StableId("dungeon-top-down-302".into());
    }
    if let Some(landlook) = classic_landlook_for_media_asset(asset) {
        return StableId(format!("classic.landlook.{landlook}"));
    }
    let identity = match asset.kind.as_str() {
        "special-land-tile" => format!("special-land.{}", asset.resource.resource_id),
        _ => format!("{}:{}", asset.kind, asset.resource.resource_id),
    };
    StableId(identity)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codecs::{
        ResourceEntry, compile_scenario_icon_resource_fork, encode_scenario_icon_cicn,
        encode_scenario_picture_pict, encode_scenario_sound_snd,
        parse_resource_entries_preserving_duplicates, write_resource_fork_preserving_duplicates,
    };
    use crate::model::{AssetDescriptor, BlobId, StableId};

    #[test]
    fn catalog_derivation_is_deterministic_and_keeps_native_and_runtime_payloads_separate() {
        let rgba = vec![255; 32 * 32 * 4];
        let pict = encode_scenario_picture_pict(&rgba, 32, 32, false).unwrap();
        let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
        let snd = encode_scenario_sound_snd(&[0, 64, 128, 255], 11_025, 1).unwrap();
        let fork = write_resource_fork_preserving_duplicates(&[
            ResourceEntry {
                resource_type: *b"snd ",
                id: 200,
                name: "Gate Opens".into(),
                attributes: 4,
                data: snd.clone(),
            },
            ResourceEntry {
                resource_type: *b"PICT",
                id: 30_000,
                name: "Moon Gate".into(),
                attributes: 0,
                data: pict.clone(),
            },
            ResourceEntry {
                resource_type: *b"cicn",
                id: -91,
                name: "Special Moon Gate".into(),
                attributes: 2,
                data: cicn.clone(),
            },
        ])
        .unwrap();

        let first = derive_classic_media_catalog(&fork).unwrap();
        let second = derive_classic_media_catalog(&fork).unwrap();
        assert_eq!(first, second);
        assert!(first.ambiguous_resources.is_empty());
        assert!(first.failures.is_empty());
        assert_eq!(first.assets.len(), 3);
        let picture = first
            .assets
            .iter()
            .find(|asset| asset.resource.resource_type == "PICT")
            .unwrap();
        assert_eq!(picture.classic_payload, pict);
        assert_eq!(&picture.runtime_payload[..8], b"\x89PNG\r\n\x1a\n");
        let icon = first
            .assets
            .iter()
            .find(|asset| asset.resource.resource_type == "cicn")
            .unwrap();
        assert_eq!(icon.kind, "special-land-tile");
        assert_eq!(icon.attributes, 2);
        let sound = first
            .assets
            .iter()
            .find(|asset| asset.resource.resource_type == "snd ")
            .unwrap();
        assert_eq!(sound.classic_payload, snd);
        assert_eq!(&sound.runtime_payload[..12], b"RIFF(\0\0\0WAVE");
        assert_eq!(sound.sample_rate, Some(11_025));
    }

    #[test]
    fn exact_landlook_pict_geometry_gets_the_runtime_tileset_role() {
        let landlook =
            encode_scenario_picture_pict(&vec![127; 640 * 320 * 4], 640, 320, false).unwrap();
        let ordinary_picture =
            encode_scenario_picture_pict(&vec![127; 320 * 320 * 4], 320, 320, false).unwrap();
        let fork = write_resource_fork_preserving_duplicates(&[
            ResourceEntry {
                resource_type: *b"PICT",
                id: 306,
                name: "Moonlit Vale Landlook".into(),
                attributes: 0,
                data: landlook,
            },
            ResourceEntry {
                resource_type: *b"PICT",
                id: 307,
                name: "Player Map 307".into(),
                attributes: 0,
                data: ordinary_picture,
            },
        ])
        .unwrap();

        let catalog = derive_classic_media_catalog(&fork).unwrap();
        let landlook = catalog
            .assets
            .iter()
            .find(|asset| asset.resource.resource_id == 306)
            .unwrap();
        let ordinary = catalog
            .assets
            .iter()
            .find(|asset| asset.resource.resource_id == 307)
            .unwrap();
        assert_eq!(landlook.kind, "tileset");
        assert_eq!(classic_landlook_for_media_asset(landlook), Some(6));
        assert_eq!(
            classic_media_asset_identity(landlook),
            StableId("classic.landlook.6".into())
        );
        assert_eq!(ordinary.kind, "picture");
        assert_eq!(classic_landlook_for_media_asset(ordinary), None);
    }

    #[test]
    fn shared_pict_keeps_every_pixel_instead_of_only_the_dungeon_crop() {
        let mut source = vec![255_u8; 640 * 640 * 4];
        for (x, y) in [(0, 0), (639, 639), (576, 320), (639, 383), (31, 511)] {
            let offset = (y * 640 + x) * 4;
            source[offset..offset + 4].copy_from_slice(&[12, 34, 56, 255]);
        }
        let pict = encode_scenario_picture_pict(&source, 640, 640, false).unwrap();
        let decoded = decode_classic_pict(&pict).unwrap();
        let asset = derive_asset(
            ClassicResourceKey {
                resource_type: "PICT".into(),
                resource_id: 302,
            },
            "Shared map artwork".into(),
            0,
            &pict,
        )
        .unwrap();
        assert_eq!((asset.width, asset.height), (Some(640), Some(640)));
        assert_eq!(asset.classic_payload, pict);
        assert_eq!(
            asset.runtime_payload,
            encode_runtime_rgba_png(&decoded.rgba, 640, 640).unwrap()
        );
        assert_eq!(
            classic_media_asset_identity(&asset),
            StableId("dungeon-top-down-302".into())
        );
    }

    #[test]
    fn duplicate_identities_are_preserved_in_source_but_never_selected_as_assets() {
        let rgba = vec![255; 32 * 32 * 4];
        let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
        let fork = write_resource_fork_preserving_duplicates(&[
            ResourceEntry {
                resource_type: *b"cicn",
                id: 451,
                name: "First".into(),
                attributes: 0,
                data: cicn.clone(),
            },
            ResourceEntry {
                resource_type: *b"cicn",
                id: 451,
                name: "Second".into(),
                attributes: 0,
                data: cicn,
            },
        ])
        .unwrap();

        let catalog = derive_classic_media_catalog(&fork).unwrap();
        assert!(catalog.assets.is_empty());
        assert!(catalog.failures.is_empty());
        assert_eq!(
            catalog.ambiguous_resources,
            [ClassicMediaAmbiguity {
                resource: ClassicResourceKey {
                    resource_type: "cicn".into(),
                    resource_id: 451,
                },
                occurrences: 2,
            }]
        );
    }

    #[test]
    fn appearance_ids_receive_reference_compatible_kinds() {
        let rgba = vec![255; 32 * 32 * 4];
        let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
        let fork = write_resource_fork_preserving_duplicates(&[
            ResourceEntry {
                resource_type: *b"cicn",
                id: 257,
                name: String::new(),
                attributes: 0,
                data: cicn.clone(),
            },
            ResourceEntry {
                resource_type: *b"cicn",
                id: 9000,
                name: String::new(),
                attributes: 0,
                data: cicn,
            },
        ])
        .unwrap();

        let catalog = derive_classic_media_catalog(&fork).unwrap();
        assert_eq!(catalog.assets[0].kind, "portrait");
        assert_eq!(catalog.assets[1].kind, "combat-icon");
    }

    #[test]
    fn unowned_duplicate_resources_survive_exact_and_edited_catalog_compiles() {
        let rgba = vec![255; 32 * 32 * 4];
        let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
        let fork = write_resource_fork_preserving_duplicates(&[
            ResourceEntry {
                resource_type: *b"cicn",
                id: 451,
                name: "First duplicate".into(),
                attributes: 1,
                data: cicn.clone(),
            },
            ResourceEntry {
                resource_type: *b"cicn",
                id: 451,
                name: "Second duplicate".into(),
                attributes: 2,
                data: cicn.clone(),
            },
            ResourceEntry {
                resource_type: *b"cicn",
                id: 257,
                name: "Captain Maelis".into(),
                attributes: 8,
                data: cicn.clone(),
            },
        ])
        .unwrap();
        let blob = BlobId(format!("sha256:{}", "a".repeat(64)));
        let asset = AssetDescriptor {
            identity: StableId("portrait:257".into()),
            label: "Captain Maelis".into(),
            kind: "portrait".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: 257,
            }),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "b".repeat(64))),
            byte_length: 1,
            classic_payload_blob: Some(blob.clone()),
            classic_payload_byte_length: Some(cicn.len() as u64),
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
            source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
        };
        let exact = compile_scenario_icon_resource_fork(
            std::slice::from_ref(&asset),
            &BTreeMap::from([(blob.0.clone(), cicn.clone())]),
            Some(&fork),
        )
        .unwrap();
        assert_eq!(exact, fork);

        let edited_cicn = encode_scenario_icon_cicn(&vec![0; 32 * 32 * 4], 32, 32).unwrap();
        let edited = compile_scenario_icon_resource_fork(
            &[AssetDescriptor {
                classic_payload_byte_length: Some(edited_cicn.len() as u64),
                ..asset
            }],
            &BTreeMap::from([(blob.0, edited_cicn.clone())]),
            Some(&fork),
        )
        .unwrap();
        let entries = parse_resource_entries_preserving_duplicates(&edited).unwrap();
        assert_eq!(
            entries
                .iter()
                .filter(|entry| entry.resource_type == *b"cicn" && entry.id == 451)
                .count(),
            2
        );
        let updated = entries
            .iter()
            .find(|entry| entry.resource_type == *b"cicn" && entry.id == 257)
            .unwrap();
        assert_eq!(updated.data, edited_cicn);
        assert_eq!(updated.attributes, 8);
    }
}
