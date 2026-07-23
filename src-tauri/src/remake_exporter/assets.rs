use super::portable::{portable_source_label, portable_value};
use super::REMAKE_CLASSIC_FORMAT_VERSION;
use crate::error::{IoPath, ProvidenceError, Result};
use crate::project::{
    ManagedAsset, ManagedAssetExportState, ManagedAssetKind, ManagedAssetLibraryScope,
    ProvidenceProject, ResourceAsset, SourceFileRole,
};
use crate::resource_fork::parse_resource_fork_entries;
use crate::resource_preview::{inspect_resource_preview, sound::decode_snd_to_wav};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

const ASSET_DIR: &str = "assets/managed";
const RUNTIME_IMAGE_DIR: &str = "media/images";
const RUNTIME_PICTURE_DIR: &str = "media/pictures";
const RUNTIME_SOUND_DIR: &str = "media/sounds";

#[derive(Debug, Clone)]
struct PackagedRuntimeMedia {
    relative_path: String,
    bytes: u64,
    sha256: String,
    media_type: String,
}

#[derive(Debug, Clone)]
struct ScenarioPicturePayload {
    source_file: String,
    name: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct PackagedPayload {
    relative_path: String,
    file_name: String,
    bytes: u64,
    sha256: String,
    media_type: String,
    source: String,
    runtime_media: Option<PackagedRuntimeMedia>,
}

#[derive(Debug, Clone)]
pub(crate) struct PackagedAssets {
    pub(crate) managed_assets: Vec<Value>,
    pub(crate) written_files: Vec<String>,
    catalog: Value,
    monster_icon_overrides: Value,
    scenario_icon_resources: Value,
}

impl PackagedAssets {
    pub(crate) fn document(&self) -> Value {
        json!({
            "schemaVersion": REMAKE_CLASSIC_FORMAT_VERSION,
            "managedAssets": &self.managed_assets,
            "catalog": &self.catalog,
            "monsterIconOverrides": &self.monster_icon_overrides,
            "scenarioIconResources": &self.scenario_icon_resources,
        })
    }
}

pub(crate) fn package_assets(
    project: &ProvidenceProject,
    project_dir: &Path,
    output_dir: &Path,
) -> Result<PackagedAssets> {
    let mut managed_assets = Vec::new();
    let mut written_files = Vec::new();
    let mut payloads = BTreeMap::new();

    for asset in project.assets.iter().filter(|asset| {
        !matches!(
            asset.library_scope,
            Some(ManagedAssetLibraryScope::CustomLibrary)
        ) && !matches!(asset.kind, ManagedAssetKind::Music)
    }) {
        validate_resource_identity(asset)?;
        if !matches!(asset.export_state, ManagedAssetExportState::Ready) {
            return Err(ProvidenceError::message(format!(
                "Managed asset '{}' is not export-ready",
                asset.label
            )));
        }
        let (media_type, bytes) = read_payload(asset, project_dir)?;
        let payload = write_payload(asset, &bytes, &media_type, output_dir)?;
        let key = (asset.resource_type.clone(), asset.resource_id);
        if payloads.insert(key, payload.clone()).is_some() {
            return Err(ProvidenceError::message(format!(
                "Duplicate managed resource {} {}",
                asset.resource_type, asset.resource_id
            )));
        }
        written_files.push(payload.relative_path.clone());
        if let Some(runtime_media) = &payload.runtime_media {
            written_files.push(runtime_media.relative_path.clone());
        }
        managed_assets.push(managed_asset_document(asset, &payload));
    }
    package_scenario_pictures(
        project,
        project_dir,
        output_dir,
        &mut payloads,
        &mut written_files,
    )?;
    package_shared_special_land_tiles(project, output_dir, &mut payloads, &mut written_files)?;
    managed_assets.sort_by(|left, right| value_string(left, "id").cmp(&value_string(right, "id")));
    written_files.sort();

    let catalog = catalog_document(project, &payloads)?;
    let monster_icon_overrides = sanitized_icon_metadata(&project.monster_icon_overrides)?;
    let scenario_icon_resources = sanitized_icon_metadata(&project.scenario_icon_resources)?;
    Ok(PackagedAssets {
        managed_assets,
        written_files,
        catalog,
        monster_icon_overrides,
        scenario_icon_resources,
    })
}

fn read_payload(asset: &ManagedAsset, project_dir: &Path) -> Result<(String, Vec<u8>)> {
    let resource_path = asset.resource_path.trim();
    if resource_path.is_empty() {
        return Err(ProvidenceError::message(format!(
            "Managed asset '{}' has no canonical resource payload",
            asset.label
        )));
    }
    let payload = if resource_path.starts_with("data:") {
        decode_data_uri(resource_path, &asset.label)?
    } else {
        let relative_path = Path::new(resource_path);
        if relative_path.is_absolute()
            || relative_path.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
            || relative_path.components().any(|component| {
                component
                    .as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("raw-sources")
            })
        {
            return Err(ProvidenceError::message(format!(
                "Managed asset '{}' does not use a project-relative canonical payload path",
                asset.label
            )));
        }
        let path = project_dir.join(relative_path);
        (
            "application/octet-stream".to_string(),
            fs::read(&path).with_path(&path)?,
        )
    };
    Ok(payload)
}

fn decode_data_uri(uri: &str, label: &str) -> Result<(String, Vec<u8>)> {
    let (header, encoded) = uri.split_once(',').ok_or_else(|| {
        ProvidenceError::message(format!("Managed asset '{label}' has a malformed data URI"))
    })?;
    if !header.ends_with(";base64") {
        return Err(ProvidenceError::message(format!(
            "Managed asset '{label}' data URI is not base64 encoded"
        )));
    }
    let media_type = header
        .trim_start_matches("data:")
        .trim_end_matches(";base64")
        .to_string();
    let bytes = STANDARD.decode(encoded).map_err(|error| {
        ProvidenceError::message(format!(
            "Managed asset '{label}' has invalid base64 payload data: {error}"
        ))
    })?;
    Ok((media_type, bytes))
}

fn write_payload(
    asset: &ManagedAsset,
    bytes: &[u8],
    media_type: &str,
    output_dir: &Path,
) -> Result<PackagedPayload> {
    write_resource_payload(
        &asset.resource_type,
        asset.resource_id,
        &asset.label,
        bytes,
        media_type,
        "managed",
        output_dir,
    )
}

fn write_resource_payload(
    resource_type: &str,
    resource_id: i16,
    label: &str,
    bytes: &[u8],
    media_type: &str,
    source: &str,
    output_dir: &Path,
) -> Result<PackagedPayload> {
    let sha256 = hex::encode(Sha256::digest(bytes));
    let resource_type_token = resource_type_file_token(resource_type);
    let id = if resource_id < 0 {
        format!("neg-{}", resource_id.unsigned_abs())
    } else {
        resource_id.to_string()
    };
    let extension = resource_extension(resource_type);
    let file_name = format!("{resource_type_token}-{id}-{}.{}", &sha256[..12], extension);
    let relative_path = format!("{ASSET_DIR}/{file_name}");
    let path = output_dir.join(PathBuf::from(&relative_path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    fs::write(&path, bytes).with_path(&path)?;
    let runtime_media = if resource_type == "snd " {
        let wav = decode_snd_to_wav(bytes).map_err(|error| {
            ProvidenceError::message(format!(
                "Managed sound '{}' cannot be decoded for Realmz Remake runtime media: {error}",
                label
            ))
        })?;
        Some(write_runtime_sound(resource_id, &wav, output_dir)?)
    } else if resource_type == "PICT" || resource_type == "cicn" {
        Some(write_runtime_image(
            resource_type,
            resource_id,
            label,
            bytes,
            output_dir,
        )?)
    } else {
        None
    };
    Ok(PackagedPayload {
        relative_path,
        file_name,
        bytes: bytes.len() as u64,
        sha256,
        media_type: media_type.to_string(),
        source: source.to_string(),
        runtime_media,
    })
}

fn write_runtime_sound(
    resource_id: i16,
    wav: &[u8],
    output_dir: &Path,
) -> Result<PackagedRuntimeMedia> {
    let sha256 = hex::encode(Sha256::digest(wav));
    let id = if resource_id < 0 {
        format!("neg-{}", resource_id.unsigned_abs())
    } else {
        resource_id.to_string()
    };
    let relative_path = format!("{RUNTIME_SOUND_DIR}/snd-{id}-{}.wav", &sha256[..12]);
    let path = output_dir.join(PathBuf::from(&relative_path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    fs::write(&path, wav).with_path(&path)?;
    Ok(PackagedRuntimeMedia {
        relative_path,
        bytes: wav.len() as u64,
        sha256,
        media_type: "audio/wav".to_string(),
    })
}

fn write_runtime_image(
    resource_type: &str,
    resource_id: i16,
    label: &str,
    bytes: &[u8],
    output_dir: &Path,
) -> Result<PackagedRuntimeMedia> {
    let preview = inspect_resource_preview(resource_type, bytes)?;
    let display_type = resource_type.trim();
    let data_url = preview.data_url.ok_or_else(|| {
        let detail = preview
            .diagnostics
            .first()
            .map(|diagnostic| diagnostic.message.as_str())
            .unwrap_or("no decoded image was produced");
        ProvidenceError::message(format!(
            "{display_type} '{}' cannot be decoded for Realmz Remake runtime media: {detail}",
            label,
        ))
    })?;
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(|| {
            ProvidenceError::message(format!(
                "{display_type} '{}' did not produce PNG runtime media",
                label,
            ))
        })?;
    let png = STANDARD.decode(encoded).map_err(|error| {
        ProvidenceError::message(format!(
            "{display_type} '{}' produced invalid PNG runtime media: {error}",
            label,
        ))
    })?;
    let sha256 = hex::encode(Sha256::digest(&png));
    let id = if resource_id < 0 {
        format!("neg-{}", resource_id.unsigned_abs())
    } else {
        resource_id.to_string()
    };
    let relative_path = match resource_type {
        "PICT" => format!("{RUNTIME_PICTURE_DIR}/pict-{id}-{}.png", &sha256[..12]),
        "cicn" => format!("{RUNTIME_IMAGE_DIR}/cicn-{id}-{}.png", &sha256[..12]),
        _ => {
            return Err(ProvidenceError::message(format!(
                "No Realmz Remake runtime image path is defined for {display_type}"
            )))
        }
    };
    let path = output_dir.join(PathBuf::from(&relative_path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    fs::write(&path, &png).with_path(&path)?;
    Ok(PackagedRuntimeMedia {
        relative_path,
        bytes: png.len() as u64,
        sha256,
        media_type: "image/png".to_string(),
    })
}

fn package_scenario_pictures(
    project: &ProvidenceProject,
    project_dir: &Path,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let mut missing = Vec::new();
    for asset in project
        .asset_catalog
        .pictures
        .iter()
        .filter(|asset| asset.resource_type == "PICT" && is_scenario_owned_picture(asset))
    {
        let resource_id = i16::try_from(asset.resource_id).map_err(|_| {
            ProvidenceError::message(format!(
                "Scenario picture resource ID {} is outside the Classic signed 16-bit range",
                asset.resource_id
            ))
        })?;
        if !payloads.contains_key(&("PICT".to_string(), resource_id)) {
            missing.push((asset, resource_id));
        }
    }
    if missing.is_empty() {
        return Ok(());
    }
    if !project.source.requires_compatibility_annex() {
        return Err(ProvidenceError::message(format!(
            "Scenario-owned PICT {} has no canonical managed payload",
            missing[0].1
        )));
    }

    let candidates = preserved_scenario_picture_payloads(project, project_dir)?;
    for (asset, resource_id) in missing {
        let candidate = select_scenario_picture_payload(asset, &candidates)?;
        let label = asset
            .name
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| (!candidate.name.trim().is_empty()).then_some(candidate.name.as_str()))
            .map(str::to_string)
            .unwrap_or_else(|| format!("Scenario picture {resource_id}"));
        let payload = write_resource_payload(
            "PICT",
            resource_id,
            &label,
            &candidate.bytes,
            "image/pict",
            &format!("Preserved scenario resource {}", candidate.source_file),
            output_dir,
        )?;
        written_files.push(payload.relative_path.clone());
        if let Some(runtime_media) = &payload.runtime_media {
            written_files.push(runtime_media.relative_path.clone());
        }
        payloads.insert(("PICT".to_string(), resource_id), payload);
    }
    Ok(())
}

fn is_scenario_owned_picture(asset: &ResourceAsset) -> bool {
    let source = asset.source.to_ascii_lowercase();
    asset.id.starts_with("scenario-pict-")
        || source.starts_with("scenario resource fork:")
        || (source.starts_with("browser import:")
            && !source.contains("bundled realmz reference pict"))
}

fn preserved_scenario_picture_payloads(
    project: &ProvidenceProject,
    project_dir: &Path,
) -> Result<BTreeMap<i16, Vec<ScenarioPicturePayload>>> {
    let raw_sources_dir = if project.source.raw_sources_dir.trim().is_empty() {
        PathBuf::from("raw-sources")
    } else {
        validated_relative_path(
            &project.source.raw_sources_dir,
            "Imported project raw-sources directory",
        )?
    };
    let raw_sources_dir = project_dir.join(raw_sources_dir);
    let mut source_files = project
        .source
        .files
        .iter()
        .filter(|file| matches!(&file.role, SourceFileRole::ResourceFork))
        .collect::<Vec<_>>();
    source_files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let mut pictures = BTreeMap::<i16, Vec<ScenarioPicturePayload>>::new();
    for source_file in source_files {
        let relative_path = validated_relative_path(
            &source_file.relative_path,
            &format!("Preserved resource fork '{}'", source_file.name),
        )?;
        let path = raw_sources_dir.join(relative_path);
        if !path.is_file() {
            continue;
        }
        let bytes = fs::read(&path).with_path(&path)?;
        for entry in parse_resource_fork_entries(&bytes)
            .into_iter()
            .filter(|entry| entry.resource_type == "PICT")
        {
            pictures
                .entry(entry.id)
                .or_default()
                .push(ScenarioPicturePayload {
                    source_file: source_file.name.clone(),
                    name: entry.name,
                    bytes: entry.data,
                });
        }
    }
    Ok(pictures)
}

fn select_scenario_picture_payload<'a>(
    asset: &ResourceAsset,
    candidates: &'a BTreeMap<i16, Vec<ScenarioPicturePayload>>,
) -> Result<&'a ScenarioPicturePayload> {
    let resource_id = i16::try_from(asset.resource_id).map_err(|_| {
        ProvidenceError::message(format!(
            "Scenario picture resource ID {} is outside the Classic signed 16-bit range",
            asset.resource_id
        ))
    })?;
    let available = candidates.get(&resource_id).ok_or_else(|| {
        ProvidenceError::message(format!(
            "Scenario-owned PICT {resource_id} has no managed payload and was not found in the project raw-source snapshot"
        ))
    })?;
    let source_hint = scenario_picture_source_hint(asset);
    let matching = source_hint
        .as_deref()
        .map(|hint| {
            available
                .iter()
                .filter(|candidate| source_file_matches(&candidate.source_file, hint))
                .collect::<Vec<_>>()
        })
        .filter(|matching| !matching.is_empty())
        .unwrap_or_else(|| available.iter().collect::<Vec<_>>());
    let first = matching[0];
    if matching
        .iter()
        .skip(1)
        .any(|candidate| candidate.bytes != first.bytes)
    {
        return Err(ProvidenceError::message(format!(
            "Scenario-owned PICT {resource_id} is ambiguous across preserved resource forks: {}",
            matching
                .iter()
                .map(|candidate| candidate.source_file.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    Ok(first)
}

fn scenario_picture_source_hint(asset: &ResourceAsset) -> Option<String> {
    if let Some(source) = asset.source.strip_prefix("Scenario resource fork: ") {
        return Some(source.trim().to_string());
    }
    let source = asset.source.strip_prefix("Browser import: ")?;
    let suffix = format!(" PICT {}", asset.resource_id);
    source
        .strip_suffix(&suffix)
        .map(|value| value.trim().to_string())
}

fn source_file_matches(source_file: &str, hint: &str) -> bool {
    let source_file = source_file.replace('\\', "/");
    let hint = hint.replace('\\', "/");
    source_file.eq_ignore_ascii_case(&hint)
        || source_file
            .rsplit('/')
            .next()
            .is_some_and(|name| name.eq_ignore_ascii_case(hint.rsplit('/').next().unwrap_or(&hint)))
}

fn validated_relative_path(value: &str, label: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    if value.trim().is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(ProvidenceError::message(format!(
            "{label} must use a project-relative path"
        )));
    }
    Ok(path.to_path_buf())
}

fn package_shared_special_land_tiles(
    project: &ProvidenceProject,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let wanted = referenced_special_land_tile_ids(project)
        .into_iter()
        .filter(|id| !payloads.contains_key(&("cicn".to_string(), *id)))
        .collect::<BTreeSet<_>>();
    let resources = crate::realmz_reference::resources("cicn", &wanted)?;
    let found = resources.keys().copied().collect::<BTreeSet<_>>();
    let missing = wanted.difference(&found).copied().collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(ProvidenceError::message(format!(
            "Realmz Remake export cannot resolve referenced shared special-land cicn resources: {}",
            missing
                .iter()
                .map(i16::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    for (id, resource) in resources {
        let label = if resource.name.trim().is_empty() {
            format!("Realmz shared special land tile {id}")
        } else {
            resource.name
        };
        let payload = write_resource_payload(
            "cicn",
            id,
            &label,
            &resource.data,
            "image/cicn",
            "Realmz reference resources",
            output_dir,
        )?;
        written_files.push(payload.relative_path.clone());
        if let Some(runtime_media) = &payload.runtime_media {
            written_files.push(runtime_media.relative_path.clone());
        }
        payloads.insert(("cicn".to_string(), id), payload);
    }
    Ok(())
}

fn referenced_special_land_tile_ids(project: &ProvidenceProject) -> BTreeSet<i16> {
    project
        .maps
        .iter()
        .flat_map(|map| map.tiles.iter())
        .filter_map(|value| {
            if *value >= 0 {
                return None;
            }
            let mut id = *value;
            while id < -999 {
                id += 1000;
            }
            Some(id)
        })
        .collect()
}

fn managed_asset_document(asset: &ManagedAsset, payload: &PackagedPayload) -> Value {
    let mut value = json!({
        "id": &asset.id,
        "label": &asset.label,
        "kind": asset.kind,
        "resourceType": &asset.resource_type,
        "resourceId": asset.resource_id,
        "width": asset.width,
        "height": asset.height,
        "durationMs": asset.duration_ms,
        "sampleRate": asset.sample_rate,
        "channels": asset.channels,
        "provenance": &asset.provenance,
        "linkedEntity": &asset.linked_entity,
        "payloadPath": &payload.relative_path,
        "payloadFileName": &payload.file_name,
        "payloadEncoding": "classic-resource-data",
        "payloadMediaType": &payload.media_type,
        "payloadBytes": payload.bytes,
        "payloadSha256": &payload.sha256,
    });
    add_runtime_media(&mut value, payload);
    value
}

fn catalog_document(
    project: &ProvidenceProject,
    payloads: &BTreeMap<(String, i16), PackagedPayload>,
) -> Result<Value> {
    let mut tilesets = Vec::new();
    for tileset in &project.asset_catalog.tilesets {
        let mut value = json!({
            "id": &tileset.id,
            "landlook": tileset.landlook,
            "name": &tileset.name,
            "source": portable_source_label(&tileset.source),
            "available": tileset.available,
            "pictId": tileset.pict_id,
            "tileWidth": tileset.tile_width,
            "tileHeight": tileset.tile_height,
            "columns": tileset.columns,
            "rows": tileset.rows,
            "custom": tileset.custom,
            "baseTile": tileset.base_tile,
        });
        if let Some(payload) = tileset
            .pict_id
            .and_then(|id| i16::try_from(id).ok())
            .and_then(|id| payloads.get(&("PICT".to_string(), id)))
        {
            add_payload_fields(&mut value, payload);
        }
        tilesets.push(value);
    }
    tilesets.sort_by(|left, right| value_string(left, "id").cmp(&value_string(right, "id")));

    Ok(json!({
        "tilesets": tilesets,
        "pictures": resource_catalog(&project.asset_catalog.pictures, "PICT", payloads)?,
        "icons": nonnegative_resource_catalog(&project.asset_catalog.icons, "cicn", payloads)?,
        "specialLandTiles": special_land_tile_catalog(project, payloads)?,
        "sounds": resource_catalog(&project.asset_catalog.sounds, "snd ", payloads)?,
    }))
}

fn validate_resource_identity(asset: &ManagedAsset) -> Result<()> {
    let is_negative_cicn = asset.resource_type == "cicn" && asset.resource_id < 0;
    let is_special_land_tile = matches!(asset.kind, ManagedAssetKind::SpecialLandTile);
    if is_negative_cicn != is_special_land_tile {
        return Err(ProvidenceError::message(format!(
            "Managed asset '{}' must use kind special-land-tile exactly when it uses a negative cicn resource ID",
            asset.label
        )));
    }
    Ok(())
}

fn nonnegative_resource_catalog(
    existing: &[ResourceAsset],
    resource_type: &str,
    payloads: &BTreeMap<(String, i16), PackagedPayload>,
) -> Result<Vec<Value>> {
    let existing = existing
        .iter()
        .filter(|asset| asset.resource_id >= 0)
        .cloned()
        .collect::<Vec<_>>();
    let payloads = payloads
        .iter()
        .filter_map(|((payload_type, payload_id), payload)| {
            (payload_type == resource_type && *payload_id >= 0)
                .then(|| ((payload_type.clone(), *payload_id), payload.clone()))
        })
        .collect::<BTreeMap<_, _>>();
    resource_catalog(&existing, resource_type, &payloads)
}

fn special_land_tile_catalog(
    project: &ProvidenceProject,
    payloads: &BTreeMap<(String, i16), PackagedPayload>,
) -> Result<Vec<Value>> {
    let mut records = BTreeMap::<i32, Value>::new();
    for asset in project
        .asset_catalog
        .icons
        .iter()
        .filter(|asset| asset.resource_id < 0)
    {
        if records
            .insert(
                asset.resource_id,
                json!({
                    "id": &asset.id,
                    "resourceType": &asset.resource_type,
                    "resourceId": asset.resource_id,
                    "name": &asset.name,
                    "source": portable_source_label(&asset.source),
                }),
            )
            .is_some()
        {
            return Err(ProvidenceError::message(format!(
                "Duplicate special land tile catalog resource {}",
                asset.resource_id
            )));
        }
    }
    for ((resource_type, resource_id), payload) in payloads
        .iter()
        .filter(|((resource_type, resource_id), _)| resource_type == "cicn" && *resource_id < 0)
    {
        let record = records.entry(i32::from(*resource_id)).or_insert_with(|| {
            json!({
                "id": format!("resource:{resource_type}:{resource_id}"),
                "resourceType": resource_type,
                "resourceId": resource_id,
                "source": &payload.source,
            })
        });
        add_payload_fields(record, payload);
    }
    Ok(records.into_values().collect())
}

fn resource_catalog(
    existing: &[ResourceAsset],
    resource_type: &str,
    payloads: &BTreeMap<(String, i16), PackagedPayload>,
) -> Result<Vec<Value>> {
    let mut records = BTreeMap::<i32, Value>::new();
    for asset in existing {
        if records.contains_key(&asset.resource_id) {
            return Err(ProvidenceError::message(format!(
                "Duplicate {} catalog resource {}",
                resource_type, asset.resource_id
            )));
        }
        records.insert(
            asset.resource_id,
            json!({
                "id": &asset.id,
                "resourceType": &asset.resource_type,
                "resourceId": asset.resource_id,
                "name": &asset.name,
                "source": portable_source_label(&asset.source),
            }),
        );
    }
    for ((payload_type, payload_id), payload) in payloads {
        if payload_type != resource_type {
            continue;
        }
        let record = records.entry(i32::from(*payload_id)).or_insert_with(|| {
            json!({
                "id": format!("resource:{resource_type}:{payload_id}"),
                "resourceType": resource_type,
                "resourceId": payload_id,
                "source": "managed",
            })
        });
        add_payload_fields(record, payload);
    }
    Ok(records.into_values().collect())
}

fn add_payload_fields(value: &mut Value, payload: &PackagedPayload) {
    let object = value
        .as_object_mut()
        .expect("asset catalog rows are objects");
    object.insert("payloadPath".to_string(), json!(&payload.relative_path));
    object.insert("payloadFileName".to_string(), json!(&payload.file_name));
    object.insert(
        "payloadEncoding".to_string(),
        json!("classic-resource-data"),
    );
    object.insert("payloadBytes".to_string(), json!(payload.bytes));
    object.insert("payloadSha256".to_string(), json!(&payload.sha256));
    add_runtime_media(value, payload);
}

fn add_runtime_media(value: &mut Value, payload: &PackagedPayload) {
    let Some(runtime_media) = &payload.runtime_media else {
        return;
    };
    value
        .as_object_mut()
        .expect("asset catalog rows are objects")
        .insert(
            "runtimeMedia".to_string(),
            json!({
                "path": &runtime_media.relative_path,
                "mediaType": &runtime_media.media_type,
                "bytes": runtime_media.bytes,
                "sha256": &runtime_media.sha256,
            }),
        );
}

fn sanitized_icon_metadata<T: serde::Serialize>(records: &T) -> Result<Value> {
    portable_value(records)
}

fn resource_extension(resource_type: &str) -> &'static str {
    match resource_type {
        "PICT" => "pict",
        "cicn" => "cicn",
        "snd " => "snd",
        "TEXT" => "txt",
        "styl" => "styl",
        _ => "bin",
    }
}

pub(crate) fn resource_type_file_token(resource_type: &str) -> String {
    match resource_type {
        "PICT" => "pict".to_string(),
        "cicn" => "cicn".to_string(),
        "snd " => "snd".to_string(),
        "TEXT" => "text".to_string(),
        "styl" => "styl".to_string(),
        other => format!("type-{}", hex::encode(other.as_bytes())),
    }
}

fn value_string(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
