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
    Ok(derive_classic_media_catalog_from_entries(&entries))
}

pub fn derive_classic_media_catalog_from_entries(
    entries: &[super::ResourceEntry],
) -> ClassicMediaCatalog {
    derive_classic_media_catalog_with_progress(entries, &|_, _| {})
}

pub fn derive_classic_media_catalog_with_progress(
    entries: &[super::ResourceEntry],
    progress: &(dyn Fn(usize, usize) + Sync),
) -> ClassicMediaCatalog {
    let mut grouped = BTreeMap::<([u8; 4], i16), Vec<_>>::new();
    for entry in entries
        .iter()
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
    let groups = grouped.into_iter().collect::<Vec<_>>();
    let results = decode_groups(&groups, progress);
    for (((resource_type, resource_id), entries), decoded) in groups.into_iter().zip(results) {
        let resource = ClassicResourceKey {
            resource_type: String::from_utf8_lossy(&resource_type).into_owned(),
            resource_id: i32::from(resource_id),
        };
        if entries.len() != 1 {
            ambiguous_resources.push(ClassicMediaAmbiguity {
                resource: resource.clone(),
                occurrences: entries.len(),
            });
        }
        // Castle's native reader selects the first reference-map occurrence.
        // Retain every source entry; decode failure must not select a later duplicate.
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
        match decoded.expect("every native media group has a decode result") {
            Ok(asset) => assets.push(asset),
            Err(reason) => failures.push(ClassicMediaFailure {
                resource,
                label,
                classic_payload_bytes: entry.data.len(),
                reason,
            }),
        }
    }

    ClassicMediaCatalog {
        assets,
        ambiguous_resources,
        failures,
    }
}

type MediaGroup<'a> = (([u8; 4], i16), Vec<&'a super::ResourceEntry>);
type MediaDecode = Option<Result<ClassicMediaAsset, String>>;

fn decode_groups(
    groups: &[MediaGroup<'_>],
    progress: &(dyn Fn(usize, usize) + Sync),
) -> Vec<MediaDecode> {
    let completed = std::sync::atomic::AtomicUsize::new(0);
    progress(0, groups.len());
    let workers = std::thread::available_parallelism()
        .map_or(1, usize::from)
        .min(4);
    let large_scratch = std::sync::Mutex::new(());
    // Each worker holds one bounded codec scratch allocation. Results retain only
    // the catalog payloads that the serial path also retained, in native key order.
    std::thread::scope(|scope| {
        let handles = (0..workers.min(groups.len()))
            .map(|worker| {
                let large_scratch = &large_scratch;
                let completed = &completed;
                scope.spawn(move || {
                    groups
                        .iter()
                        .enumerate()
                        .skip(worker)
                        .step_by(workers)
                        .map(|(index, group)| {
                            // Icons are limited to 512x512. Serialize the larger
                            // picture/sound codecs without changing their limits.
                            let _scratch = (group.0.0 != *b"cicn").then(|| {
                                large_scratch
                                    .lock()
                                    .unwrap_or_else(|error| error.into_inner())
                            });
                            let result = decode_group(group);
                            progress(
                                completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1,
                                groups.len(),
                            );
                            (index, result)
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect::<Vec<_>>();
        let mut results = (0..groups.len()).map(|_| None).collect::<Vec<_>>();
        for handle in handles {
            for (index, decoded) in handle.join().expect("media codec worker panicked") {
                results[index] = decoded;
            }
        }
        results
    })
}

fn decode_group(((resource_type, resource_id), entries): &MediaGroup<'_>) -> MediaDecode {
    let entry = entries[0];
    let resource = ClassicResourceKey {
        resource_type: String::from_utf8_lossy(resource_type).into_owned(),
        resource_id: i32::from(*resource_id),
    };
    let label = if entry.name.trim().is_empty() {
        format!("{} {}", resource.resource_type, resource_id)
    } else {
        entry.name.clone()
    };
    Some(derive_asset(resource, label, entry.attributes, &entry.data))
}

fn derive_asset(
    resource: ClassicResourceKey,
    label: String,
    attributes: u8,
    classic_payload: &[u8],
) -> Result<ClassicMediaAsset, String> {
    match resource.resource_type.as_str() {
        "PICT" => derive_picture(resource, label, attributes, classic_payload),
        "cicn" => derive_icon(resource, label, attributes, classic_payload),
        "snd " => derive_sound(resource, label, attributes, classic_payload),
        _ => Err("resource family is not media".into()),
    }
}

fn derive_picture(
    resource: ClassicResourceKey,
    label: String,
    attributes: u8,
    classic_payload: &[u8],
) -> Result<ClassicMediaAsset, String> {
    let decoded = decode_classic_pict(classic_payload).map_err(|error| error.to_string())?;
    let kind = match (resource.resource_id, decoded.width, decoded.height) {
        (302, 640, 640) | (300..=301 | 303..=310, 640, 320) => "tileset",
        _ => "picture",
    };
    let runtime_payload = encode_runtime_rgba_png(&decoded.rgba, decoded.width, decoded.height)
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

fn derive_icon(
    resource: ClassicResourceKey,
    label: String,
    attributes: u8,
    classic_payload: &[u8],
) -> Result<ClassicMediaAsset, String> {
    let decoded = decode_cicn(classic_payload).map_err(|error| error.to_string())?;
    let runtime_payload = encode_runtime_rgba_png(&decoded.rgba, decoded.width, decoded.height)
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

fn derive_sound(
    resource: ClassicResourceKey,
    label: String,
    attributes: u8,
    classic_payload: &[u8],
) -> Result<ClassicMediaAsset, String> {
    let decoded = decode_classic_snd(classic_payload).map_err(|error| error.to_string())?;
    let runtime_payload = encode_runtime_pcm_wav(
        &decoded.runtime_pcm,
        decoded.sample_rate,
        decoded.channels,
        decoded.bits_per_sample,
    )
    .map_err(|error| error.to_string())?;
    let duration_ms = u32::try_from(decoded.duration_ms())
        .map_err(|_| "decoded sound duration exceeds the portable descriptor".to_string())?;
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
mod tests;
