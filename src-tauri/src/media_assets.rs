use crate::error::Result;
use crate::error::{IoPath, ProvidenceError};
use crate::importer::save_project as save_project_impl;
use crate::project::{
    AssetImportTarget, DitherMode, ImageFitMode, ImageMatte, ImageScaleMode, ManagedAsset,
    ManagedAssetConversion, ManagedAssetExportState, ManagedAssetKind, ManagedAssetLibraryScope,
    PaletteMode, ProvidenceProject,
};
use crate::resource_fork::{
    encode_cicn_resource, encode_pict_resource_with_dither, encode_snd_resource,
    parse_resource_fork_entries, PcmAudioPayload, RgbaImagePayload,
};
use crate::resource_preview::preview_data_url_for_resource;
use crate::validation::validate_project as validate_project_impl;
use crate::workspace::{
    load_library_asset as load_library_asset_impl, save_workspace as save_workspace_impl,
    LibraryAsset, ProvidenceWorkspace, BUNDLED_LIBRARY_DIR,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAssetImportRequest {
    pub label: String,
    pub kind: ManagedAssetKind,
    pub resource_type: String,
    pub resource_id: i16,
    #[serde(default)]
    pub scenario_music_slot: Option<u8>,
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
    #[serde(default)]
    pub library_scope: Option<ManagedAssetLibraryScope>,
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
pub fn load_reference_picture_asset(app: tauri::AppHandle, pict_id: i32) -> Result<String> {
    if !(0..=32767).contains(&pict_id) {
        return Err(ProvidenceError::message(format!(
            "Reference picture id {pict_id} is outside the supported range."
        )));
    }
    let Some(root) = bundled_library_root(&app) else {
        return Err(ProvidenceError::message(
            "Bundled Realmz reference library was not found.",
        ));
    };
    let realmz_root = root.join("realmz-reference");
    let pict_id = pict_id as i16;
    for entry in WalkDir::new(&realmz_root)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path();
        let bytes = fs::read(path).with_path(path)?;
        for resource in parse_resource_fork_entries(&bytes) {
            if resource.resource_type != "PICT" || resource.id != pict_id {
                continue;
            }
            if let Some(data_url) = preview_data_url_for_resource("PICT", &resource.data)? {
                return Ok(data_url);
            }
            return Err(ProvidenceError::message(format!(
                "Bundled Realmz PICT {pict_id} could not be decoded as a preview."
            )));
        }
    }
    Err(ProvidenceError::message(format!(
        "Bundled Realmz PICT {pict_id} was not found."
    )))
}

fn bundled_library_root(app: &tauri::AppHandle) -> Option<PathBuf> {
    let resource_candidate = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| path.join(BUNDLED_LIBRARY_DIR));
    if resource_candidate
        .as_ref()
        .is_some_and(|path| path.is_dir())
    {
        return resource_candidate;
    }

    let dev_candidate = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("public")
        .join(BUNDLED_LIBRARY_DIR);
    if dev_candidate.is_dir() {
        return Some(dev_candidate);
    }

    let cwd_candidate = Path::new("public").join(BUNDLED_LIBRARY_DIR);
    if cwd_candidate.is_dir() {
        return Some(cwd_candidate);
    }

    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
        .map(|dir| dir.join(BUNDLED_LIBRARY_DIR))
        .filter(|path| path.is_dir())
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
pub fn import_workspace_media_asset(
    workspace_dir: String,
    mut workspace: ProvidenceWorkspace,
    request: MediaAssetImportRequest,
) -> Result<ProvidenceWorkspace> {
    let token = unique_asset_token_for_assets(&workspace.custom_assets, &request.label);
    let asset_id = format!("asset:workspace:{token}");
    let mut asset = write_managed_media_asset(
        Path::new(&workspace_dir),
        &request,
        &token,
        asset_id,
        request.linked_entity.clone(),
        "imported workspace media",
        false,
    )?;
    asset.library_scope = Some(ManagedAssetLibraryScope::CustomLibrary);
    workspace.custom_assets.push(asset);
    save_workspace_impl(workspace_dir, &workspace)?;
    Ok(workspace)
}

#[tauri::command]
pub fn copy_project_asset_to_workspace(
    project_dir: String,
    workspace_dir: String,
    mut workspace: ProvidenceWorkspace,
    asset: ManagedAsset,
) -> Result<ProvidenceWorkspace> {
    let token = unique_asset_token_for_assets(&workspace.custom_assets, &asset.label);
    let mut copied = copy_managed_asset_between_roots(
        Path::new(&project_dir),
        Path::new(&workspace_dir),
        &asset,
        &token,
        format!("asset:workspace:{token}"),
        Some(ManagedAssetLibraryScope::CustomLibrary),
        "copied from scenario asset",
    )?;
    if matches!(copied.kind, ManagedAssetKind::Music) {
        copied.scenario_music_slot = None;
        copied.linked_entity = None;
    }
    workspace.custom_assets.push(copied);
    save_workspace_impl(workspace_dir, &workspace)?;
    Ok(workspace)
}

#[tauri::command]
pub fn copy_workspace_asset_to_project(
    workspace_dir: String,
    project_dir: String,
    mut project: ProvidenceProject,
    asset: ManagedAsset,
    resource_id: i16,
) -> Result<ProvidenceProject> {
    let token = unique_asset_token(&project, &asset.label);
    let mut copied = copy_managed_asset_between_roots(
        Path::new(&workspace_dir),
        Path::new(&project_dir),
        &asset,
        &token,
        format!("asset:{token}"),
        Some(ManagedAssetLibraryScope::Scenario),
        "copied from workspace custom library",
    )?;
    copied.resource_id = resource_id;
    if matches!(copied.kind, ManagedAssetKind::Music) {
        if !(1..=3).contains(&resource_id) {
            return Err(ProvidenceError::message(
                "Scenario music slots must be in the range 1-3",
            ));
        }
        copied.scenario_music_slot = Some(resource_id as u8);
        copied.linked_entity = Some(format!("scenario-music:{resource_id}"));
    }
    if matches!(copied.kind, ManagedAssetKind::SpecialLandTile) {
        copied.linked_entity = Some(format!("special-land-tile:{resource_id}"));
    }
    project.assets.push(copied);
    project.validation = validate_project_impl(&project);
    save_project_impl(project_dir, &project)?;
    Ok(project)
}

#[tauri::command]
pub fn copy_library_asset_to_project(
    workspace_dir: String,
    project_dir: String,
    mut project: ProvidenceProject,
    asset: LibraryAsset,
    resource_id: i16,
    kind: Option<ManagedAssetKind>,
) -> Result<ProvidenceProject> {
    if asset.source.contains(":realmz:") {
        return Err(ProvidenceError::message(
            "Realmz stock reference assets should be referenced by their existing resource ID.",
        ));
    }
    let (resource_type, _source_resource_id, resource_bytes) =
        library_asset_resource_bytes(&workspace_dir, &asset)?;
    let token = unique_asset_token(&project, &asset.label);
    let copied = write_reference_library_asset(
        Path::new(&project_dir),
        &asset,
        &resource_type,
        resource_id,
        &resource_bytes,
        &token,
        format!("asset:{token}"),
        kind,
    )?;
    project.assets.push(copied);
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
    let mut replacement = write_managed_media_asset(
        Path::new(&project_dir),
        &request,
        &token,
        previous.id.clone(),
        linked_entity,
        "replaced media",
        true,
    )?;
    replacement.library_scope = previous.library_scope;
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
    library_scope: Option<crate::project::ManagedAssetLibraryScope>,
) -> Result<ProvidenceProject> {
    if let Some(asset) = project.assets.iter_mut().find(|asset| asset.id == asset_id) {
        if let Some(label) = label {
            if !label.trim().is_empty() {
                asset.label = label.trim().to_string();
            }
        }
        if let Some(resource_id) = resource_id {
            let scenario_music = matches!(asset.kind, ManagedAssetKind::Music)
                && !matches!(
                    asset.library_scope,
                    Some(ManagedAssetLibraryScope::CustomLibrary)
                );
            if scenario_music && !(1..=3).contains(&resource_id) {
                return Err(ProvidenceError::message(
                    "Scenario music slots must be in the range 1-3",
                ));
            }
            asset.resource_id = resource_id;
            if scenario_music {
                asset.scenario_music_slot = Some(resource_id as u8);
                asset.linked_entity = Some(format!("scenario-music:{resource_id}"));
            }
        }
        if let Some(library_scope) = library_scope {
            asset.library_scope = Some(library_scope);
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
    } else if lower.ends_with(".mod") {
        "audio/x-mod"
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
        "MOD " => {
            if request.kind != ManagedAssetKind::Music {
                return Err(ProvidenceError::message(
                    "MOD imports must use the music asset kind",
                ));
            }
            validate_standard_mod(&original)?;
            original.clone()
        }
        "TEXT" | "STR#" | "styl" => {
            if request.kind != ManagedAssetKind::Text {
                return Err(ProvidenceError::message(
                    "TEXT, STR#, and styl imports must use the text asset kind",
                ));
            }
            original.clone()
        }
        other => {
            if request.kind != ManagedAssetKind::Other {
                return Err(ProvidenceError::message(format!(
                    "Unsupported managed resource type {other}"
                )));
            }
            original.clone()
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
        ManagedAssetKind::Music => "mod",
        ManagedAssetKind::Text => "txt",
        ManagedAssetKind::Other => "bin",
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
        scenario_music_slot: request.scenario_music_slot,
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
        library_scope: request
            .library_scope
            .clone()
            .or(Some(ManagedAssetLibraryScope::Scenario)),
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
    if matches!(request.target, AssetImportTarget::Text) {
        if request.kind != ManagedAssetKind::Text {
            return Err(ProvidenceError::message(
                "Text resource imports must use the text asset kind",
            ));
        }
        if !matches!(request.resource_type.as_str(), "TEXT" | "STR#" | "styl") {
            return Err(ProvidenceError::message(
                "Text resource imports must use TEXT, STR#, or styl",
            ));
        }
    }
    if matches!(request.target, AssetImportTarget::Music) {
        if request.kind != ManagedAssetKind::Music || request.resource_type != "MOD " {
            return Err(ProvidenceError::message(
                "Scenario music imports must use the music asset kind and MOD payload type",
            ));
        }
        if matches!(
            request.library_scope,
            Some(ManagedAssetLibraryScope::CustomLibrary)
        ) {
            if request.scenario_music_slot.is_some() {
                return Err(ProvidenceError::message(
                    "Custom Library music must not claim a scenario music slot",
                ));
            }
        } else {
            let slot = request.scenario_music_slot.ok_or_else(|| {
                ProvidenceError::message("Scenario music imports require a Classic music slot")
            })?;
            if !(1..=3).contains(&slot) || request.resource_id != i16::from(slot) {
                return Err(ProvidenceError::message(
                    "Scenario music slots and resource IDs must match in the range 1-3",
                ));
            }
        }
    }
    if matches!(request.target, AssetImportTarget::RawResource) {
        if request.kind != ManagedAssetKind::Other {
            return Err(ProvidenceError::message(
                "Raw resource imports must use the raw resource asset kind",
            ));
        }
        if request.resource_type.trim().is_empty() || request.resource_type.len() > 4 {
            return Err(ProvidenceError::message(
                "Raw resource imports need a nonempty resource type of four characters or fewer",
            ));
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
        "audio/x-mod" | "audio/mod" | "audio/x-protracker" => "mod",
        _ => match kind {
            ManagedAssetKind::Sound => "audio",
            ManagedAssetKind::Music => "mod",
            ManagedAssetKind::Text => "txt",
            ManagedAssetKind::Picture
            | ManagedAssetKind::Icon
            | ManagedAssetKind::SpecialLandTile => "image",
            _ => "bin",
        },
    }
}

pub(crate) fn validate_standard_mod(bytes: &[u8]) -> Result<()> {
    if bytes.len() < 1084 {
        return Err(ProvidenceError::message(
            "The selected file is too short to be a standard 31-sample MOD module",
        ));
    }
    let signature = std::str::from_utf8(&bytes[1080..1084]).unwrap_or("");
    let channels = mod_channel_count(signature).ok_or_else(|| {
        ProvidenceError::message(format!(
            "The selected file is not a supported standard MOD module (signature {signature:?}); XM, S3M, IT, MADG, and PlayerPRO files are not accepted"
        ))
    })?;
    let mut sample_bytes = 0usize;
    for index in 0..31 {
        let offset = 20 + index * 30;
        sample_bytes = sample_bytes
            .checked_add(
                usize::from(u16::from_be_bytes([bytes[offset + 22], bytes[offset + 23]])) * 2,
            )
            .ok_or_else(|| ProvidenceError::message("MOD sample payload length overflowed"))?;
        if bytes[offset + 25] > 64 {
            return Err(ProvidenceError::message(format!(
                "MOD sample {} has an invalid volume greater than 64",
                index + 1
            )));
        }
    }
    let song_length = usize::from(bytes[950]);
    if !(1..=128).contains(&song_length) {
        return Err(ProvidenceError::message(
            "The MOD order list length must be between 1 and 128",
        ));
    }
    let highest_pattern = bytes[952..952 + song_length]
        .iter()
        .copied()
        .max()
        .unwrap_or(0);
    let pattern_bytes = (usize::from(highest_pattern) + 1)
        .checked_mul(64 * channels * 4)
        .ok_or_else(|| ProvidenceError::message("MOD pattern payload length overflowed"))?;
    let required_bytes = 1084usize
        .checked_add(pattern_bytes)
        .and_then(|value| value.checked_add(sample_bytes))
        .ok_or_else(|| ProvidenceError::message("MOD payload length overflowed"))?;
    if required_bytes > bytes.len()
        && !crate::music_compatibility::is_outdoor_music_replacement(bytes)
    {
        return Err(ProvidenceError::message(format!(
            "The MOD payload is truncated: its headers require at least {required_bytes} bytes, but the file has {}",
            bytes.len()
        )));
    }
    Ok(())
}

fn mod_channel_count(signature: &str) -> Option<usize> {
    match signature {
        "M.K." | "M!K!" | "M&K!" | "N.T." | "FLT4" => Some(4),
        "OCTA" | "CD81" | "FLT8" => Some(8),
        _ => {
            let bytes = signature.as_bytes();
            if bytes.len() == 4 && bytes[0].is_ascii_digit() && &bytes[1..] == b"CHN" {
                return Some(usize::from(bytes[0] - b'0'));
            }
            if bytes.len() == 4
                && bytes[0].is_ascii_digit()
                && bytes[1].is_ascii_digit()
                && &bytes[2..] == b"CH"
            {
                return Some(usize::from(bytes[0] - b'0') * 10 + usize::from(bytes[1] - b'0'));
            }
            None
        }
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

fn unique_asset_token_for_assets(assets: &[ManagedAsset], label: &str) -> String {
    let base = stable_token(label);
    let used: std::collections::BTreeSet<String> = assets
        .iter()
        .map(|asset| stable_token(&asset.id.replace("asset:", "").replace("workspace:", "")))
        .chain(
            assets
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
    format!("{base}-{}", assets.len() + 1)
}

fn copy_managed_asset_between_roots(
    source_root: &Path,
    destination_root: &Path,
    asset: &ManagedAsset,
    token: &str,
    asset_id: String,
    library_scope: Option<ManagedAssetLibraryScope>,
    provenance_suffix: &str,
) -> Result<ManagedAsset> {
    let original = read_asset_payload(source_root, &asset.original_path)?;
    let preview = read_asset_payload(source_root, &asset.preview_path)?;
    let resource = read_asset_payload(source_root, &asset.resource_path)?;
    let asset_dir = destination_root.join("assets").join("media").join(token);
    if asset_dir.exists() {
        fs::remove_dir_all(&asset_dir).with_path(&asset_dir)?;
    }
    fs::create_dir_all(&asset_dir).with_path(&asset_dir)?;

    let original_name = copied_file_name(&asset.original_path, &asset.file_name, "original.bin");
    let preview_name = copied_file_name(&asset.preview_path, "preview.bin", "preview.bin");
    let resource_name = copied_file_name(&asset.resource_path, "resource.bin", "resource.bin");
    fs::write(asset_dir.join(&original_name), &original)
        .with_path(asset_dir.join(&original_name))?;
    fs::write(asset_dir.join(&preview_name), &preview).with_path(asset_dir.join(&preview_name))?;
    fs::write(asset_dir.join(&resource_name), &resource)
        .with_path(asset_dir.join(&resource_name))?;

    let rel_dir = format!("assets/media/{token}");
    let mut copied = asset.clone();
    copied.id = asset_id;
    copied.original_path = format!("{rel_dir}/{original_name}");
    copied.preview_path = format!("{rel_dir}/{preview_name}");
    copied.resource_path = format!("{rel_dir}/{resource_name}");
    copied.file_name = original_name;
    copied.bytes = original.len() as u64;
    copied.sha256 = sha256_hex(&original);
    copied.library_scope = library_scope;
    copied.provenance = format!("{}; {}", asset.provenance, provenance_suffix);
    Ok(copied)
}

fn write_reference_library_asset(
    project_root: &Path,
    asset: &LibraryAsset,
    resource_type: &str,
    resource_id: i16,
    resource_bytes: &[u8],
    token: &str,
    asset_id: String,
    requested_kind: Option<ManagedAssetKind>,
) -> Result<ManagedAsset> {
    let kind =
        requested_kind.unwrap_or_else(|| managed_asset_kind_for_library(asset, resource_type));
    if matches!(kind, ManagedAssetKind::Music) {
        if resource_type != "MOD " || !(1..=3).contains(&resource_id) {
            return Err(ProvidenceError::message(
                "Built-in music must be a standard MOD copied into Classic slot 1, 2, or 3",
            ));
        }
        validate_standard_mod(resource_bytes)?;
    }
    let asset_dir = project_root.join("assets").join("media").join(token);
    if asset_dir.exists() {
        fs::remove_dir_all(&asset_dir).with_path(&asset_dir)?;
    }
    fs::create_dir_all(&asset_dir).with_path(&asset_dir)?;

    let original_name = if matches!(kind, ManagedAssetKind::Music) {
        format!("reference_MOD_{resource_id}.mod")
    } else {
        format!(
            "reference_{}_{}.bin",
            resource_type.trim().replace(' ', "_"),
            resource_id
        )
    };
    let resource_name = format!(
        "resource_{}_{}.bin",
        resource_type.trim().replace(' ', "_"),
        resource_id
    );
    let preview_data_url = if matches!(kind, ManagedAssetKind::Music) {
        None
    } else {
        preview_data_url_for_resource(resource_type, resource_bytes)?
    };
    let preview_bytes = preview_data_url
        .as_deref()
        .map(decode_data_url)
        .transpose()?
        .unwrap_or_else(|| resource_bytes.to_vec());
    let preview_name = if matches!(kind, ManagedAssetKind::Music) {
        "preview.mod".to_string()
    } else {
        format!(
            "preview.{}",
            preview_extension(preview_data_url.as_deref(), resource_type)
        )
    };

    fs::write(asset_dir.join(&original_name), resource_bytes)
        .with_path(asset_dir.join(&original_name))?;
    fs::write(asset_dir.join(&preview_name), &preview_bytes)
        .with_path(asset_dir.join(&preview_name))?;
    fs::write(asset_dir.join(&resource_name), resource_bytes)
        .with_path(asset_dir.join(&resource_name))?;

    let rel_dir = format!("assets/media/{token}");
    Ok(ManagedAsset {
        id: asset_id,
        label: asset.label.trim().to_string(),
        kind,
        resource_type: resource_type.to_string(),
        resource_id,
        scenario_music_slot: matches!(kind, ManagedAssetKind::Music).then_some(resource_id as u8),
        file_name: original_name.clone(),
        original_path: format!("{rel_dir}/{original_name}"),
        preview_path: format!("{rel_dir}/{preview_name}"),
        resource_path: format!("{rel_dir}/{resource_name}"),
        mime_type: asset
            .mime_type
            .clone()
            .unwrap_or_else(|| mime_for_resource(resource_type).to_string()),
        bytes: resource_bytes.len() as u64,
        sha256: sha256_hex(resource_bytes),
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        export_state: ManagedAssetExportState::Ready,
        library_scope: Some(ManagedAssetLibraryScope::Scenario),
        provenance: format!("copied from reference asset {}", asset.source),
        linked_entity: if matches!(kind, ManagedAssetKind::SpecialLandTile) {
            Some(format!("special-land-tile:{resource_id}"))
        } else if matches!(kind, ManagedAssetKind::Music) {
            Some(format!("scenario-music:{resource_id}"))
        } else {
            None
        },
        conversion: matches!(kind, ManagedAssetKind::Music).then_some(ManagedAssetConversion {
            target: AssetImportTarget::Music,
            fit_mode: None,
            scale_mode: None,
            matte: None,
            palette_mode: None,
            dither_mode: None,
            source_width: None,
            source_height: None,
            source_duration_ms: None,
            source_sample_rate: None,
            source_channels: None,
            final_width: None,
            final_height: None,
            warnings: Vec::new(),
        }),
    })
}

fn library_asset_resource_bytes(
    workspace_dir: &str,
    asset: &LibraryAsset,
) -> Result<(String, i16, Vec<u8>)> {
    let fragment = split_library_resource_fragment(&asset.relative_path);
    let folder = if asset.source.contains(":divinity:") {
        "divinity"
    } else if asset.source.contains(":realmz:") {
        "realmz-reference"
    } else {
        "providence"
    };
    let file_path = fragment
        .as_ref()
        .map(|(file_path, _, _)| *file_path)
        .unwrap_or(asset.relative_path.as_str());
    let relative = Path::new("raw").join(folder).join(file_path);
    let bytes = load_library_asset_impl(workspace_dir, relative)?;
    let Some((_file_path, resource_type, resource_id)) = fragment else {
        if asset.asset_type == "music"
            && asset
                .resource_type
                .as_deref()
                .is_some_and(|value| value.trim() == "MOD")
        {
            validate_standard_mod(&bytes)?;
            return Ok((
                "MOD ".to_string(),
                asset.resource_id.unwrap_or_default(),
                bytes,
            ));
        }
        return Err(ProvidenceError::message(format!(
            "{} is not a resource-fork member",
            asset.relative_path
        )));
    };
    let entries = parse_resource_fork_entries(&bytes);
    if let Some(entry) = entries
        .iter()
        .find(|entry| entry.resource_type == resource_type && entry.id == resource_id)
    {
        return Ok((resource_type, resource_id, entry.data.clone()));
    }
    Err(ProvidenceError::message(format!(
        "{} {} was not found in {}",
        resource_type, resource_id, asset.relative_path
    )))
}

fn split_library_resource_fragment(relative_path: &str) -> Option<(&str, String, i16)> {
    let (file_path, fragment) = relative_path.split_once('#')?;
    let (resource_type, id) = fragment.rsplit_once(':')?;
    Some((
        file_path,
        resource_type.to_string(),
        id.parse::<i16>().ok()?,
    ))
}

fn managed_asset_kind_for_library(asset: &LibraryAsset, resource_type: &str) -> ManagedAssetKind {
    if asset.asset_type == "sound" || resource_type.trim() == "snd" {
        return ManagedAssetKind::Sound;
    }
    if asset.asset_type == "music" || resource_type.trim() == "MOD" {
        return ManagedAssetKind::Music;
    }
    if asset.asset_type == "special-land-tile" {
        return ManagedAssetKind::SpecialLandTile;
    }
    if asset.asset_type.contains("icon") || resource_type == "cicn" {
        return ManagedAssetKind::Icon;
    }
    if asset.asset_type == "picture" || resource_type == "PICT" {
        return ManagedAssetKind::Picture;
    }
    if asset.asset_type == "text"
        || resource_type == "TEXT"
        || resource_type == "STR#"
        || resource_type == "styl"
    {
        return ManagedAssetKind::Text;
    }
    ManagedAssetKind::Other
}

fn mime_for_resource(resource_type: &str) -> &'static str {
    if resource_type == "PICT" {
        "image/pict"
    } else if resource_type == "cicn" {
        "image/cicn"
    } else if resource_type.trim() == "snd" {
        "audio/x-mac-snd"
    } else if resource_type.trim() == "MOD" {
        "audio/x-mod"
    } else if resource_type == "TEXT" || resource_type == "STR#" {
        "text/plain"
    } else {
        "application/octet-stream"
    }
}

fn preview_extension(preview_data_url: Option<&str>, resource_type: &str) -> &'static str {
    if let Some(url) = preview_data_url {
        if url.starts_with("data:image/png") {
            return "png";
        }
        if url.starts_with("data:audio/wav") {
            return "wav";
        }
        if url.starts_with("data:text/") {
            return "txt";
        }
    }
    if resource_type == "TEXT" || resource_type == "STR#" {
        "txt"
    } else {
        "bin"
    }
}

fn read_asset_payload(root: &Path, path: &str) -> Result<Vec<u8>> {
    if path.trim().is_empty() {
        return Err(ProvidenceError::message(
            "Managed asset payload path is empty",
        ));
    }
    if path.starts_with("data:") {
        return decode_data_url(path);
    }
    let full_path = root.join(path);
    fs::read(&full_path).with_path(&full_path)
}

fn decode_data_url(value: &str) -> Result<Vec<u8>> {
    let Some((metadata, payload)) = value
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(','))
    else {
        return Err(ProvidenceError::message("Invalid data URL payload"));
    };
    if metadata.to_ascii_lowercase().contains(";base64") {
        return STANDARD
            .decode(payload)
            .map_err(|error| ProvidenceError::message(error.to_string()));
    }
    Ok(percent_decode(payload))
}

fn percent_decode(value: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(value.len());
    let input = value.as_bytes();
    let mut index = 0;
    while index < input.len() {
        if input[index] == b'%' && index + 2 < input.len() {
            if let (Some(high), Some(low)) =
                (hex_value(input[index + 1]), hex_value(input[index + 2]))
            {
                bytes.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        bytes.push(input[index]);
        index += 1;
    }
    bytes
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn copied_file_name(path: &str, preferred: &str, fallback: &str) -> String {
    let candidate = if path.starts_with("data:") {
        preferred
    } else {
        path.rsplit('/')
            .next()
            .filter(|part| !part.is_empty())
            .unwrap_or(preferred)
    };
    let safe = candidate
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>();
    if safe.trim().is_empty() {
        fallback.to_string()
    } else {
        safe
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_mod_copy_becomes_canonical_scenario_music() {
        let temp = tempfile::tempdir().expect("tempdir");
        let library_asset = LibraryAsset {
            id: "library-asset:providence:file:outdoor-music-mod".to_string(),
            asset_type: "music".to_string(),
            label: "Outdoor Music".to_string(),
            source: "library-source:providence:outdoor-music-mod".to_string(),
            relative_path: "Outdoor Music.mod".to_string(),
            bytes: crate::music_compatibility::replacement_bytes().len() as u64,
            sha256: crate::music_compatibility::OUTDOOR_MUSIC_REPLACEMENT_SHA256.to_string(),
            resource_type: Some("MOD ".to_string()),
            resource_id: None,
            preview_path: None,
            mime_type: Some("audio/x-mod".to_string()),
        };

        let managed = write_reference_library_asset(
            temp.path(),
            &library_asset,
            "MOD ",
            2,
            crate::music_compatibility::replacement_bytes(),
            "outdoor-music",
            "asset:test:outdoor-music".to_string(),
            Some(ManagedAssetKind::Music),
        )
        .expect("copy built-in music");

        assert_eq!(managed.kind, ManagedAssetKind::Music);
        assert_eq!(managed.resource_id, 2);
        assert_eq!(managed.scenario_music_slot, Some(2));
        assert_eq!(managed.linked_entity.as_deref(), Some("scenario-music:2"));
        assert!(managed
            .conversion
            .as_ref()
            .is_some_and(|conversion| { matches!(conversion.target, AssetImportTarget::Music) }));
        assert_eq!(
            fs::read(temp.path().join(&managed.resource_path)).expect("managed MOD payload"),
            crate::music_compatibility::replacement_bytes()
        );
    }
}
