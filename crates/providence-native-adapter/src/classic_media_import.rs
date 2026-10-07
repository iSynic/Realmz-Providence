use crate::execute;
use crate::request_params::required_string;
use crate::request_params::required_u64;
use crate::scenario_preflight::resolve_classic_native_file;
use providence_core::codecs::CLASSIC_SCENARIO_RESOURCE_SOURCE;
use providence_core::codecs::classic_landlook_for_media_asset;
use providence_core::codecs::classic_media_asset_identity;
use providence_core::codecs::decode_classic_text_assets;
use providence_core::codecs::derive_classic_media_catalog;
use providence_core::codecs::is_classic_dungeon_tileset;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::ClassicSourceBlob;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use providence_core::codecs::{ClassicMediaCatalog, DecodedClassicTextAsset};
use providence_core::model::BlobId;

pub(crate) fn import_classic_media(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: Value,
) -> Result<Value, String> {
    let store = store.ok_or_else(|| {
        "project.import-classic-media requires serve-project so source and runtime media bytes are durable"
            .to_string()
    })?;
    let expected_revision = Revision(required_u64(&params, "expectedRevision")?);
    if expected_revision != session.revision() {
        return Err(format!(
            "revision conflict: expected {}, current revision is {}",
            expected_revision.0,
            session.revision().0
        ));
    }
    let directory = PathBuf::from(required_string(&params, "directory")?);
    if resolve_classic_native_file(&directory, "Scenario.rsrc").is_none() {
        return Ok(json!({
            "sourcePresent": false,
            "counts": {},
            "decoded": 0,
            "failures": [],
            "ambiguousResources": [],
            "sourceBytes": 0,
        }));
    }
    let (source, catalog, text_catalog) = prepare_media_source(store, &params)?;
    let mut assets = store_media_assets(store, &catalog)?;
    let text_occurrences = text_occurrences(&text_catalog);
    append_text_assets(store, text_catalog, &text_occurrences, &mut assets)?;
    let annex_blob = store_media_annex(session, store, &source)?;
    let counts = assets.iter().fold(BTreeMap::new(), |mut counts, asset| {
        *counts.entry(asset.kind.clone()).or_insert(0usize) += 1;
        counts
    });
    let failures = media_failures(&catalog);
    let ambiguous_resources = media_ambiguities(&catalog, &text_occurrences);
    let decoded_count = assets.len();
    let source_bytes_count = source.byte_length;
    let mut result = execute(
        session,
        &params,
        EditorCommand::ImportClassicMediaCatalog {
            annex_blob,
            source,
            assets,
        },
    )?;
    if let Some(object) = result.as_object_mut() {
        object.insert("counts".into(), json!(counts));
        object.insert("decoded".into(), json!(decoded_count));
        object.insert("failures".into(), json!(failures));
        object.insert("ambiguousResources".into(), json!(ambiguous_resources));
        object.insert("sourceBytes".into(), json!(source_bytes_count));
        object.insert("sourcePresent".into(), json!(true));
    }
    Ok(result)
}

fn store_media_assets(
    store: &ProjectStore,
    catalog: &ClassicMediaCatalog,
) -> Result<Vec<AssetDescriptor>, String> {
    let mut assets = Vec::with_capacity(catalog.assets.len());
    for derived in &catalog.assets {
        let runtime_blob = store
            .put_blob(&derived.runtime_payload)
            .map_err(|error| error.to_string())?;
        let classic_payload_blob = store
            .put_blob(&derived.classic_payload)
            .map_err(|error| error.to_string())?;
        let landlook = classic_landlook_for_media_asset(derived);
        let dungeon_tileset = is_classic_dungeon_tileset(derived);
        let identity = classic_media_asset_identity(derived);
        assets.push(AssetDescriptor {
            identity,
            label: derived.label.clone(),
            kind: derived.kind.clone(),
            mime_type: Some(derived.mime_type.clone()),
            classic_resource: Some(derived.resource.clone()),
            scenario_music_slot: None,
            blob: runtime_blob,
            byte_length: derived.runtime_payload.len() as u64,
            classic_payload_blob: Some(classic_payload_blob),
            classic_payload_byte_length: Some(derived.classic_payload.len() as u64),
            extension: Some(derived.extension.clone()),
            width: derived.width,
            height: derived.height,
            duration_ms: derived.duration_ms,
            sample_rate: derived.sample_rate,
            channels: derived.channels,
            tile_width: landlook.map(|_| 32).or(dungeon_tileset.then_some(16)),
            tile_height: landlook.map(|_| 32).or(dungeon_tileset.then_some(16)),
            columns: landlook.map(|_| 20).or(dungeon_tileset.then_some(4)),
            rows: landlook.map(|_| 10).or(dungeon_tileset.then_some(4)),
            landlook: landlook.or(dungeon_tileset.then_some(2)),
            base_tile: None,
            source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
        });
    }
    Ok(assets)
}

