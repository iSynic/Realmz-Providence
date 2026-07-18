use crate::compatibility_annex::{CompatibilityAnnex, CompatibilityAnnexSnapshot};
use crate::error::{IoPath, ProvidenceError, Result};
use crate::native_manifest::NativeScenarioManifest;
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

#[derive(Debug)]
struct NativeCompilerInputs {
    compatibility_annex: Option<CompatibilityAnnexSnapshot>,
    managed_asset_bytes: Vec<Option<std::result::Result<Vec<u8>, String>>>,
}

#[derive(Debug)]
struct RealmzCompilation {
    manifest: NativeScenarioManifest,
    resource_result: ResourceExportResult,
    warnings: Vec<String>,
    target_compatibility_issues: Vec<TargetCompatibilityIssue>,
    target_compatibility: TargetCompatibilityBuckets,
}

pub fn export_project(
    project_dir: impl AsRef<Path>,
    project: &ProvidenceProject,
    output_dir: impl AsRef<Path>,
    target: ScenarioTarget,
) -> Result<ExportReport> {
    let project_dir = project_dir.as_ref();
    let output_dir = output_dir.as_ref();
    let compatibility_annex = CompatibilityAnnex::for_project(project_dir, project)?;
    let inputs = NativeCompilerInputs {
        compatibility_annex: compatibility_annex
            .as_ref()
            .map(CompatibilityAnnex::snapshot)
            .transpose()?,
        managed_asset_bytes: resolve_managed_asset_bytes(project_dir, project),
    };
    let compilation = compile_realmz_scenario(project, target, &inputs)?;
    materialize_manifest(&compilation.manifest, output_dir)?;
    Ok(ExportReport {
        output_path: output_dir.to_string_lossy().to_string(),
        target,
        written_files: compilation.manifest.written_files().to_vec(),
        pass_through_files: compilation.manifest.pass_through_files().to_vec(),
        written_resources: compilation.resource_result.written_resources,
        preserved_resources: compilation.resource_result.preserved_resources,
        resource_warnings: compilation.resource_result.resource_warnings,
        blocked_assets: compilation.resource_result.blocked_assets,
        warnings: compilation.warnings,
        target_compatibility_issues: compilation.target_compatibility_issues,
        target_compatibility: compilation.target_compatibility,
    })
}

