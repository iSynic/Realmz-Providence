use crate::error::{IoPath, ProvidenceError, Result};
use crate::importer::RAW_SOURCES_DIR;
use crate::project::{
    ItemTextRecord, LevelType, MonsterIconOverride, MonsterIconOverrideSource, ProvidenceProject,
    ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride, ScenarioTarget,
    TargetCompatibilityBuckets, TargetCompatibilityIssue,
};
use crate::realmz::{
    write_battles, write_caste_overrides, write_complex_encounters, write_custom_landlook_metadata,
    write_door_file_for_levels, write_extracodes, write_fields, write_global_macro_hooks,
    write_land_layout, write_macro_file, write_map_records, write_messages,
    write_monster_descriptions, write_monster_set, write_monsters, write_option_labels,
    write_race_overrides, write_random_levels, write_scenario_contact_info, write_scenario_items,
    write_scenario_restrictions, write_scenario_shell, write_scenario_support_file, write_shops,
    write_simple_encounters, write_spell_overrides, write_thief_encounters, write_tile_solids,
    write_timed_encounters, write_treasures, DOOR_BYTES, EXTRACODE_BYTES,
};
use crate::resource_fork::{
    decode_string_list_resource, encode_string_list_resource, merge_resource_entries,
    merge_resource_entries_with_removals, parse_resource_fork_entries, ResourceForkEntry,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub output_path: String,
    pub target: ScenarioTarget,
    pub written_files: Vec<String>,
    pub pass_through_files: Vec<String>,
    pub written_resources: Vec<String>,
    pub preserved_resources: usize,
    pub resource_warnings: Vec<String>,
    pub blocked_assets: Vec<String>,
    pub warnings: Vec<String>,
    pub target_compatibility_issues: Vec<crate::project::TargetCompatibilityIssue>,
    pub target_compatibility: TargetCompatibilityBuckets,
}

