use crate::map_rendering::application_landlook_atlas_coverage;
use crate::request_params::required_string;
use providence_core::codecs::classic_landlook_for_media_asset;
use providence_core::codecs::derive_classic_media_catalog;
use providence_core::codecs::is_classic_dungeon_tileset;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION;
use providence_core::rebuilt::ApplicationMediaAmbiguity;
use providence_core::rebuilt::ApplicationMediaAsset;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaFailure;
use providence_core::rebuilt::ApplicationMediaResolution;
use providence_core::rebuilt::ApplicationMediaSource;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use providence_core::codecs::ClassicMediaAsset;
use std::path::Path;

pub(crate) fn import_classic_application_media(params: Value) -> Result<Value, String> {
    let source_directory = PathBuf::from(required_string(&params, "sourceDirectory")?);
    let library_root = PathBuf::from(required_string(&params, "libraryRoot")?);
    let store = ReferenceLibraryStore::create(&library_root).map_err(|error| error.to_string())?;
    let source_specs = [
        (
            "classic-application:family-jewels",
            "The Family Jewels.rsrc",
            0_u32,
        ),
        ("classic-application:portraits", "Portraits.rsrc", 1_u32),
        ("classic-application:tacticals", "Tacticals.rsrc", 2_u32),
    ];
    let mut catalog = ApplicationMediaCatalog::empty(StableId("realmz-classic-application".into()));
    let mut counts = BTreeMap::<String, usize>::new();
    for (source_id, native_name, priority) in source_specs {
        import_application_source(
            &store,
            &source_directory,
            source_id,
            native_name,
            priority,
            &mut catalog,
            &mut counts,
        )?;
    }
    sort_application_catalog(&mut catalog);
    application_import_result(&store, &catalog, &counts)
}

pub(crate) fn application_asset_identity(source: &str, resource: &ClassicResourceKey) -> StableId {
    let resource_type = resource
        .resource_type
        .trim()
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() {
                char::from(byte.to_ascii_lowercase())
            } else {
                '-'
            }
        })
        .collect::<String>();
    StableId(format!("{source}:{resource_type}:{}", resource.resource_id))
}
fn import_application_source(
    store: &ReferenceLibraryStore,
    source_directory: &Path,
    source_id: &str,
    native_name: &str,
    priority: u32,
    catalog: &mut ApplicationMediaCatalog,
    counts: &mut BTreeMap<String, usize>,
) -> Result<(), String> {
    let path = source_directory.join(native_name);
    let bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let derived = derive_classic_media_catalog(&bytes)
        .map_err(|error| format!("could not decode {}: {error}", path.display()))?;
    let source = StableId(source_id.into());
    let source_blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    catalog.sources.push(ApplicationMediaSource {
        identity: source.clone(),
        native_name: native_name.into(),
        priority,
        blob: source_blob,
        byte_length: bytes.len() as u64,
    });
    for asset in derived.assets {
        *counts.entry(asset.kind.clone()).or_default() += 1;
        catalog.assets.push(store_application_asset(
            store,
            &source,
            native_name,
            priority,
            asset,
        )?);
    }
    catalog
        .ambiguous_resources
        .extend(derived.ambiguous_resources.into_iter().map(|ambiguity| {
            ApplicationMediaAmbiguity {
                source: source.clone(),
                source_priority: priority,
                resource: ambiguity.resource,
                occurrences: ambiguity.occurrences,
            }
        }));
    catalog.failures.extend(
        derived
            .failures
            .into_iter()
            .map(|failure| ApplicationMediaFailure {
                source: source.clone(),
                source_priority: priority,
                resource: failure.resource,
                label: failure.label,
                classic_payload_bytes: failure.classic_payload_bytes,
                reason: failure.reason,
            }),
    );
    Ok(())
}

