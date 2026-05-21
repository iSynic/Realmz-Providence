use crate::error::{IoPath, ProvidenceError, Result};
use crate::importer::RAW_SOURCES_DIR;
use crate::project::{LevelType, ProvidenceProject};
use crate::realmz::{
    write_door_file, write_extracodes, write_fields, write_macro_file, write_random_levels,
};
use crate::resource_fork::{
    merge_resource_entries, parse_resource_fork_entries, ResourceForkEntry,
};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub output_path: String,
    pub written_files: Vec<String>,
    pub pass_through_files: Vec<String>,
    pub written_resources: Vec<String>,
    pub preserved_resources: usize,
    pub resource_warnings: Vec<String>,
    pub blocked_assets: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn export_project(
    project_dir: impl AsRef<Path>,
    project: &ProvidenceProject,
    output_dir: impl AsRef<Path>,
) -> Result<ExportReport> {
    let project_dir = project_dir.as_ref();
    let output_dir = output_dir.as_ref();
    let raw_dir = project_dir.join(RAW_SOURCES_DIR);
    if !raw_dir.is_dir() {
        return Err(ProvidenceError::message(format!(
            "Missing raw source snapshot: {}",
            raw_dir.display()
        )));
    }
    fs::create_dir_all(output_dir).with_path(output_dir)?;

    let mut pass_through_files = Vec::new();
    for entry in WalkDir::new(&raw_dir).max_depth(1).min_depth(1) {
        let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let dest = output_dir.join(&name);
        fs::copy(entry.path(), &dest).with_path(&dest)?;
        pass_through_files.push(name);
    }

    let mut written_files = Vec::new();
    write_if_nonempty(
        output_dir,
        "Data LD",
        write_fields(&project.maps, LevelType::Land)?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data DL",
        write_fields(&project.maps, LevelType::Dungeon)?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data DD",
        write_door_file(&project.triggers, LevelType::Land)?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data DDD",
        write_door_file(&project.triggers, LevelType::Dungeon)?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data RD",
        write_random_levels(&project.random_levels, LevelType::Land)?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data RDD",
        write_random_levels(&project.random_levels, LevelType::Dungeon)?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data ED3",
        write_macro_file(&project.triggers)?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data EDCD",
        write_extracodes(&project.extracodes)?,
        &mut written_files,
    )?;
    let resource_result = write_managed_resources(project_dir, output_dir, project)?;
    if resource_result.resource_file_written {
        written_files.push(resource_result.resource_file_name.clone());
    }

    let written: BTreeSet<&str> = written_files.iter().map(String::as_str).collect();
    pass_through_files.retain(|name| !written.contains(name.as_str()));
    let warnings = if project.validation.ok {
        Vec::new()
    } else {
        project.validation.warnings.clone()
    };
    Ok(ExportReport {
        output_path: output_dir.to_string_lossy().to_string(),
        written_files,
        pass_through_files,
        written_resources: resource_result.written_resources,
        preserved_resources: resource_result.preserved_resources,
        resource_warnings: resource_result.resource_warnings,
        blocked_assets: resource_result.blocked_assets,
        warnings,
    })
}

fn write_if_nonempty(
    output_dir: &Path,
    name: &str,
    bytes: Vec<u8>,
    written: &mut Vec<String>,
) -> Result<()> {
    if bytes.is_empty() {
        return Ok(());
    }
    let path = output_dir.join(name);
    fs::write(&path, bytes).with_path(&path)?;
    written.push(name.to_string());
    Ok(())
}

#[derive(Debug, Default)]
struct ResourceExportResult {
    resource_file_written: bool,
    resource_file_name: String,
    written_resources: Vec<String>,
    preserved_resources: usize,
    resource_warnings: Vec<String>,
    blocked_assets: Vec<String>,
}

fn write_managed_resources(
    project_dir: &Path,
    output_dir: &Path,
    project: &ProvidenceProject,
) -> Result<ResourceExportResult> {
    let mut result = ResourceExportResult {
        resource_file_name: resource_file_name(project),
        ..ResourceExportResult::default()
    };
    if project.assets.is_empty() {
        return Ok(result);
    }
    let raw_dir = project_dir.join(RAW_SOURCES_DIR);
    let raw_resource_path = raw_dir.join(&result.resource_file_name);
    let original = if raw_resource_path.is_file() {
        fs::read(&raw_resource_path).with_path(&raw_resource_path)?
    } else {
        result.resource_warnings.push(format!(
            "No source resource fork named {} was found; creating one for managed media.",
            result.resource_file_name
        ));
        Vec::new()
    };
    result.preserved_resources = parse_resource_fork_entries(&original).len();
    let mut updates = Vec::new();
    for asset in &project.assets {
        if !matches!(
            asset.export_state,
            crate::project::ManagedAssetExportState::Ready
        ) {
            result.blocked_assets.push(asset.label.clone());
            continue;
        }
        if !matches!(asset.resource_type.as_str(), "PICT" | "cicn" | "snd ") {
            result.blocked_assets.push(format!(
                "{} uses unsupported resource type {}",
                asset.label, asset.resource_type
            ));
            continue;
        }
        let path = project_dir.join(&asset.resource_path);
        if !path.is_file() {
            result.blocked_assets.push(format!(
                "{} is missing converted resource bytes",
                asset.label
            ));
            continue;
        }
        let data = fs::read(&path).with_path(&path)?;
        updates.push(ResourceForkEntry {
            resource_type: asset.resource_type.clone(),
            id: asset.resource_id,
            name: asset.label.clone(),
            attributes: 0,
            data,
        });
        result.written_resources.push(format!(
            "{} {}: {}",
            asset.resource_type, asset.resource_id, asset.label
        ));
    }
    if updates.is_empty() {
        return Ok(result);
    }
    let (resource_bytes, replaced) = merge_resource_entries(&original, updates)?;
    if replaced > 0 {
        result.resource_warnings.push(format!(
            "{replaced} existing resource(s) were replaced by managed assets."
        ));
    }
    let dest = output_dir.join(&result.resource_file_name);
    fs::write(&dest, resource_bytes).with_path(&dest)?;
    result.resource_file_written = true;
    Ok(result)
}

fn resource_file_name(project: &ProvidenceProject) -> String {
    project
        .source
        .files
        .iter()
        .find(|file| matches!(file.role, crate::project::SourceFileRole::ResourceFork))
        .map(|file| file.name.clone())
        .unwrap_or_else(|| "Scenario".to_string())
}