fn compile_realmz_scenario(
    project: &ProvidenceProject,
    target: ScenarioTarget,
    inputs: &NativeCompilerInputs,
) -> Result<RealmzCompilation> {
    let compatibility_annex = inputs.compatibility_annex.as_ref();
    let preserves_source_snapshot = compatibility_annex.is_some();
    let mut manifest = NativeScenarioManifest::default();

    if let Some(annex) = compatibility_annex {
        for (name, source_bytes) in annex.top_level_files() {
            if is_custom_names_support_file(&name) || is_generated_runtime_cache_file(&name) {
                continue;
            }
            manifest.insert_pass_through(name, source_bytes);
        }
    }

    if !preserves_source_snapshot {
        write_authored_runtime_baseline(&mut manifest, project, target)?;
    }
    if let Some(shell) = &project.scenario.shell {
        write_if_nonempty(
            &mut manifest,
            scenario_shell_file_name(project),
            write_scenario_shell(shell)?,
        )?;
    }
    if let Some(support_file) = &project.scenario.support_file {
        write_if_nonempty(
            &mut manifest,
            &support_file.source_file,
            write_scenario_support_file(support_file)?,
        )?;
    }
    if let Some(contact_info) = &project.scenario.contact_info {
        write_if_nonempty(
            &mut manifest,
            "Data CI",
            write_scenario_contact_info(contact_info)?,
        )?;
    }
    if let Some(restrictions) = &project.scenario.restrictions {
        write_if_nonempty(
            &mut manifest,
            "Data RI",
            write_scenario_restrictions(restrictions)?,
        )?;
    }
    if let Some(global_hooks) = &project.scenario.global_macro_hooks {
        write_if_nonempty(
            &mut manifest,
            "Global",
            write_global_macro_hooks(global_hooks)?,
        )?;
    }
    if let Some(security_backup) = &project.scenario.security_backup {
        write_if_nonempty(
            &mut manifest,
            "Data CS",
            write_scenario_shell(security_backup)?,
        )?;
    }
    write_if_nonempty(
        &mut manifest,
        "Data LD",
        write_fields(&project.maps, LevelType::Land)?,
    )?;
    write_if_nonempty(
        &mut manifest,
        "Data DL",
        write_fields(&project.maps, LevelType::Dungeon)?,
    )?;
    if let Some(layout) = &project.land_layout {
        write_if_nonempty(&mut manifest, "Layout", write_land_layout(layout)?)?;
    }
    write_if_nonempty(
        &mut manifest,
        "Data Solids",
        write_tile_solids(&project.tile_attributes)?,
    )?;
    for landlook in &project.custom_landlooks {
        if landlook.authored {
            write_if_nonempty(
                &mut manifest,
                &landlook.source_file,
                write_custom_landlook_metadata(landlook)?,
            )?;
        }
    }
    write_if_nonempty(
        &mut manifest,
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
    )?;
    write_if_nonempty(
        &mut manifest,
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
    )?;
    write_if_nonempty(
        &mut manifest,
        "Data RD",
        write_random_levels(&project.random_levels, LevelType::Land)?,
    )?;
    write_if_nonempty(
        &mut manifest,
        "Data RDD",
        write_random_levels(&project.random_levels, LevelType::Dungeon)?,
    )?;
    write_if_nonempty(
        &mut manifest,
        "Data ED3",
        preserve_imported_fixed_length(
            "Data ED3",
            write_macro_file(&project.triggers)?,
            DOOR_BYTES,
            compatibility_annex,
        )?,
    )?;
    write_if_nonempty(
        &mut manifest,
        "Data EDCD",
        preserve_imported_fixed_length(
            "Data EDCD",
            write_extracodes(&project.extracodes)?,
            EXTRACODE_BYTES,
            compatibility_annex,
        )?,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data SD2",
        write_messages(&project.messages)?,
        crate::realmz::MESSAGE_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data OD",
        write_option_labels(&project.option_labels)?,
        crate::realmz::OPTION_LABEL_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data MD2",
        write_map_records(&project.map_records)?,
        crate::realmz::MAP_RECORD_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data BD",
        write_battles(&project.battles)?,
        crate::realmz::BATTLE_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data MD",
        write_monsters(&project.monsters)?,
        crate::realmz::MONSTER_BYTES,
        compatibility_annex,
    )?;
    for monster_set in &project.monster_sets {
        write_fixed_if_nonempty(
            &mut manifest,
            &monster_set.source_file,
            write_monster_set(monster_set)?,
            crate::realmz::MONSTER_BYTES,
            compatibility_annex,
        )?;
    }
    write_fixed_if_nonempty(
        &mut manifest,
        "Data DES",
        write_monster_descriptions(&project.monster_descriptions)?,
        crate::realmz::MONSTER_DESCRIPTION_BYTES,
        compatibility_annex,
    )?;
    let mut scenario_item_bytes = overlay_zero_filled_fixed_capacity(
        "Data NI",
        write_scenario_items(&project.scenario_items)?,
        compatibility_annex,
    )?;
    if !preserves_source_snapshot {
        scenario_item_bytes.resize(200 * crate::realmz::ITEM_BYTES, 0);
    }
    write_fixed_if_nonempty(
        &mut manifest,
        "Data NI",
        scenario_item_bytes,
        crate::realmz::ITEM_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data TD",
        write_treasures(&project.treasures)?,
        crate::realmz::TREASURE_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data SD",
        append_preserved_shop_source_suffix(write_shops(&project.shops)?, compatibility_annex)?,
        crate::realmz::SHOP_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data ED",
        write_simple_encounters(&project.simple_encounters)?,
        crate::realmz::SIMPLE_ENCOUNTER_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data ED2",
        write_complex_encounters(&project.complex_encounters)?,
        crate::realmz::COMPLEX_ENCOUNTER_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data TD2",
        write_thief_encounters(&project.thief_encounters)?,
        crate::realmz::THIEF_ENCOUNTER_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        "Data TD3",
        write_timed_encounters(&project.timed_encounters)?,
        crate::realmz::TIMED_ENCOUNTER_BYTES,
        compatibility_annex,
    )?;
    write_spell_overrides_preserving_tail(
        &mut manifest,
        compatibility_annex,
        &project.spell_overrides,
    )?;
    write_custom_spell_name_resources(
        &mut manifest,
        compatibility_annex,
        &project.spell_overrides,
    )?;
    write_item_text_resources(&mut manifest, compatibility_annex, &project.item_texts)?;
    write_race_overrides_for_export(&mut manifest, compatibility_annex, &project.race_overrides)?;
    write_caste_overrides_for_export(&mut manifest, compatibility_annex, &project.caste_overrides)?;
    let resource_result = write_managed_resources(
        &mut manifest,
        compatibility_annex,
        &inputs.managed_asset_bytes,
        project,
        target,
    )?;

    let warnings = if project.validation.ok {
        Vec::new()
    } else {
        project.validation.warnings.clone()
    };
    let target_compatibility_issues = target_compatibility_issues_for_export(project, target);
    let target_compatibility =
        crate::validation::bucket_target_compatibility_issues(&target_compatibility_issues);
    Ok(RealmzCompilation {
        manifest,
        resource_result,
        warnings,
        target_compatibility_issues,
        target_compatibility,
    })
}

