use super::portable::{portable_source_label, portable_value};
use super::REMAKE_CLASSIC_FORMAT_VERSION;
use crate::error::{IoPath, ProvidenceError, Result};
use crate::project::{
    ManagedAsset, ManagedAssetExportState, ManagedAssetKind, ManagedAssetLibraryScope,
    ProvidenceProject, ResourceAsset,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

const ASSET_DIR: &str = "assets/managed";

#[derive(Debug, Clone)]
pub(crate) struct PackagedPayload {
    relative_path: String,
    file_name: String,
    bytes: u64,
    sha256: String,
    media_type: String,
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
        )
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
        managed_assets.push(managed_asset_document(asset, &payload));
    }
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
    let sha256 = hex::encode(Sha256::digest(bytes));
    let resource_type = resource_type_file_token(&asset.resource_type);
    let id = if asset.resource_id < 0 {
        format!("neg-{}", asset.resource_id.unsigned_abs())
    } else {
        asset.resource_id.to_string()
    };
    let extension = resource_extension(&asset.resource_type);
    let file_name = format!("{resource_type}-{id}-{}.{}", &sha256[..12], extension);
    let relative_path = format!("{ASSET_DIR}/{file_name}");
    let path = output_dir.join(PathBuf::from(&relative_path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    fs::write(&path, bytes).with_path(&path)?;
    Ok(PackagedPayload {
        relative_path,
        file_name,
        bytes: bytes.len() as u64,
        sha256,
        media_type: media_type.to_string(),
    })
}

fn managed_asset_document(asset: &ManagedAsset, payload: &PackagedPayload) -> Value {
    json!({
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
    })
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
    for asset in project.assets.iter().filter(|asset| {
        matches!(asset.kind, ManagedAssetKind::SpecialLandTile)
            && !matches!(
                asset.library_scope,
                Some(ManagedAssetLibraryScope::CustomLibrary)
            )
    }) {
        let payload = payloads
            .get(&(asset.resource_type.clone(), asset.resource_id))
            .ok_or_else(|| {
                ProvidenceError::message(format!(
                    "Special land tile '{}' has no packaged payload",
                    asset.label
                ))
            })?;
        let record = records
            .entry(i32::from(asset.resource_id))
            .or_insert_with(|| {
                json!({
                    "id": format!("resource:cicn:{}", asset.resource_id),
                    "resourceType": "cicn",
                    "resourceId": asset.resource_id,
                    "source": "managed",
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
