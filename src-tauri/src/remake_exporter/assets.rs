use super::portable::{portable_source_label, portable_value};
use super::REMAKE_DOCUMENT_SCHEMA_VERSION;
use crate::error::{IoPath, ProvidenceError, Result};
use crate::project::{
    Action, EncounterActionRow, ManagedAsset, ManagedAssetExportState, ManagedAssetKind,
    ManagedAssetLibraryScope, ProvidenceProject, ResourceAsset, SourceFileRole,
};
use crate::resource_fork::parse_resource_fork_entries;
use crate::resource_preview::{
    decode_classic_text, inspect_resource_preview, sound::decode_snd_to_wav,
};
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
const CLASSIC_STYLE_RUN_BYTES: usize = 20;
const MONSTER_ICON_FACING_OFFSET: i32 = 308;

#[derive(Debug, Clone)]
struct PackagedRuntimeMedia {
    relative_path: String,
    bytes: u64,
    sha256: String,
    media_type: String,
}

#[derive(Debug, Clone)]
struct PreservedResourcePayload {
    source_file: String,
    name: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct PackagedPayload {
    has_classic_payload: bool,
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
    scrolling_texts: BTreeMap<i16, Value>,
}

impl PackagedAssets {
    pub(crate) fn document(&self) -> Value {
        json!({
            "schemaVersion": REMAKE_DOCUMENT_SCHEMA_VERSION,
            "managedAssets": &self.managed_assets,
            "catalog": &self.catalog,
            "scrollingTexts": self.scrolling_texts.values().collect::<Vec<_>>(),
            "monsterIconOverrides": &self.monster_icon_overrides,
            "scenarioIconResources": &self.scenario_icon_resources,
        })
    }