fn store_application_asset(
    store: &ReferenceLibraryStore,
    source: &StableId,
    native_name: &str,
    priority: u32,
    asset: ClassicMediaAsset,
) -> Result<ApplicationMediaAsset, String> {
    let landlook = classic_landlook_for_media_asset(&asset);
    let dungeon_tileset = is_classic_dungeon_tileset(&asset);
    let runtime_blob = store
        .put_blob(&asset.runtime_payload)
        .map_err(|error| error.to_string())?;
    let classic_blob = store
        .put_blob(&asset.classic_payload)
        .map_err(|error| error.to_string())?;
    let identity = application_asset_identity(&source.0, &asset.resource);
    Ok(ApplicationMediaAsset {
        source: source.clone(),
        source_priority: priority,
        descriptor: AssetDescriptor {
            identity,
            label: asset.label,
            kind: asset.kind,
            mime_type: Some(asset.mime_type),
            classic_resource: Some(asset.resource),
            scenario_music_slot: None,
            blob: runtime_blob,
            byte_length: asset.runtime_payload.len() as u64,
            classic_payload_blob: Some(classic_blob),
            classic_payload_byte_length: Some(asset.classic_payload.len() as u64),
            extension: Some(asset.extension),
            width: asset.width,
            height: asset.height,
            duration_ms: asset.duration_ms,
            sample_rate: asset.sample_rate,
            channels: asset.channels,
            tile_width: landlook.map(|_| 32).or(dungeon_tileset.then_some(32)),
            tile_height: landlook.map(|_| 32).or(dungeon_tileset.then_some(32)),
            columns: landlook.map(|_| 20).or(dungeon_tileset.then_some(20)),
            rows: landlook.map(|_| 10).or(dungeon_tileset.then_some(20)),
            landlook: landlook.or(dungeon_tileset.then_some(2)),
            base_tile: None,
            source: format!("Classic application/{native_name}"),
        },
    })
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::*;

    #[test]
    fn imported_complete_pict_302_uses_the_shared_32_pixel_grid() {
        let temporary = tempfile::tempdir().expect("temporary application library");
        let store = ReferenceLibraryStore::create(temporary.path()).expect("reference store");
        let asset = ClassicMediaAsset {
            resource: ClassicResourceKey {
                resource_type: "PICT".into(),
                resource_id: 302,
            },
            label: "PICT 302".into(),
            attributes: 0,
            kind: "tileset".into(),
            mime_type: "image/png".into(),
            extension: "png".into(),
            width: Some(640),
            height: Some(640),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            runtime_payload: vec![1, 2, 3],
            classic_payload: vec![4, 5, 6],
        };

        let imported = store_application_asset(
            &store,
            &StableId("classic-application:family-jewels".into()),
            "The Family Jewels.rsrc",
            0,
            asset,
        )
        .expect("store application asset");

        assert_eq!(imported.descriptor.tile_width, Some(32));
        assert_eq!(imported.descriptor.tile_height, Some(32));
        assert_eq!(imported.descriptor.columns, Some(20));
        assert_eq!(imported.descriptor.rows, Some(20));
        assert_eq!(imported.descriptor.landlook, Some(2));
    }
}

fn sort_application_catalog(catalog: &mut ApplicationMediaCatalog) {
    catalog.sources.sort_by_key(|source| source.priority);
    catalog.assets.sort_by(|left, right| {
        (
            left.source_priority,
            left.descriptor.classic_resource.as_ref(),
            &left.descriptor.identity,
        )
            .cmp(&(
                right.source_priority,
                right.descriptor.classic_resource.as_ref(),
                &right.descriptor.identity,
            ))
    });
    catalog.ambiguous_resources.sort_by(|left, right| {
        (left.source_priority, &left.resource).cmp(&(right.source_priority, &right.resource))
    });
    catalog.failures.sort_by(|left, right| {
        (left.source_priority, &left.resource).cmp(&(right.source_priority, &right.resource))
    });
}

fn missing_appearance_resources(catalog: &ApplicationMediaCatalog) -> Vec<i32> {
    (257..377)
        .map(|id| (id, "portrait"))
        .chain((9000..9120).map(|id| (id, "combat-icon")))
        .filter_map(|(resource_id, kind)| {
            let resource = ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id,
            };
            (!matches!(
                catalog.resolve_resource(&resource, Some(kind)),
                ApplicationMediaResolution::Resolved(_)
            ))
            .then_some(resource_id)
        })
        .collect::<Vec<_>>()
}

fn application_import_result(
    store: &ReferenceLibraryStore,
    catalog: &ApplicationMediaCatalog,
    counts: &BTreeMap<String, usize>,
) -> Result<Value, String> {
    let missing_appearance = missing_appearance_resources(catalog);
    let (available_landlooks, missing_landlooks, dungeon_atlas) =
        application_landlook_atlas_coverage(catalog);
    let manifest_sha256 = store
        .save_catalog(catalog)
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "formatVersion": APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
        "libraryId": catalog.library_id,
        "libraryRoot": store.root(),
        "catalogPath": store.catalog_path(),
        "manifestSha256": manifest_sha256,
        "sources": catalog.sources,
        "counts": {
            "assets": catalog.assets.len(),
            "byKind": counts,
            "ambiguousResources": catalog.ambiguous_resources.len(),
            "decodeFailures": catalog.failures.len(),
            "appearanceRoots": 240 - missing_appearance.len(),
        },
        "appearanceComplete": missing_appearance.is_empty(),
        "missingAppearanceResourceIds": missing_appearance,
        "landlookAtlases": {
            "available": available_landlooks,
            "missing": missing_landlooks,
            "dungeon": dungeon_atlas,
        },
        "ready": catalog.failures.is_empty() && catalog.ambiguous_resources.is_empty(),
    }))
}
