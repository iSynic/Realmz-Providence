use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Cursor,
    path::Path,
};

use providence_core::{
    codecs::{ClassicMediaAsset, derive_classic_media_catalog},
    model::{ClassicResourceKey, StableId},
    rebuilt::{
        ApplicationMediaCatalog, ApplicationMediaResolution, RebuiltV3AssetIndex,
        RebuiltV3AssetRecord,
    },
};
use sha2::{Digest, Sha256};

pub(super) struct Source {
    assets: Vec<ClassicMediaAsset>,
    resource_keys: BTreeSet<ClassicResourceKey>,
    problem_keys: BTreeSet<ClassicResourceKey>,
    pub(super) sha256: Option<String>,
}

pub(super) struct Migration {
    pub(super) asset_identity_rewrites: BTreeMap<String, String>,
    pub(super) scenario_cicn_identities: BTreeMap<i64, String>,
    pub(super) removed_descriptors: usize,
    pub(super) added_descriptors: usize,
    pub(super) refreshed: usize,
    pub(super) preserved_unrefreshable: usize,
}

pub(super) fn inspect(path: &Path) -> Result<Source, String> {
    if !path.is_file() {
        return Ok(Source {
            assets: Vec::new(),
            resource_keys: BTreeSet::new(),
            problem_keys: BTreeSet::new(),
            sha256: None,
        });
    }
    let bytes =
        fs::read(path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let derived = derive_classic_media_catalog(&bytes)
        .map_err(|error| format!("could not inspect {}: {error}", path.display()))?;
    let mut resource_keys = derived
        .assets
        .iter()
        .map(|asset| asset.resource.clone())
        .collect::<BTreeSet<_>>();
    let problem_keys = derived
        .ambiguous_resources
        .iter()
        .map(|resource| resource.resource.clone())
        .chain(
            derived
                .failures
                .iter()
                .map(|resource| resource.resource.clone()),
        )
        .collect::<BTreeSet<_>>();
    resource_keys.extend(problem_keys.iter().cloned());
    Ok(Source {
        assets: derived.assets,
        resource_keys,
        problem_keys,
        sha256: Some(sha256(&bytes)),
    })
}

pub(super) fn migrate(
    index: &mut RebuiltV3AssetIndex,
    files: &mut BTreeMap<String, Vec<u8>>,
    application: &ApplicationMediaCatalog,
    source: &Source,
) -> Result<Migration, String> {
    let mut asset_identity_rewrites = BTreeMap::new();
    let mut removed_descriptors = 0;
    index.assets.retain(|asset| {
        let Some(resource) = resource_key(asset) else {
            return true;
        };
        let application_asset = match application.resolve_resource(&resource, None) {
            ApplicationMediaResolution::Resolved(asset) => Some(asset),
            _ => None,
        };
        let remove = !source.resource_keys.contains(&resource) && application_asset.is_some();
        if remove
            && let Some(application_asset) = application_asset
            && asset.id != application_asset.descriptor.identity
        {
            asset_identity_rewrites.insert(
                asset.id.0.clone(),
                application_asset.descriptor.identity.0.clone(),
            );
        }
        removed_descriptors += usize::from(remove);
        !remove
    });
    let (refreshed, added_descriptors, preserved_unrefreshable) = refresh(
        index,
        files,
        &source.assets,
        &source.problem_keys,
        Some(application),
    )?;
    let scenario_cicn_identities = index
        .assets
        .iter()
        .filter_map(|asset| {
            let resource = resource_key(asset)?;
            (resource.resource_type == "cicn" && source.resource_keys.contains(&resource))
                .then(|| (i64::from(resource.resource_id), asset.id.0.clone()))
        })
        .collect();
    Ok(Migration {
        asset_identity_rewrites,
        scenario_cicn_identities,
        removed_descriptors,
        added_descriptors,
        refreshed,
        preserved_unrefreshable,
    })
}

fn refresh(
    index: &mut RebuiltV3AssetIndex,
    files: &mut BTreeMap<String, Vec<u8>>,
    scenario_media: &[ClassicMediaAsset],
    problem_keys: &BTreeSet<ClassicResourceKey>,
    application: Option<&ApplicationMediaCatalog>,
) -> Result<(usize, usize, usize), String> {
    let by_resource = scenario_media
        .iter()
        .map(|asset| (asset.resource.clone(), asset))
        .collect::<BTreeMap<_, _>>();
    let existing = refresh_existing(index, files, &by_resource, problem_keys)?;
    let added_descriptors = add_missing_cicn(
        index,
        files,
        &by_resource,
        problem_keys,
        application,
        &existing.seen,
    )?;
    index.assets.sort_by(|left, right| left.id.cmp(&right.id));
    Ok((
        existing.refreshed + added_descriptors,
        added_descriptors,
        existing.preserved_unrefreshable,
    ))
}

struct ExistingRefresh {
    seen: BTreeSet<ClassicResourceKey>,
    refreshed: usize,
    preserved_unrefreshable: usize,
}

fn refresh_existing(
    index: &mut RebuiltV3AssetIndex,
    files: &mut BTreeMap<String, Vec<u8>>,
    by_resource: &BTreeMap<ClassicResourceKey, &ClassicMediaAsset>,
    problem_keys: &BTreeSet<ClassicResourceKey>,
) -> Result<ExistingRefresh, String> {
    let mut seen = BTreeSet::new();
    let mut refreshed = 0;
    let mut preserved_unrefreshable = 0;
    for record in &mut index.assets {
        let Some(resource) = resource_key(record) else {
            continue;
        };
        if problem_keys.contains(&resource) {
            preserved_unrefreshable += 1;
            continue;
        }
        let Some(source) = by_resource.get(&resource) else {
            continue;
        };
        // Equal payloads still claim their resource; another descriptor is ambiguous.
        if !seen.insert(resource.clone()) {
            return Err(format!(
                "source package has multiple descriptors for scenario-owned {} resource {}",
                resource.resource_type, resource.resource_id
            ));
        }
        if files
            .get(&record.path)
            .is_some_and(|prior| runtime_payloads_match(prior, source))
        {
            continue;
        }
        let sha256 = sha256(&source.runtime_payload);
        let path = format!("assets/media/{sha256}.{}", source.extension);
        *record = refreshed_record(record, source, sha256, path.clone());
        files.insert(path, source.runtime_payload.clone());
        refreshed += 1;
    }
    Ok(ExistingRefresh {
        seen,
        refreshed,
        preserved_unrefreshable,
    })
}

fn add_missing_cicn(
    index: &mut RebuiltV3AssetIndex,
    files: &mut BTreeMap<String, Vec<u8>>,
    by_resource: &BTreeMap<ClassicResourceKey, &ClassicMediaAsset>,
    problem_keys: &BTreeSet<ClassicResourceKey>,
    application: Option<&ApplicationMediaCatalog>,
    seen: &BTreeSet<ClassicResourceKey>,
) -> Result<usize, String> {
    let mut added_descriptors = 0;
    for (resource, source) in by_resource {
        if resource.resource_type != "cicn"
            || seen.contains(resource)
            || problem_keys.contains(resource)
        {
            continue;
        }
        let sha256 = sha256(&source.runtime_payload);
        let path = format!("assets/media/{sha256}.{}", source.extension);
        let id = match application.map(|catalog| catalog.resolve_resource(resource, None)) {
            Some(ApplicationMediaResolution::Resolved(asset)) => asset.descriptor.identity.clone(),
            _ => StableId(format!("scenario-cicn-{}", resource.resource_id)),
        };
        if index.assets.iter().any(|record| record.id == id) {
            return Err(format!(
                "source package already uses identity {} for a different resource",
                id.0
            ));
        }
        index
            .assets
            .push(new_cicn_record(source, id, sha256, path.clone()));
        files.insert(path, source.runtime_payload.clone());
        added_descriptors += 1;
    }
    Ok(added_descriptors)
}

fn resource_key(record: &RebuiltV3AssetRecord) -> Option<ClassicResourceKey> {
    Some(ClassicResourceKey {
        resource_type: record.resource_type.clone()?,
        resource_id: record.resource_id?,
    })
}

fn runtime_payloads_match(prior: &[u8], source: &ClassicMediaAsset) -> bool {
    if prior == source.runtime_payload {
        return true;
    }
    if source.mime_type != "image/png" {
        return false;
    }
    let (Some(width), Some(height)) = (source.width, source.height) else {
        return false;
    };
    decoded_png(prior, width, height)
        .zip(decoded_png(&source.runtime_payload, width, height))
        .is_some_and(|(prior_pixels, source_pixels)| prior_pixels == source_pixels)
}

fn decoded_png(bytes: &[u8], expected_width: u32, expected_height: u32) -> Option<Vec<u8>> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().ok()?;
    if reader.info().width != expected_width || reader.info().height != expected_height {
        return None;
    }
    let maximum_output = usize::try_from(expected_width)
        .ok()?
        .checked_mul(usize::try_from(expected_height).ok()?)?
        .checked_mul(4)?;
    let output_size = reader.output_buffer_size()?;
    if output_size > maximum_output {
        return None;
    }
    let mut output = vec![0; output_size];
    let info = reader.next_frame(&mut output).ok()?;
    output.truncate(info.buffer_size());
    Some(output)
}