    pub(crate) fn scrolling_text(&self, resource_id: i16) -> Option<&Value> {
        self.scrolling_texts.get(&resource_id)
    }
}

pub(crate) fn update_scenario_icon_assets(
    project: &ProvidenceProject,
    output_dir: &Path,
    assets_document: &mut Value,
) -> Result<Vec<String>> {
    let mut payloads = BTreeMap::new();
    let mut written_files = Vec::new();
    package_scenario_icon_resources(project, output_dir, &mut payloads, &mut written_files)?;
    let icon_catalog = assets_document
        .get_mut("catalog")
        .and_then(Value::as_object_mut)
        .and_then(|catalog| catalog.get_mut("icons"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| {
            ProvidenceError::message(
                "Existing Realmz Remake assets document has no catalog.icons array",
            )
        })?;
    for ((resource_type, resource_id), payload) in &payloads {
        let record_index = icon_catalog.iter().position(|record| {
            record
                .get("resourceId")
                .and_then(Value::as_i64)
                .is_some_and(|id| id == i64::from(*resource_id))
        });
        let record = if let Some(index) = record_index {
            &mut icon_catalog[index]
        } else {
            icon_catalog.push(json!({
                "id": format!("resource:{resource_type}:{resource_id}"),
                "resourceType": resource_type,
                "resourceId": resource_id,
                "source": &payload.source,
            }));
            icon_catalog.last_mut().expect("inserted icon catalog row")
        };
        add_payload_fields(record, payload);
    }
    icon_catalog.sort_by_key(|record| {
        record
            .get("resourceId")
            .and_then(Value::as_i64)
            .unwrap_or_default()
    });
    assets_document["monsterIconOverrides"] =
        sanitized_icon_metadata(&project.monster_icon_overrides)?;
    assets_document["scenarioIconResources"] =
        sanitized_icon_metadata(&project.scenario_icon_resources)?;
    written_files.sort();
    Ok(written_files)
}

pub(crate) fn package_assets(
    project: &ProvidenceProject,
    project_dir: &Path,
    output_dir: &Path,
) -> Result<PackagedAssets> {
    let mut managed_assets = Vec::new();
    let mut written_files = Vec::new();
    let mut payloads = BTreeMap::new();
    let mut text_payloads = BTreeMap::new();
    let mut style_payloads = BTreeMap::new();

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
        if asset.resource_type == "TEXT" {
            text_payloads.insert(asset.resource_id, bytes.clone());
        }
        if asset.resource_type == "styl" {
            if style_payloads.insert(asset.resource_id, bytes).is_some() {
                return Err(ProvidenceError::message(format!(
                    "Duplicate managed resource styl {}",
                    asset.resource_id
                )));
            }
            continue;
        }
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
    package_scenario_icon_resources(project, output_dir, &mut payloads, &mut written_files)?;
    package_referenced_scenario_monster_icons(
        project,
        project_dir,
        output_dir,
        &mut payloads,
        &mut written_files,
    )?;
    package_scenario_pictures(
        project,
        project_dir,
        output_dir,
        &mut payloads,
        &mut written_files,
    )?;
    package_scenario_scrolling_texts(
        project,
        project_dir,
        output_dir,
        &mut payloads,
        &mut text_payloads,
        &mut style_payloads,
        &mut written_files,
    )?;
    package_scenario_sounds(
        project,
        project_dir,
        output_dir,
        &mut payloads,
        &mut written_files,
    )?;
    package_scenario_item_icons(project, output_dir, &mut payloads, &mut written_files)?;
    package_scenario_special_land_tiles(
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
    let scrolling_texts = scrolling_text_documents(&payloads, &text_payloads, &style_payloads);
    let monster_icon_overrides = sanitized_icon_metadata(&project.monster_icon_overrides)?;
    let scenario_icon_resources = sanitized_icon_metadata(&project.scenario_icon_resources)?;
    Ok(PackagedAssets {
        managed_assets,
        written_files,
        catalog,
        monster_icon_overrides,
        scenario_icon_resources,
        scrolling_texts,
    })
}

fn scrolling_text_documents(
    payloads: &BTreeMap<(String, i16), PackagedPayload>,
    text_payloads: &BTreeMap<i16, Vec<u8>>,
    style_payloads: &BTreeMap<i16, Vec<u8>>,
) -> BTreeMap<i16, Value> {
    let mut records = BTreeMap::new();
    for (resource_id, text_bytes) in text_payloads {
        let Some(text_payload) = payloads.get(&("TEXT".to_string(), *resource_id)) else {
            continue;
        };
        let text = decode_classic_text(text_bytes);
        let mut record = json!({
            "resourceType": "TEXT",
            "resourceId": resource_id,
            "text": text,
        });
        add_payload_fields(&mut record, text_payload);
        if let Some(presentation) = style_payloads
            .get(resource_id)
            .and_then(|style_bytes| portable_text_presentation(text_bytes, style_bytes))
        {
            record
                .as_object_mut()
                .expect("scrolling-text records are objects")
                .insert("presentation".to_string(), presentation);
        }
        records.insert(*resource_id, record);
    }
    records
}

#[derive(Debug, Clone, Copy)]
struct PortableTextStyle {
    font_id: i16,
    font_size: i16,
    face: u8,
    red: u16,
    green: u16,
    blue: u16,
}

fn portable_text_presentation(text_bytes: &[u8], style_bytes: &[u8]) -> Option<Value> {
    let run_count = usize::from(read_u16_be(style_bytes, 0)?);
    let expected_length = 2usize.checked_add(run_count.checked_mul(CLASSIC_STYLE_RUN_BYTES)?)?;
    if style_bytes.len() != expected_length {
        return None;
    }

    let (visible_start, visible_end) = classic_text_visible_range(text_bytes);
    let mut styles_by_offset = BTreeMap::new();
    for index in 0..run_count {
        let offset = 2 + index * CLASSIC_STYLE_RUN_BYTES;
        let raw_start = read_i32_be(style_bytes, offset)?;
        if raw_start < 0 {
            continue;
        }
        styles_by_offset.insert(
            raw_start as usize,
            PortableTextStyle {
                font_id: read_i16_be(style_bytes, offset + 8)?,
                face: *style_bytes.get(offset + 10)?,
                font_size: read_i16_be(style_bytes, offset + 12)?,
                red: read_u16_be(style_bytes, offset + 14)?,
                green: read_u16_be(style_bytes, offset + 16)?,
                blue: read_u16_be(style_bytes, offset + 18)?,
            },
        );
    }

    let offsets = styles_by_offset.keys().copied().collect::<Vec<_>>();
    let mut runs = Vec::new();
    for (index, raw_start) in offsets.iter().copied().enumerate() {
        let raw_end = offsets
            .get(index + 1)
            .copied()
            .unwrap_or(visible_end)
            .min(visible_end);
        let start = raw_start.clamp(visible_start, visible_end) - visible_start;
        let end = raw_end.clamp(visible_start, visible_end) - visible_start;
        if end <= start {
            continue;
        }
        let style = styles_by_offset[&raw_start];
        let stretch = if style.face & 0x20 != 0 {
            "condensed"
        } else if style.face & 0x40 != 0 {
            "expanded"
        } else {
            "normal"
        };
        runs.push(json!({
            "start": start,
            "end": end,
            "fontId": style.font_id,
            "fontSize": style.font_size.max(1),
            "color": format!(
                "#{:02x}{:02x}{:02x}",
                classic_color_component(style.red),
                classic_color_component(style.green),
                classic_color_component(style.blue),
            ),
            "bold": style.face & 0x01 != 0,
            "italic": style.face & 0x02 != 0,
            "underline": style.face & 0x04 != 0,
            "outline": style.face & 0x08 != 0,
            "shadow": style.face & 0x10 != 0,
            "stretch": stretch,
        }));
    }

    Some(json!({
        "format": "portable-rich-text-v1",
        "runs": runs,
    }))
}

fn classic_text_visible_range(bytes: &[u8]) -> (usize, usize) {
    let leading = bytes
        .iter()
        .take_while(|byte| classic_text_byte_is_whitespace(**byte))
        .count();
    let trailing = bytes
        .iter()
        .rev()
        .take_while(|byte| classic_text_byte_is_whitespace(**byte))
        .count();
    (leading, bytes.len().saturating_sub(trailing).max(leading))
}

fn classic_text_byte_is_whitespace(byte: u8) -> bool {
    matches!(byte, 0 | 9 | 10 | 13 | 32)
}

fn classic_color_component(value: u16) -> u8 {
    ((u32::from(value) + 128) / 257) as u8
}

fn read_i16_be(bytes: &[u8], offset: usize) -> Option<i16> {
    Some(i16::from_be_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
    ]))
}

fn read_u16_be(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_be_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
    ]))
}

