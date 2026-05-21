use crate::error::{ProvidenceError, Result};
use crate::exporter::{export_project as export_project_impl, ExportReport};
use crate::importer::{
    create_project as create_project_impl, import_scenario as import_scenario_impl,
    import_scenario_into_project as import_scenario_into_project_impl,
    open_project as open_project_impl, save_project as save_project_impl,
};
use crate::media_assets::mime_for_path;
use crate::project::{ProvidenceProject, ValidationReport};
use crate::resource_fork::parse_resource_fork_entries;
use crate::resource_preview::{
    inspect_resource_preview, preview_data_url_for_resource, DecodedResourcePreview,
};
use crate::validation::validate_project as validate_project_impl;
use crate::workspace::{
    import_divinity_libraries as import_divinity_libraries_impl,
    import_realmz_reference_data as import_realmz_reference_data_impl,
    load_library_asset as load_library_asset_impl,
    open_workspace_with_bundled_libraries as open_workspace_with_bundled_libraries_impl,
    save_workspace as save_workspace_impl, LibraryCatalog, ProvidenceWorkspace,
    BUNDLED_LIBRARY_DIR,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::Manager;

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
            if let Some(data_url) =
                preview_data_url_for_resource(&entry.resource_type, &entry.data)?
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
        status: crate::resource_preview::ResourcePreviewStatus::MetadataOnly,
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