fn refreshed_record(
    prior: &RebuiltV3AssetRecord,
    source: &ClassicMediaAsset,
    sha256: String,
    path: String,
) -> RebuiltV3AssetRecord {
    RebuiltV3AssetRecord {
        id: prior.id.clone(),
        label: source.label.clone(),
        kind: prior.kind.clone(),
        mime_type: Some(source.mime_type.clone()),
        resource_type: Some(source.resource.resource_type.clone()),
        resource_id: Some(source.resource.resource_id),
        scenario_music_slot: prior.scenario_music_slot,
        bytes: source.runtime_payload.len() as u64,
        sha256,
        path,
        width: source.width,
        height: source.height,
        duration_ms: source.duration_ms,
        sample_rate: source.sample_rate,
        channels: source.channels,
        tile_width: prior.tile_width,
        tile_height: prior.tile_height,
        columns: prior.columns,
        rows: prior.rows,
        landlook: prior.landlook,
        base_tile: prior.base_tile,
    }
}

fn new_cicn_record(
    source: &ClassicMediaAsset,
    id: StableId,
    sha256: String,
    path: String,
) -> RebuiltV3AssetRecord {
    RebuiltV3AssetRecord {
        id,
        label: source.label.clone(),
        kind: "monster-icon".into(),
        mime_type: Some(source.mime_type.clone()),
        resource_type: Some(source.resource.resource_type.clone()),
        resource_id: Some(source.resource.resource_id),
        scenario_music_slot: None,
        bytes: source.runtime_payload.len() as u64,
        sha256,
        path,
        width: source.width,
        height: source.height,
        duration_ms: source.duration_ms,
        sample_rate: source.sample_rate,
        channels: source.channels,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
    }
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod tests;