fn write_authored_runtime_baseline(
    manifest: &mut NativeScenarioManifest,
    project: &ProvidenceProject,
    target: ScenarioTarget,
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
        manifest.insert_generated(name, bytes);
    }
    manifest.insert_generated("Data DDD", Vec::new());
    for name in EMPTY_RUNTIME_TABLES {
        manifest.insert_generated(*name, Vec::new());
    }
    Ok(())
}

fn materialize_manifest(manifest: &NativeScenarioManifest, output_dir: &Path) -> Result<()> {
    fs::create_dir_all(output_dir).with_path(output_dir)?;
    for (name, bytes) in manifest.files() {
        let path = output_dir.join(name);
        fs::write(&path, bytes).with_path(&path)?;
    }
    Ok(())
}

fn resolve_managed_asset_bytes(
    project_dir: &Path,
    project: &ProvidenceProject,
) -> Vec<Option<std::result::Result<Vec<u8>, String>>> {
    project
        .assets
        .iter()
        .map(|asset| {
            if matches!(
                asset.library_scope,
                Some(crate::project::ManagedAssetLibraryScope::CustomLibrary)
            ) || !matches!(
                asset.export_state,
                crate::project::ManagedAssetExportState::Ready
            ) || !managed_resource_type_supported(asset.resource_type.as_str())
            {
                None
            } else {
                Some(managed_asset_resource_bytes(project_dir, asset))
            }
        })
        .collect()
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
    manifest: &mut NativeScenarioManifest,
    name: &str,
    bytes: Vec<u8>,
) -> Result<()> {
    if bytes.is_empty() {
        return Ok(());
    }
    manifest.insert_generated(name, bytes);
    Ok(())
}

fn write_fixed_if_nonempty(
    manifest: &mut NativeScenarioManifest,
    name: &str,
    mut bytes: Vec<u8>,
    record_bytes: usize,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    if bytes.is_empty() {
        return Ok(());
    }
    if let Some(raw) = match annex {
        Some(annex) => annex.read(name)?,
        None => None,
    } {
        if raw.len() > bytes.len() && raw.len() % record_bytes != 0 {
            bytes.extend_from_slice(&raw[bytes.len()..]);
        }
    }
    write_if_nonempty(manifest, name, bytes)
}

fn overlay_zero_filled_fixed_capacity(
    name: &str,
    bytes: Vec<u8>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(annex) = annex else {
        return Ok(bytes);
    };
    let Some(mut raw) = annex.read(name)? else {
        return Ok(bytes);
    };
    if bytes.is_empty() {
        return Ok(bytes);
    }
    if raw.len() <= bytes.len() || raw.iter().any(|byte| *byte != 0) {
        return Ok(bytes);
    }
    raw[..bytes.len()].copy_from_slice(&bytes);
    Ok(raw)
}

fn append_preserved_shop_source_suffix(
    mut bytes: Vec<u8>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(annex) = annex else {
        return Ok(bytes);
    };
    let Some(raw) = annex.read("Data SD")? else {
        return Ok(bytes);
    };
    if bytes.is_empty() {
        return Ok(bytes);
    }
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
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(annex) = annex else {
        return Ok(bytes);
    };
    let Some(raw) = annex.read(name)? else {
        return Ok(bytes);
    };
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
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    records: &[ScenarioRaceOverride],
) -> Result<()> {
    let source_backed = match annex {
        Some(annex) => annex.contains("Data Race")?,
        None => false,
    };
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
        manifest,
        annex,
        "Data Race",
        crate::realmz::RACE_BYTES,
        crate::realmz::RACE_OVERRIDE_RECORDS,
        records.iter().map(|record| record.id).collect(),
        write_race_overrides(writer_records)?,
    )
}

fn write_caste_overrides_for_export(
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    records: &[ScenarioCasteOverride],
) -> Result<()> {
    let source_backed = match annex {
        Some(annex) => annex.contains("Data Caste")?,
        None => false,
    };
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
        manifest,
        annex,
        "Data Caste",
        crate::realmz::CASTE_BYTES,
        crate::realmz::CASTE_OVERRIDE_RECORDS,
        records.iter().map(|record| record.id).collect(),
        write_caste_overrides(writer_records)?,
    )
}