pub fn export_project(
    project_dir: impl AsRef<Path>,
    project: &ProvidenceProject,
    output_dir: impl AsRef<Path>,
    target: ScenarioTarget,
) -> Result<ExportReport> {
    let project_dir = project_dir.as_ref();
    let output_dir = output_dir.as_ref();
    let raw_dir = project_dir.join(if project.source.raw_sources_dir.trim().is_empty() {
        RAW_SOURCES_DIR
    } else {
        project.source.raw_sources_dir.as_str()
    });
    let preserves_source_snapshot = project.source.requires_compatibility_annex();
    if preserves_source_snapshot && !raw_dir.is_dir() {
        return Err(ProvidenceError::message(format!(
            "Missing raw source snapshot: {}",
            raw_dir.display()
        )));
    }
    let preserved_raw_dir = preserves_source_snapshot.then_some(raw_dir.as_path());
    fs::create_dir_all(output_dir).with_path(output_dir)?;

    let mut pass_through_files = Vec::new();
    if preserves_source_snapshot {
        for entry in WalkDir::new(&raw_dir).max_depth(1).min_depth(1) {
            let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if is_custom_names_support_file(&name) || is_generated_runtime_cache_file(&name) {
                continue;
            }
            let dest = output_dir.join(&name);
            fs::copy(entry.path(), &dest).with_path(&dest)?;
            pass_through_files.push(name);
        }
    }

    let mut written_files = Vec::new();
    if !preserves_source_snapshot {
        write_authored_runtime_baseline(output_dir, project, target, &mut written_files)?;
    }
    if let Some(shell) = &project.scenario.shell {
        write_if_nonempty(
            output_dir,
            scenario_shell_file_name(project),
            write_scenario_shell(shell)?,
            &mut written_files,
        )?;
    }
    if let Some(support_file) = &project.scenario.support_file {
        write_if_nonempty(
            output_dir,
            &support_file.source_file,
            write_scenario_support_file(support_file)?,
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
    for landlook in &project.custom_landlooks {
        if landlook.authored {
            write_if_nonempty(
                output_dir,
                &landlook.source_file,
                write_custom_landlook_metadata(landlook)?,
                &mut written_files,
            )?;
        }
    }
    write_if_nonempty(
        output_dir,
        "Data DD",
        write_door_file_for_levels(
            &project.triggers,
            LevelType::Land,
            project
                .maps
                .iter()
                .filter(|map| map.level_type == LevelType::Land)
                .count(),
        )?,
        &mut written_files,
    )?;
    write_if_nonempty(
        output_dir,
        "Data DDD",
        write_door_file_for_levels(
            &project.triggers,
            LevelType::Dungeon,
            project
                .maps
                .iter()
                .filter(|map| map.level_type == LevelType::Dungeon)
                .count(),
        )?,
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
            preserved_raw_dir,
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
            preserved_raw_dir,
        )?,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data SD2",
        write_messages(&project.messages)?,
        crate::realmz::MESSAGE_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data OD",
        write_option_labels(&project.option_labels)?,
        crate::realmz::OPTION_LABEL_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data MD2",
        write_map_records(&project.map_records)?,
        crate::realmz::MAP_RECORD_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data BD",
        write_battles(&project.battles)?,
        crate::realmz::BATTLE_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data MD",
        write_monsters(&project.monsters)?,
        crate::realmz::MONSTER_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    for monster_set in &project.monster_sets {
        write_fixed_if_nonempty(
            output_dir,
            &monster_set.source_file,
            write_monster_set(monster_set)?,
            crate::realmz::MONSTER_BYTES,
            preserved_raw_dir,
            &mut written_files,
        )?;
    }
    write_fixed_if_nonempty(
        output_dir,
        "Data DES",
        write_monster_descriptions(&project.monster_descriptions)?,
        crate::realmz::MONSTER_DESCRIPTION_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    let mut scenario_item_bytes = overlay_zero_filled_fixed_capacity(
        "Data NI",
        write_scenario_items(&project.scenario_items)?,
        preserved_raw_dir,
    )?;
    if !preserves_source_snapshot {
        scenario_item_bytes.resize(200 * crate::realmz::ITEM_BYTES, 0);
    }
    write_fixed_if_nonempty(
        output_dir,
        "Data NI",
        scenario_item_bytes,
        crate::realmz::ITEM_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data TD",
        write_treasures(&project.treasures)?,
        crate::realmz::TREASURE_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data SD",
        append_preserved_shop_source_suffix(write_shops(&project.shops)?, preserved_raw_dir)?,
        crate::realmz::SHOP_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data ED",
        write_simple_encounters(&project.simple_encounters)?,
        crate::realmz::SIMPLE_ENCOUNTER_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data ED2",
        write_complex_encounters(&project.complex_encounters)?,
        crate::realmz::COMPLEX_ENCOUNTER_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data TD2",
        write_thief_encounters(&project.thief_encounters)?,
        crate::realmz::THIEF_ENCOUNTER_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_fixed_if_nonempty(
        output_dir,
        "Data TD3",
        write_timed_encounters(&project.timed_encounters)?,
        crate::realmz::TIMED_ENCOUNTER_BYTES,
        preserved_raw_dir,
        &mut written_files,
    )?;
    write_spell_overrides_preserving_tail(
        output_dir,
        preserved_raw_dir,
        &project.spell_overrides,
        &mut written_files,
    )?;
    write_custom_spell_name_resources(
        output_dir,
        preserved_raw_dir,
        &project.spell_overrides,
        &mut written_files,
    )?;
    write_item_text_resources(
        output_dir,
        preserved_raw_dir,
        &project.item_texts,
        &mut written_files,
    )?;
    write_race_overrides_for_export(
        output_dir,
        preserved_raw_dir,
        &project.race_overrides,
        &mut written_files,
    )?;
    write_caste_overrides_for_export(
        output_dir,
        preserved_raw_dir,
        &project.caste_overrides,
        &mut written_files,
    )?;
    let resource_result =
        write_managed_resources(project_dir, output_dir, preserved_raw_dir, project, target)?;
    if resource_result.resource_file_written {
        written_files.push(resource_result.resource_file_name.clone());
    }

    let mut unique_written = BTreeSet::new();
    written_files.retain(|name| unique_written.insert(name.clone()));
    let written: BTreeSet<&str> = written_files.iter().map(String::as_str).collect();
    pass_through_files.retain(|name| !written.contains(name.as_str()));
    let warnings = if project.validation.ok {
        Vec::new()
    } else {
        project.validation.warnings.clone()
    };
    let target_compatibility_issues = target_compatibility_issues_for_export(project, target);
    let target_compatibility =
        crate::validation::bucket_target_compatibility_issues(&target_compatibility_issues);
    Ok(ExportReport {
        output_path: output_dir.to_string_lossy().to_string(),
        target,
        written_files,
        pass_through_files,
        written_resources: resource_result.written_resources,
        preserved_resources: resource_result.preserved_resources,
        resource_warnings: resource_result.resource_warnings,
        blocked_assets: resource_result.blocked_assets,
        warnings,
        target_compatibility_issues,
        target_compatibility,
    })
}

fn write_authored_runtime_baseline(
    output_dir: &Path,
    project: &ProvidenceProject,
    target: ScenarioTarget,
    written_files: &mut Vec<String>,
) -> Result<()> {
    const SCENARIO_SUPPORT_BYTES: usize = 600;
    const SCENARIO_ITEM_TABLE_BYTES: usize = 200 * crate::realmz::ITEM_BYTES;
    const TILE_SOLIDS_BYTES: usize = 1024;
    const EMPTY_RUNTIME_TABLES: &[&str] = &[
        "Data DL", "Data RDD", "Data SD", "Data TD2", "Data TD3", "Data ED", "Data ED2", "Data MD",
    ];

    let shell = project.scenario.shell.as_ref().ok_or_else(|| {
        ProvidenceError::message("Authored scenarios require scenario shell metadata.")
    })?;
    let entries = [
        ("Scenario".to_string(), vec![0; SCENARIO_SUPPORT_BYTES]),
        (
            resource_file_name(project, target),
            crate::resource_fork::write_resource_fork(&[])?,
        ),
        ("Data CS".to_string(), write_scenario_shell(shell)?),
        ("Data NI".to_string(), vec![0; SCENARIO_ITEM_TABLE_BYTES]),
        ("Data Solids".to_string(), vec![0; TILE_SOLIDS_BYTES]),
    ];
    for (name, bytes) in entries {
        write_generated_file(output_dir, &name, bytes, written_files)?;
    }
    write_generated_file(output_dir, "Data DDD", Vec::new(), written_files)?;
    for name in EMPTY_RUNTIME_TABLES {
        write_generated_file(output_dir, name, Vec::new(), written_files)?;
    }
    Ok(())
}

fn write_generated_file(
    output_dir: &Path,
    name: &str,
    bytes: Vec<u8>,
    written: &mut Vec<String>,
) -> Result<()> {
    let path = output_dir.join(name);
    fs::write(&path, bytes).with_path(&path)?;
    written.push(name.to_string());
    Ok(())
}

fn target_compatibility_issues_for_export(
    project: &ProvidenceProject,
    target: ScenarioTarget,
) -> Vec<TargetCompatibilityIssue> {
    let issues = crate::validation::validate_target_compatibility(project);
    issues
        .into_iter()
        .filter(|issue| {
            if target == ScenarioTarget::ProvidencePortableFolder {
                true
            } else {
                issue.target == target || issue.target == ScenarioTarget::ProvidencePortableFolder
            }
        })
        .collect()
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
    raw_dir: Option<&Path>,
    written: &mut Vec<String>,
) -> Result<()> {
    if bytes.is_empty() {
        return Ok(());
    }
    if let Some(raw_dir) = raw_dir {
        let raw_path = raw_dir.join(name);
        if raw_path.is_file() {
            let raw = fs::read(&raw_path).with_path(&raw_path)?;
            if raw.len() > bytes.len() && raw.len() % record_bytes != 0 {
                bytes.extend_from_slice(&raw[bytes.len()..]);
            }
        }
    }
    write_if_nonempty(output_dir, name, bytes, written)
}

fn overlay_zero_filled_fixed_capacity(
    name: &str,
    bytes: Vec<u8>,
    raw_dir: Option<&Path>,
) -> Result<Vec<u8>> {
    let Some(raw_dir) = raw_dir else {
        return Ok(bytes);
    };
    let raw_path = raw_dir.join(name);
    if bytes.is_empty() || !raw_path.is_file() {
        return Ok(bytes);
    }
    let mut raw = fs::read(&raw_path).with_path(&raw_path)?;
    if raw.len() <= bytes.len() || raw.iter().any(|byte| *byte != 0) {
        return Ok(bytes);
    }
    raw[..bytes.len()].copy_from_slice(&bytes);
    Ok(raw)
}

fn append_preserved_shop_source_suffix(
    mut bytes: Vec<u8>,
    raw_dir: Option<&Path>,
) -> Result<Vec<u8>> {
    let Some(raw_dir) = raw_dir else {
        return Ok(bytes);
    };
    let raw_path = raw_dir.join("Data SD");
    if bytes.is_empty() || !raw_path.is_file() {
        return Ok(bytes);
    }
    let raw = fs::read(&raw_path).with_path(&raw_path)?;
    let source_prefix_bytes =
        crate::realmz::shop_prefix_record_count(&raw) * crate::realmz::SHOP_BYTES;
    let full_source_bytes = raw.len() / crate::realmz::SHOP_BYTES * crate::realmz::SHOP_BYTES;
    let suffix_start = if source_prefix_bytes < full_source_bytes {
        Some(source_prefix_bytes)
    } else if full_source_bytes < raw.len() {
        Some(full_source_bytes)
    } else {
        None
    };
    let Some(suffix_start) = suffix_start else {
        return Ok(bytes);
    };
    bytes.extend_from_slice(&raw[suffix_start..]);
    Ok(bytes)
}

fn preserve_imported_fixed_length(
    name: &str,
    mut bytes: Vec<u8>,
    record_bytes: usize,
    raw_dir: Option<&Path>,
) -> Result<Vec<u8>> {
    let Some(raw_dir) = raw_dir else {
        return Ok(bytes);
    };
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RulesCompilerBaseline {
    schema_version: u32,
    race: RulesCompilerBaselineFamily,
    caste: RulesCompilerBaselineFamily,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RulesCompilerBaselineFamily {
    record_bytes: usize,
    records: usize,
    bytes_base64: String,
}

fn write_race_overrides_for_export(
    output_dir: &Path,
    raw_dir: Option<&Path>,
    records: &[ScenarioRaceOverride],
    written_files: &mut Vec<String>,
) -> Result<()> {
    let source_backed = raw_dir
        .map(|raw_dir| raw_dir.join("Data Race").is_file())
        .unwrap_or(false);
    let sanitized;
    let writer_records = if source_backed {
        records
    } else {
        sanitized = records
            .iter()
            .cloned()
            .map(|mut record| {
                record.raw_bytes.clear();
                record
            })
            .collect::<Vec<_>>();
        sanitized.as_slice()
    };
    write_rule_overrides_for_export(
        output_dir,
        raw_dir,
        "Data Race",
        crate::realmz::RACE_BYTES,
        crate::realmz::RACE_OVERRIDE_RECORDS,
        records.iter().map(|record| record.id).collect(),
        write_race_overrides(writer_records)?,
        written_files,
    )
}

fn write_caste_overrides_for_export(
    output_dir: &Path,
    raw_dir: Option<&Path>,
    records: &[ScenarioCasteOverride],
    written_files: &mut Vec<String>,
) -> Result<()> {
    let source_backed = raw_dir
        .map(|raw_dir| raw_dir.join("Data Caste").is_file())
        .unwrap_or(false);
    let sanitized;
    let writer_records = if source_backed {
        records
    } else {
        sanitized = records
            .iter()
            .cloned()
            .map(|mut record| {
                record.raw_bytes.clear();
                record
            })
            .collect::<Vec<_>>();
        sanitized.as_slice()
    };
    write_rule_overrides_for_export(
        output_dir,
        raw_dir,
        "Data Caste",
        crate::realmz::CASTE_BYTES,
        crate::realmz::CASTE_OVERRIDE_RECORDS,
        records.iter().map(|record| record.id).collect(),
        write_caste_overrides(writer_records)?,
        written_files,
    )
}

#[allow(clippy::too_many_arguments)]
fn write_rule_overrides_for_export(
    output_dir: &Path,
    raw_dir: Option<&Path>,
    name: &str,
    record_bytes: usize,
    fresh_records: usize,
    record_ids: Vec<usize>,
    encoded: Vec<u8>,
    written_files: &mut Vec<String>,
) -> Result<()> {
    if record_ids.is_empty() {
        return Ok(());
    }
    let raw_path = raw_dir.map(|raw_dir| raw_dir.join(name));
    let source_backed = raw_path.as_ref().is_some_and(|path| path.is_file());
    if !source_backed {
        if let Some(id) = record_ids.iter().find(|id| **id >= fresh_records) {
            return Err(ProvidenceError::message(format!(
                "{name} record {id} is outside the fresh 0..{} scenario slot range.",
                fresh_records - 1
            )));
        }
    }

    let (mut body, tail) = if let Some(raw_path) = raw_path.filter(|path| path.is_file()) {
        let mut raw = fs::read(&raw_path).with_path(&raw_path)?;
        let body_bytes = raw.len() / record_bytes * record_bytes;
        let tail = raw.split_off(body_bytes);
        (raw, tail)
    } else {
        (
            rule_compiler_baseline_bytes(name, record_bytes, fresh_records)?,
            Vec::new(),
        )
    };
    let required_body_bytes = record_ids
        .iter()
        .map(|id| (id + 1) * record_bytes)
        .max()
        .unwrap_or(0);
    if body.len() < required_body_bytes {
        body.resize(required_body_bytes, 0);
    }
    for id in record_ids {
        let start = id * record_bytes;
        let end = start + record_bytes;
        let record = encoded.get(start..end).ok_or_else(|| {
            ProvidenceError::message(format!("{name} writer did not produce record {id}."))
        })?;
        body[start..end].copy_from_slice(record);
    }
    body.extend_from_slice(&tail);
    write_if_nonempty(output_dir, name, body, written_files)
}

fn rule_compiler_baseline_bytes(
    name: &str,
    record_bytes: usize,
    records: usize,
) -> Result<Vec<u8>> {
    let baseline: RulesCompilerBaseline =
        serde_json::from_str(include_str!("../../src/shared/rulesCompilerBaseline.json")).map_err(
            |error| ProvidenceError::message(format!("Invalid rules compiler baseline: {error}")),
        )?;
    if baseline.schema_version != 1 {
        return Err(ProvidenceError::message(format!(
            "Unsupported rules compiler baseline schema {}.",
            baseline.schema_version
        )));
    }
    let family = match name {
        "Data Race" => baseline.race,
        "Data Caste" => baseline.caste,
        _ => {
            return Err(ProvidenceError::message(format!(
                "No rules compiler baseline exists for {name}."
            )))
        }
    };
    if family.record_bytes != record_bytes || family.records != records {
        return Err(ProvidenceError::message(format!(
            "Rules compiler baseline metadata for {name} is invalid."
        )));
    }
    let bytes = STANDARD.decode(&family.bytes_base64).map_err(|error| {
        ProvidenceError::message(format!(
            "Rules compiler baseline for {name} is not base64: {error}"
        ))
    })?;
    if bytes.len() != record_bytes * records {
        return Err(ProvidenceError::message(format!(
            "Rules compiler baseline for {name} has {} bytes; expected {}.",
            bytes.len(),
            record_bytes * records
        )));
    }
    Ok(bytes)
}

fn write_spell_overrides_preserving_tail(
    output_dir: &Path,
    raw_dir: Option<&Path>,
    records: &[ScenarioSpellOverride],
    written_files: &mut Vec<String>,
) -> Result<()> {
    if let Some(record) = records
        .iter()
        .find(|record| record.id >= crate::realmz::SPELL_OVERRIDE_RECORDS)
    {
        return Err(ProvidenceError::message(format!(
            "Custom spell {} is outside Data Spell's 0..104 custom slot range.",
            record.id
        )));
    }
    let overlay = write_spell_overrides(records)?;
    if overlay.is_empty() {
        return Ok(());
    }
    let fresh_capacity = crate::realmz::SPELL_OVERRIDE_RECORDS * crate::realmz::SPELL_BYTES;
    let raw_path = raw_dir.map(|raw_dir| raw_dir.join("Data Spell"));
    let mut bytes = if let Some(raw_path) = raw_path.filter(|path| path.is_file()) {
        fs::read(&raw_path).with_path(&raw_path)?
    } else {
        vec![0; fresh_capacity]
    };
    if bytes.len() < overlay.len() {
        bytes.resize(overlay.len(), 0);
    }
    bytes[..overlay.len()].copy_from_slice(&overlay);
    write_if_nonempty(output_dir, "Data Spell", bytes, written_files)
}

fn write_custom_spell_name_resources(
    output_dir: &Path,
    raw_dir: Option<&Path>,
    records: &[ScenarioSpellOverride],
    written_files: &mut Vec<String>,
) -> Result<()> {
    let preserved = match raw_dir {
        Some(raw_dir) => data_spell_resource_fork(raw_dir)?,
        None => None,
    };
    let source_backed = preserved.is_some();
    let candidates = records
        .iter()
        .filter(|record| {
            record.id < crate::realmz::SPELL_OVERRIDE_RECORDS && (source_backed || record.authored)
        })
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        return Ok(());
    }
    let (resource_file_name, original) =
        preserved.unwrap_or_else(|| ("Data Spell.rsrc".to_string(), Vec::new()));
    let updates = custom_spell_name_resource_updates(&candidates, &original);
    if updates.is_empty() {
        return Ok(());
    }
    let (resource_bytes, _) = merge_resource_entries(&original, updates)?;
    let dest = output_dir.join(&resource_file_name);
    fs::write(&dest, resource_bytes).with_path(&dest)?;
    if !written_files.iter().any(|name| name == &resource_file_name) {
        written_files.push(resource_file_name);
    }
    Ok(())
}

fn custom_spell_name_resource_updates(
    records: &[&ScenarioSpellOverride],
    original: &[u8],
) -> Vec<ResourceForkEntry> {
    let entries = parse_resource_fork_entries(&original);
    let mut updates = Vec::new();
    for level_index in 0..7usize {
        let resource_id = 5000 + level_index as i16;
        let existing = entries
            .iter()
            .find(|entry| entry.resource_type == "STR#" && entry.id == resource_id);
        let mut names = existing
            .map(|entry| decode_string_list_resource(&entry.data))
            .unwrap_or_default();
        names.resize(15, String::new());
        let mut changed = false;
        for slot_index in 0..15usize {
            let custom_id = level_index * 15 + slot_index;
            let Some(record) = records.iter().find(|record| record.id == custom_id) else {
                continue;
            };
            let display_name = if record.display_name.trim().is_empty() {
                default_custom_spell_name(custom_id)
            } else {
                record.display_name.trim().to_string()
            };
            if existing.is_some()
                && !record.authored
                && display_name == default_custom_spell_name(custom_id)
            {
                continue;
            }
            if display_name == names[slot_index] {
                continue;
            }
            names[slot_index] = display_name;
            changed = true;
        }
        if changed {
            updates.push(ResourceForkEntry {
                resource_type: existing
                    .map(|entry| entry.resource_type.clone())
                    .unwrap_or_else(|| "STR#".to_string()),
                id: existing.map(|entry| entry.id).unwrap_or(resource_id),
                name: existing
                    .map(|entry| entry.name.clone())
                    .unwrap_or_else(|| custom_spell_resource_name(level_index).to_string()),
                attributes: existing.map(|entry| entry.attributes).unwrap_or(32),
                data: encode_string_list_resource(&names),
            });
        }
    }
    updates
}

fn data_spell_resource_fork(raw_dir: &Path) -> Result<Option<(String, Vec<u8>)>> {
    for name in ["Data Spell.rsrc", "Data Spell.rsf", "._Data Spell"] {
        let path = raw_dir.join(name);
        if !path.is_file() {
            continue;
        }
        let bytes = fs::read(&path).with_path(&path)?;
        if parse_resource_fork_entries(&bytes)
            .iter()
            .any(|entry| entry.resource_type == "STR#" && (5000..=5006).contains(&entry.id))
        {
            return Ok(Some((name.to_string(), bytes)));
        }
    }
    Ok(None)
}

fn write_item_text_resources(
    output_dir: &Path,
    raw_dir: Option<&Path>,
    records: &[ItemTextRecord],
    written_files: &mut Vec<String>,
) -> Result<()> {
    let authored = records
        .iter()
        .filter(|record| record.authored && (1..1000).contains(&record.item_id))
        .collect::<Vec<_>>();
    if authored.is_empty() {
        return Ok(());
    }
    let (resource_file_name, original) = match raw_dir {
        Some(raw_dir) => data_id_resource_fork(raw_dir)?
            .unwrap_or_else(|| ("Data ID.rsrc".to_string(), Vec::new())),
        None => ("Data ID.rsrc".to_string(), Vec::new()),
    };
    let updates = item_text_resource_updates(&authored, &original);
    if updates.is_empty() {
        return Ok(());
    }
    let (resource_bytes, _) = merge_resource_entries(&original, updates)?;
    let dest = output_dir.join(&resource_file_name);
    fs::write(&dest, resource_bytes).with_path(&dest)?;
    if !written_files.iter().any(|name| name == &resource_file_name) {
        written_files.push(resource_file_name);
    }
    Ok(())
}

fn data_id_resource_fork(raw_dir: &Path) -> Result<Option<(String, Vec<u8>)>> {
    for name in ["Data ID.rsrc", "Data ID.rsf", "._Data ID", "Data ID"] {
        let path = raw_dir.join(name);
        if !path.is_file() {
            continue;
        }
        let bytes = fs::read(&path).with_path(&path)?;
        if parse_resource_fork_entries(&bytes).iter().any(|entry| {
            entry.resource_type == "STR#" && item_text_resource_base(entry.id).is_some()
        }) {
            return Ok(Some((name.to_string(), bytes)));
        }
    }
    Ok(None)
}

fn item_text_resource_updates(
    records: &[&ItemTextRecord],
    original: &[u8],
) -> Vec<ResourceForkEntry> {
    let entries = parse_resource_fork_entries(original);
    let families = records
        .iter()
        .map(|record| record.item_id / 200 * 200)
        .collect::<BTreeSet<_>>();
    let mut updates = Vec::new();
    for base in families {
        for offset in 0..=2i16 {
            let resource_id = base + offset;
            let existing = entries
                .iter()
                .find(|entry| entry.resource_type == "STR#" && entry.id == resource_id);
            let mut strings = existing
                .map(|entry| decode_string_list_resource(&entry.data))
                .unwrap_or_default();
            strings.resize(200, String::new());
            let mut changed = false;
            for record in records {
                if record.item_id / 200 * 200 != base {
                    continue;
                }
                let index = (record.item_id - base) as usize;
                let next = match offset {
                    0 => &record.unidentified_name,
                    1 => &record.identified_name,
                    _ => &record.description,
                };
                if strings[index] == *next {
                    continue;
                }
                strings[index] = next.clone();
                changed = true;
            }
            if changed {
                updates.push(ResourceForkEntry {
                    resource_type: existing
                        .map(|entry| entry.resource_type.clone())
                        .unwrap_or_else(|| "STR#".to_string()),
                    id: existing.map(|entry| entry.id).unwrap_or(resource_id),
                    name: existing
                        .map(|entry| entry.name.clone())
                        .unwrap_or_else(|| item_text_resource_name(offset).to_string()),
                    attributes: existing.map(|entry| entry.attributes).unwrap_or(0),
                    data: encode_string_list_resource(&strings),
                });
            }
        }
    }
    updates
}

fn item_text_resource_base(resource_id: i16) -> Option<i16> {
    let offset = resource_id.rem_euclid(200);
    if !matches!(offset, 0..=2) {
        return None;
    }
    let base = resource_id - offset;
    (0..1000).contains(&base).then_some(base)
}

fn item_text_resource_name(offset: i16) -> &'static str {
    match offset {
        0 => "Item Unidentified Names",
        1 => "Item Names",
        _ => "Item Descriptions",
    }
}

fn is_custom_names_support_file(name: &str) -> bool {
    matches!(
        name,
        "Custom Names.rsrc" | "Custom Names.rsf" | "._Custom Names"
    )
}

fn is_generated_runtime_cache_file(name: &str) -> bool {
    matches!(name, "Data MENU")
}

fn default_custom_spell_name(custom_id: usize) -> String {
    format!("Custom Spell {custom_id}")
}

fn custom_spell_resource_name(level_index: usize) -> &'static str {
    [
        "Custom 1st",
        "Custom 2nd",
        "Custom 3rd",
        "Custom 4th",
        "Custom 5th",
        "Custom 6th",
        "Custom 7th",
    ][level_index]
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

fn managed_resource_type_supported(resource_type: &str) -> bool {
    matches!(resource_type, "PICT" | "cicn" | "snd " | "TEXT" | "styl")
}

fn managed_asset_resource_bytes(
    project_dir: &Path,
    asset: &crate::project::ManagedAsset,
) -> std::result::Result<Vec<u8>, String> {
    for value in [
        &asset.resource_path,
        &asset.preview_path,
        &asset.original_path,
    ] {
        if let Some(bytes) = decode_data_url_bytes(value)? {
            return Ok(bytes);
        }
    }
    let path = project_dir.join(&asset.resource_path);
    if !path.is_file() {
        return Err("converted resource bytes are missing".to_string());
    }
    fs::read(&path).map_err(|error| error.to_string())
}

fn decode_data_url_bytes(value: &str) -> std::result::Result<Option<Vec<u8>>, String> {
    if !value.starts_with("data:") {
        return Ok(None);
    }
    let Some((metadata, payload)) = value.split_once(',') else {
        return Err("data URL has no payload".to_string());
    };
    if metadata.to_ascii_lowercase().contains(";base64") {
        return STANDARD
            .decode(payload)
            .map(Some)
            .map_err(|error| format!("base64 decode failed: {error}"));
    }
    percent_decode_data_url_payload(payload).map(Some)
}

fn percent_decode_data_url_payload(payload: &str) -> std::result::Result<Vec<u8>, String> {
    let mut bytes = Vec::with_capacity(payload.len());
    let raw = payload.as_bytes();
    let mut index = 0;
    while index < raw.len() {
        if raw[index] == b'%' {
            if index + 2 >= raw.len() {
                return Err("truncated percent escape in data URL".to_string());
            }
            let high = hex_digit(raw[index + 1])?;
            let low = hex_digit(raw[index + 2])?;
            bytes.push((high << 4) | low);
            index += 3;
        } else {
            bytes.push(raw[index]);
            index += 1;
        }
    }
    Ok(bytes)
}

fn hex_digit(value: u8) -> std::result::Result<u8, String> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err("invalid percent escape in data URL".to_string()),
    }
}

fn write_managed_resources(
    project_dir: &Path,
    output_dir: &Path,
    raw_dir: Option<&Path>,
    project: &ProvidenceProject,
    target: ScenarioTarget,
) -> Result<ResourceExportResult> {
    let mut result = ResourceExportResult {
        resource_file_name: resource_file_name(project, target),
        ..ResourceExportResult::default()
    };
    let original = if let Some(raw_dir) = raw_dir {
        let raw_resource_path = raw_dir.join(&result.resource_file_name);
        if raw_resource_path.is_file() {
            fs::read(&raw_resource_path).with_path(&raw_resource_path)?
        } else {
            match source_resource_bytes(project, raw_dir, target)? {
                Some(bytes) => bytes,
                None => {
                    result.resource_warnings.push(format!(
                        "No source resource fork named {} was found; creating one for export resources.",
                        result.resource_file_name
                    ));
                    Vec::new()
                }
            }
        }
    } else {
        crate::resource_fork::write_resource_fork(&[])?
    };
    let original_entries = parse_resource_fork_entries(&original);
    result.preserved_resources = original_entries.len();
    let mut updates = map_name_resource_updates(project, &original);
    updates.extend(monster_icon_override_updates(
        &project.monster_icon_overrides,
        &original,
        &mut result,
    ));
    updates.extend(scenario_icon_resource_updates(
        &project.scenario_items,
        &project.scenario_icon_resources,
        &mut result,
    ));
    let mut scrolling_text_runtime_warning_emitted = false;
    for asset in &project.assets {
        if matches!(
            asset.library_scope,
            Some(crate::project::ManagedAssetLibraryScope::CustomLibrary)
        ) {
            continue;
        }
        if !matches!(
            asset.export_state,
            crate::project::ManagedAssetExportState::Ready
        ) {
            result.blocked_assets.push(asset.label.clone());
            continue;
        }
        if !managed_resource_type_supported(asset.resource_type.as_str()) {
            result.blocked_assets.push(format!(
                "{} uses unsupported resource type {}",
                asset.label, asset.resource_type
            ));
            continue;
        }
        let data = match managed_asset_resource_bytes(project_dir, asset) {
            Ok(data) => data,
            Err(error) => {
                result.blocked_assets.push(format!(
                    "{} is missing converted resource bytes: {}",
                    asset.label, error
                ));
                continue;
            }
        };
        if !scrolling_text_runtime_warning_emitted
            && matches!(asset.kind, crate::project::ManagedAssetKind::Text)
            && (asset.resource_type == "TEXT" || asset.resource_type.trim() == "styl")
        {
            result.resource_warnings.push(
                "Scrolling Text TEXT/styl export is runtime-suspect: recent Windows Realmz testing ignored styl formatting, and Mac Realmz 7.1.2 crashed after a Providence-authored Scrolling Text action step.".to_string(),
            );
            scrolling_text_runtime_warning_emitted = true;
        }
        if original_entries.iter().any(|entry| {
            entry.resource_type == asset.resource_type
                && entry.id == asset.resource_id
                && entry.data == data
        }) {
            continue;
        }
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
    let removals = project
        .editor_metadata
        .removed_scenario_resources
        .iter()
        .map(|resource| (resource.resource_type.clone(), resource.resource_id))
        .collect::<Vec<_>>();
    if updates.is_empty() && removals.is_empty() {
        return Ok(result);
    }
    let (resource_bytes, replaced) =
        merge_resource_entries_with_removals(&original, updates, &removals)?;
    if !removals.is_empty() {
        result.resource_warnings.push(format!(
            "{} scenario resource(s) were intentionally removed from the exported resource fork.",
            removals.len()
        ));
    }
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

fn monster_icon_override_updates(
    overrides: &[MonsterIconOverride],
    original: &[u8],
    result: &mut ResourceExportResult,
) -> Vec<ResourceForkEntry> {
    let mut updates = Vec::new();
    let original_entries = parse_resource_fork_entries(original);
    for override_entry in overrides {
        let target = override_entry.target_base_icon_id;
        if target <= 0 || target > i32::from(i16::MAX) - 308 {
            result.resource_warnings.push(format!(
                "Monster icon override target {} is outside the exportable cicn ID range.",
                override_entry.target_base_icon_id
            ));
            continue;
        }
        let source = override_entry.source_base_icon_id;
        let base_data = match STANDARD.decode(&override_entry.source_base_resource_base64) {
            Ok(data) => data,
            Err(error) => {
                result.resource_warnings.push(format!(
                    "Monster icon override {} -> {} has invalid base cicn data: {error}",
                    source, target
                ));
                continue;
            }
        };
        let paired_data = match STANDARD.decode(&override_entry.source_paired_resource_base64) {
            Ok(data) => data,
            Err(error) => {
                result.resource_warnings.push(format!(
                    "Monster icon override {} -> {} has invalid paired cicn data: {error}",
                    source, target
                ));
                continue;
            }
        };
        let label = override_entry
            .source_label
            .clone()
            .unwrap_or_else(|| format!("Monster Mash {}", source));
        let preserve_existing_metadata = matches!(
            override_entry.source_kind,
            MonsterIconOverrideSource::ScenarioResource
        );
        let existing_base = preserve_existing_metadata
            .then(|| {
                original_entries.iter().find(|entry| {
                    entry.resource_type == "cicn" && i32::from(entry.id).abs() == target
                })
            })
            .flatten();
        let existing_paired = preserve_existing_metadata
            .then(|| {
                original_entries.iter().find(|entry| {
                    entry.resource_type == "cicn" && i32::from(entry.id).abs() == target + 308
                })
            })
            .flatten();
        if preserve_existing_metadata
            && existing_base.is_some_and(|entry| entry.data == base_data)
            && existing_paired.is_some_and(|entry| entry.data == paired_data)
        {
            continue;
        }
        updates.push(ResourceForkEntry {
            resource_type: "cicn".to_string(),
            id: target as i16,
            name: existing_base
                .map(|entry| entry.name.clone())
                .unwrap_or_else(|| {
                    if preserve_existing_metadata {
                        String::new()
                    } else {
                        format!("Monster icon override from {label}")
                    }
                }),
            attributes: existing_base.map(|entry| entry.attributes).unwrap_or(0),
            data: base_data,
        });
        updates.push(ResourceForkEntry {
            resource_type: "cicn".to_string(),
            id: (target + 308) as i16,
            name: existing_paired
                .map(|entry| entry.name.clone())
                .unwrap_or_else(|| {
                    if preserve_existing_metadata {
                        String::new()
                    } else {
                        format!("Monster icon override from {label} facing")
                    }
                }),
            attributes: existing_paired.map(|entry| entry.attributes).unwrap_or(0),
            data: paired_data,
        });
        result.written_resources.push(format!(
            "cicn {} and {}: monster icon override from {}",
            target,
            target + 308,
            label
        ));
    }
    if overrides.len() > 120 {
        result.resource_warnings.push(format!(
            "{} monster icon override(s) are authored; classic Realmz scenarios were documented around 127 monster icon sets.",
            overrides.len()
        ));
    }
    updates
}

fn scenario_icon_resource_updates(
    scenario_items: &[crate::project::ScenarioItemRecord],
    scenario_icon_resources: &[crate::project::ScenarioIconResource],
    result: &mut ResourceExportResult,
) -> Vec<ResourceForkEntry> {
    let referenced_item_icons = scenario_items
        .iter()
        .filter(|item| item.icon_id != 0)
        .map(|item| i32::from(item.icon_id).abs())
        .collect::<std::collections::BTreeSet<_>>();
    if referenced_item_icons.is_empty() {
        return Vec::new();
    }
    let mut updates = Vec::new();
    for resource in scenario_icon_resources {
        let resource_id = resource.resource_id.abs();
        if !referenced_item_icons.contains(&resource_id) {
            continue;
        }
        if resource_id <= 0 || resource_id > i32::from(i16::MAX) {
            result.resource_warnings.push(format!(
                "Scenario icon resource {} is outside the exportable cicn ID range.",
                resource.resource_id
            ));
            continue;
        }
        let data = match STANDARD.decode(&resource.resource_base64) {
            Ok(data) => data,
            Err(error) => {
                result.resource_warnings.push(format!(
                    "Scenario icon resource {} has invalid cicn data: {error}",
                    resource.resource_id
                ));
                continue;
            }
        };
        updates.push(ResourceForkEntry {
            resource_type: "cicn".to_string(),
            id: resource_id as i16,
            name: resource.label.clone(),
            attributes: 0,
            data,
        });
        result.written_resources.push(format!(
            "cicn {}: custom item icon {}",
            resource_id, resource.label
        ));
    }
    updates
}

fn source_resource_bytes(
    project: &ProvidenceProject,
    raw_dir: &Path,
    target: ScenarioTarget,
) -> Result<Option<Vec<u8>>> {
    for file in project
        .source
        .files
        .iter()
        .filter(|file| matches!(file.role, crate::project::SourceFileRole::ResourceFork))
    {
        if target == ScenarioTarget::WindowsRealmzFolder && file.name == "Scenario" {
            continue;
        }
        let path = raw_dir.join(&file.relative_path);
        if path.is_file() {
            return fs::read(&path).with_path(&path).map(Some);
        }
    }
    Ok(None)
}

fn resource_file_name(project: &ProvidenceProject, target: ScenarioTarget) -> String {
    let shell_name = scenario_shell_file_name(project);
    let mut preferred = vec![
        "Scenario.rsrc".to_string(),
        "Scenario.rsf".to_string(),
        format!("{shell_name}.rsrc"),
        format!("{shell_name}.rsf"),
        "Scenario".to_string(),
    ];
    preferred.dedup();
    for candidate in preferred {
        if let Some(file) = project.source.files.iter().find(|file| {
            matches!(file.role, crate::project::SourceFileRole::ResourceFork)
                && file.name.eq_ignore_ascii_case(&candidate)
        }) {
            if target == ScenarioTarget::WindowsRealmzFolder && file.name == "Scenario" {
                return "Scenario.rsrc".to_string();
            }
            return file.name.clone();
        }
    }
    project
        .source
        .files
        .iter()
        .find(|file| matches!(file.role, crate::project::SourceFileRole::ResourceFork))
        .map(|file| {
            if target == ScenarioTarget::WindowsRealmzFolder && file.name == "Scenario" {
                "Scenario.rsrc".to_string()
            } else {
                file.name.clone()
            }
        })
        .unwrap_or_else(|| {
            if target == ScenarioTarget::WindowsRealmzFolder
                || !project.source.requires_compatibility_annex()
            {
                "Scenario.rsrc".to_string()
            } else {
                "Scenario".to_string()
            }
        })
}

fn map_name_resource_updates(
    project: &ProvidenceProject,
    original_resource_fork: &[u8],
) -> Vec<ResourceForkEntry> {
    map_name_resource_updates_for_records(&project.map_records, original_resource_fork)
}

fn map_name_resource_updates_for_records(
    map_records: &[crate::project::MapRecord],
    original_resource_fork: &[u8],
) -> Vec<ResourceForkEntry> {
    if map_records.is_empty() {
        return Vec::new();
    }
    let existing = parse_resource_fork_entries(original_resource_fork);
    let has_authored_names = map_records.iter().any(|record| record.map_name_authored);
    if !has_authored_names {
        return Vec::new();
    }
    let primary_names: Vec<String> = map_records.iter().map(map_record_primary_name).collect();
    let secondary_names: Vec<String> = map_records
        .iter()
        .map(|record| {
            record
                .secondary_name
                .as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .unwrap_or("--------------------")
                .to_string()
        })
        .collect();
    let primary_data = encode_string_list_resource(&primary_names);
    let secondary_data = encode_string_list_resource(&secondary_names);
    let existing_primary = existing
        .iter()
        .find(|entry| entry.resource_type == "STR#" && entry.id == -102);
    let existing_secondary = existing
        .iter()
        .find(|entry| entry.resource_type == "STR#" && entry.id == -101);
    if existing_primary.is_some_and(|entry| entry.data == primary_data)
        && existing_secondary.is_some_and(|entry| entry.data == secondary_data)
    {
        return Vec::new();
    }
    vec![
        ResourceForkEntry {
            resource_type: "STR#".to_string(),
            id: -102,
            name: "Map Names".to_string(),
            attributes: 0,
            data: primary_data,
        },
        ResourceForkEntry {
            resource_type: "STR#".to_string(),
            id: -101,
            name: "Map Names".to_string(),
            attributes: 0,
            data: secondary_data,
        },
    ]
}

fn map_record_primary_name(record: &crate::project::MapRecord) -> String {
    for candidate in [record.name.as_deref(), record.primary_name.as_deref()] {
        if let Some(name) = candidate.map(str::trim).filter(|name| !name.is_empty()) {
            return name.to_string();
        }
    }
    format!("Map {}", record.id + 1)
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
    use super::{
        append_preserved_shop_source_suffix, custom_spell_name_resource_updates,
        item_text_resource_updates, managed_asset_resource_bytes, managed_resource_type_supported,
        map_name_resource_updates_for_records, monster_icon_override_updates,
        preserve_imported_fixed_length, rule_compiler_baseline_bytes,
        scenario_icon_resource_updates, write_caste_overrides_for_export,
        write_race_overrides_for_export, write_spell_overrides_preserving_tail,
        ResourceExportResult,
    };
    use crate::project::{
        Confidence, ItemTextRecord, ManagedAsset, ManagedAssetExportState, ManagedAssetKind,
        MapRecord, MapRecordRect, MonsterIconOverride, MonsterIconOverrideSource, Provenance,
        ScenarioIconResource, ScenarioIconResourceSource, ScenarioItemRecord,
    };
    use crate::resource_fork::{
        decode_string_list_resource, encode_string_list_resource, write_resource_fork,
        ResourceForkEntry,
    };
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::fs;

    #[test]
    fn managed_text_asset_resource_data_url_exports_plain_text() {
        let asset = ManagedAsset {
            id: "managed:TEXT:-200:authored".to_string(),
            label: "Scrolling Text -200".to_string(),
            kind: ManagedAssetKind::Text,
            resource_type: "TEXT".to_string(),
            resource_id: -200,
            file_name: "scrolling-text--200.txt".to_string(),
            original_path: String::new(),
            preview_path: String::new(),
            resource_path: format!(
                "data:text/plain;base64,{}",
                STANDARD.encode(b"scrolling text")
            ),
            mime_type: "text/plain".to_string(),
            bytes: 14,
            sha256: "fixture".to_string(),
            width: None,
            height: None,
            duration_ms: None,
            sample_rate: None,
            channels: None,
            export_state: ManagedAssetExportState::Ready,
            library_scope: None,
            provenance: "test".to_string(),
            linked_entity: Some("resource:TEXT:-200".to_string()),
            conversion: None,
        };

        assert!(managed_resource_type_supported("TEXT"));
        assert!(managed_resource_type_supported("styl"));
        assert_eq!(
            managed_asset_resource_bytes(std::path::Path::new("."), &asset).unwrap(),
            b"scrolling text".to_vec()
        );
    }

    #[test]
    fn item_text_resource_updates_generate_all_strings_and_preserve_existing_metadata() {
        let mut existing_names = vec![String::new(); 200];
        existing_names[101] = "Old unidentified name".to_string();
        let original = write_resource_fork(&[
            ResourceForkEntry {
                resource_type: "STR#".to_string(),
                id: 800,
                name: "Existing item names".to_string(),
                attributes: 7,
                data: encode_string_list_resource(&existing_names),
            },
            ResourceForkEntry {
                resource_type: "TEXT".to_string(),
                id: 42,
                name: "Unrelated".to_string(),
                attributes: 0,
                data: b"preserve me".to_vec(),
            },
        ])
        .unwrap();
        let record = ItemTextRecord {
            id: 901,
            item_id: 901,
            unidentified_name: "Unknown Providence Token".to_string(),
            identified_name: "Providence Token".to_string(),
            description: "Compiled from canonical Providence data.".to_string(),
            authored: true,
            provenance: None,
        };

        let updates = item_text_resource_updates(&[&record], &original);

        assert_eq!(updates.len(), 3);
        for (offset, expected) in [
            (0, "Unknown Providence Token"),
            (1, "Providence Token"),
            (2, "Compiled from canonical Providence data."),
        ] {
            let update = updates
                .iter()
                .find(|entry| entry.resource_type == "STR#" && entry.id == 800 + offset)
                .expect("item text resource update");
            assert_eq!(decode_string_list_resource(&update.data)[101], expected);
        }
        let unidentified = updates
            .iter()
            .find(|entry| entry.id == 800)
            .expect("unidentified item strings");
        assert_eq!(unidentified.name, "Existing item names");
        assert_eq!(unidentified.attributes, 7);
        assert_eq!(
            updates.iter().find(|entry| entry.id == 801).unwrap().name,
            "Item Names"
        );
        assert_eq!(
            updates.iter().find(|entry| entry.id == 802).unwrap().name,
            "Item Descriptions"
        );

        let (merged, _) = crate::resource_fork::merge_resource_entries(&original, updates).unwrap();
        assert!(crate::resource_fork::parse_resource_fork_entries(&merged)
            .iter()
            .any(|entry| entry.resource_type == "TEXT"
                && entry.id == 42
                && entry.data == b"preserve me"));
    }

    #[test]
    fn fresh_spell_export_uses_fixed_capacity_and_creates_name_resource_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let record = authored_spell(16, "Providence Ward");
        let mut written = Vec::new();

        write_spell_overrides_preserving_tail(
            temp.path(),
            None,
            std::slice::from_ref(&record),
            &mut written,
        )
        .unwrap();

        assert_eq!(
            fs::metadata(temp.path().join("Data Spell")).unwrap().len() as usize,
            crate::realmz::SPELL_OVERRIDE_RECORDS * crate::realmz::SPELL_BYTES
        );
        assert_eq!(written, vec!["Data Spell".to_string()]);

        let updates = custom_spell_name_resource_updates(&[&record], &[]);
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].resource_type, "STR#");
        assert_eq!(updates[0].id, 5001);
        assert_eq!(updates[0].name, "Custom 2nd");
        assert_eq!(updates[0].attributes, 32);
        assert_eq!(
            decode_string_list_resource(&updates[0].data)[1],
            "Providence Ward"
        );
    }

    #[test]
    fn spell_name_updates_preserve_imported_entry_metadata_and_unrelated_resources() {
        let record = authored_spell(16, "Providence Ward");
        let original = write_resource_fork(&[
            ResourceForkEntry {
                resource_type: "STR#".to_string(),
                id: 5001,
                name: "Existing second level".to_string(),
                attributes: 7,
                data: encode_string_list_resource(&vec![String::new(); 15]),
            },
            ResourceForkEntry {
                resource_type: "TEXT".to_string(),
                id: 42,
                name: "Unrelated".to_string(),
                attributes: 0,
                data: b"preserve me".to_vec(),
            },
        ])
        .unwrap();

        let updates = custom_spell_name_resource_updates(&[&record], &original);

        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].name, "Existing second level");
        assert_eq!(updates[0].attributes, 7);
        let (merged, _) = crate::resource_fork::merge_resource_entries(&original, updates).unwrap();
        assert!(crate::resource_fork::parse_resource_fork_entries(&merged)
            .iter()
            .any(|entry| entry.resource_type == "TEXT"
                && entry.id == 42
                && entry.data == b"preserve me"));
    }

    #[test]
    fn fresh_rule_exports_use_fixed_compiler_baselines_and_semantic_spare_words() {
        let temp = tempfile::tempdir().unwrap();
        let mut race =
            crate::realmz::parse_race_overrides(&vec![0; 20 * crate::realmz::RACE_BYTES])
                .pop()
                .unwrap();
        race.authored = true;
        race.raw_bytes = vec![0xab; crate::realmz::RACE_BYTES];
        race.base_move = 11;
        race.spare.as_mut().unwrap()[0] = 123;
        race.spacer.as_mut().unwrap()[30] = -321;

        let mut caste =
            crate::realmz::parse_caste_overrides(&vec![0; 21 * crate::realmz::CASTE_BYTES])
                .pop()
                .unwrap();
        caste.authored = true;
        caste.raw_bytes = vec![0xcd; crate::realmz::CASTE_BYTES];
        caste.start_money = 25;
        caste.spare1.as_mut().unwrap()[0] = 456;
        caste.spare2.as_mut().unwrap()[1] = -654;
        caste.spacer.as_mut().unwrap()[62] = 789;

        let mut written = Vec::new();
        write_race_overrides_for_export(
            temp.path(),
            None,
            std::slice::from_ref(&race),
            &mut written,
        )
        .unwrap();
        write_caste_overrides_for_export(
            temp.path(),
            None,
            std::slice::from_ref(&caste),
            &mut written,
        )
        .unwrap();

        let race_bytes = fs::read(temp.path().join("Data Race")).unwrap();
        let caste_bytes = fs::read(temp.path().join("Data Caste")).unwrap();
        assert_eq!(
            race_bytes.len(),
            crate::realmz::RACE_OVERRIDE_RECORDS * crate::realmz::RACE_BYTES
        );
        assert_eq!(
            caste_bytes.len(),
            crate::realmz::CASTE_OVERRIDE_RECORDS * crate::realmz::CASTE_BYTES
        );
        let race_baseline = rule_compiler_baseline_bytes(
            "Data Race",
            crate::realmz::RACE_BYTES,
            crate::realmz::RACE_OVERRIDE_RECORDS,
        )
        .unwrap();
        assert_eq!(
            &race_bytes[..crate::realmz::RACE_BYTES],
            &race_baseline[..crate::realmz::RACE_BYTES]
        );
        let race_record =
            &race_bytes[19 * crate::realmz::RACE_BYTES..20 * crate::realmz::RACE_BYTES];
        assert_eq!(crate::realmz::i16_be(race_record, 96), 123);
        assert_eq!(crate::realmz::i16_be(race_record, 196), 11);
        assert_eq!(crate::realmz::i16_be(race_record, 406), -321);
        assert_ne!(
            race_record[350], 0xab,
            "fresh raw bytes must not leak into output"
        );
        let caste_record =
            &caste_bytes[20 * crate::realmz::CASTE_BYTES..21 * crate::realmz::CASTE_BYTES];
        assert_eq!(crate::realmz::i16_be(caste_record, 240), 456);
        assert_eq!(crate::realmz::i16_be(caste_record, 246), -654);
        assert_eq!(crate::realmz::i16_be(caste_record, 384), 25);
        assert_eq!(crate::realmz::i16_be(caste_record, 574), 789);
        assert_ne!(
            caste_record[500], 0xcd,
            "fresh raw bytes must not leak into output"
        );
        assert_eq!(written, vec!["Data Race", "Data Caste"]);
    }

    #[test]
    fn imported_rule_exports_preserve_aligned_rows_and_malformed_tails() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        let output_dir = temp.path().join("output");
        fs::create_dir_all(&raw_dir).unwrap();
        fs::create_dir_all(&output_dir).unwrap();

        let mut race_source = vec![0x5a; 2 * crate::realmz::RACE_BYTES];
        race_source.extend_from_slice(&[0xde, 0xad]);
        fs::write(raw_dir.join("Data Race"), &race_source).unwrap();
        let mut race = crate::realmz::parse_race_overrides(&race_source)[1].clone();
        race.authored = true;
        race.base_move = 12;

        let mut caste_source = vec![0x6b; 2 * crate::realmz::CASTE_BYTES];
        caste_source.extend_from_slice(&[0xbe, 0xef, 0x01]);
        fs::write(raw_dir.join("Data Caste"), &caste_source).unwrap();
        let mut caste = crate::realmz::parse_caste_overrides(&caste_source)[1].clone();
        caste.authored = true;
        caste.start_money = 42;

        let mut written = Vec::new();
        write_race_overrides_for_export(&output_dir, Some(&raw_dir), &[race], &mut written)
            .unwrap();
        write_caste_overrides_for_export(&output_dir, Some(&raw_dir), &[caste], &mut written)
            .unwrap();

        let race_output = fs::read(output_dir.join("Data Race")).unwrap();
        let caste_output = fs::read(output_dir.join("Data Caste")).unwrap();
        assert_eq!(race_output.len(), race_source.len());
        assert_eq!(caste_output.len(), caste_source.len());
        assert_eq!(
            &race_output[..crate::realmz::RACE_BYTES],
            &race_source[..crate::realmz::RACE_BYTES]
        );
        assert_eq!(&race_output[race_output.len() - 2..], &[0xde, 0xad]);
        assert_eq!(
            &caste_output[..crate::realmz::CASTE_BYTES],
            &caste_source[..crate::realmz::CASTE_BYTES]
        );
        assert_eq!(&caste_output[caste_output.len() - 3..], &[0xbe, 0xef, 0x01]);
    }

    #[test]
    fn monster_icon_override_exports_paired_target_resources() {
        let overrides = vec![MonsterIconOverride {
            target_base_icon_id: 387,
            source_base_icon_id: 409,
            source_label: Some("Tall spear giant".to_string()),
            source_kind: MonsterIconOverrideSource::MonsterMash,
            source_base_resource_base64: STANDARD.encode([1u8, 2, 3]),
            source_paired_resource_base64: STANDARD.encode([4u8, 5, 6]),
            imported: false,
        }];
        let mut result = ResourceExportResult::default();

        let entries = monster_icon_override_updates(&overrides, &[], &mut result);

        assert_eq!(entries.len(), 2);
        let base = entries
            .iter()
            .find(|entry| entry.resource_type == "cicn" && entry.id == 387)
            .expect("base target cicn");
        let paired = entries
            .iter()
            .find(|entry| entry.resource_type == "cicn" && entry.id == 695)
            .expect("paired target cicn");
        assert_eq!(base.data, vec![1u8, 2, 3]);
        assert_eq!(paired.data, vec![4u8, 5, 6]);
        assert!(result
            .written_resources
            .iter()
            .any(|entry| entry.contains("cicn 387 and 695")));
    }

    #[test]
    fn scenario_icon_resource_exports_only_referenced_custom_item_icons() {
        let items = vec![scenario_item_with_icon(0, 30126)];
        let resources = vec![
            ScenarioIconResource {
                resource_id: 30126,
                label: "Custom item icon".to_string(),
                source_kind: ScenarioIconResourceSource::ProvidenceLibrary,
                resource_base64: STANDARD.encode([9u8, 8, 7]),
                preview_path: None,
                imported: false,
            },
            ScenarioIconResource {
                resource_id: 30127,
                label: "Unused item icon".to_string(),
                source_kind: ScenarioIconResourceSource::ProvidenceLibrary,
                resource_base64: STANDARD.encode([6u8, 5, 4]),
                preview_path: None,
                imported: false,
            },
        ];
        let mut result = ResourceExportResult::default();

        let entries = scenario_icon_resource_updates(&items, &resources, &mut result);

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].resource_type, "cicn");
        assert_eq!(entries[0].id, 30126);
        assert_eq!(entries[0].data, vec![9u8, 8, 7]);
        assert!(result
            .written_resources
            .iter()
            .any(|entry| entry.contains("cicn 30126")));
    }

    #[test]
    fn preserves_imported_fixed_row_file_length_when_export_model_shrinks() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        fs::write(raw_dir.join("Data EDCD"), vec![0x7Au8; 30]).unwrap();

        let bytes =
            preserve_imported_fixed_length("Data EDCD", vec![1u8; 10], 10, Some(raw_dir)).unwrap();

        assert_eq!(bytes.len(), 30);
        assert_eq!(&bytes[..10], &[1u8; 10]);
        assert_eq!(&bytes[10..], &[0u8; 20]);
    }

    #[test]
    fn preserves_unknown_tail_bytes_for_malformed_fixed_row_file() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        fs::write(raw_dir.join("Data EDCD"), vec![9u8, 8, 7, 6, 5]).unwrap();

        let bytes =
            preserve_imported_fixed_length("Data EDCD", vec![1u8, 2], 10, Some(raw_dir)).unwrap();

        assert_eq!(bytes, vec![1u8, 2, 7, 6, 5]);
    }

    #[test]
    fn inserts_added_shop_before_preserved_source_suffix() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        let valid = vec![0u8; crate::realmz::SHOP_BYTES];
        let mut foreign = vec![0u8; crate::realmz::SHOP_BYTES];
        for slot in 0..1000 {
            crate::realmz::write_i16_be(&mut foreign, slot * 2, 2000 + slot as i16);
            foreign[2000 + slot] = 0xff;
        }
        fs::write(
            raw_dir.join("Data SD"),
            [valid.clone(), foreign.clone()].concat(),
        )
        .unwrap();
        let mut modeled = valid.clone();
        modeled.extend_from_slice(&vec![1u8; crate::realmz::SHOP_BYTES]);

        let bytes = append_preserved_shop_source_suffix(modeled.clone(), Some(raw_dir)).unwrap();

        assert_eq!(&bytes[..modeled.len()], modeled);
        assert_eq!(&bytes[modeled.len()..], foreign);
    }

    #[test]
    fn map_name_resource_updates_preserve_existing_names_until_authored() {
        let original = write_resource_fork(&[
            map_names_resource(-102, &["Old Primary 0", "Old Primary 1"]),
            map_names_resource(-101, &["Old Secondary 0", "Old Secondary 1"]),
        ])
        .unwrap();
        let records = vec![map_record_with_names(
            0,
            "Old Primary 0",
            "Old Secondary 0",
            false,
        )];

        let updates = map_name_resource_updates_for_records(&records, &original);

        assert!(updates.is_empty());
    }

    #[test]
    fn map_name_resource_updates_skip_authored_names_when_bytes_match_original() {
        let original = write_resource_fork(&[
            map_names_resource(-102, &["Old Primary 0", "Old Primary 1"]),
            map_names_resource(-101, &["Old Secondary 0", "Old Secondary 1"]),
        ])
        .unwrap();
        let records = vec![
            map_record_with_names(0, "Old Primary 0", "Old Secondary 0", true),
            map_record_with_names(1, "Old Primary 1", "Old Secondary 1", false),
        ];

        let updates = map_name_resource_updates_for_records(&records, &original);

        assert!(updates.is_empty());
    }

    #[test]
    fn map_name_resource_updates_rewrite_authored_primary_and_secondary_names() {
        let original = write_resource_fork(&[
            map_names_resource(-102, &["Old Primary 0", "Old Primary 1"]),
            map_names_resource(-101, &["Old Secondary 0", "Old Secondary 1"]),
        ])
        .unwrap();
        let records = vec![
            map_record_with_names(0, "New Primary 0", "New Secondary 0", true),
            map_record_with_names(1, "Old Primary 1", "Old Secondary 1", false),
        ];

        let updates = map_name_resource_updates_for_records(&records, &original);

        assert_eq!(updates.len(), 2);
        let primary = updates
            .iter()
            .find(|entry| entry.resource_type == "STR#" && entry.id == -102)
            .expect("primary Map Names resource");
        let secondary = updates
            .iter()
            .find(|entry| entry.resource_type == "STR#" && entry.id == -101)
            .expect("secondary Map Names resource");
        assert_eq!(
            decode_string_list_resource(&primary.data),
            vec!["New Primary 0".to_string(), "Old Primary 1".to_string()]
        );
        assert_eq!(
            decode_string_list_resource(&secondary.data),
            vec!["New Secondary 0".to_string(), "Old Secondary 1".to_string()]
        );
    }

    #[test]
    fn map_name_resource_updates_do_not_fallback_to_related_level_name() {
        let records = vec![MapRecord {
            name: None,
            primary_name: None,
            secondary_name: None,
            level: 2,
            ..map_record_with_names(0, "", "", true)
        }];

        let updates = map_name_resource_updates_for_records(&records, &[]);
        let primary = updates
            .iter()
            .find(|entry| entry.resource_type == "STR#" && entry.id == -102)
            .expect("primary Map Names resource");

        assert_eq!(
            decode_string_list_resource(&primary.data),
            vec!["Map 1".to_string()]
        );
    }

    fn scenario_item_with_icon(id: usize, icon_id: i16) -> ScenarioItemRecord {
        ScenarioItemRecord {
            id,
            item_id: 900 + id as i16,
            icon_id,
            item_type: 0,
            st: 0,
            blunt: 0,
            hands: 0,
            lu: 0,
            movement: 0,
            ac: 0,
            magic_resistance: 0,
            damage: 0,
            spell_points: 0,
            sound: 0,
            weight: 0,
            cost: 0,
            charge: 0,
            cursed_item_id: 0,
            magical: 0,
            item_cat0: 0,
            item_cat1: 0,
            race_restrictions: 0,
            caste_restrictions: 0,
            specific_race: 0,
            specific_caste: 0,
            race_class_only: 0,
            caste_class_only: 0,
            spare2: Vec::new(),
            v_small: 0,
            v_large: 0,
            heat: 0,
            cold: 0,
            electric: 0,
            vs_undead: 0,
            vs_demon_devil: 0,
            vs_evil: 0,
            special1: 0,
            special2: 0,
            special3: 0,
            special4: 0,
            special5: 0,
            weight_per_charge: 0,
            drop_on_empty: 0,
            raw_bytes: Vec::new(),
            authored: true,
            provenance: Provenance {
                source_file: "Data NI".to_string(),
                record_index: id,
                byte_offset: id * 100,
                byte_length: 100,
                confidence: Confidence::Confirmed,
            },
        }
    }

    fn authored_spell(id: usize, display_name: &str) -> crate::project::ScenarioSpellOverride {
        let mut records =
            crate::realmz::parse_spell_overrides(&vec![0; (id + 1) * crate::realmz::SPELL_BYTES]);
        let mut record = records.pop().expect("spell record");
        record.authored = true;
        record.display_name = display_name.to_string();
        record.cost = 4;
        record.in_combat = true;
        record
    }

    fn map_names_resource(id: i16, names: &[&str]) -> ResourceForkEntry {
        ResourceForkEntry {
            resource_type: "STR#".to_string(),
            id,
            name: "Map Names".to_string(),
            attributes: 0,
            data: encode_string_list_resource(
                &names
                    .iter()
                    .map(|name| name.to_string())
                    .collect::<Vec<_>>(),
            ),
        }
    }

    fn map_record_with_names(
        id: usize,
        primary_name: &str,
        secondary_name: &str,
        map_name_authored: bool,
    ) -> MapRecord {
        MapRecord {
            id,
            markers: Vec::new(),
            start_x: 0,
            start_y: 0,
            level: 0,
            pict_id: 0,
            icon_size: 0,
            show: 0,
            is_dungeon: false,
            rect: MapRecordRect {
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
            },
            note: String::new(),
            name: (!primary_name.is_empty()).then(|| primary_name.to_string()),
            primary_name: (!primary_name.is_empty()).then(|| primary_name.to_string()),
            secondary_name: (!secondary_name.is_empty()).then(|| secondary_name.to_string()),
            name_source: None,
            map_name_authored,
            raw_bytes: Vec::new(),
            authored: false,
            provenance: provenance("Data MD2", id, crate::realmz::MAP_RECORD_BYTES),
        }
    }

    fn provenance(source_file: &str, record_index: usize, byte_length: usize) -> Provenance {
        Provenance {
            source_file: source_file.to_string(),
            record_index,
            byte_offset: record_index * byte_length,
            byte_length,
            confidence: Confidence::Confirmed,
        }
    }
}
