use crate::error::{IoPath, ProvidenceError, Result};
use crate::importer::RAW_SOURCES_DIR;
use crate::project::{LevelType, ProvidenceProject};
use crate::realmz::{
    write_door_file, write_extracodes, write_fields, write_macro_file, write_random_levels,
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
