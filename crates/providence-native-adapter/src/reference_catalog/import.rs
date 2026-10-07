use super::required_string;
use providence_core::{
    codecs::{ClassicMediaAsset, derive_classic_media_catalog},
    model::{AssetDescriptor, BlobId, StableId},
    reference_library::{
        REFERENCE_CATALOG_FORMAT_VERSION, ReferenceCatalog, ReferenceCatalogAsset,
        ReferenceCatalogSource, ReferenceSourceKind,
    },
};
use providence_storage::ReferenceCatalogStore;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

struct DecodedSource {
    kind: ReferenceSourceKind,
    source_id: &'static str,
    native_name: &'static str,
    entry_kind: &'static str,
    bytes: Vec<u8>,
    assets: Vec<ClassicMediaAsset>,
}

pub(crate) fn import_divinity_reference_catalog(params: Value) -> Result<Value, String> {
    let source_directory = PathBuf::from(required_string(
        &params,
        "sourceDirectory",
        "reference-catalog.import-divinity",
    )?);
    let library_root = PathBuf::from(required_string(
        &params,
        "libraryRoot",
        "reference-catalog.import-divinity",
    )?);
    let decoded_sources = decode_sources(&source_directory)?;
    let store = ReferenceCatalogStore::create(&library_root).map_err(|error| error.to_string())?;
    let mut catalog = ReferenceCatalog::empty(StableId("reference-library:divinity".into()));
    let mut counts = BTreeMap::<String, usize>::new();
    for decoded in decoded_sources {
        publish_source(&store, &mut catalog, &mut counts, decoded)?;
    }
    finalize_catalog(&store, catalog, counts)
}

fn decode_sources(source_directory: &Path) -> Result<Vec<DecodedSource>, String> {
    let source_specs = [
        (
            ReferenceSourceKind::BagOfHolding,
            "reference-source:bag-of-holding",
            "Bag of Holding.rsrc",
            "bag-item",
        ),
        (
            ReferenceSourceKind::VaultOfArcana,
            "reference-source:vault-of-arcana",
            "Vault of Arcana.rsrc",
            "vault-icon",
        ),
    ];
    let mut decoded_sources = Vec::new();
    for (kind, source_id, native_name, entry_kind) in source_specs {
        let path = source_directory.join(native_name);
        let bytes = fs::read(&path)
            .map_err(|error| format!("could not read {}: {error}", path.display()))?;
        let derived = derive_classic_media_catalog(&bytes)
            .map_err(|error| format!("could not decode {}: {error}", path.display()))?;
        if !derived.ambiguous_resources.is_empty() || !derived.failures.is_empty() {
            return Err(format!(
                "{} is not a certifiable reference source: {} ambiguous resources and {} decode failures",
                path.display(),
                derived.ambiguous_resources.len(),
                derived.failures.len()
            ));
        }
        let assets = derived
            .assets
            .into_iter()
            .filter(|asset| asset.resource.resource_type == "cicn")
            .collect::<Vec<_>>();
        if assets.is_empty() {
            return Err(format!("{} contains no cicn resources", path.display()));
        }
        decoded_sources.push(DecodedSource {
            kind,
            source_id,
            native_name,
            entry_kind,
            bytes,
            assets,
        });
    }

    Ok(decoded_sources)
}

fn publish_source(
    store: &ReferenceCatalogStore,
    catalog: &mut ReferenceCatalog,
    counts: &mut BTreeMap<String, usize>,
    decoded: DecodedSource,
) -> Result<(), String> {
    let DecodedSource {
        kind,
        source_id,
        native_name,
        entry_kind,
        bytes,
        assets,
    } = decoded;
    let source = StableId(source_id.into());
    let source_blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    catalog.sources.push(ReferenceCatalogSource {
        identity: source.clone(),
        kind,
        native_name: format!("Divinity Data/{native_name}"),
        blob: source_blob,
        byte_length: bytes.len() as u64,
    });
    for asset in assets {
        let runtime_blob = store
            .put_blob(&asset.runtime_payload)
            .map_err(|error| error.to_string())?;
        let classic_blob = store
            .put_blob(&asset.classic_payload)
            .map_err(|error| error.to_string())?;
        *counts.entry(entry_kind.into()).or_default() += 1;
        catalog.assets.push(asset_record(
            asset,
            &source,
            native_name,
            entry_kind,
            runtime_blob,
            classic_blob,
        ));
    }
    Ok(())
}

fn asset_record(
    asset: ClassicMediaAsset,
    source: &StableId,
    native_name: &str,
    entry_kind: &str,
    runtime_blob: BlobId,
    classic_blob: BlobId,
) -> ReferenceCatalogAsset {
    let resource_id = asset.resource.resource_id;
    ReferenceCatalogAsset {
        source: source.clone(),
        descriptor: AssetDescriptor {
            identity: StableId(format!("divinity:{entry_kind}:{resource_id}")),
            label: asset.label,
            kind: entry_kind.into(),
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
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: format!("Divinity Data/{native_name}"),
        },
    }
}

fn finalize_catalog(
    store: &ReferenceCatalogStore,
    mut catalog: ReferenceCatalog,
    counts: BTreeMap<String, usize>,
) -> Result<Value, String> {
    catalog.assets.sort_by(|left, right| {
        (
            left.descriptor.kind.as_str(),
            left.descriptor.classic_resource.as_ref(),
            &left.descriptor.identity,
        )
            .cmp(&(
                right.descriptor.kind.as_str(),
                right.descriptor.classic_resource.as_ref(),
                &right.descriptor.identity,
            ))
    });
    let manifest_sha256 = store
        .save_catalog(&catalog)
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "formatVersion": REFERENCE_CATALOG_FORMAT_VERSION,
        "libraryId": catalog.library_id,
        "libraryRoot": store.root(),
        "catalogPath": store.catalog_path(),
        "manifestSha256": manifest_sha256,
        "sources": catalog.sources,
        "counts": {
            "assets": catalog.assets.len(),
            "byKind": counts,
        },
        "projectOwnership": false,
        "readOnly": true,
    }))
}
