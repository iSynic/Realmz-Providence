use crate::error::{IoPath, ProvidenceError, Result};
use crate::importer::RAW_SOURCES_DIR;
use crate::project::{LevelType, ProvidenceProject};
use crate::realmz::{
    write_battles, write_caste_overrides, write_complex_encounters, write_door_file,
    write_extracodes, write_fields, write_global_macro_hooks, write_land_layout, write_macro_file,
    write_map_records, write_messages, write_monster_descriptions, write_monster_set,
    write_monsters, write_option_labels, write_race_overrides, write_random_levels,
    write_scenario_contact_info, write_scenario_items, write_scenario_restrictions,
    write_scenario_shell, write_shops, write_simple_encounters, write_spell_overrides,
    write_thief_encounters, write_tile_solids, write_timed_encounters, write_treasures,
    DOOR_BYTES, EXTRACODE_BYTES,
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
    if let Some(shell) = &project.scenario.shell {
        write_if_nonempty(
            output_dir,
            scenario_shell_file_name(project),
            write_scenario_shell(shell)?,
            &mut written_files,
        )?;
    }
    if let Some(contact_info) = &project.scenario.contact_info {
        write_if_nonempty(
            output_dir,
            "Data CI",
            write_scenario_contact_info(contact_info)?,
            &mut written_files,
        )?;
    }
    if let Some(restrictions) = &project.scenario.restrictions {
        write_if_nonempty(
            output_dir,
            "Data RI",
            write_scenario_restrictions(restrictions)?,
            &mut written_files,
        )?;
    }
    if let Some(global_hooks) = &project.scenario.global_macro_hooks {
        write_if_nonempty(
            output_dir,
            "Global",
            write_global_macro_hooks(global_hooks)?,
            &mut written_files,
        )?;
    }
    if let Some(security_backup) = &project.scenario.security_backup {
        write_if_nonempty(
            output_dir,
            "Data CS",
            write_scenario_shell(security_backup)?,
            &mut written_files,
        )?;
    }
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
    if let Some(layout) = &project.land_layout {
        write_if_nonempty(
            output_dir,
            "Layout",
            write_land_layout(layout)?,
            &mut written_files,
        )?;
    }
    write_if_nonempty(
        output_dir,
        "Data Solids",
        write_tile_solids(&project.tile_attributes)?,
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
        preserve_imported_fixed_length(
            "Data ED3",
            write_macro_file(&project.triggers)?,
            DOOR_BYTES,
            &raw_dir,
        )?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data EDCD",
        preserve_imported_fixed_length(
            "Data EDCD",
            write_extracodes(&project.extracodes)?,
            EXTRACODE_BYTES,
            &raw_dir,
        )?,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data SD2",
        write_messages(&project.messages)?,
        crate::realmz::MESSAGE_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data OD",
        write_option_labels(&project.option_labels)?,
        crate::realmz::OPTION_LABEL_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data MD2",
        write_map_records(&project.map_records)?,
        crate::realmz::MAP_RECORD_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data BD",
        write_battles(&project.battles)?,
        crate::realmz::BATTLE_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data MD",
        write_monsters(&project.monsters)?,
        crate::realmz::MONSTER_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    for monster_set in &project.monster_sets {
        write_fixed_if_nonempty(
            output_dir,
            &monster_set.source_file,
            write_monster_set(monster_set)?,
            crate::realmz::MONSTER_BYTES,
            &raw_dir,
            &mut written_files,
        )?;
    }
    write_fixed_if_nonempty(
        output_dir,
        "Data DES",
        write_monster_descriptions(&project.monster_descriptions)?,
        crate::realmz::MONSTER_DESCRIPTION_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data NI",
        write_scenario_items(&project.scenario_items)?,
        crate::realmz::ITEM_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data TD",
        write_treasures(&project.treasures)?,
        crate::realmz::TREASURE_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data SD",
        write_shops(&project.shops)?,
        crate::realmz::SHOP_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data ED",
        write_simple_encounters(&project.simple_encounters)?,
        crate::realmz::SIMPLE_ENCOUNTER_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data ED2",
        write_complex_encounters(&project.complex_encounters)?,
        crate::realmz::COMPLEX_ENCOUNTER_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data TD2",
        write_thief_encounters(&project.thief_encounters)?,
        crate::realmz::THIEF_ENCOUNTER_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data TD3",
        write_timed_encounters(&project.timed_encounters)?,
        crate::realmz::TIMED_ENCOUNTER_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_spell_overrides_preserving_tail(
        output_dir,
        &raw_dir,
        &project.spell_overrides,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data Race",
        write_race_overrides(&project.race_overrides)?,
        crate::realmz::RACE_BYTES,
        &raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data Caste",
        write_caste_overrides(&project.caste_overrides)?,
        crate::realmz::CASTE_BYTES,
        &raw_dir,
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

fn write_fixed_if_nonempty(
    output_dir: &Path,
    name: &str,
    mut bytes: Vec<u8>,
    record_bytes: usize,
    raw_dir: &Path,
    written: &mut Vec<String>,
) -> Result<()> {
    if bytes.is_empty() {
        return Ok(());
    }
    let raw_path = raw_dir.join(name);
    if raw_path.is_file() {
        let raw = fs::read(&raw_path).with_path(&raw_path)?;
        if raw.len() > bytes.len() && raw.len() % record_bytes != 0 {
            bytes.extend_from_slice(&raw[bytes.len()..]);
        }
    }
    write_if_nonempty(output_dir, name, bytes, written)
}

fn preserve_imported_fixed_length(
    name: &str,
    mut bytes: Vec<u8>,
    record_bytes: usize,
    raw_dir: &Path,
) -> Result<Vec<u8>> {
    let raw_path = raw_dir.join(name);
    if !raw_path.is_file() {
        return Ok(bytes);
    }
    let raw = fs::read(&raw_path).with_path(&raw_path)?;
    if raw.len() <= bytes.len() {
        return Ok(bytes);
    }
    if raw.len() % record_bytes == 0 {
        bytes.resize(raw.len(), 0);
    } else {
        bytes.extend_from_slice(&raw[bytes.len()..]);
    }
    Ok(bytes)
}

fn write_spell_overrides_preserving_tail(
    output_dir: &Path,
    raw_dir: &Path,
    records: &[crate::project::ScenarioSpellOverride],
    written_files: &mut Vec<String>,
) -> Result<()> {
    let overlay = write_spell_overrides(records)?;
    if overlay.is_empty() {
        return Ok(());
    }
    let raw_path = raw_dir.join("Data Spell");
    let mut bytes = if raw_path.is_file() {
        fs::read(&raw_path).with_path(&raw_path)?
    } else {
        Vec::new()
    };
    if bytes.len() < overlay.len() {
        bytes.resize(overlay.len(), 0);
    }
    bytes[..overlay.len()].copy_from_slice(&overlay);
    write_if_nonempty(output_dir, "Data Spell", bytes, written_files)
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

fn scenario_shell_file_name(project: &ProvidenceProject) -> &str {
    project
        .scenario
        .shell
        .as_ref()
        .map(|shell| shell.source_file.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(project.scenario.name.as_str())
}

#[cfg(test)]
mod tests {
    use super::preserve_imported_fixed_length;
    use std::fs;

    #[test]
    fn preserves_imported_fixed_row_file_length_when_export_model_shrinks() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        fs::write(raw_dir.join("Data EDCD"), vec![0x7Au8; 30]).unwrap();

        let bytes = preserve_imported_fixed_length("Data EDCD", vec![1u8; 10], 10, raw_dir).unwrap();

        assert_eq!(bytes.len(), 30);
        assert_eq!(&bytes[..10], &[1u8; 10]);
        assert_eq!(&bytes[10..], &[0u8; 20]);
    }

    #[test]
    fn preserves_unknown_tail_bytes_for_malformed_fixed_row_file() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        fs::write(raw_dir.join("Data EDCD"), vec![9u8, 8, 7, 6, 5]).unwrap();

        let bytes = preserve_imported_fixed_length("Data EDCD", vec![1u8, 2], 10, raw_dir).unwrap();

        assert_eq!(bytes, vec![1u8, 2, 7, 6, 5]);
    }
}