fn text_occurrences(
    text_catalog: &[DecodedClassicTextAsset],
) -> BTreeMap<ClassicResourceKey, usize> {
    text_catalog.iter().fold(
        BTreeMap::<ClassicResourceKey, usize>::new(),
        |mut counts, decoded| {
            let resource = decoded
                .asset
                .classic_resource
                .clone()
                .expect("Classic text assets always carry resource keys");
            *counts.entry(resource).or_default() += 1;
            counts
        },
    )
}

fn append_text_assets(
    store: &ProjectStore,
    text_catalog: Vec<DecodedClassicTextAsset>,
    text_occurrences: &BTreeMap<ClassicResourceKey, usize>,
    assets: &mut Vec<AssetDescriptor>,
) -> Result<(), String> {
    for decoded in text_catalog {
        let resource = decoded
            .asset
            .classic_resource
            .clone()
            .expect("Classic text assets always carry resource keys");
        if text_occurrences.get(&resource) != Some(&1) {
            continue;
        }
        let mut asset = decoded.asset;
        asset.blob = store
            .put_blob(&decoded.runtime_payload)
            .map_err(|error| error.to_string())?;
        asset.classic_payload_blob = Some(
            store
                .put_blob(&decoded.classic_payload)
                .map_err(|error| error.to_string())?,
        );
        asset.source = CLASSIC_SCENARIO_RESOURCE_SOURCE.into();
        assets.push(asset);
    }

    Ok(())
}

fn store_media_annex(
    session: &EditorSession,
    store: &ProjectStore,
    source: &ClassicSourceBlob,
) -> Result<BlobId, String> {
    let mut sources = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|existing| existing.native_path != "Scenario.rsrc")
        .cloned()
        .collect::<Vec<_>>();
    sources.push(source.clone());
    sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    let annex_bytes = serde_json::to_vec(
        &json!({"format": "providence-classic-source-annex-v1", "files": sources}),
    )
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;

    Ok(annex_blob)
}

fn media_failures(catalog: &ClassicMediaCatalog) -> Vec<Value> {
    catalog
        .failures
        .iter()
        .map(|failure| {
            json!({
                "resourceType": failure.resource.resource_type,
                "resourceId": failure.resource.resource_id,
                "label": failure.label,
                "classicPayloadBytes": failure.classic_payload_bytes,
                "reason": failure.reason,
            })
        })
        .collect::<Vec<_>>()
}

fn media_ambiguities(
    catalog: &ClassicMediaCatalog,
    text_occurrences: &BTreeMap<ClassicResourceKey, usize>,
) -> Vec<Value> {
    let mut ambiguous_resources = catalog
        .ambiguous_resources
        .iter()
        .map(|ambiguity| {
            json!({
                "resourceType": ambiguity.resource.resource_type,
                "resourceId": ambiguity.resource.resource_id,
                "occurrences": ambiguity.occurrences,
            })
        })
        .collect::<Vec<_>>();
    ambiguous_resources.extend(
        text_occurrences
            .iter()
            .filter(|(_, occurrences)| **occurrences > 1)
            .map(|(resource, occurrences)| {
                json!({
                    "resourceType": resource.resource_type,
                    "resourceId": resource.resource_id,
                    "occurrences": occurrences,
                })
            }),
    );
    ambiguous_resources.sort_by(|left, right| {
        left["resourceType"]
            .as_str()
            .cmp(&right["resourceType"].as_str())
            .then_with(|| {
                left["resourceId"]
                    .as_i64()
                    .cmp(&right["resourceId"].as_i64())
            })
    });
    ambiguous_resources
}

fn prepare_media_source(
    store: &ProjectStore,
    params: &Value,
) -> Result<
    (
        ClassicSourceBlob,
        ClassicMediaCatalog,
        Vec<DecodedClassicTextAsset>,
    ),
    String,
> {
    let directory = PathBuf::from(required_string(params, "directory")?);
    let path = resolve_classic_native_file(&directory, "Scenario.rsrc")
        .ok_or_else(|| format!("{} is required", directory.join("Scenario.rsrc").display()))?;
    let source_bytes =
        fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let catalog = derive_classic_media_catalog(&source_bytes)
        .map_err(|error| format!("Scenario.rsrc media catalog is invalid: {error}"))?;
    let text_catalog = decode_classic_text_assets(&source_bytes, "Scenario.rsrc")
        .map_err(|error| format!("Scenario.rsrc text catalog is invalid: {error}"))?;
    let source_blob = store
        .put_blob(&source_bytes)
        .map_err(|error| error.to_string())?;
    let source = ClassicSourceBlob {
        native_path: "Scenario.rsrc".into(),
        blob: source_blob,
        byte_length: source_bytes.len() as u64,
    };

    Ok((source, catalog, text_catalog))
}