fn read_i32_be(bytes: &[u8], offset: usize) -> Option<i32> {
    Some(i32::from_be_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
        *bytes.get(offset + 2)?,
        *bytes.get(offset + 3)?,
    ]))
}
fn package_scenario_icon_resources(
    project: &ProvidenceProject,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let override_targets = project
        .monster_icon_overrides
        .iter()
        .flat_map(|override_record| {
            [
                override_record.target_base_icon_id,
                override_record.target_base_icon_id + MONSTER_ICON_FACING_OFFSET,
            ]
        })
        .collect::<BTreeSet<_>>();

    for resource in &project.scenario_icon_resources {
        if override_targets.contains(&resource.resource_id) {
            continue;
        }
        let bytes = decode_icon_resource(
            &resource.resource_base64,
            &format!("Scenario icon {}", resource.resource_id),
        )?;
        package_icon_payload(
            resource.resource_id,
            &resource.label,
            &bytes,
            "Scenario icon resource",
            output_dir,
            payloads,
            written_files,
        )?;
    }

    for override_record in &project.monster_icon_overrides {
        let source_label = override_record
            .source_label
            .as_deref()
            .filter(|label| !label.trim().is_empty())
            .unwrap_or("Scenario monster icon override");
        let base_bytes = decode_icon_resource(
            &override_record.source_base_resource_base64,
            &format!(
                "Monster icon override {} base resource",
                override_record.target_base_icon_id
            ),
        )?;
        let paired_bytes = decode_icon_resource(
            &override_record.source_paired_resource_base64,
            &format!(
                "Monster icon override {} paired resource",
                override_record.target_base_icon_id
            ),
        )?;
        package_icon_payload(
            override_record.target_base_icon_id,
            source_label,
            &base_bytes,
            "Scenario monster icon override",
            output_dir,
            payloads,
            written_files,
        )?;
        package_icon_payload(
            override_record.target_base_icon_id + MONSTER_ICON_FACING_OFFSET,
            &format!("{source_label} facing"),
            &paired_bytes,
            "Scenario monster icon override",
            output_dir,
            payloads,
            written_files,
        )?;
    }
    Ok(())
}

