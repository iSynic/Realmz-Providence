use crate::error::Result;
use crate::error::{IoPath, ProvidenceError};
use crate::exporter::{export_project as export_project_impl, ExportReport};
use crate::importer::{
    create_project as create_project_impl, import_scenario as import_scenario_impl,
    import_scenario_into_project as import_scenario_into_project_impl,
    open_project as open_project_impl, save_project as save_project_impl,
};
use crate::project::{ProvidenceProject, ValidationReport};
use crate::project::{
    ManagedAsset, ManagedAssetExportState, ManagedAssetKind,
};
use crate::resource_fork::{
    encode_cicn_resource, encode_pict_resource, encode_snd_resource,
    inspect_resource_preview, parse_resource_fork_entries, preview_data_url_for_resource,
    DecodedResourcePreview, PcmAudioPayload, RgbaImagePayload,
};
use crate::validation::validate_project as validate_project_impl;
use crate::workspace::{
    BUNDLED_LIBRARY_DIR,
    import_divinity_libraries as import_divinity_libraries_impl,
    import_realmz_reference_data as import_realmz_reference_data_impl,
    load_library_asset as load_library_asset_impl,
    open_workspace_with_bundled_libraries as open_workspace_with_bundled_libraries_impl,
    save_workspace as save_workspace_impl, LibraryCatalog, ProvidenceWorkspace,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use std::time::Instant;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkReport {
    pub project_name: String,
    pub maps: usize,
    pub triggers: usize,
    pub extracodes: usize,
    pub random_levels: usize,
    pub validation_ms: u128,
    pub estimated_canvas_tiles: usize,
    pub ok: bool,
}

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
}

#[tauri::command]
pub fn create_project(project_name: String, project_dir: String) -> Result<ProvidenceProject> {
    create_project_impl(project_name, project_dir)
}

#[tauri::command]
pub fn open_workspace(app: tauri::AppHandle, workspace_dir: String) -> Result<ProvidenceWorkspace> {
    open_workspace_with_bundled_libraries_impl(workspace_dir, bundled_library_root(&app))
}

#[tauri::command]
pub fn save_workspace(workspace_dir: String, workspace: ProvidenceWorkspace) -> Result<()> {
    save_workspace_impl(workspace_dir, &workspace)
}

#[tauri::command]
pub fn import_divinity_libraries(
    source_path: String,
    workspace_dir: String,
) -> Result<LibraryCatalog> {
    import_divinity_libraries_impl(source_path, workspace_dir)
}

#[tauri::command]
pub fn import_realmz_reference_data(
    source_path: String,
    workspace_dir: String,
) -> Result<LibraryCatalog> {
    import_realmz_reference_data_impl(source_path, workspace_dir)
}

