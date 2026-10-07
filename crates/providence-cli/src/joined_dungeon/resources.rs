use providence_core::codecs::CLASSIC_SCENARIO_RESOURCE_SOURCE;
use providence_core::codecs::ClassicMediaAsset;
use providence_core::codecs::classic_landlook_for_media_asset;
use providence_core::codecs::classic_media_asset_identity;
use providence_core::codecs::decode_classic_text_assets;
use providence_core::codecs::derive_classic_media_catalog;
use providence_core::codecs::is_classic_dungeon_tileset;
use providence_core::model::AssetDescriptor;
use providence_core::model::BlobId;
use providence_core::model::ProjectSnapshot;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;

use super::sources::ScenarioSources;
use providence_core::codecs::{ClassicMediaCatalog, DecodedClassicTextAsset};

pub(super) fn populate_resources(
    snapshot: &mut ProjectSnapshot,
    sources: &ScenarioSources,
) -> Result<serde_json::Value, String> {
    let bytes = &sources.scenario_resources;
    let text =
        decode_classic_text_assets(bytes, "Scenario.rsrc").map_err(|error| error.to_string())?;
    let media = derive_classic_media_catalog(bytes).map_err(|error| error.to_string())?;
    let catalog = text_resource_catalog(&text);
    let catalog_sha256 = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&catalog).expect("Classic resource catalog serializes"))
    );
    snapshot.assets = text.iter().map(|decoded| decoded.asset.clone()).collect();
    snapshot
        .assets
        .extend(media.assets.iter().map(probe_classic_media_descriptor));
    Ok(resource_report(bytes, &text, &media, catalog_sha256))
}

fn text_resource_catalog(
    classic_text_assets: &[DecodedClassicTextAsset],
) -> Vec<serde_json::Value> {
    classic_text_assets
        .iter()
        .map(|decoded| {
            let resource = decoded
                .asset
                .classic_resource
                .as_ref()
                .expect("decoded Classic text assets have resource keys");
            json!({
                "resourceType": resource.resource_type,
                "resourceId": resource.resource_id,
                "name": decoded.resource_name,
                "attributes": decoded.resource_attributes,
                "runtimeBytes": decoded.asset.byte_length,
                "runtimeSha256": decoded.asset.blob.0.strip_prefix("sha256:").unwrap_or(&decoded.asset.blob.0),
                "classicBytes": decoded.asset.classic_payload_byte_length,
                "classicSha256": decoded.asset.classic_payload_blob.as_ref().and_then(|blob| blob.0.strip_prefix("sha256:")),
            })
        })
        .collect::<Vec<_>>()
}

fn resource_report(
    bytes: &[u8],
    text: &[DecodedClassicTextAsset],
    media: &ClassicMediaCatalog,
    catalog_sha256: String,
) -> serde_json::Value {
    json!({
        "bytes": bytes.len(),
        "sha256": format!("{:x}", Sha256::digest(bytes)),
        "textResources": text.iter().filter(|asset| asset.asset.classic_resource.as_ref().is_some_and(|resource| resource.resource_type == "TEXT")).count(),
        "styleResources": text.iter().filter(|asset| asset.asset.classic_resource.as_ref().is_some_and(|resource| resource.resource_type == "styl")).count(),
        "mediaAssets": media.assets.len(),
        "mediaAmbiguities": media.ambiguous_resources.len(),
        "mediaDecodeFailures": media.failures.len(),
        "resourceCatalogSha256": catalog_sha256,
    })
}

fn probe_classic_media_descriptor(asset: &ClassicMediaAsset) -> AssetDescriptor {
    let landlook = classic_landlook_for_media_asset(asset);
    let dungeon_tileset = is_classic_dungeon_tileset(asset);
    AssetDescriptor {
        identity: classic_media_asset_identity(asset),
        label: asset.label.clone(),
        kind: asset.kind.clone(),
        mime_type: Some(asset.mime_type.clone()),
        classic_resource: Some(asset.resource.clone()),
        scenario_music_slot: None,
        blob: BlobId(format!(
            "sha256:{:x}",
            Sha256::digest(&asset.runtime_payload)
        )),
        byte_length: asset.runtime_payload.len() as u64,
        classic_payload_blob: Some(BlobId(format!(
            "sha256:{:x}",
            Sha256::digest(&asset.classic_payload)
        ))),
        classic_payload_byte_length: Some(asset.classic_payload.len() as u64),
        extension: Some(asset.extension.clone()),
        width: asset.width,
        height: asset.height,
        duration_ms: asset.duration_ms,
        sample_rate: asset.sample_rate,
        channels: asset.channels,
        tile_width: landlook.map(|_| 32).or(dungeon_tileset.then_some(16)),
        tile_height: landlook.map(|_| 32).or(dungeon_tileset.then_some(16)),
        columns: landlook.map(|_| 20).or(dungeon_tileset.then_some(4)),
        rows: landlook.map(|_| 10).or(dungeon_tileset.then_some(4)),
        landlook: landlook.or(dungeon_tileset.then_some(2)),
        base_tile: None,
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    }
}
