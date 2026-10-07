use std::collections::BTreeMap;

use super::{
    ApplicationMediaAmbiguity, ApplicationMediaAsset, ApplicationMediaCatalog,
    ApplicationMediaDerivationError, ApplicationMediaFailure, ApplicationMediaSource,
    ApplicationMediaSourceInput, DerivedApplicationMediaLibrary,
    REALMZ_CLASSIC_APPLICATION_LIBRARY_ID, blob_id, rebuilt_application_media_identity,
};
use crate::{
    codecs::{
        ClassicMediaAsset, classic_landlook_for_media_asset, derive_classic_media_catalog,
        is_classic_dungeon_tileset,
    },
    model::{AssetDescriptor, BlobId, StableId},
};

pub fn derive_application_media_library(
    sources: &[ApplicationMediaSourceInput<'_>],
) -> Result<DerivedApplicationMediaLibrary, ApplicationMediaDerivationError> {
    let mut catalog =
        ApplicationMediaCatalog::empty(StableId(REALMZ_CLASSIC_APPLICATION_LIBRARY_ID.into()));
    let mut runtime_payloads = BTreeMap::new();
    for input in sources {
        append_source(input, &mut catalog, &mut runtime_payloads)?;
    }
    sort_catalog(&mut catalog);
    Ok(DerivedApplicationMediaLibrary {
        catalog,
        runtime_payloads,
    })
}

fn append_source(
    input: &ApplicationMediaSourceInput<'_>,
    catalog: &mut ApplicationMediaCatalog,
    runtime_payloads: &mut BTreeMap<BlobId, Vec<u8>>,
) -> Result<(), ApplicationMediaDerivationError> {
    let derived = derive_classic_media_catalog(input.bytes).map_err(|error| {
        ApplicationMediaDerivationError::Decode {
            source: input.native_name.into(),
            error,
        }
    })?;
    let source = StableId(input.identity.into());
    catalog.sources.push(ApplicationMediaSource {
        identity: source.clone(),
        native_name: input.native_name.into(),
        priority: input.priority,
        blob: blob_id(input.bytes),
        byte_length: input.bytes.len() as u64,
    });
    for asset in derived.assets {
        let runtime_blob = retain_payload(runtime_payloads, &asset)?;
        catalog
            .assets
            .push(asset_record(input, &source, asset, runtime_blob));
    }
    catalog
        .ambiguous_resources
        .extend(derived.ambiguous_resources.into_iter().map(|ambiguity| {
            ApplicationMediaAmbiguity {
                source: source.clone(),
                source_priority: input.priority,
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
                source_priority: input.priority,
                resource: failure.resource,
                label: failure.label,
                classic_payload_bytes: failure.classic_payload_bytes,
                reason: failure.reason,
            }),
    );
    Ok(())
}

fn retain_payload(
    runtime_payloads: &mut BTreeMap<BlobId, Vec<u8>>,
    asset: &ClassicMediaAsset,
) -> Result<BlobId, ApplicationMediaDerivationError> {
    let runtime_blob = blob_id(&asset.runtime_payload);
    if runtime_payloads
        .insert(runtime_blob.clone(), asset.runtime_payload.clone())
        .is_some_and(|existing| existing != asset.runtime_payload)
    {
        return Err(ApplicationMediaDerivationError::ConflictingPayload(
            runtime_blob,
        ));
    }
    Ok(runtime_blob)
}

fn asset_record(
    input: &ApplicationMediaSourceInput<'_>,
    source: &StableId,
    asset: ClassicMediaAsset,
    runtime_blob: BlobId,
) -> ApplicationMediaAsset {
    let landlook = classic_landlook_for_media_asset(&asset);
    let dungeon_tileset = is_classic_dungeon_tileset(&asset);
    ApplicationMediaAsset {
        source: source.clone(),
        source_priority: input.priority,
        descriptor: AssetDescriptor {
            identity: rebuilt_application_media_identity(&asset.resource, &asset.kind),
            label: asset.label,
            kind: asset.kind,
            mime_type: Some(asset.mime_type),
            classic_resource: Some(asset.resource),
            scenario_music_slot: None,
            blob: runtime_blob,
            byte_length: asset.runtime_payload.len() as u64,
            classic_payload_blob: Some(blob_id(&asset.classic_payload)),
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
            source: format!("Classic application/{}", input.native_name),
        },
    }
}

fn sort_catalog(catalog: &mut ApplicationMediaCatalog) {
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
