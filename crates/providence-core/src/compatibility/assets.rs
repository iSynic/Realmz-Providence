use super::{CompatibilityBlocker, blocker, is_sha256_blob};
use crate::model::ProjectSnapshot;
use crate::rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution};

pub(super) fn asset_index_blockers(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Vec<CompatibilityBlocker> {
    if snapshot.assets.is_empty() && application_media.is_none() {
        return vec![blocker(
            "rebuilt.asset-index.unavailable",
            "The schema-v3 asset index and content-addressed media inputs are not yet available to the pure compiler.",
            None,
        )];
    }
    let mut blockers = Vec::new();
    let mut keys = AssetKeys::default();
    for asset in &snapshot.assets {
        validate_identity(asset, &mut keys, &mut blockers);
        validate_resource_keys(asset, &mut keys, &mut blockers);
        validate_grid(asset, &mut blockers);
        validate_appearance(asset, &mut blockers);
    }
    blockers.extend(map_tileset_blockers(snapshot, application_media));
    blockers.extend(appearance_catalog_blockers(
        snapshot,
        application_media,
        &keys,
    ));
    blockers
}

#[derive(Default)]
struct AssetKeys {
    ids: std::collections::BTreeSet<crate::model::StableId>,
    resource_keys: std::collections::BTreeSet<(String, i32)>,
    music_slots: std::collections::BTreeSet<u8>,
    portrait_ids: std::collections::BTreeSet<i32>,
    combat_icon_ids: std::collections::BTreeSet<i32>,
}

fn validate_identity(
    asset: &crate::model::AssetDescriptor,
    keys: &mut AssetKeys,
    blockers: &mut Vec<CompatibilityBlocker>,
) {
    if !keys.ids.insert(asset.identity.clone()) {
        blockers.push(blocker(
            "rebuilt.asset-index.duplicate-id",
            format!("Asset ID '{}' is duplicated.", asset.identity.0),
            Some(asset.identity.clone()),
        ));
    }
    if asset.identity.0.is_empty()
        || asset.identity.0.len() > 255
        || asset.kind.is_empty()
        || asset.source.trim().is_empty()
        || !is_sha256_blob(&asset.blob.0)
        || asset.extension.as_ref().is_some_and(|extension| {
            !extension
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
    {
        blockers.push(blocker(
            "rebuilt.asset-index.invalid-record",
            format!(
                "Asset '{}' has invalid identity, provenance, blob, kind, or extension metadata.",
                asset.identity.0
            ),
            Some(asset.identity.clone()),
        ));
    }
}

fn validate_resource_keys(
    asset: &crate::model::AssetDescriptor,
    keys: &mut AssetKeys,
    blockers: &mut Vec<CompatibilityBlocker>,
) {
    if let Some(resource) = &asset.classic_resource {
        if resource.resource_type.is_empty()
            || !keys
                .resource_keys
                .insert((resource.resource_type.clone(), resource.resource_id))
        {
            blockers.push(blocker(
                "rebuilt.asset-index.duplicate-resource",
                format!(
                    "Asset '{}' has an empty or duplicate exact Classic resource key.",
                    asset.identity.0
                ),
                Some(asset.identity.clone()),
            ));
        }
        if resource.resource_type == "cicn" && asset.kind == "portrait" {
            keys.portrait_ids.insert(resource.resource_id);
        }
        if resource.resource_type == "cicn" && asset.kind == "combat-icon" {
            keys.combat_icon_ids.insert(resource.resource_id);
        }
    }
    if let Some(slot) = asset.scenario_music_slot
        && (!(1..=3).contains(&slot)
            || asset.kind != "music"
            || !asset
                .mime_type
                .as_deref()
                .is_some_and(|mime| mime.starts_with("audio/"))
            || !keys.music_slots.insert(slot))
    {
        blockers.push(blocker(
            "rebuilt.asset-index.music-slot",
            format!(
                "Asset '{}' has an invalid or duplicate scenario music slot.",
                asset.identity.0
            ),
            Some(asset.identity.clone()),
        ));
    }
}

fn validate_grid(asset: &crate::model::AssetDescriptor, blockers: &mut Vec<CompatibilityBlocker>) {
    if matches!(asset.kind.as_str(), "tileset" | "battle-tileset") {
        let valid_grid = asset.width.zip(asset.height).zip(
            asset
                .tile_width
                .zip(asset.tile_height)
                .zip(asset.columns.zip(asset.rows)),
        );
        let valid_grid = valid_grid.is_some_and(
            |((width, height), ((tile_width, tile_height), (columns, rows)))| {
                tile_width > 0
                    && tile_height > 0
                    && columns > 0
                    && rows > 0
                    && width == tile_width.saturating_mul(columns)
                    && height == tile_height.saturating_mul(rows)
            },
        );
        if !valid_grid
            || !asset
                .mime_type
                .as_deref()
                .is_some_and(|mime| mime.starts_with("image/"))
        {
            blockers.push(blocker(
                "rebuilt.asset-index.tileset-shape",
                format!(
                    "Tileset asset '{}' has invalid image or atlas-grid metadata.",
                    asset.identity.0
                ),
                Some(asset.identity.clone()),
            ));
        }
    }
}

fn validate_appearance(
    asset: &crate::model::AssetDescriptor,
    blockers: &mut Vec<CompatibilityBlocker>,
) {
    if asset.kind == "battle-tileset"
        && (asset.identity.0 != "classic-battle-tiles-302"
            || asset.mime_type.as_deref() != Some("image/png")
            || asset.classic_resource.is_some()
            || asset.width != Some(640)
            || asset.height != Some(640)
            || asset.tile_width != Some(32)
            || asset.tile_height != Some(32)
            || asset.columns != Some(20)
            || asset.rows != Some(20))
    {
        blockers.push(blocker(
            "rebuilt.asset-index.battle-atlas",
            "The Classic battle atlas must be the role-specific 640 by 640 PICT 302 tile grid.",
            Some(asset.identity.clone()),
        ));
    }
    if matches!(asset.kind.as_str(), "portrait" | "combat-icon")
        && (asset
            .classic_resource
            .as_ref()
            .is_none_or(|resource| resource.resource_type != "cicn")
            || asset.mime_type.as_deref() != Some("image/png")
            || asset.width.unwrap_or(0) == 0
            || asset.height.unwrap_or(0) == 0)
    {
        blockers.push(blocker(
            "rebuilt.asset-index.appearance-shape",
            format!(
                "Appearance asset '{}' is not a positive-size decoded Classic cicn PNG.",
                asset.identity.0
            ),
            Some(asset.identity.clone()),
        ));
    }
}

fn map_tileset_blockers(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    for map in &snapshot.world.maps {
        if let Some(runtime) = &map.runtime {
            let scenario_has_tileset = snapshot.assets.iter().any(|asset| {
                asset.identity == runtime.tileset_id
                    && asset.kind == "tileset"
                    && asset
                        .mime_type
                        .as_deref()
                        .is_some_and(|mime| mime.starts_with("image/"))
            });
            let application_has_tileset = application_media.is_some_and(|catalog| {
                matches!(
                    catalog.resolve_map_tileset(&runtime.tileset_id),
                    ApplicationMediaResolution::Resolved(_)
                )
            });
            if !scenario_has_tileset && !application_has_tileset {
                blockers.push(blocker(
                    "rebuilt.asset-index.missing-map-tileset",
                    format!(
                        "Map '{}' references unavailable tileset asset '{}'.",
                        map.identity.0, runtime.tileset_id.0
                    ),
                    Some(map.identity.clone()),
                ));
            }
        }
    }
    blockers
}

fn appearance_catalog_blockers(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
    keys: &AssetKeys,
) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let application_has = |resource_id: i32, expected_kind: &str| {
        let resource = crate::model::ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id,
        };
        let scenario_owns_key = snapshot
            .assets
            .iter()
            .any(|asset| asset.classic_resource.as_ref() == Some(&resource));
        if scenario_owns_key {
            return false;
        }
        application_media.is_some_and(|catalog| {
            matches!(
                catalog.resolve_resource(&resource, Some(expected_kind)),
                ApplicationMediaResolution::Resolved(_)
            )
        })
    };
    let missing_portraits = (257..377)
        .filter(|resource_id| {
            !keys.portrait_ids.contains(resource_id) && !application_has(*resource_id, "portrait")
        })
        .collect::<Vec<_>>();
    let missing_combat_icons = (9000..9120)
        .filter(|resource_id| {
            !keys.combat_icon_ids.contains(resource_id)
                && !application_has(*resource_id, "combat-icon")
        })
        .collect::<Vec<_>>();
    if !missing_portraits.is_empty() || !missing_combat_icons.is_empty() {
        blockers.push(blocker(
            "rebuilt.asset-index.appearance-catalog",
            format!(
                "Rebuilt requires the complete Classic appearance catalog; {} portrait and {} combat-icon assets are missing.",
                missing_portraits.len(),
                missing_combat_icons.len()
            ),
            None,
        ));
    }
    blockers
}