#[allow(clippy::too_many_arguments)]
fn write_rule_overrides_for_export(
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    name: &str,
    record_bytes: usize,
    fresh_records: usize,
    record_ids: Vec<usize>,
    encoded: Vec<u8>,
) -> Result<()> {
    if record_ids.is_empty() {
        return Ok(());
    }
    let raw = match annex {
        Some(annex) => annex.read(name)?,
        None => None,
    };
    let source_backed = raw.is_some();
    if !source_backed {
        if let Some(id) = record_ids.iter().find(|id| **id >= fresh_records) {
            return Err(ProvidenceError::message(format!(
                "{name} record {id} is outside the fresh 0..{} scenario slot range.",
                fresh_records - 1
            )));
        }
    }

    let (mut body, tail) = if let Some(mut raw) = raw {
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
    write_if_nonempty(manifest, name, body)
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
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    records: &[ScenarioSpellOverride],
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
    let mut bytes = match annex {
        Some(annex) => annex
            .read("Data Spell")?
            .unwrap_or_else(|| vec![0; fresh_capacity]),
        None => vec![0; fresh_capacity],
    };
    if bytes.len() < overlay.len() {
        bytes.resize(overlay.len(), 0);
    }
    bytes[..overlay.len()].copy_from_slice(&overlay);
    write_if_nonempty(manifest, "Data Spell", bytes)
}

fn write_custom_spell_name_resources(
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    records: &[ScenarioSpellOverride],
) -> Result<()> {
    let preserved = match annex {
        Some(annex) => data_spell_resource_fork(annex)?,
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
    manifest.insert_generated(resource_file_name, resource_bytes);
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

fn data_spell_resource_fork(
    annex: &CompatibilityAnnexSnapshot,
) -> Result<Option<(String, Vec<u8>)>> {
    for name in ["Data Spell.rsrc", "Data Spell.rsf", "._Data Spell"] {
        let Some(bytes) = annex.read(name)? else {
            continue;
        };
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
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    records: &[ItemTextRecord],
) -> Result<()> {
    let authored = records
        .iter()
        .filter(|record| record.authored && (1..1000).contains(&record.item_id))
        .collect::<Vec<_>>();
    if authored.is_empty() {
        return Ok(());
    }
    let (resource_file_name, original) = match annex {
        Some(annex) => data_id_resource_fork(annex)?
            .unwrap_or_else(|| ("Data ID.rsrc".to_string(), Vec::new())),
        None => ("Data ID.rsrc".to_string(), Vec::new()),
    };
    let updates = item_text_resource_updates(&authored, &original);
    if updates.is_empty() {
        return Ok(());
    }
    let (resource_bytes, _) = merge_resource_entries(&original, updates)?;
    manifest.insert_generated(resource_file_name, resource_bytes);
    Ok(())
}

fn data_id_resource_fork(annex: &CompatibilityAnnexSnapshot) -> Result<Option<(String, Vec<u8>)>> {
    for name in ["Data ID.rsrc", "Data ID.rsf", "._Data ID", "Data ID"] {
        let Some(bytes) = annex.read(name)? else {
            continue;
        };
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
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    managed_asset_bytes: &[Option<std::result::Result<Vec<u8>, String>>],
    project: &ProvidenceProject,
    target: ScenarioTarget,
) -> Result<ResourceExportResult> {
    let mut result = ResourceExportResult {
        resource_file_name: resource_file_name(project, target),
        ..ResourceExportResult::default()
    };
    let original = if let Some(annex) = annex {
        if let Some(bytes) = annex.read(&result.resource_file_name)? {
            bytes
        } else {
            match source_resource_bytes(project, annex, target)? {
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
    for (asset_index, asset) in project.assets.iter().enumerate() {
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
        let data = match managed_asset_bytes
            .get(asset_index)
            .and_then(Option::as_ref)
        {
            Some(Ok(data)) => data.clone(),
            Some(Err(error)) => {
                result.blocked_assets.push(format!(
                    "{} is missing converted resource bytes: {}",
                    asset.label, error
                ));
                continue;
            }
            None => {
                result.blocked_assets.push(format!(
                    "{} is missing converted resource bytes: compiler input was not resolved",
                    asset.label
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
    manifest.insert_generated(result.resource_file_name.clone(), resource_bytes);
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
    annex: &CompatibilityAnnexSnapshot,
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
        if let Some(bytes) = annex.read(&file.relative_path)? {
            return Ok(Some(bytes));
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
        append_preserved_shop_source_suffix, compile_realmz_scenario,
        custom_spell_name_resource_updates, item_text_resource_updates,
        managed_asset_resource_bytes, managed_resource_type_supported,
        map_name_resource_updates_for_records, monster_icon_override_updates,
        preserve_imported_fixed_length, rule_compiler_baseline_bytes,
        scenario_icon_resource_updates, write_caste_overrides_for_export,
        write_race_overrides_for_export, write_spell_overrides_preserving_tail,
        NativeCompilerInputs, ResourceExportResult,
    };
    use crate::compatibility_annex::CompatibilityAnnex;
    use crate::native_manifest::NativeScenarioManifest;
    use crate::project::{
        Confidence, ItemTextRecord, ManagedAsset, ManagedAssetExportState, ManagedAssetKind,
        MapRecord, MapRecordRect, MonsterIconOverride, MonsterIconOverrideSource, Provenance,
        ScenarioIconResource, ScenarioIconResourceSource, ScenarioItemRecord, ScenarioTarget,
    };
    use crate::resource_fork::{
        decode_string_list_resource, encode_string_list_resource, write_resource_fork,
        ResourceForkEntry,
    };
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::fs;

    #[test]
    fn authored_compiler_is_independent_of_the_project_filesystem() {
        let temp = tempfile::tempdir().unwrap();
        let project_dir = temp.path().join("Manifest Proof.providence");
        let project =
            crate::importer::create_project("Manifest Proof".to_string(), &project_dir).unwrap();
        fs::remove_dir_all(&project_dir).unwrap();
        let inputs = NativeCompilerInputs {
            compatibility_annex: None,
            managed_asset_bytes: project.assets.iter().map(|_| None).collect(),
        };

        let first = compile_realmz_scenario(&project, ScenarioTarget::WindowsRealmzFolder, &inputs)
            .unwrap();
        let second =
            compile_realmz_scenario(&project, ScenarioTarget::WindowsRealmzFolder, &inputs)
                .unwrap();

        assert_eq!(first.manifest.files(), second.manifest.files());
        assert_eq!(first.manifest.files()["Scenario"].len(), 600);
        assert!(first.manifest.files().contains_key("Scenario.rsrc"));
        assert!(first.manifest.pass_through_files().is_empty());
    }

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
        let record = authored_spell(16, "Providence Ward");
        let mut manifest = NativeScenarioManifest::default();

        write_spell_overrides_preserving_tail(&mut manifest, None, std::slice::from_ref(&record))
            .unwrap();

        assert_eq!(
            manifest.files()["Data Spell"].len(),
            crate::realmz::SPELL_OVERRIDE_RECORDS * crate::realmz::SPELL_BYTES
        );
        assert_eq!(manifest.written_files(), ["Data Spell"]);

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

        let mut manifest = NativeScenarioManifest::default();
        write_race_overrides_for_export(&mut manifest, None, std::slice::from_ref(&race)).unwrap();
        write_caste_overrides_for_export(&mut manifest, None, std::slice::from_ref(&caste))
            .unwrap();

        let race_bytes = &manifest.files()["Data Race"];
        let caste_bytes = &manifest.files()["Data Caste"];
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
        assert_eq!(manifest.written_files(), ["Data Race", "Data Caste"]);
    }

    #[test]
    fn imported_rule_exports_preserve_aligned_rows_and_malformed_tails() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

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

        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();
        let mut manifest = NativeScenarioManifest::default();
        write_race_overrides_for_export(&mut manifest, Some(&annex), &[race]).unwrap();
        write_caste_overrides_for_export(&mut manifest, Some(&annex), &[caste]).unwrap();

        let race_output = &manifest.files()["Data Race"];
        let caste_output = &manifest.files()["Data Caste"];
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
        let annex = CompatibilityAnnex::from_root(raw_dir).snapshot().unwrap();

        let bytes =
            preserve_imported_fixed_length("Data EDCD", vec![1u8; 10], 10, Some(&annex)).unwrap();

        assert_eq!(bytes.len(), 30);
        assert_eq!(&bytes[..10], &[1u8; 10]);
        assert_eq!(&bytes[10..], &[0u8; 20]);
    }

    #[test]
    fn preserves_unknown_tail_bytes_for_malformed_fixed_row_file() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        fs::write(raw_dir.join("Data EDCD"), vec![9u8, 8, 7, 6, 5]).unwrap();
        let annex = CompatibilityAnnex::from_root(raw_dir).snapshot().unwrap();

        let bytes =
            preserve_imported_fixed_length("Data EDCD", vec![1u8, 2], 10, Some(&annex)).unwrap();

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
        let annex = CompatibilityAnnex::from_root(raw_dir).snapshot().unwrap();

        let bytes = append_preserved_shop_source_suffix(modeled.clone(), Some(&annex)).unwrap();

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