fn package_referenced_scenario_monster_icons(
    project: &ProvidenceProject,
    project_dir: &Path,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let referenced_base_ids = project
        .monsters
        .iter()
        .chain(
            project
                .monster_sets
                .iter()
                .flat_map(|monster_set| monster_set.monsters.iter()),
        )
        .filter_map(|monster| monster.icon_id.checked_abs())
        .filter(|resource_id| *resource_id != 0)
        .collect::<BTreeSet<_>>();
    if referenced_base_ids.is_empty() {
        return Ok(());
    }

    let scenario_assets = project
        .asset_catalog
        .icons
        .iter()
        .filter(|asset| asset.resource_type == "cicn" && is_scenario_owned_icon(asset))
        .filter_map(|asset| {
            i16::try_from(asset.resource_id)
                .ok()
                .map(|resource_id| (resource_id, asset))
        })
        .collect::<BTreeMap<_, _>>();
    let candidates = preserved_scenario_resource_payloads(project, project_dir, "cicn")?;

    for base_id in referenced_base_ids {
        let Ok(paired_id) =
            i16::try_from(i32::from(base_id) + MONSTER_ICON_FACING_OFFSET)
        else {
            continue;
        };
        let mut planned = Vec::new();
        let mut complete_pair = true;
        for resource_id in [base_id, paired_id] {
            if payloads.contains_key(&("cicn".to_string(), resource_id)) {
                continue;
            }
            let asset = scenario_assets.get(&resource_id).copied();
            let candidate = match asset {
                Some(asset) => select_scenario_resource_payload(asset, &candidates, "cicn")?,
                None => {
                    let Some(candidate) = select_uncatalogued_scenario_resource_payload(
                        resource_id,
                        &candidates,
                        "cicn",
                    )?
                    else {
                        complete_pair = false;
                        break;
                    };
                    candidate
                }
            };
            planned.push((resource_id, asset, candidate));
        }
        if !complete_pair {
            continue;
        }
        for (resource_id, asset, candidate) in planned {
            let label = asset
                .and_then(|asset| asset.name.as_deref())
                .filter(|value| !value.trim().is_empty())
                .or_else(|| (!candidate.name.trim().is_empty()).then_some(candidate.name.as_str()))
                .map(str::to_string)
                .unwrap_or_else(|| format!("Scenario monster icon {resource_id}"));
            package_icon_payload(
                i32::from(resource_id),
                &label,
                &candidate.bytes,
                &format!("Scenario resource fork: {}", candidate.source_file),
                output_dir,
                payloads,
                written_files,
            )?;
        }
    }
    Ok(())
}

fn decode_icon_resource(encoded: &str, label: &str) -> Result<Vec<u8>> {
    if encoded.trim().is_empty() {
        return Err(ProvidenceError::message(format!(
            "{label} has no preserved cicn payload"
        )));
    }
    STANDARD.decode(encoded).map_err(|error| {
        ProvidenceError::message(format!(
            "{label} has invalid base64 cicn payload data: {error}"
        ))
    })
}

