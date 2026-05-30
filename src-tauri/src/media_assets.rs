use crate::error::Result;
use crate::error::{IoPath, ProvidenceError};
use crate::importer::save_project as save_project_impl;
use crate::project::{
    AssetImportTarget, DitherMode, ImageFitMode, ImageMatte, ImageScaleMode, ManagedAsset,
    ManagedAssetConversion, ManagedAssetExportState, ManagedAssetKind, PaletteMode,
    ProvidenceProject,
};
use crate::resource_fork::{
    encode_cicn_resource, encode_pict_resource_with_dither, encode_snd_resource, PcmAudioPayload,
    RgbaImagePayload,
};
use crate::validation::validate_project as validate_project_impl;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAssetImportRequest {
    pub label: String,
    pub kind: ManagedAssetKind,
    pub resource_type: String,
    pub resource_id: i16,
    pub mime_type: String,
    pub original_base64: String,
    pub preview_base64: String,
    pub image: Option<RgbaImagePayload>,
    pub audio: Option<PcmAudioPayload>,
    pub linked_entity: Option<String>,
    pub target: AssetImportTarget,
    pub fit_mode: Option<ImageFitMode>,
    pub scale_mode: Option<ImageScaleMode>,
    pub matte: Option<ImageMatte>,
    pub palette_mode: Option<PaletteMode>,
    pub dither_mode: Option<DitherMode>,
    #[serde(default)]
    pub source_width: Option<u32>,
    #[serde(default)]
    pub source_height: Option<u32>,
    #[serde(default)]
    pub source_duration_ms: Option<u32>,
    #[serde(default)]
    pub source_sample_rate: Option<u32>,
    #[serde(default)]
    pub source_channels: Option<u16>,
    pub final_width: Option<u32>,
    pub final_height: Option<u32>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn load_project_asset(project_dir: String, relative_path: String) -> Result<String> {
    let bytes = read_project_relative_file(&project_dir, &relative_path)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn load_project_asset_preview(project_dir: String, relative_path: String) -> Result<String> {
    let bytes = read_project_relative_file(&project_dir, &relative_path)?;
    Ok(format!(
        "data:{};base64,{}",
        mime_for_path(&relative_path),
        STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn import_project_media_asset(
    project_dir: String,
    mut project: ProvidenceProject,
    request: MediaAssetImportRequest,
) -> Result<ProvidenceProject> {
    let project_root = Path::new(&project_dir);
    let token = unique_asset_token(&project, &request.label);
    let asset_id = format!("asset:{token}");
    let asset = write_managed_media_asset(
        project_root,
        &request,
        &token,
        asset_id,
        request.linked_entity.clone(),
        "imported media",
        false,
    )?;
    project.assets.push(asset);
    project.validation = validate_project_impl(&project);
    save_project_impl(project_dir, &project)?;
    Ok(project)
}

#[tauri::command]
pub fn replace_project_media_asset(
    project_dir: String,
    mut project: ProvidenceProject,
    asset_id: String,
    request: MediaAssetImportRequest,
) -> Result<ProvidenceProject> {
    let previous = project
        .assets
        .iter()
        .find(|asset| asset.id == asset_id)
        .cloned()
        .ok_or_else(|| {
            ProvidenceError::message(format!("Project asset {asset_id} was not found"))
        })?;
    let token = asset_token_for_existing_asset(&previous);
    let linked_entity = request
        .linked_entity
        .clone()
        .or_else(|| previous.linked_entity.clone());
    let replacement = write_managed_media_asset(
        Path::new(&project_dir),
        &request,
        &token,
        previous.id.clone(),
        linked_entity,
        "replaced media",
        true,
    )?;
    for asset in &mut project.assets {
        if asset.id == asset_id {
            *asset = replacement;
            break;
        }
    }
    project.validation = validate_project_impl(&project);
    save_project_impl(project_dir, &project)?;
    Ok(project)
}

#[tauri::command]
pub fn update_project_asset(
    project_dir: String,
    mut project: ProvidenceProject,
    asset_id: String,
    label: Option<String>,
    resource_id: Option<i16>,
) -> Result<ProvidenceProject> {
    if let Some(asset) = project.assets.iter_mut().find(|asset| asset.id == asset_id) {
        if let Some(label) = label {
            if !label.trim().is_empty() {
                asset.label = label.trim().to_string();
            }
        }
        if let Some(resource_id) = resource_id {
            asset.resource_id = resource_id;
        }
    }
    project.validation = validate_project_impl(&project);
    save_project_impl(project_dir, &project)?;
    Ok(project)
}

#[tauri::command]
pub fn delete_project_asset(
    project_dir: String,
    mut project: ProvidenceProject,
    asset_id: String,
) -> Result<ProvidenceProject> {
    project.assets.retain(|asset| asset.id != asset_id);
    project.validation = validate_project_impl(&project);
    save_project_impl(project_dir, &project)?;
    Ok(project)
}

pub fn mime_for_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".ogg") {
        "audio/ogg"
    } else if lower.ends_with(".txt") {
        "text/plain"
    } else {
        "application/octet-stream"
    }
}

fn write_managed_media_asset(
    project_root: &Path,
    request: &MediaAssetImportRequest,
    token: &str,
    asset_id: String,
    linked_entity: Option<String>,
    provenance: &str,
    clear_existing: bool,
) -> Result<ManagedAsset> {
    validate_media_asset_request(request)?;
    let original = STANDARD
        .decode(&request.original_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    let preview = STANDARD
        .decode(&request.preview_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    let resource_bytes = match request.resource_type.as_str() {
        "PICT" => {
            let image = request.image.as_ref().ok_or_else(|| {
                ProvidenceError::message("PICT import requires decoded image pixels")
            })?;
            encode_pict_resource_with_dither(
                image,
                !matches!(request.dither_mode, Some(DitherMode::None)),
            )?
        }
        "cicn" => {
            let image = request.image.as_ref().ok_or_else(|| {
                ProvidenceError::message("cicn import requires decoded image pixels")
            })?;
            encode_cicn_resource(image)?
        }
        "snd " => {
            let audio = request.audio.as_ref().ok_or_else(|| {
                ProvidenceError::message("snd import requires decoded audio samples")
            })?;
            encode_snd_resource(audio)?
        }
        other => {
            return Err(ProvidenceError::message(format!(
                "Unsupported managed resource type {other}"
            )));
        }
    };
    let asset_dir = project_root.join("assets").join("media").join(token);
    if clear_existing && asset_dir.exists() {
        fs::remove_dir_all(&asset_dir).with_path(&asset_dir)?;
    }
    fs::create_dir_all(&asset_dir).with_path(&asset_dir)?;

    let original_ext = extension_for_mime(&request.mime_type, request.kind);
    let preview_ext = match request.kind {
        ManagedAssetKind::Sound => "wav",
        _ => "png",
    };
    let original_name = format!("original.{original_ext}");
    let preview_name = format!("preview.{preview_ext}");
    let resource_name = format!(
        "resource_{}_{}.bin",
        request.resource_type.trim().replace(' ', "_"),
        request.resource_id
    );
    fs::write(asset_dir.join(&original_name), &original)
        .with_path(asset_dir.join(&original_name))?;
    fs::write(asset_dir.join(&preview_name), &preview).with_path(asset_dir.join(&preview_name))?;
    fs::write(asset_dir.join(&resource_name), &resource_bytes)
        .with_path(asset_dir.join(&resource_name))?;

    let rel_dir = format!("assets/media/{token}");
    Ok(ManagedAsset {
        id: asset_id,
        label: request.label.trim().to_string(),
        kind: request.kind,
        resource_type: request.resource_type.clone(),
        resource_id: request.resource_id,
        file_name: original_name.clone(),
        original_path: format!("{rel_dir}/{original_name}"),
        preview_path: format!("{rel_dir}/{preview_name}"),
        resource_path: format!("{rel_dir}/{resource_name}"),
        mime_type: request.mime_type.clone(),
        bytes: original.len() as u64,
        sha256: sha256_hex(&original),
        width: request.image.as_ref().map(|image| image.width),
        height: request.image.as_ref().map(|image| image.height),
        duration_ms: request.audio.as_ref().and_then(|audio| audio.duration_ms),
        sample_rate: request.audio.as_ref().map(|audio| audio.sample_rate),
        channels: request.audio.as_ref().map(|audio| audio.channels),
        export_state: ManagedAssetExportState::Ready,
        provenance: provenance.to_string(),
        linked_entity,
        conversion: Some(ManagedAssetConversion {
            target: request.target,
            fit_mode: request.fit_mode,
            scale_mode: request.scale_mode,
            matte: request.matte,
            palette_mode: request.palette_mode,
            dither_mode: request.dither_mode,
            source_width: request.source_width,
            source_height: request.source_height,
            source_duration_ms: request.source_duration_ms,
            source_sample_rate: request.source_sample_rate,
            source_channels: request.source_channels,
            final_width: request.final_width,
            final_height: request.final_height,
            warnings: request.warnings.clone(),
        }),
    })
}

fn validate_media_asset_request(request: &MediaAssetImportRequest) -> Result<()> {
    if matches!(request.target, AssetImportTarget::CustomLandlookAtlas) {
        if request.kind != ManagedAssetKind::Picture || request.resource_type != "PICT" {
            return Err(ProvidenceError::message(
                "Custom landlook atlas replacement must be a PICT picture asset",
            ));
        }
        if !(306..=308).contains(&request.resource_id) {
            return Err(ProvidenceError::message(
                "Custom landlook atlas replacement must use PICT 306, 307, or 308",
            ));
        }
        if request.final_width != Some(640) || request.final_height != Some(320) {
            return Err(ProvidenceError::message(
                "Custom landlook atlas replacement must be converted to 640 x 320 pixels",
            ));
        }
        let expected_link = format!("landlook:{}", request.resource_id - 300);
        if request.linked_entity.as_deref() != Some(expected_link.as_str()) {
            return Err(ProvidenceError::message(format!(
                "Custom landlook atlas replacement must be linked to {expected_link}"
            )));
        }
    }
    Ok(())
}

fn read_project_relative_file(project_dir: &str, relative_path: &str) -> Result<Vec<u8>> {
    let project_dir = Path::new(project_dir);
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(ProvidenceError::message(
            "Project asset path must stay inside the project folder",
        ));
    }
    let root = project_dir.canonicalize().with_path(project_dir)?;
    let target = root
        .join(relative)
        .canonicalize()
        .with_path(root.join(relative))?;
    if !target.starts_with(&root) {
        return Err(ProvidenceError::message(
            "Project asset path resolved outside the project folder",
        ));
    }
    fs::read(&target).with_path(&target)
}

fn extension_for_mime(mime_type: &str, kind: ManagedAssetKind) -> &'static str {
    match mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "audio/wav" | "audio/wave" | "audio/x-wav" => "wav",
        "audio/mpeg" => "mp3",
        "audio/ogg" => "ogg",
        _ => match kind {
            ManagedAssetKind::Sound => "audio",
            ManagedAssetKind::Picture
            | ManagedAssetKind::Icon
            | ManagedAssetKind::SpecialLandTile => "image",
            _ => "bin",
        },
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn asset_token_for_existing_asset(asset: &ManagedAsset) -> String {
    let normalized_path = asset.original_path.replace('\\', "/");
    normalized_path
        .split('/')
        .nth(2)
        .map(stable_token)
        .filter(|token| !token.is_empty())
        .unwrap_or_else(|| stable_token(asset.id.trim_start_matches("asset:")))
}

fn stable_token(value: &str) -> String {
    let token = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if token.is_empty() {
        "asset".to_string()
    } else {
        token
    }
}

fn unique_asset_token(project: &ProvidenceProject, label: &str) -> String {
    let base = stable_token(label);
    let used: std::collections::BTreeSet<String> = project
        .assets
        .iter()
        .map(|asset| stable_token(&asset.id.replace("asset:", "")))
        .chain(
            project
                .assets
                .iter()
                .filter_map(|asset| asset.original_path.split('/').nth(2).map(stable_token)),
        )
        .collect();
    if !used.contains(&base) {
        return base;
    }
    for index in 2..10_000 {
        let candidate = format!("{base}-{index}");
        if !used.contains(&candidate) {
            return candidate;
        }
    }
    format!("{base}-{}", project.assets.len() + 1)
}