#[tauri::command]
pub fn load_library_asset(workspace_dir: String, relative_path: String) -> Result<String> {
    let bytes = load_library_asset_impl(workspace_dir, relative_path)?;
    Ok(format!(
        "data:application/octet-stream;base64,{}",
        STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn load_library_asset_preview(
    workspace_dir: String,
    source: String,
    relative_path: String,
) -> Result<String> {
    let (file_path, fragment) = split_resource_fragment(&relative_path);
    let folder = if source.contains(":divinity:") {
        "divinity"
    } else if source.contains(":realmz:") {
        "realmz-reference"
    } else {
        "providence"
    };
    let relative = Path::new("raw").join(folder).join(file_path);
    let bytes = load_library_asset_impl(&workspace_dir, relative)?;
    if let Some((resource_type, resource_id)) = fragment {
        let entries = parse_resource_fork_entries(&bytes);
        if let Some(entry) = entries
            .iter()
            .find(|entry| entry.resource_type == resource_type && entry.id == resource_id)
        {
            if let Some(data_url) = preview_data_url_for_resource(&entry.resource_type, &entry.data)?
            {
                return Ok(data_url);
            }
            return Ok(format!(
                "data:application/octet-stream;base64,{}",
                STANDARD.encode(&entry.data)
            ));
        }
        return Err(ProvidenceError::message(format!(
            "{} {} was not found in {}",
            resource_type, resource_id, relative_path
        )));
    }
    Ok(format!(
        "data:{};base64,{}",
        mime_for_path(&relative_path),
        STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn inspect_library_asset_preview(
    workspace_dir: String,
    source: String,
    relative_path: String,
) -> Result<DecodedResourcePreview> {
    let (file_path, fragment) = split_resource_fragment(&relative_path);
    let folder = if source.contains(":divinity:") {
        "divinity"
    } else if source.contains(":realmz:") {
        "realmz-reference"
    } else {
        "providence"
    };
    let relative = Path::new("raw").join(folder).join(file_path);
    let bytes = load_library_asset_impl(&workspace_dir, relative)?;
    if let Some((resource_type, resource_id)) = fragment {
        let entries = parse_resource_fork_entries(&bytes);
        if let Some(entry) = entries
            .iter()
            .find(|entry| entry.resource_type == resource_type && entry.id == resource_id)
        {
            return inspect_resource_preview(&entry.resource_type, &entry.data);
        }
        return Err(ProvidenceError::message(format!(
            "{} {} was not found in {}",
            resource_type, resource_id, relative_path
        )));
    }
    Ok(DecodedResourcePreview {
        status: crate::resource_fork::ResourcePreviewStatus::MetadataOnly,
        mime_type: mime_for_path(&relative_path).to_string(),
        data_url: Some(format!(
            "data:{};base64,{}",
            mime_for_path(&relative_path),
            STANDARD.encode(bytes)
        )),
        summary: std::collections::BTreeMap::new(),
        diagnostics: Vec::new(),
    })
}

#[tauri::command]
pub fn import_scenario(source_path: String, project_dir: String) -> Result<ProvidenceProject> {
    import_scenario_impl(source_path, project_dir)
}

#[tauri::command]
pub fn import_scenario_into_project(
    source_path: String,
    project_dir: String,
    project_name: String,
) -> Result<ProvidenceProject> {
    import_scenario_into_project_impl(source_path, project_dir, project_name)
}

#[tauri::command]
pub fn open_project(project_dir: String) -> Result<ProvidenceProject> {
    open_project_impl(project_dir)
}

#[tauri::command]
pub fn load_project_asset(project_dir: String, relative_path: String) -> Result<String> {
    let project_dir = Path::new(&project_dir);
    let relative = Path::new(&relative_path);
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
    let bytes = fs::read(&target).with_path(&target)?;
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
    let original = STANDARD
        .decode(&request.original_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    let preview = STANDARD
        .decode(&request.preview_base64)
        .map_err(|error| ProvidenceError::message(error.to_string()))?;
    let token = unique_asset_token(&project, &request.label);
    let asset_id = format!("asset:{token}");
    let asset_dir = project_root.join("assets").join("media").join(&token);
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
    fs::write(asset_dir.join(&original_name), &original).with_path(asset_dir.join(&original_name))?;
    fs::write(asset_dir.join(&preview_name), &preview).with_path(asset_dir.join(&preview_name))?;

    let resource_bytes = match request.resource_type.as_str() {
        "PICT" => {
            let image = request.image.as_ref().ok_or_else(|| {
                ProvidenceError::message("PICT import requires decoded image pixels")
            })?;
            encode_pict_resource(image)?
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
    fs::write(asset_dir.join(&resource_name), &resource_bytes)
        .with_path(asset_dir.join(&resource_name))?;

    let rel_dir = format!("assets/media/{token}");
    project.assets.push(ManagedAsset {
        id: asset_id.clone(),
        label: request.label.trim().to_string(),
        kind: request.kind,
        resource_type: request.resource_type,
        resource_id: request.resource_id,
        file_name: original_name.clone(),
        original_path: format!("{rel_dir}/{original_name}"),
        preview_path: format!("{rel_dir}/{preview_name}"),
        resource_path: format!("{rel_dir}/{resource_name}"),
        mime_type: request.mime_type,
        bytes: original.len() as u64,
        sha256: sha256_hex(&original),
        width: request.image.as_ref().map(|image| image.width),
        height: request.image.as_ref().map(|image| image.height),
        duration_ms: request.audio.as_ref().and_then(|audio| audio.duration_ms),
        sample_rate: request.audio.as_ref().map(|audio| audio.sample_rate),
        channels: request.audio.as_ref().map(|audio| audio.channels),
        export_state: ManagedAssetExportState::Ready,
        provenance: "imported media".to_string(),
        linked_entity: request.linked_entity,
    });
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

#[tauri::command]
pub fn save_project(
    project_dir: String,
    mut project: ProvidenceProject,
) -> Result<ProvidenceProject> {
    project.validation = validate_project_impl(&project);
    save_project_impl(project_dir, &project)?;
    Ok(project)
}

#[tauri::command]
pub fn export_project(
    project_dir: String,
    project: ProvidenceProject,
    output_dir: String,
) -> Result<ExportReport> {
    export_project_impl(project_dir, &project, output_dir)
}

#[tauri::command]
pub fn validate_project(project: ProvidenceProject) -> ValidationReport {
    validate_project_impl(&project)
}

#[tauri::command]
pub fn benchmark_project(project: ProvidenceProject) -> BenchmarkReport {
    let start = Instant::now();
    let validation = validate_project_impl(&project);
    BenchmarkReport {
        project_name: project.scenario.name,
        maps: project.maps.len(),
        triggers: project.triggers.len(),
        extracodes: project.extracodes.len(),
        random_levels: project.random_levels.len(),
        validation_ms: start.elapsed().as_millis(),
        estimated_canvas_tiles: project.maps.len()
            * crate::project::MAP_SIZE
            * crate::project::MAP_SIZE,
        ok: validation.ok,
    }
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
        Some(dev_candidate)
    } else {
        None
    }
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

fn split_resource_fragment(relative_path: &str) -> (&str, Option<(String, i16)>) {
    let Some((file_path, fragment)) = relative_path.split_once('#') else {
        return (relative_path, None);
    };
    let Some((resource_type, id)) = fragment.rsplit_once(':') else {
        return (file_path, None);
    };
    let id = id.parse::<i16>().ok();
    (file_path, id.map(|id| (resource_type.to_string(), id)))
}

fn mime_for_path(path: &str) -> &'static str {
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