#[allow(clippy::too_many_arguments)]
fn package_icon_payload(
    resource_id: i32,
    label: &str,
    bytes: &[u8],
    source: &str,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let resource_id = i16::try_from(resource_id).map_err(|_| {
        ProvidenceError::message(format!(
            "Scenario cicn resource ID {resource_id} is outside the Classic signed 16-bit range"
        ))
    })?;
    let key = ("cicn".to_string(), resource_id);
    if let Some(existing) = payloads.get(&key) {
        let sha256 = hex::encode(Sha256::digest(bytes));
        if existing.sha256 == sha256 {
            return Ok(());
        }
        return Err(ProvidenceError::message(format!(
            "Scenario cicn resource {resource_id} has conflicting preserved payloads"
        )));
    }
    let payload = write_resource_payload(
        "cicn",
        resource_id,
        label,
        bytes,
        "image/cicn",
        source,
        output_dir,
    )?;
    written_files.push(payload.relative_path.clone());
    if let Some(runtime_media) = &payload.runtime_media {
        written_files.push(runtime_media.relative_path.clone());
    }
    payloads.insert(key, payload);
    Ok(())
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
        has_classic_payload: true,
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

    let candidates = preserved_scenario_resource_payloads(project, project_dir, "PICT")?;
    for (asset, resource_id) in missing {
        let candidate = select_scenario_resource_payload(asset, &candidates, "PICT")?;
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

fn package_scenario_scrolling_texts(
    project: &ProvidenceProject,
    project_dir: &Path,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    text_payloads: &mut BTreeMap<i16, Vec<u8>>,
    style_payloads: &mut BTreeMap<i16, Vec<u8>>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let text_candidates = preserved_scenario_resource_payloads(project, project_dir, "TEXT")?;
    for resource_id in text_candidates.keys().copied().collect::<Vec<_>>() {
        if payloads.contains_key(&("TEXT".to_string(), resource_id))
            || scenario_resource_removed(project, "TEXT", resource_id)
        {
            continue;
        }
        let Some(candidate) =
            select_uncatalogued_scenario_resource_payload(resource_id, &text_candidates, "TEXT")?
        else {
            continue;
        };
        let label = (!candidate.name.trim().is_empty())
            .then_some(candidate.name.clone())
            .unwrap_or_else(|| format!("Scenario scrolling text {resource_id}"));
        let payload = write_resource_payload(
            "TEXT",
            resource_id,
            &label,
            &candidate.bytes,
            "text/plain",
            &format!("Scenario resource fork: {}", candidate.source_file),
            output_dir,
        )?;
        text_payloads.insert(resource_id, candidate.bytes.clone());
        written_files.push(payload.relative_path.clone());
        payloads.insert(("TEXT".to_string(), resource_id), payload);
    }

    let style_candidates = preserved_scenario_resource_payloads(project, project_dir, "styl")?;
    let text_ids = payloads
        .keys()
        .filter_map(|(resource_type, resource_id)| {
            (resource_type == "TEXT").then_some(*resource_id)
        })
        .collect::<Vec<_>>();
    for resource_id in text_ids {
        if style_payloads.contains_key(&resource_id)
            || scenario_resource_removed(project, "styl", resource_id)
        {
            continue;
        }
        let Some(candidate) =
            select_uncatalogued_scenario_resource_payload(resource_id, &style_candidates, "styl")?
        else {
            continue;
        };
        style_payloads.insert(resource_id, candidate.bytes.clone());
    }
    Ok(())
}

fn package_scenario_sounds(
    project: &ProvidenceProject,
    project_dir: &Path,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let candidates = preserved_scenario_resource_payloads(project, project_dir, "snd ")?;
    for resource_id in candidates.keys().copied().collect::<Vec<_>>() {
        if payloads.contains_key(&("snd ".to_string(), resource_id))
            || scenario_resource_removed(project, "snd ", resource_id)
        {
            continue;
        }
        let catalog_asset = project.asset_catalog.sounds.iter().find(|asset| {
            asset.resource_type == "snd "
                && asset.resource_id == i32::from(resource_id)
                && is_scenario_owned_sound(asset)
        });
        let candidate = if let Some(asset) = catalog_asset {
            select_scenario_resource_payload(asset, &candidates, "snd ")?
        } else {
            let Some(candidate) =
                select_uncatalogued_scenario_resource_payload(resource_id, &candidates, "snd ")?
            else {
                continue;
            };
            candidate
        };
        let label = catalog_asset
            .and_then(|asset| asset.name.as_deref())
            .filter(|value| !value.trim().is_empty())
            .or_else(|| (!candidate.name.trim().is_empty()).then_some(candidate.name.as_str()))
            .map(str::to_string)
            .unwrap_or_else(|| format!("Scenario sound {resource_id}"));
        let payload = write_resource_payload(
            "snd ",
            resource_id,
            &label,
            &candidate.bytes,
            "audio/x-mac-snd",
            &format!("Scenario resource fork: {}", candidate.source_file),
            output_dir,
        )?;
        written_files.push(payload.relative_path.clone());
        if let Some(runtime_media) = &payload.runtime_media {
            written_files.push(runtime_media.relative_path.clone());
        }
        payloads.insert(("snd ".to_string(), resource_id), payload);
    }
    Ok(())
}

fn is_scenario_owned_sound(asset: &ResourceAsset) -> bool {
    let source = asset.source.to_ascii_lowercase();
    asset.id.starts_with("scenario-snd-")
        || source.starts_with("scenario resource fork:")
        || (source.starts_with("browser import:")
            && !source.contains("bundled realmz reference snd"))
}

fn scenario_resource_removed(
    project: &ProvidenceProject,
    resource_type: &str,
    resource_id: i16,
) -> bool {
    project
        .editor_metadata
        .removed_scenario_resources
        .iter()
        .any(|resource| {
            resource.resource_type == resource_type
                && resource.resource_id == i32::from(resource_id)
        })
}

fn preserved_scenario_resource_payloads(
    project: &ProvidenceProject,
    project_dir: &Path,
    resource_type: &str,
) -> Result<BTreeMap<i16, Vec<PreservedResourcePayload>>> {
    let mut source_files = project
        .source
        .files
        .iter()
        .filter(|file| matches!(&file.role, SourceFileRole::ResourceFork))
        .collect::<Vec<_>>();
    if source_files.is_empty() {
        return Ok(BTreeMap::new());
    }
    source_files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    let raw_sources_dir = if project.source.raw_sources_dir.trim().is_empty() {
        PathBuf::from("raw-sources")
    } else {
        validated_relative_path(
            &project.source.raw_sources_dir,
            "Imported project raw-sources directory",
        )?
    };
    let raw_sources_dir = project_dir.join(raw_sources_dir);
    let mut resources = BTreeMap::<i16, Vec<PreservedResourcePayload>>::new();
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
            .filter(|entry| entry.resource_type == resource_type)
        {
            resources
                .entry(entry.id)
                .or_default()
                .push(PreservedResourcePayload {
                    source_file: source_file.name.clone(),
                    name: entry.name,
                    bytes: entry.data,
                });
        }
    }
    Ok(resources)
}

fn select_scenario_resource_payload<'a>(
    asset: &ResourceAsset,
    candidates: &'a BTreeMap<i16, Vec<PreservedResourcePayload>>,
    resource_type: &str,
) -> Result<&'a PreservedResourcePayload> {
    let resource_id = i16::try_from(asset.resource_id).map_err(|_| {
        ProvidenceError::message(format!(
            "Scenario-owned {resource_type} resource ID {} is outside the Classic signed 16-bit range",
            asset.resource_id,
        ))
    })?;
    let available = candidates.get(&resource_id).ok_or_else(|| {
        ProvidenceError::message(format!(
            "Scenario-owned {resource_type} {resource_id} has no managed payload and was not found in the project raw-source snapshot"
        ))
    })?;
    let source_hint = scenario_resource_source_hint(asset, resource_type);
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
    let first = matching
        .iter()
        .copied()
        .max_by_key(|candidate| candidate.bytes.len())
        .expect("resource candidate groups are non-empty");
    if matching
        .iter()
        .skip(1)
        .any(|candidate| {
            !candidate
                .source_file
                .eq_ignore_ascii_case(&first.source_file)
                && candidate.bytes != first.bytes
        })
    {
        return Err(ProvidenceError::message(format!(
            "Scenario-owned {resource_type} {resource_id} is ambiguous across preserved resource forks: {}",
            matching
                .iter()
                .map(|candidate| candidate.source_file.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    Ok(first)
}

fn select_uncatalogued_scenario_resource_payload<'a>(
    resource_id: i16,
    candidates: &'a BTreeMap<i16, Vec<PreservedResourcePayload>>,
    resource_type: &str,
) -> Result<Option<&'a PreservedResourcePayload>> {
    let Some(available) = candidates.get(&resource_id) else {
        return Ok(None);
    };
    let preferred = available
        .iter()
        .filter(|candidate| source_file_matches(&candidate.source_file, "Scenario.rsrc"))
        .collect::<Vec<_>>();
    let matching = if preferred.is_empty() {
        available.iter().collect::<Vec<_>>()
    } else {
        preferred
    };
    let first = matching
        .iter()
        .copied()
        .max_by_key(|candidate| candidate.bytes.len())
        .expect("resource candidate groups are non-empty");
    if matching
        .iter()
        .skip(1)
        .any(|candidate| {
            !candidate
                .source_file
                .eq_ignore_ascii_case(&first.source_file)
                && candidate.bytes != first.bytes
        })
    {
        return Err(ProvidenceError::message(format!(
            "Scenario-owned {resource_type} {resource_id} is ambiguous across preserved resource forks: {}",
            matching
                .iter()
                .map(|candidate| candidate.source_file.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    Ok(Some(first))
}

fn scenario_resource_source_hint(asset: &ResourceAsset, resource_type: &str) -> Option<String> {
    if let Some(source) = asset.source.strip_prefix("Scenario resource fork: ") {
        return Some(source.trim().to_string());
    }
    let source = asset.source.strip_prefix("Browser import: ")?;
    let suffix = format!(" {resource_type} {}", asset.resource_id);
    source
        .strip_suffix(&suffix)
        .map(|value| value.trim().to_string())
}

fn package_scenario_item_icons(
    project: &ProvidenceProject,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let referenced = project
        .scenario_items
        .iter()
        .filter_map(|item| item.icon_id.checked_abs())
        .filter(|resource_id| *resource_id != 0)
        .collect::<BTreeSet<_>>();
    if referenced.is_empty() {
        return Ok(());
    }

    let mut resources = project.scenario_icon_resources.iter().collect::<Vec<_>>();
    resources.sort_by_key(|resource| resource.resource_id.abs());
    for resource in resources {
        let resource_id = i16::try_from(resource.resource_id.abs()).map_err(|_| {
            ProvidenceError::message(format!(
                "Scenario item icon resource ID {} is outside the Classic signed 16-bit range",
                resource.resource_id
            ))
        })?;
        if !referenced.contains(&resource_id)
            || payloads.contains_key(&("cicn".to_string(), resource_id))
        {
            continue;
        }
        let bytes = STANDARD
            .decode(&resource.resource_base64)
            .map_err(|error| {
                ProvidenceError::message(format!(
                "Scenario item icon cicn {resource_id} has invalid Classic resource data: {error}"
            ))
            })?;
        let payload = write_resource_payload(
            "cicn",
            resource_id,
            &resource.label,
            &bytes,
            "image/cicn",
            if resource.imported {
                "Preserved scenario item icon"
            } else {
                "Scenario item icon"
            },
            output_dir,
        )?;
        written_files.push(payload.relative_path.clone());
        if let Some(runtime_media) = &payload.runtime_media {
            written_files.push(runtime_media.relative_path.clone());
        }
        payloads.insert(("cicn".to_string(), resource_id), payload);
    }
    Ok(())
}

fn package_scenario_special_land_tiles(
    project: &ProvidenceProject,
    project_dir: &Path,
    output_dir: &Path,
    payloads: &mut BTreeMap<(String, i16), PackagedPayload>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    let wanted = referenced_special_land_tile_ids(project);
    let mut assets = project
        .asset_catalog
        .icons
        .iter()
        .filter(|asset| {
            asset.resource_type == "cicn"
                && asset.resource_id < 0
                && i16::try_from(asset.resource_id)
                    .ok()
                    .is_some_and(|resource_id| wanted.contains(&resource_id))
                && is_scenario_owned_icon(asset)
        })
        .collect::<Vec<_>>();
    assets.sort_by(|left, right| {
        left.resource_id
            .cmp(&right.resource_id)
            .then_with(|| left.id.cmp(&right.id))
    });
    let assets = assets
        .into_iter()
        .filter_map(|asset| {
            i16::try_from(asset.resource_id)
                .ok()
                .map(|resource_id| (resource_id, asset))
        })
        .collect::<BTreeMap<_, _>>();

    let candidates = preserved_scenario_resource_payloads(project, project_dir, "cicn")?;
    for resource_id in wanted {
        if payloads.contains_key(&("cicn".to_string(), resource_id)) {
            continue;
        }
        let asset = assets.get(&resource_id).copied();
        let candidate = match asset {
            Some(asset) => select_scenario_resource_payload(asset, &candidates, "cicn")?,
            None => {
                let Some(candidate) = select_uncatalogued_scenario_resource_payload(
                    resource_id,
                    &candidates,
                    "cicn",
                )?
                else {
                    continue;
                };
                candidate
            }
        };
        let label = asset
            .and_then(|asset| asset.name.as_deref())
            .filter(|value| !value.trim().is_empty())
            .or_else(|| (!candidate.name.trim().is_empty()).then_some(candidate.name.as_str()))
            .map(str::to_string)
            .unwrap_or_else(|| format!("Scenario special land tile {resource_id}"));
        let payload = write_resource_payload(
            "cicn",
            resource_id,
            &label,
            &candidate.bytes,
            "image/cicn",
            &format!("Scenario resource fork: {}", candidate.source_file),
            output_dir,
        )?;
        written_files.push(payload.relative_path.clone());
        if let Some(runtime_media) = &payload.runtime_media {
            written_files.push(runtime_media.relative_path.clone());
        }
        payloads.insert(("cicn".to_string(), resource_id), payload);
    }
    Ok(())
}

fn is_scenario_owned_icon(asset: &ResourceAsset) -> bool {
    let source = asset.source.to_ascii_lowercase();
    asset.id.starts_with("scenario-cicn-")
        || source.starts_with("scenario resource fork:")
        || (source.starts_with("browser import:")
            && !source.contains("bundled realmz reference cicn"))
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
    if !missing.is_empty() {
        let runtime_media = write_transparent_special_land_fallback(output_dir)?;
        written_files.push(runtime_media.relative_path.clone());
        for id in missing {
            payloads.insert(
                ("cicn".to_string(), id),
                PackagedPayload {
                    has_classic_payload: false,
                    relative_path: String::new(),
                    file_name: String::new(),
                    bytes: 0,
                    sha256: String::new(),
                    media_type: "image/cicn".to_string(),
                    source: "Classic missing cicn fallback".to_string(),
                    runtime_media: Some(runtime_media.clone()),
                },
            );
        }
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
            Some(special_land_resource_id(remake_land_tile_value(*value)))
        })
        .collect()
}

pub(crate) fn remake_land_tile_value(value: i16) -> i16 {
    if value < -3999 {
        // Realmz removes at most three 1000-wide state bands before looking up
        // a special cicn. Values below this range cannot resolve and render as
        // the base land tile, so the Remake document uses one transparent
        // fallback identity instead of manufacturing thousands of resource IDs.
        -999
    } else {
        value
    }
}

fn special_land_resource_id(value: i16) -> i16 {
    let mut resource_id = value;
    for _ in 0..3 {
        if resource_id >= -999 {
            break;
        }
        resource_id += 1000;
    }
    resource_id
}

fn write_transparent_special_land_fallback(output_dir: &Path) -> Result<PackagedRuntimeMedia> {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 32, 32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|error| {
            ProvidenceError::message(format!(
                "Could not create transparent special-land fallback PNG: {error}"
            ))
        })?;
        writer
            .write_image_data(&vec![0_u8; 32 * 32 * 4])
            .map_err(|error| {
                ProvidenceError::message(format!(
                    "Could not encode transparent special-land fallback PNG: {error}"
                ))
            })?;
    }
    let sha256 = hex::encode(Sha256::digest(&bytes));
    let relative_path = format!(
        "{RUNTIME_IMAGE_DIR}/cicn-missing-transparent-{}.png",
        &sha256[..12]
    );
    let path = output_dir.join(PathBuf::from(&relative_path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    fs::write(&path, &bytes).with_path(&path)?;
    Ok(PackagedRuntimeMedia {
        relative_path,
        bytes: bytes.len() as u64,
        sha256,
        media_type: "image/png".to_string(),
    })
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
    let mut catalog_landlooks = BTreeSet::new();
    for tileset in &project.asset_catalog.tilesets {
        catalog_landlooks.insert(tileset.landlook);
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
    for landlook in runtime_stock_landlooks(project) {
        if catalog_landlooks.insert(landlook)
            && has_complete_stock_landlook_table(project, landlook)
        {
            tilesets.push(stock_landlook_document(landlook));
        }
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

fn runtime_stock_landlooks(project: &ProvidenceProject) -> BTreeSet<i8> {
    let extra_codes = project
        .extracodes
        .iter()
        .map(|row| (row.id, row.values))
        .collect::<BTreeMap<_, _>>();
    let mut landlooks = BTreeSet::new();
    for trigger in project.triggers.iter().filter(|trigger| trigger.active) {
        collect_action_landlooks(&trigger.actions, &extra_codes, &mut landlooks);
    }
    for encounter in &project.simple_encounters {
        collect_encounter_action_landlooks(&encounter.actions, &extra_codes, &mut landlooks);
    }
    for encounter in &project.complex_encounters {
        collect_encounter_action_landlooks(&encounter.actions, &extra_codes, &mut landlooks);
    }
    landlooks.retain(|landlook| matches!(landlook, 0 | 3 | 4 | 5 | 9 | 10));
    landlooks
}

fn collect_action_landlooks(
    actions: &[Action],
    extra_codes: &BTreeMap<usize, [i16; 5]>,
    landlooks: &mut BTreeSet<i8>,
) {
    for action in actions {
        collect_landlook(action.raw_code, action.id, extra_codes, landlooks);
    }
}

fn collect_encounter_action_landlooks(
    actions: &[EncounterActionRow],
    extra_codes: &BTreeMap<usize, [i16; 5]>,
    landlooks: &mut BTreeSet<i8>,
) {
    for action in actions {
        collect_landlook(action.raw_code, action.id, extra_codes, landlooks);
    }
}

fn collect_landlook(
    raw_code: i16,
    extra_code_id: i16,
    extra_codes: &BTreeMap<usize, [i16; 5]>,
    landlooks: &mut BTreeSet<i8>,
) {
    if raw_code.unsigned_abs() != 57 || extra_code_id < 0 {
        return;
    }
    let Some(values) = extra_codes.get(&(extra_code_id as usize)) else {
        return;
    };
    if let Ok(landlook) = i8::try_from(values[0]) {
        landlooks.insert(landlook);
    }
}

fn has_complete_stock_landlook_table(project: &ProvidenceProject, landlook: i8) -> bool {
    project
        .tile_attributes
        .iter()
        .filter(|record| record.landlook == Some(landlook) && (1..=200).contains(&record.tile))
        .map(|record| record.tile)
        .collect::<BTreeSet<_>>()
        .len()
        == 200
}

fn stock_landlook_document(landlook: i8) -> Value {
    let (name, base_tile) = match landlook {
        0 => ("Plains", 156),
        3 => ("Subterranean", 155),
        4 => ("Castle", 111),
        5 => ("Desert", 191),
        9 => ("Swamp", 155),
        10 => ("Snow", 155),
        _ => unreachable!("filtered stock landlook"),
    };
    json!({
        "id": format!("landlook-{landlook}"),
        "landlook": landlook,
        "name": name,
        "source": "Realmz reference resources",
        "available": true,
        "pictId": 300 + i32::from(landlook),
        "tileWidth": 32,
        "tileHeight": 32,
        "columns": 20,
        "rows": 10,
        "custom": false,
        "baseTile": base_tile,
    })
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
                "source": &payload.source,
            })
        });
        add_payload_fields(record, payload);
    }
    Ok(records.into_values().collect())
}

fn add_payload_fields(value: &mut Value, payload: &PackagedPayload) {
    if !payload.has_classic_payload {
        add_runtime_media(value, payload);
        return;
    }
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
