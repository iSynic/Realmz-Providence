use crate::compatibility_annex::{CompatibilityAnnex, CompatibilityAnnexSnapshot};
use crate::error::{IoPath, ProvidenceError, Result};
use crate::generated::native_manifest_policy::{
    authored_optional_semantic_file_paths, authored_project_path_semantic_file_expectations,
    AUTHORED_OPTIONAL_SEMANTIC_FILES, AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS,
    AUTHORED_RESOURCE_SIDECAR_PATHS, AUTHORED_RUNTIME_BASELINE_FILES,
    AUTHORED_RUNTIME_BASELINE_FILE_PATHS, AUTHORED_SCENARIO_ITEM_RECORDS,
    AUTHORED_STARTUP_FILES, AUTHORED_TRIGGER_TABLES, AUTHORED_TRIGGER_TABLE_PATHS,
};
use crate::native_manifest::NativeScenarioManifest;
use crate::project::{
    BattleRecord, ComplexEncounterRecord, ItemTextRecord, LevelType, MapRecord, MessageRecord,
    MonsterDescriptionRecord, MonsterIconOverride, MonsterIconOverrideSource, MonsterRecord,
    OptionLabelRecord, ProvidenceProject, RandomLevel, ScenarioCasteOverride, ScenarioRaceOverride,
    ScenarioSpellOverride, ScenarioTarget, SimpleEncounterRecord, TargetCompatibilityBuckets,
    TargetCompatibilityIssue, ThiefEncounterRecord, TimedEncounterRecord,
};
use crate::realmz::landlooks::{
    CUSTOM_LANDLOOK_METADATA_BYTES, LANDLOOK_RANGE_SLOTS, LANDLOOK_RANGE_SLOT_BYTES,
    MAPSTATS_RECORDS, MAPSTATS_RECORD_BYTES, TILE_SOLIDS_BYTES,
};
use crate::realmz::{
    write_battles, write_caste_overrides, write_complex_encounters, write_custom_landlook_metadata,
    write_door_file_for_levels, write_extracodes, write_fields, write_global_macro_hooks,
    write_land_layout, write_macro_file, write_map_records, write_messages,
    write_monster_descriptions, write_monsters, write_option_labels, write_race_overrides,
    write_random_levels, write_scenario_contact_info, write_scenario_items,
    write_scenario_restrictions, write_scenario_shell, write_scenario_support_file, write_shops,
    write_simple_encounters, write_spell_overrides, write_thief_encounters, write_tile_solids,
    write_timed_encounters, write_treasures, DOOR_BYTES, EXTRACODE_BYTES, LAND_LAYOUT_BYTES,
};
use crate::resource_fork::{
    decode_string_list_resource, encode_string_list_resource, merge_resource_entries,
    merge_resource_entries_with_removals, parse_resource_fork_entries,
    write_minimum_scenario_resource_fork, ResourceForkEntry,
};
use crate::rule_compiler::{
    write_fresh_caste_overrides, write_fresh_race_overrides, write_fresh_spell_overrides,
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

pub(crate) fn expected_authored_scenario_manifest_files(
    project: &ProvidenceProject,
    target: ScenarioTarget,
) -> Result<Vec<String>> {
    if project.source.requires_compatibility_annex() {
        return Err(ProvidenceError::message(
            "Expected authored scenario manifest files are only available for authored projects.",
        ));
    }
    let inputs = NativeCompilerInputs {
        compatibility_annex: None,
        managed_asset_bytes: project.assets.iter().map(|_| None).collect(),
    };
    let compilation = compile_realmz_scenario(project, target, &inputs)?;
    Ok(compilation.manifest.files().keys().cloned().collect())
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
        write_scenario_singleton_for_export(
            &mut manifest,
            scenario_shell_file_name(project),
            316,
            shell.authored,
            write_scenario_shell(shell)?,
            compatibility_annex,
        )?;
    }
    if let Some(support_file) = &project.scenario.support_file {
        write_scenario_support_file_for_export(
            &mut manifest,
            &support_file.source_file,
            support_file.authored,
            write_scenario_support_file(support_file)?,
            compatibility_annex,
        )?;
    }
    if let Some(contact_info) = &project.scenario.contact_info {
        write_scenario_singleton_for_export(
            &mut manifest,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.contact_info,
            crate::realmz::SCENARIO_CONTACT_INFO_BYTES,
            contact_info.authored,
            write_scenario_contact_info(contact_info)?,
            compatibility_annex,
        )?;
    }
    if let Some(restrictions) = &project.scenario.restrictions {
        write_scenario_singleton_for_export(
            &mut manifest,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.restrictions,
            crate::realmz::SCENARIO_RESTRICTIONS_BYTES,
            restrictions.authored,
            write_scenario_restrictions(restrictions)?,
            compatibility_annex,
        )?;
    }
    if let Some(global_hooks) = &project.scenario.global_macro_hooks {
        write_if_nonempty(
            &mut manifest,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.global_hooks,
            preserve_imported_global_macro_hooks(
                write_global_macro_hooks(global_hooks)?,
                global_hooks.authored,
                compatibility_annex,
            )?,
        )?;
    }
    if let Some(security_backup) = &project.scenario.security_backup {
        write_scenario_singleton_for_export(
            &mut manifest,
            AUTHORED_STARTUP_FILES.security_backup,
            316,
            security_backup.authored,
            write_scenario_shell(security_backup)?,
            compatibility_annex,
        )?;
    }
    write_if_nonempty(
        &mut manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.land_maps,
        write_fields(&project.maps, LevelType::Land)?,
    )?;
    write_if_nonempty(
        &mut manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.dungeon_maps,
        write_fields(&project.maps, LevelType::Dungeon)?,
    )?;
    if let Some(layout) = &project.land_layout {
        write_if_nonempty(
            &mut manifest,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.land_layout,
            preserve_imported_land_layout_tail(write_land_layout(layout)?, compatibility_annex)?,
        )?;
    }
    write_if_nonempty(
        &mut manifest,
        AUTHORED_STARTUP_FILES.tile_solids,
        preserve_imported_data_solids_tail(
            write_tile_solids(&project.tile_attributes)?,
            compatibility_annex,
        )?,
    )?;
    for landlook in &project.custom_landlooks {
        if landlook.authored {
            write_if_nonempty(
                &mut manifest,
                &landlook.source_file,
                preserve_imported_custom_landlook_compatibility(
                    write_custom_landlook_metadata(landlook)?,
                    &landlook.source_file,
                    compatibility_annex,
                )?,
            )?;
        }
    }
    write_if_nonempty(
        &mut manifest,
        AUTHORED_TRIGGER_TABLE_PATHS.land,
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
        AUTHORED_TRIGGER_TABLE_PATHS.dungeon,
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
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.land_random_levels,
        preserve_imported_random_level_compatibility(
            write_random_levels(&project.random_levels, LevelType::Land)?,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.land_random_levels,
            &project.random_levels,
            LevelType::Land,
            compatibility_annex,
        )?,
    )?;
    write_if_nonempty(
        &mut manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.dungeon_random_levels,
        preserve_imported_random_level_compatibility(
            write_random_levels(&project.random_levels, LevelType::Dungeon)?,
            AUTHORED_RUNTIME_BASELINE_FILE_PATHS.dungeon_random_levels,
            &project.random_levels,
            LevelType::Dungeon,
            compatibility_annex,
        )?,
    )?;
    write_if_nonempty(
        &mut manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.macro_actions,
        compile_fixed_rows_with_compatibility_annex(
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.macro_actions,
            write_macro_file(&project.triggers)?,
            DOOR_BYTES,
            compatibility_annex,
        )?,
    )?;
    write_if_nonempty(
        &mut manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.extra_codes,
        compile_fixed_rows_with_compatibility_annex(
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.extra_codes,
            write_extracodes(&project.extracodes)?,
            EXTRACODE_BYTES,
            compatibility_annex,
        )?,
    )?;
    write_messages_for_export(&mut manifest, &project.messages, compatibility_annex)?;
    write_option_labels_for_export(&mut manifest, &project.option_labels, compatibility_annex)?;
    write_if_nonempty(
        &mut manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.map_records,
        preserve_imported_map_record_compatibility(
            write_map_records(&project.map_records)?,
            &project.map_records,
            compatibility_annex,
        )?,
    )?;
    write_battles_for_export(&mut manifest, &project.battles, compatibility_annex)?;
    write_monsters_for_export(
        &mut manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.monsters,
        &project.monsters,
        compatibility_annex,
    )?;
    for monster_set in &project.monster_sets {
        write_monsters_for_export(
            &mut manifest,
            &monster_set.source_file,
            &monster_set.monsters,
            compatibility_annex,
        )?;
    }
    write_monster_descriptions_for_export(
        &mut manifest,
        &project.monster_descriptions,
        compatibility_annex,
    )?;
    let mut scenario_item_bytes = preserve_imported_scenario_item_compatibility(
        write_scenario_items(&project.scenario_items)?,
        &project.scenario_items,
        compatibility_annex,
    )?;
    if !preserves_source_snapshot {
        scenario_item_bytes.resize(
            AUTHORED_SCENARIO_ITEM_RECORDS * crate::realmz::ITEM_BYTES,
            0,
        );
    }
    write_if_nonempty(
        &mut manifest,
        AUTHORED_STARTUP_FILES.scenario_items,
        scenario_item_bytes,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.treasures,
        write_treasures(&project.treasures)?,
        crate::realmz::TREASURE_BYTES,
        compatibility_annex,
    )?;
    write_fixed_if_nonempty(
        &mut manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.shops,
        append_preserved_shop_source_suffix(write_shops(&project.shops)?, compatibility_annex)?,
        crate::realmz::SHOP_BYTES,
        compatibility_annex,
    )?;
    write_simple_encounters_for_export(
        &mut manifest,
        &project.simple_encounters,
        compatibility_annex,
    )?;
    write_complex_encounters_for_export(
        &mut manifest,
        &project.complex_encounters,
        compatibility_annex,
    )?;
    write_thief_encounters_for_export(
        &mut manifest,
        &project.thief_encounters,
        compatibility_annex,
    )?;
    write_timed_encounters_for_export(
        &mut manifest,
        &project.timed_encounters,
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
    if !preserves_source_snapshot {
        validate_authored_semantic_files(project, &manifest)?;
    }

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

fn validate_authored_semantic_files(
    project: &ProvidenceProject,
    manifest: &NativeScenarioManifest,
) -> Result<()> {
    let expected = authored_optional_semantic_file_paths(project);
    for family in AUTHORED_OPTIONAL_SEMANTIC_FILES {
        let should_exist = expected.iter().any(|path| *path == family.path);
        if manifest.files().contains_key(family.path) != should_exist {
            return Err(ProvidenceError::message(format!(
                "Authored optional semantic file policy '{}' expected {} at '{}' from {} {} {:?} {:?}.",
                family.id,
                if should_exist { "output" } else { "no output" },
                family.path,
                family.project_path,
                family.presence_kind,
                family.match_field,
                family.match_value,
            )));
        }
    }
    let project_path_expectations = authored_project_path_semantic_file_expectations(project);
    for expectation in &project_path_expectations {
        let should_exist = project_path_expectations
            .iter()
            .any(|candidate| candidate.path == expectation.path && candidate.should_exist);
        if manifest.files().contains_key(expectation.path) != should_exist {
            return Err(ProvidenceError::message(format!(
                "Authored project-path semantic file policy '{}' expected {} at canonical path '{}'.",
                expectation.family_id,
                if should_exist { "output" } else { "no output" },
                expectation.path,
            )));
        }
    }
    Ok(())
}

fn write_authored_runtime_baseline(
    manifest: &mut NativeScenarioManifest,
    project: &ProvidenceProject,
    target: ScenarioTarget,
) -> Result<()> {
    const SCENARIO_ITEM_TABLE_BYTES: usize =
        AUTHORED_SCENARIO_ITEM_RECORDS * crate::realmz::ITEM_BYTES;

    let shell = project.scenario.shell.as_ref().ok_or_else(|| {
        ProvidenceError::message("Authored scenarios require scenario shell metadata.")
    })?;
    let entries = [
        (
            AUTHORED_STARTUP_FILES.scenario_support.to_string(),
            vec![0; crate::realmz::SCENARIO_SUPPORT_FILE_BYTES],
        ),
        (
            authored_resource_file_name(target).to_string(),
            write_minimum_scenario_resource_fork()?,
        ),
        (
            AUTHORED_STARTUP_FILES.security_backup.to_string(),
            write_scenario_shell(shell)?,
        ),
        (
            AUTHORED_STARTUP_FILES.scenario_items.to_string(),
            vec![0; SCENARIO_ITEM_TABLE_BYTES],
        ),
        (
            AUTHORED_STARTUP_FILES.tile_solids.to_string(),
            write_tile_solids(&project.tile_attributes)?,
        ),
    ];
    for (name, bytes) in entries {
        manifest.insert_generated(name, bytes);
    }
    for table in AUTHORED_TRIGGER_TABLES {
        let level_type = match table.level_type {
            "land" => LevelType::Land,
            "dungeon" => LevelType::Dungeon,
            other => {
                return Err(ProvidenceError::message(format!(
                    "Unsupported authored trigger-table level type '{other}'."
                )))
            }
        };
        let level_count = project
            .maps
            .iter()
            .filter(|map| map.level_type == level_type)
            .count()
            .max(table.minimum_levels);
        manifest.insert_generated(
            table.path,
            vec![0; level_count * crate::realmz::DOOR_LEVEL_BYTES],
        );
    }
    for path in AUTHORED_RUNTIME_BASELINE_FILES {
        manifest.insert_generated(*path, Vec::new());
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

fn write_scenario_singleton_for_export(
    manifest: &mut NativeScenarioManifest,
    name: &str,
    record_bytes: usize,
    authored: bool,
    bytes: Vec<u8>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_singleton(bytes, name, record_bytes, authored, annex)?;
    write_if_nonempty(manifest, name, bytes)
}

fn write_scenario_support_file_for_export(
    manifest: &mut NativeScenarioManifest,
    name: &str,
    authored: bool,
    bytes: Vec<u8>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_scenario_support_file(bytes, name, authored, annex)?;
    write_if_nonempty(manifest, name, bytes)
}

fn preserve_imported_scenario_support_file(
    bytes: Vec<u8>,
    name: &str,
    authored: bool,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(raw) = (match annex {
        Some(annex) => annex.read(name)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    if !authored && raw.len() >= 40 {
        return Ok(raw);
    }
    if raw.len() < 40 {
        return Ok(bytes);
    }
    let mut output = vec![0; bytes.len().max(raw.len())];
    output[..raw.len()].copy_from_slice(&raw);
    output[23] = bytes[23];
    output[38..40].copy_from_slice(&bytes[38..40]);
    Ok(output)
}

fn preserve_imported_singleton(
    mut bytes: Vec<u8>,
    name: &str,
    record_bytes: usize,
    authored: bool,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(raw) = (match annex {
        Some(annex) => annex.read(name)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    if !authored && raw.len() >= record_bytes {
        return Ok(raw);
    }
    if raw.len() > bytes.len() && raw.len() % record_bytes != 0 {
        bytes.extend_from_slice(&raw[bytes.len()..]);
    }
    Ok(bytes)
}

fn preserve_imported_global_macro_hooks(
    mut bytes: Vec<u8>,
    authored: bool,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(raw) = (match annex {
        Some(annex) => annex.read(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.global_hooks)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    if !authored {
        return Ok(raw);
    }
    let record_bytes = crate::realmz::GLOBAL_MACRO_HOOK_BYTES;
    if raw.len() > bytes.len() && raw.len() % record_bytes != 0 {
        bytes.extend_from_slice(&raw[bytes.len()..]);
    }
    if raw.len() >= record_bytes {
        bytes[6..8].copy_from_slice(&raw[6..8]);
        bytes[12..record_bytes].copy_from_slice(&raw[12..record_bytes]);
    }
    Ok(bytes)
}

fn write_messages_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[MessageRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_message_rows(write_messages(records)?, records, annex)?;
    write_if_nonempty(
        manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.messages,
        bytes,
    )
}

fn write_option_labels_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[OptionLabelRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_option_label_rows(write_option_labels(records)?, records, annex)?;
    write_if_nonempty(
        manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.option_labels,
        bytes,
    )
}

fn write_battles_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[BattleRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_battle_rows(write_battles(records)?, records, annex)?;
    write_if_nonempty(
        manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.battles,
        bytes,
    )
}

fn write_monsters_for_export(
    manifest: &mut NativeScenarioManifest,
    name: &str,
    records: &[MonsterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_monster_rows(write_monsters(records)?, name, records, annex)?;
    write_if_nonempty(manifest, name, bytes)
}

fn write_monster_descriptions_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[MonsterDescriptionRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_monster_description_rows(
        write_monster_descriptions(records)?,
        records,
        annex,
    )?;
    write_if_nonempty(
        manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.monster_descriptions,
        bytes,
    )
}

fn write_simple_encounters_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[SimpleEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes =
        preserve_imported_simple_encounter_rows(write_simple_encounters(records)?, records, annex)?;
    write_if_nonempty(
        manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.simple_encounters,
        bytes,
    )
}

fn write_complex_encounters_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[ComplexEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes = preserve_imported_complex_encounter_rows(
        write_complex_encounters(records)?,
        records,
        annex,
    )?;
    write_if_nonempty(
        manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.complex_encounters,
        bytes,
    )
}

fn write_thief_encounters_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[ThiefEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes =
        preserve_imported_thief_encounter_rows(write_thief_encounters(records)?, records, annex)?;
    write_if_nonempty(
        manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.thief_encounters,
        bytes,
    )
}

fn write_timed_encounters_for_export(
    manifest: &mut NativeScenarioManifest,
    records: &[TimedEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<()> {
    let bytes =
        preserve_imported_timed_encounter_rows(write_timed_encounters(records)?, records, annex)?;
    write_if_nonempty(
        manifest,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.timed_encounters,
        bytes,
    )
}

fn preserve_imported_message_rows(
    bytes: Vec<u8>,
    records: &[MessageRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        bytes,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.messages,
        crate::realmz::MESSAGE_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_option_label_rows(
    bytes: Vec<u8>,
    records: &[OptionLabelRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        bytes,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.option_labels,
        crate::realmz::OPTION_LABEL_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_battle_rows(
    bytes: Vec<u8>,
    records: &[BattleRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        bytes,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.battles,
        crate::realmz::BATTLE_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_monster_rows(
    modeled: Vec<u8>,
    name: &str,
    records: &[MonsterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        modeled,
        name,
        crate::realmz::MONSTER_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_monster_description_rows(
    modeled: Vec<u8>,
    records: &[MonsterDescriptionRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        modeled,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.monster_descriptions,
        crate::realmz::MONSTER_DESCRIPTION_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_simple_encounter_rows(
    bytes: Vec<u8>,
    records: &[SimpleEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        bytes,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.simple_encounters,
        crate::realmz::SIMPLE_ENCOUNTER_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_complex_encounter_rows(
    bytes: Vec<u8>,
    records: &[ComplexEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        bytes,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.complex_encounters,
        crate::realmz::COMPLEX_ENCOUNTER_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_thief_encounter_rows(
    bytes: Vec<u8>,
    records: &[ThiefEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    preserve_imported_fixed_rows(
        bytes,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.thief_encounters,
        crate::realmz::THIEF_ENCOUNTER_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )
}

fn preserve_imported_timed_encounter_rows(
    bytes: Vec<u8>,
    records: &[TimedEncounterRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let mut output = preserve_imported_fixed_rows(
        bytes,
        AUTHORED_RUNTIME_BASELINE_FILE_PATHS.timed_encounters,
        crate::realmz::TIMED_ENCOUNTER_BYTES,
        records.iter().map(|record| (record.id, record.authored)),
        annex,
    )?;
    let Some(raw) = (match annex {
        Some(annex) => annex.read(AUTHORED_RUNTIME_BASELINE_FILE_PATHS.timed_encounters)?,
        None => None,
    }) else {
        return Ok(output);
    };
    let complete_source_bytes =
        raw.len() / crate::realmz::TIMED_ENCOUNTER_BYTES * crate::realmz::TIMED_ENCOUNTER_BYTES;
    for record in records.iter().filter(|record| record.authored) {
        let start = record.id * crate::realmz::TIMED_ENCOUNTER_BYTES + 22;
        let end = (record.id + 1) * crate::realmz::TIMED_ENCOUNTER_BYTES;
        if end <= output.len() && end <= complete_source_bytes {
            output[start..end].copy_from_slice(&raw[start..end]);
        }
    }
    Ok(output)
}

fn preserve_imported_fixed_rows(
    mut bytes: Vec<u8>,
    name: &str,
    record_bytes: usize,
    records: impl Iterator<Item = (usize, bool)>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    if bytes.is_empty() {
        return Ok(bytes);
    }
    let Some(raw) = (match annex {
        Some(annex) => annex.read(name)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    let complete_source_bytes = raw.len() / record_bytes * record_bytes;
    for (id, _) in records.filter(|(_, authored)| !authored) {
        let start = id * record_bytes;
        let end = start + record_bytes;
        if end <= bytes.len() && end <= complete_source_bytes {
            bytes[start..end].copy_from_slice(&raw[start..end]);
        }
    }
    bytes.extend_from_slice(&raw[complete_source_bytes..]);
    Ok(bytes)
}

fn preserve_imported_scenario_item_compatibility(
    bytes: Vec<u8>,
    records: &[crate::project::ScenarioItemRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    if bytes.is_empty() {
        return Ok(bytes);
    }
    let Some(raw) = (match annex {
        Some(annex) => annex.read(AUTHORED_STARTUP_FILES.scenario_items)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    let record_bytes = crate::realmz::ITEM_BYTES;
    let complete_source_bytes = raw.len() / record_bytes * record_bytes;
    let mut output = vec![0; bytes.len().max(complete_source_bytes)];
    output[..bytes.len()].copy_from_slice(&bytes);
    for record in records {
        let start = record.id * record_bytes;
        if start + record_bytes > complete_source_bytes || start + record_bytes > output.len() {
            continue;
        }
        let source_item_id = i16::from_be_bytes([raw[start + 2], raw[start + 3]]);
        if source_item_id == 0 && record.item_id as i32 == 800 + record.id as i32 {
            output[start + 2..start + 4].copy_from_slice(&raw[start + 2..start + 4]);
        }
    }
    output.extend_from_slice(&raw[complete_source_bytes..]);
    Ok(output)
}

fn append_preserved_shop_source_suffix(
    mut bytes: Vec<u8>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(annex) = annex else {
        return Ok(bytes);
    };
    let Some(raw) = annex.read(AUTHORED_RUNTIME_BASELINE_FILE_PATHS.shops)? else {
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

fn compile_fixed_rows_with_compatibility_annex(
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
    let complete_source_bytes = raw.len() / record_bytes * record_bytes;
    bytes.resize(bytes.len().max(complete_source_bytes), 0);
    bytes.extend_from_slice(&raw[complete_source_bytes..]);
    Ok(bytes)
}

fn preserve_imported_map_record_compatibility(
    mut bytes: Vec<u8>,
    records: &[MapRecord],
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    if bytes.is_empty() {
        return Ok(bytes);
    }
    let Some(raw) = (match annex {
        Some(annex) => annex.read(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.map_records)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    let record_bytes = crate::realmz::MAP_RECORD_BYTES;
    let complete_source_bytes = raw.len() / record_bytes * record_bytes;
    let output_core_bytes = bytes.len().max(complete_source_bytes);
    let mut output = vec![0; output_core_bytes];
    output[..bytes.len()].copy_from_slice(&bytes);
    output.extend_from_slice(&raw[complete_source_bytes..]);
    bytes = output;
    let source_records = crate::realmz::parse_map_records(&raw[..complete_source_bytes]);
    for record in records {
        let start = record.id * record_bytes;
        if start + record_bytes > bytes.len() || start + record_bytes > complete_source_bytes {
            continue;
        }
        bytes[start + 74..start + 76].copy_from_slice(&raw[start + 74..start + 76]);
        let source = &source_records[record.id];
        if source.is_dungeon == record.is_dungeon {
            bytes[start + 72..start + 74].copy_from_slice(&raw[start + 72..start + 74]);
        }
        if source.note == record.note {
            bytes[start + 84..start + record_bytes]
                .copy_from_slice(&raw[start + 84..start + record_bytes]);
        }
    }
    Ok(bytes)
}

fn preserve_imported_random_level_compatibility(
    bytes: Vec<u8>,
    name: &str,
    levels: &[RandomLevel],
    level_type: LevelType,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    if bytes.is_empty() {
        return Ok(bytes);
    }
    let Some(raw) = (match annex {
        Some(annex) => annex.read(name)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    let record_bytes = crate::realmz::RANDLEVEL_BYTES;
    let complete_source_bytes = raw.len() / record_bytes * record_bytes;
    let mut output = Vec::with_capacity(bytes.len() + raw.len() - complete_source_bytes);
    output.extend_from_slice(&bytes);
    output.extend_from_slice(&raw[complete_source_bytes..]);

    for level in levels.iter().filter(|level| level.level_type == level_type) {
        let start = level.level_index * record_bytes;
        if start + record_bytes > bytes.len() || start + record_bytes > complete_source_bytes {
            continue;
        }
        if (raw[start + 521] != 0) == level.is_dark {
            output[start + 521] = raw[start + 521];
        }
        if (raw[start + 522] != 0) == level.use_los {
            output[start + 522] = raw[start + 522];
        }
        for rect_index in 0..20 {
            let source_active = imported_random_rect_active(&raw, start, rect_index);
            let current = level
                .rects
                .iter()
                .find(|rect| rect.rect_index == rect_index);
            if !source_active && current.is_none() {
                copy_imported_random_rect_slot(&mut output, &raw, start, rect_index);
            } else if source_active
                && current
                    .map(|rect| (raw[start + 523 + rect_index] != 0) == rect.only)
                    .unwrap_or(false)
            {
                output[start + 523 + rect_index] = raw[start + 523 + rect_index];
            }
        }
        output[start + 643] = raw[start + 643];
    }
    Ok(output)
}

fn imported_random_rect_active(raw: &[u8], record_start: usize, rect_index: usize) -> bool {
    let rect_start = record_start + rect_index * 8;
    random_level_i16(raw, rect_start) != 0
        || random_level_i16(raw, rect_start + 2) != 0
        || random_level_i16(raw, rect_start + 4) != 0
        || random_level_i16(raw, rect_start + 6) != 0
        || random_level_i16(raw, record_start + 160 + rect_index * 2) != 0
        || (0..3)
            .any(|slot| random_level_i16(raw, record_start + 280 + rect_index * 6 + slot * 2) != 0)
}

fn copy_imported_random_rect_slot(
    output: &mut [u8],
    raw: &[u8],
    record_start: usize,
    rect_index: usize,
) {
    for (relative_start, length) in [
        (rect_index * 8, 8),
        (160 + rect_index * 2, 2),
        (200 + rect_index * 4, 4),
        (280 + rect_index * 6, 6),
        (400 + rect_index * 6, 6),
        (523 + rect_index, 1),
        (543 + rect_index, 1),
        (563 + rect_index * 2, 2),
        (603 + rect_index * 2, 2),
    ] {
        let start = record_start + relative_start;
        output[start..start + length].copy_from_slice(&raw[start..start + length]);
    }
}

fn random_level_i16(bytes: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([bytes[offset], bytes[offset + 1]])
}

fn preserve_imported_data_solids_tail(
    mut bytes: Vec<u8>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(raw) = (match annex {
        Some(annex) => annex.read(AUTHORED_STARTUP_FILES.tile_solids)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    if raw.len() > TILE_SOLIDS_BYTES {
        bytes.extend_from_slice(&raw[TILE_SOLIDS_BYTES..]);
    }
    Ok(bytes)
}

fn preserve_imported_land_layout_tail(
    mut bytes: Vec<u8>,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(raw) = (match annex {
        Some(annex) => annex.read(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.land_layout)?,
        None => None,
    }) else {
        return Ok(bytes);
    };
    if raw.len() > LAND_LAYOUT_BYTES {
        bytes.extend_from_slice(&raw[LAND_LAYOUT_BYTES..]);
    }
    Ok(bytes)
}

fn preserve_imported_custom_landlook_compatibility(
    mut bytes: Vec<u8>,
    source_file: &str,
    annex: Option<&CompatibilityAnnexSnapshot>,
) -> Result<Vec<u8>> {
    let Some(raw) = (match annex {
        Some(annex) => annex.read(source_file)?,
        None => None,
    }) else {
        return Ok(bytes);
    };

    for tile in 0..MAPSTATS_RECORDS {
        let offset = tile * MAPSTATS_RECORD_BYTES + 18;
        if raw.len() >= offset + 2 {
            bytes[offset..offset + 2].copy_from_slice(&raw[offset..offset + 2]);
        }
    }
    let range_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
    for slot in 0..LANDLOOK_RANGE_SLOTS {
        let offset = range_offset + slot * LANDLOOK_RANGE_SLOT_BYTES + 4;
        if raw.len() >= offset + 2 {
            bytes[offset..offset + 2].copy_from_slice(&raw[offset..offset + 2]);
        }
    }
    if raw.len() > CUSTOM_LANDLOOK_METADATA_BYTES {
        bytes.extend_from_slice(&raw[CUSTOM_LANDLOOK_METADATA_BYTES..]);
    }
    Ok(bytes)
}

fn write_race_overrides_for_export(
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    records: &[ScenarioRaceOverride],
) -> Result<()> {
    let source_backed = match annex {
        Some(annex) => annex.contains(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.race_overrides)?,
        None => false,
    };
    if !source_backed {
        return write_if_nonempty(
            manifest,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.race_overrides,
            write_fresh_race_overrides(records)?,
        );
    }
    write_rule_overrides_for_export(
        manifest,
        annex,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.race_overrides,
        crate::realmz::RACE_BYTES,
        records
            .iter()
            .map(|record| (record.id, record.authored))
            .collect(),
        write_race_overrides(records)?,
    )
}

fn write_caste_overrides_for_export(
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    records: &[ScenarioCasteOverride],
) -> Result<()> {
    let source_backed = match annex {
        Some(annex) => annex.contains(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.caste_overrides)?,
        None => false,
    };
    if !source_backed {
        return write_if_nonempty(
            manifest,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.caste_overrides,
            write_fresh_caste_overrides(records)?,
        );
    }
    write_rule_overrides_for_export(
        manifest,
        annex,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.caste_overrides,
        crate::realmz::CASTE_BYTES,
        records
            .iter()
            .map(|record| (record.id, record.authored))
            .collect(),
        write_caste_overrides(records)?,
    )
}

#[allow(clippy::too_many_arguments)]
fn write_rule_overrides_for_export(
    manifest: &mut NativeScenarioManifest,
    annex: Option<&CompatibilityAnnexSnapshot>,
    name: &str,
    record_bytes: usize,
    records: Vec<(usize, bool)>,
    encoded: Vec<u8>,
) -> Result<()> {
    if records.is_empty() {
        return Ok(());
    }
    let raw = match annex {
        Some(annex) => annex.read(name)?,
        None => None,
    }
    .ok_or_else(|| {
        ProvidenceError::message(format!("Missing compatibility annex source {name}."))
    })?;
    let mut body = raw;
    let body_bytes = body.len() / record_bytes * record_bytes;
    let tail = body.split_off(body_bytes);
    let required_body_bytes = records
        .iter()
        .map(|(id, _)| (id + 1) * record_bytes)
        .max()
        .unwrap_or(0);
    if body.len() < required_body_bytes {
        body.resize(required_body_bytes, 0);
    }
    for (id, authored) in records {
        if !authored {
            continue;
        }
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
    let encoded = write_spell_overrides(records)?;
    if encoded.is_empty() {
        return Ok(());
    }
    let Some(mut bytes) = (match annex {
        Some(annex) => annex.read(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.spell_overrides)?,
        None => None,
    }) else {
        return write_if_nonempty(
            manifest,
            AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.spell_overrides,
            write_fresh_spell_overrides(records)?,
        );
    };
    let body_bytes = bytes.len() / crate::realmz::SPELL_BYTES * crate::realmz::SPELL_BYTES;
    let tail = bytes.split_off(body_bytes);
    let required_body_bytes = records
        .iter()
        .map(|record| (record.id + 1) * crate::realmz::SPELL_BYTES)
        .max()
        .unwrap_or(0);
    if bytes.len() < required_body_bytes {
        bytes.resize(required_body_bytes, 0);
    }
    for record in records.iter().filter(|record| record.authored) {
        let start = record.id * crate::realmz::SPELL_BYTES;
        let end = start + crate::realmz::SPELL_BYTES;
        bytes[start..end].copy_from_slice(&encoded[start..end]);
    }
    bytes.extend_from_slice(&tail);
    write_if_nonempty(
        manifest,
        AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.spell_overrides,
        bytes,
    )
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
    let (resource_file_name, original) = preserved.unwrap_or_else(|| {
        (
            AUTHORED_RESOURCE_SIDECAR_PATHS
                .custom_spell_names
                .to_string(),
            Vec::new(),
        )
    });
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
    for name in [
        AUTHORED_RESOURCE_SIDECAR_PATHS.custom_spell_names,
        "Data Spell.rsf",
        "._Data Spell",
    ] {
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
        Some(annex) => data_id_resource_fork(annex)?.unwrap_or_else(|| {
            (
                AUTHORED_RESOURCE_SIDECAR_PATHS.item_texts.to_string(),
                Vec::new(),
            )
        }),
        None => (
            AUTHORED_RESOURCE_SIDECAR_PATHS.item_texts.to_string(),
            Vec::new(),
        ),
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
    for name in [
        AUTHORED_RESOURCE_SIDECAR_PATHS.item_texts,
        "Data ID.rsf",
        "._Data ID",
        "Data ID",
    ] {
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

fn is_normalized_landlook_atlas_pict(data: &[u8]) -> bool {
    let read_u16 = |offset: usize| u16::from_be_bytes([data[offset], data[offset + 1]]);
    data.len() >= 14
        && read_u16(2) == 0
        && read_u16(4) == 0
        && read_u16(6) == 320
        && read_u16(8) == 640
        && read_u16(10) == 0x0098
        && read_u16(12) == (0x8000 | 640)
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
        write_minimum_scenario_resource_fork()?
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
        if matches!(
            asset
                .conversion
                .as_ref()
                .map(|conversion| &conversion.target),
            Some(crate::project::AssetImportTarget::CustomLandlookAtlas)
        ) && !is_normalized_landlook_atlas_pict(&data)
        {
            result.blocked_assets.push(format!(
                "{} is not a normalized 640 x 320 indexed PICT atlas",
                asset.label
            ));
            continue;
        }
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
        if target == ScenarioTarget::WindowsRealmzFolder
            && file.name == AUTHORED_STARTUP_FILES.scenario_support
        {
            continue;
        }
        if let Some(bytes) = annex.read(&file.relative_path)? {
            return Ok(Some(bytes));
        }
    }
    Ok(None)
}

fn resource_file_name(project: &ProvidenceProject, target: ScenarioTarget) -> String {
    if !project.source.requires_compatibility_annex() {
        return authored_resource_file_name(target).to_string();
    }
    let shell_name = scenario_shell_file_name(project);
    let mut preferred = vec![
        AUTHORED_STARTUP_FILES.windows_resource_fork.to_string(),
        AUTHORED_STARTUP_FILES.mac_classic_resource_fork.to_string(),
        AUTHORED_STARTUP_FILES.providence_portable_resource_fork.to_string(),
        "Scenario.rsf".to_string(),
        format!("{shell_name}.rsrc"),
        format!("{shell_name}.rsf"),
        AUTHORED_STARTUP_FILES.scenario_support.to_string(),
    ];
    preferred.dedup();
    for candidate in preferred {
        if let Some(file) = project.source.files.iter().find(|file| {
            matches!(file.role, crate::project::SourceFileRole::ResourceFork)
                && file.name.eq_ignore_ascii_case(&candidate)
        }) {
            if target == ScenarioTarget::WindowsRealmzFolder
                && file.name == AUTHORED_STARTUP_FILES.scenario_support
            {
                return AUTHORED_STARTUP_FILES.windows_resource_fork.to_string();
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
            if target == ScenarioTarget::WindowsRealmzFolder
                && file.name == AUTHORED_STARTUP_FILES.scenario_support
            {
                AUTHORED_STARTUP_FILES.windows_resource_fork.to_string()
            } else {
                file.name.clone()
            }
        })
        .unwrap_or_else(|| {
            if target == ScenarioTarget::WindowsRealmzFolder {
                AUTHORED_STARTUP_FILES.windows_resource_fork.to_string()
            } else {
                AUTHORED_STARTUP_FILES.scenario_support.to_string()
            }
        })
}

fn authored_resource_file_name(target: ScenarioTarget) -> &'static str {
    match target {
        ScenarioTarget::WindowsRealmzFolder => AUTHORED_STARTUP_FILES.windows_resource_fork,
        ScenarioTarget::MacClassicFolder => AUTHORED_STARTUP_FILES.mac_classic_resource_fork,
        ScenarioTarget::ProvidencePortableFolder => {
            AUTHORED_STARTUP_FILES.providence_portable_resource_fork
        }
    }
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
        append_preserved_shop_source_suffix, compile_fixed_rows_with_compatibility_annex,
        compile_realmz_scenario, custom_spell_name_resource_updates,
        is_normalized_landlook_atlas_pict, item_text_resource_updates,
        managed_asset_resource_bytes, managed_resource_type_supported,
        map_name_resource_updates_for_records, monster_icon_override_updates,
        preserve_imported_battle_rows, preserve_imported_complex_encounter_rows,
        preserve_imported_custom_landlook_compatibility, preserve_imported_global_macro_hooks,
        preserve_imported_land_layout_tail, preserve_imported_message_rows,
        preserve_imported_map_record_compatibility,
        preserve_imported_monster_description_rows, preserve_imported_monster_rows,
        preserve_imported_option_label_rows, preserve_imported_random_level_compatibility,
        preserve_imported_scenario_item_compatibility,
        preserve_imported_scenario_support_file, preserve_imported_simple_encounter_rows,
        preserve_imported_singleton, preserve_imported_thief_encounter_rows,
        preserve_imported_timed_encounter_rows, scenario_icon_resource_updates,
        write_caste_overrides_for_export, write_race_overrides_for_export,
        write_spell_overrides_preserving_tail, NativeCompilerInputs, ResourceExportResult,
    };
    use crate::compatibility_annex::CompatibilityAnnex;
    use crate::native_manifest::NativeScenarioManifest;
    use crate::project::{
        Confidence, ItemTextRecord, ManagedAsset, ManagedAssetExportState, ManagedAssetKind,
        MapMarker, MapRecord, MapRecordRect, MonsterIconOverride, MonsterIconOverrideSource,
        Provenance, ScenarioIconResource, ScenarioIconResourceSource, ScenarioItemRecord,
        ScenarioTarget,
    };
    use crate::resource_fork::{
        decode_string_list_resource, encode_string_list_resource, write_resource_fork,
        ResourceForkEntry,
    };
    use crate::rule_compiler::rule_compiler_baseline_bytes;
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
    fn random_level_annex_preserves_unchanged_compatibility_and_honors_deletion() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();
        let mut source = vec![0u8; crate::realmz::RANDLEVEL_BYTES];
        source[0..2].copy_from_slice(&3i16.to_be_bytes());
        source[521] = 0xa5;
        source[522] = 0x80;
        source[523] = 0xfe;
        source[565..567].copy_from_slice(&17i16.to_be_bytes());
        source[643] = 0x34;
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data RD"), &source).unwrap();
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();
        let mut levels = crate::realmz::parse_random_levels(
            &source[..crate::realmz::RANDLEVEL_BYTES],
            crate::project::LevelType::Land,
            "Data RD",
        );

        let unchanged = preserve_imported_random_level_compatibility(
            crate::realmz::write_random_levels(&levels, crate::project::LevelType::Land).unwrap(),
            "Data RD",
            &levels,
            crate::project::LevelType::Land,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(unchanged, source);

        levels[0].is_dark = false;
        levels[0].rects.clear();
        let edited = preserve_imported_random_level_compatibility(
            crate::realmz::write_random_levels(&levels, crate::project::LevelType::Land).unwrap(),
            "Data RD",
            &levels,
            crate::project::LevelType::Land,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(&edited[0..2], &[0, 0]);
        assert_eq!(edited[521], 0);
        assert_eq!(edited[522], 0x80);
        assert_eq!(edited[523], 0);
        assert_eq!(i16::from_be_bytes([edited[565], edited[566]]), 17);
        assert_eq!(edited[643], 0x34);
        assert_eq!(&edited[644..], &[0xde, 0xad, 0xbe]);
    }

    #[test]
    fn land_layout_compatibility_tail_comes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();
        let mut source = vec![0xa5; crate::realmz::LAND_LAYOUT_BYTES];
        source.extend((0..256).map(|value| value as u8));
        fs::write(raw_dir.join("Layout"), &source).unwrap();
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();
        let mut semantic = vec![0; crate::realmz::LAND_LAYOUT_BYTES];
        semantic[0..2].copy_from_slice(&[0xff, 0xff]);

        let output = preserve_imported_land_layout_tail(semantic.clone(), Some(&annex)).unwrap();

        assert_eq!(&output[..crate::realmz::LAND_LAYOUT_BYTES], semantic);
        assert_eq!(
            &output[crate::realmz::LAND_LAYOUT_BYTES..],
            &source[crate::realmz::LAND_LAYOUT_BYTES..]
        );
        assert_eq!(
            preserve_imported_land_layout_tail(semantic.clone(), None).unwrap(),
            semantic
        );
    }

    #[test]
    fn map_record_compatibility_comes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();
        let mut source = vec![0xa5; crate::realmz::MAP_RECORD_BYTES * 2];
        source[84] = 2;
        source[85] = b'G';
        source[86] = b'o';
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data MD2"), &source).unwrap();
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();
        let mut records = crate::realmz::parse_map_records(
            &source[..crate::realmz::MAP_RECORD_BYTES * 2],
        );
        let semantic = crate::realmz::write_map_records(&records).unwrap();

        assert_eq!(
            preserve_imported_map_record_compatibility(semantic.clone(), &records, None)
                .unwrap(),
            semantic
        );
        assert_eq!(
            preserve_imported_map_record_compatibility(semantic, &records, Some(&annex)).unwrap(),
            source
        );

        records.truncate(1);
        let removed = preserve_imported_map_record_compatibility(
            crate::realmz::write_map_records(&records).unwrap(),
            &records,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(
            &removed[..crate::realmz::MAP_RECORD_BYTES],
            &source[..crate::realmz::MAP_RECORD_BYTES]
        );
        assert!(removed[crate::realmz::MAP_RECORD_BYTES..crate::realmz::MAP_RECORD_BYTES * 2]
            .iter()
            .all(|byte| *byte == 0));
        assert_eq!(
            &removed[crate::realmz::MAP_RECORD_BYTES * 2..],
            &[0xde, 0xad, 0xbe]
        );

        records[0].start_x = 0x1234;
        records[0].is_dungeon = false;
        let edited = preserve_imported_map_record_compatibility(
            crate::realmz::write_map_records(&records).unwrap(),
            &records,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(i16::from_be_bytes([edited[60], edited[61]]), 0x1234);
        assert_eq!(&edited[72..74], &[0, 0]);
        assert_eq!(&edited[74..76], &[0xa5, 0xa5]);
        assert_eq!(&edited[84..87], &[2, b'G', b'o']);
        assert_eq!(edited[crate::realmz::MAP_RECORD_BYTES - 1], 0xa5);
        assert!(edited[crate::realmz::MAP_RECORD_BYTES..crate::realmz::MAP_RECORD_BYTES * 2]
            .iter()
            .all(|byte| *byte == 0));
        assert_eq!(
            &edited[crate::realmz::MAP_RECORD_BYTES * 2..],
            &[0xde, 0xad, 0xbe]
        );

        records[0].note = "Changed".to_string();
        let note_changed = preserve_imported_map_record_compatibility(
            crate::realmz::write_map_records(&records).unwrap(),
            &records,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(&note_changed[84..92], &[7, b'C', b'h', b'a', b'n', b'g', b'e', b'd']);
        assert_eq!(note_changed[crate::realmz::MAP_RECORD_BYTES - 1], 0);
    }

    #[test]
    fn scenario_item_compatibility_comes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();
        let mut source = vec![0xa5; crate::realmz::ITEM_BYTES * 2];
        source[2..4].copy_from_slice(&[0, 0]);
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data NI"), &source).unwrap();
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();
        let mut records = crate::realmz::parse_scenario_items(
            &source[..crate::realmz::ITEM_BYTES * 2],
        );
        let semantic = crate::realmz::write_scenario_items(&records).unwrap();

        assert_eq!(
            preserve_imported_scenario_item_compatibility(
                semantic.clone(),
                &records,
                None,
            )
            .unwrap(),
            semantic
        );
        assert_eq!(
            preserve_imported_scenario_item_compatibility(
                semantic,
                &records,
                Some(&annex),
            )
            .unwrap(),
            source
        );

        records.truncate(1);
        let removed = preserve_imported_scenario_item_compatibility(
            crate::realmz::write_scenario_items(&records).unwrap(),
            &records,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(&removed[..crate::realmz::ITEM_BYTES], &source[..crate::realmz::ITEM_BYTES]);
        assert!(removed[crate::realmz::ITEM_BYTES..crate::realmz::ITEM_BYTES * 2]
            .iter()
            .all(|byte| *byte == 0));
        assert_eq!(&removed[crate::realmz::ITEM_BYTES * 2..], &[0xde, 0xad, 0xbe]);

        records[0].item_id = 901;
        let edited = preserve_imported_scenario_item_compatibility(
            crate::realmz::write_scenario_items(&records).unwrap(),
            &records,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(i16::from_be_bytes([edited[2], edited[3]]), 901);
        assert_eq!(&edited[56..70], &source[56..70]);
        assert!(edited[crate::realmz::ITEM_BYTES..crate::realmz::ITEM_BYTES * 2]
            .iter()
            .all(|byte| *byte == 0));
        assert_eq!(&edited[crate::realmz::ITEM_BYTES * 2..], &[0xde, 0xad, 0xbe]);
    }

    #[test]
    fn custom_landlook_preserve_only_words_and_tail_come_only_from_annex() {
        use crate::realmz::landlooks::{
            CUSTOM_LANDLOOK_METADATA_BYTES, LANDLOOK_RANGE_SLOT_BYTES, MAPSTATS_RECORDS,
            MAPSTATS_RECORD_BYTES,
        };

        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();
        let mut source = vec![0xa5; CUSTOM_LANDLOOK_METADATA_BYTES];
        let spare_offset = 5 * MAPSTATS_RECORD_BYTES + 18;
        source[spare_offset..spare_offset + 2].copy_from_slice(&0x1234i16.to_be_bytes());
        let range_reserved_offset =
            MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_SLOT_BYTES + 4;
        source[range_reserved_offset..range_reserved_offset + 2]
            .copy_from_slice(&0x2345i16.to_be_bytes());
        source.extend_from_slice(&[0xca, 0xfe, 0x01]);
        fs::write(raw_dir.join("Data Custom 1 BD"), &source).unwrap();
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();
        let mut semantic = vec![0; CUSTOM_LANDLOOK_METADATA_BYTES];
        semantic[5 * MAPSTATS_RECORD_BYTES..5 * MAPSTATS_RECORD_BYTES + 2]
            .copy_from_slice(&321i16.to_be_bytes());

        let without_annex = preserve_imported_custom_landlook_compatibility(
            semantic.clone(),
            "Data Custom 1 BD",
            None,
        )
        .unwrap();
        let with_annex = preserve_imported_custom_landlook_compatibility(
            semantic.clone(),
            "Data Custom 1 BD",
            Some(&annex),
        )
        .unwrap();

        assert_eq!(without_annex, semantic);
        assert_eq!(
            &with_annex[spare_offset..spare_offset + 2],
            &source[spare_offset..spare_offset + 2]
        );
        assert_eq!(
            &with_annex[range_reserved_offset..range_reserved_offset + 2],
            &source[range_reserved_offset..range_reserved_offset + 2]
        );
        assert_eq!(
            &with_annex[CUSTOM_LANDLOOK_METADATA_BYTES..],
            &[0xca, 0xfe, 0x01]
        );
        assert_eq!(
            &with_annex[5 * MAPSTATS_RECORD_BYTES..5 * MAPSTATS_RECORD_BYTES + 2],
            &321i16.to_be_bytes()
        );
    }

    #[test]
    fn scenario_metadata_legacy_identity_comes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();
        let mut contact_source = vec![0xa5; crate::realmz::SCENARIO_CONTACT_INFO_BYTES];
        contact_source.push(0xde);
        let mut restrictions_source = vec![0xb6; crate::realmz::SCENARIO_RESTRICTIONS_BYTES];
        restrictions_source.push(0xef);
        let mut global_source = vec![0xc7; crate::realmz::GLOBAL_MACRO_HOOK_BYTES];
        global_source.push(0xfa);
        let mut shell_source = vec![0xd8; 316];
        shell_source.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
        let mut security_source = vec![0xe9; 316];
        security_source.extend_from_slice(&[0xba, 0xdc]);
        let mut support_source = vec![0x5a; crate::realmz::SCENARIO_SUPPORT_FILE_BYTES];
        support_source[23] = 11;
        support_source[38..40].copy_from_slice(&[0, 222]);
        support_source.extend_from_slice(&[0xca, 0xfe]);
        fs::write(raw_dir.join("Data CI"), &contact_source).unwrap();
        fs::write(raw_dir.join("Data RI"), &restrictions_source).unwrap();
        fs::write(raw_dir.join("Global"), &global_source).unwrap();
        fs::write(raw_dir.join("Legacy Scenario"), &shell_source).unwrap();
        fs::write(raw_dir.join("Data CS"), &security_source).unwrap();
        fs::write(raw_dir.join("Scenario"), &support_source).unwrap();
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let contact_semantic = vec![0; crate::realmz::SCENARIO_CONTACT_INFO_BYTES];
        let restrictions_semantic = vec![0; crate::realmz::SCENARIO_RESTRICTIONS_BYTES];
        let mut shell_semantic = vec![0; 316];
        shell_semantic[0..4].copy_from_slice(&[0, 0, 0, 7]);
        let mut security_semantic = vec![0; 316];
        security_semantic[20..23].copy_from_slice(&[1, 2, 3]);
        let mut support_semantic = vec![0; crate::realmz::SCENARIO_SUPPORT_FILE_BYTES];
        support_semantic[23] = 202;
        support_semantic[38..40].copy_from_slice(&[0xfe, 0xd1]);
        assert_eq!(
            preserve_imported_scenario_support_file(
                support_semantic.clone(),
                "Scenario",
                false,
                Some(&annex),
            )
            .unwrap(),
            support_source
        );
        assert_eq!(
            preserve_imported_singleton(
                shell_semantic.clone(),
                "Legacy Scenario",
                316,
                false,
                Some(&annex),
            )
            .unwrap(),
            shell_source
        );
        assert_eq!(
            preserve_imported_singleton(
                security_semantic.clone(),
                "Data CS",
                316,
                false,
                Some(&annex),
            )
            .unwrap(),
            security_source
        );
        assert_eq!(
            preserve_imported_singleton(
                contact_semantic.clone(),
                "Data CI",
                crate::realmz::SCENARIO_CONTACT_INFO_BYTES,
                false,
                Some(&annex),
            )
            .unwrap(),
            contact_source
        );
        assert_eq!(
            preserve_imported_singleton(
                restrictions_semantic.clone(),
                "Data RI",
                crate::realmz::SCENARIO_RESTRICTIONS_BYTES,
                false,
                Some(&annex),
            )
            .unwrap(),
            restrictions_source
        );
        let mut global_semantic = vec![0; crate::realmz::GLOBAL_MACRO_HOOK_BYTES];
        global_semantic[0..2].copy_from_slice(&[1, 2]);
        global_semantic[8..10].copy_from_slice(&[3, 4]);
        assert_eq!(
            preserve_imported_global_macro_hooks(global_semantic.clone(), false, Some(&annex))
                .unwrap(),
            global_source
        );

        let authored_contact = preserve_imported_singleton(
            contact_semantic.clone(),
            "Data CI",
            crate::realmz::SCENARIO_CONTACT_INFO_BYTES,
            true,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(
            &authored_contact[..crate::realmz::SCENARIO_CONTACT_INFO_BYTES],
            contact_semantic.as_slice()
        );
        assert_eq!(authored_contact.last(), Some(&0xde));
        let authored_restrictions = preserve_imported_singleton(
            restrictions_semantic.clone(),
            "Data RI",
            crate::realmz::SCENARIO_RESTRICTIONS_BYTES,
            true,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(
            &authored_restrictions[..crate::realmz::SCENARIO_RESTRICTIONS_BYTES],
            restrictions_semantic.as_slice()
        );
        assert_eq!(authored_restrictions.last(), Some(&0xef));
        let authored_shell = preserve_imported_singleton(
            shell_semantic.clone(),
            "Legacy Scenario",
            316,
            true,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(&authored_shell[..316], shell_semantic.as_slice());
        assert_eq!(&authored_shell[316..], &[0xde, 0xad, 0xbe, 0xef]);
        let authored_security = preserve_imported_singleton(
            security_semantic.clone(),
            "Data CS",
            316,
            true,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(&authored_security[..316], security_semantic.as_slice());
        assert_eq!(&authored_security[316..], &[0xba, 0xdc]);
        let authored_support = preserve_imported_scenario_support_file(
            support_semantic.clone(),
            "Scenario",
            true,
            Some(&annex),
        )
        .unwrap();
        assert_eq!(authored_support.len(), support_source.len());
        assert_eq!(authored_support[0], 0x5a);
        assert_eq!(authored_support[23], 202);
        assert_eq!(&authored_support[38..40], &[0xfe, 0xd1]);
        assert_eq!(authored_support[63], 0x5a);
        assert_eq!(&authored_support[600..], &[0xca, 0xfe]);
        let authored_global =
            preserve_imported_global_macro_hooks(global_semantic.clone(), true, Some(&annex))
                .unwrap();
        assert_eq!(&authored_global[0..6], &global_semantic[0..6]);
        assert_eq!(&authored_global[6..8], &[0xc7; 2]);
        assert_eq!(&authored_global[8..12], &global_semantic[8..12]);
        assert_eq!(&authored_global[12..60], &[0xc7; 48]);
        assert_eq!(authored_global.last(), Some(&0xfa));
        assert_eq!(
            preserve_imported_singleton(
                contact_semantic.clone(),
                "Data CI",
                crate::realmz::SCENARIO_CONTACT_INFO_BYTES,
                false,
                None,
            )
            .unwrap(),
            contact_semantic
        );
        assert_eq!(
            preserve_imported_global_macro_hooks(global_semantic.clone(), true, None).unwrap(),
            global_semantic
        );
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
    fn normalized_landlook_atlas_pict_rejects_non_pict_payloads() {
        let mut pict = vec![0; 14];
        pict[6..8].copy_from_slice(&320_u16.to_be_bytes());
        pict[8..10].copy_from_slice(&640_u16.to_be_bytes());
        pict[10..12].copy_from_slice(&0x0098_u16.to_be_bytes());
        pict[12..14].copy_from_slice(&(0x8000_u16 | 640).to_be_bytes());

        assert!(is_normalized_landlook_atlas_pict(&pict));
        assert!(!is_normalized_landlook_atlas_pict(b"\x89PNG\r\n\x1a\n"));
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
        race.base_move = 11;
        race.spare.as_mut().unwrap()[0] = 123;
        race.spacer.as_mut().unwrap()[30] = -321;

        let mut caste =
            crate::realmz::parse_caste_overrides(&vec![0; 21 * crate::realmz::CASTE_BYTES])
                .pop()
                .unwrap();
        caste.authored = true;
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
        assert_eq!(
            caste_record[500], 0,
            "fresh unspecified spacer words must be deterministic"
        );
        assert_eq!(manifest.written_files(), ["Data Race", "Data Caste"]);
    }

    #[test]
    fn imported_message_export_reads_legacy_bytes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let mut source = vec![0xa5; 2 * crate::realmz::MESSAGE_BYTES];
        source[0] = 1;
        source[1] = b'Z';
        source[crate::realmz::MESSAGE_BYTES] = 1;
        source[crate::realmz::MESSAGE_BYTES + 1] = b'X';
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data SD2"), &source).unwrap();

        let mut messages = crate::realmz::parse_messages(&source);
        messages[1].text = "Go".to_string();
        messages[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_message_rows(
            crate::realmz::write_messages(&messages).unwrap(),
            &messages,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(
            &output[..crate::realmz::MESSAGE_BYTES],
            &source[..crate::realmz::MESSAGE_BYTES]
        );
        let authored = &output[crate::realmz::MESSAGE_BYTES..2 * crate::realmz::MESSAGE_BYTES];
        assert_eq!(&authored[..3], b"\x02Go");
        assert!(authored[3..].iter().all(|byte| *byte == 0));
        assert_eq!(
            &output[2 * crate::realmz::MESSAGE_BYTES..],
            &[0xde, 0xad, 0xbe]
        );
    }

    #[test]
    fn imported_option_label_export_reads_legacy_bytes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let mut source = vec![b' '; 2 * crate::realmz::OPTION_LABEL_BYTES];
        source[0] = 1;
        source[1] = b'A';
        source[crate::realmz::OPTION_LABEL_BYTES] = 1;
        source[crate::realmz::OPTION_LABEL_BYTES + 1] = b'X';
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data OD"), &source).unwrap();

        let mut options = crate::realmz::parse_option_labels(&source);
        options[1].text = "On".to_string();
        options[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_option_label_rows(
            crate::realmz::write_option_labels(&options).unwrap(),
            &options,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(
            &output[..crate::realmz::OPTION_LABEL_BYTES],
            &source[..crate::realmz::OPTION_LABEL_BYTES]
        );
        let authored =
            &output[crate::realmz::OPTION_LABEL_BYTES..2 * crate::realmz::OPTION_LABEL_BYTES];
        assert_eq!(&authored[..3], b"\x02On");
        assert!(authored[3..].iter().all(|byte| *byte == 0));
        assert_eq!(
            &output[2 * crate::realmz::OPTION_LABEL_BYTES..],
            &[0xde, 0xad, 0xbe]
        );
    }

    #[test]
    fn imported_battle_export_reads_legacy_bytes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let mut source = vec![0; 2 * crate::realmz::BATTLE_BYTES];
        crate::realmz::write_i16_be(&mut source, 12 * 2, 9);
        source[338] = 2;
        source[339] = 0xa5;
        let authored_start = crate::realmz::BATTLE_BYTES;
        source[authored_start + 339] = 0xb6;
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data BD"), &source).unwrap();

        let mut battles = crate::realmz::parse_battles(&source);
        battles[1].grid[84] = -7;
        battles[1].dist = 3;
        battles[1].message_before = 4;
        battles[1].message_after = 5;
        battles[1].battle_macro = -6;
        battles[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_battle_rows(
            crate::realmz::write_battles(&battles).unwrap(),
            &battles,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(
            &output[..crate::realmz::BATTLE_BYTES],
            &source[..crate::realmz::BATTLE_BYTES]
        );
        let authored = &output[authored_start..2 * crate::realmz::BATTLE_BYTES];
        assert_eq!(crate::realmz::i16_be(authored, 84 * 2), -7);
        assert_eq!(authored[338], 3);
        assert_eq!(authored[339], 0);
        assert_eq!(crate::realmz::i16_be(authored, 340), 4);
        assert_eq!(crate::realmz::i16_be(authored, 342), 5);
        assert_eq!(crate::realmz::i16_be(authored, 344), -6);
        assert_eq!(
            &output[2 * crate::realmz::BATTLE_BYTES..],
            &[0xde, 0xad, 0xbe]
        );
    }

    #[test]
    fn imported_monster_export_bounds_legacy_rows_and_tails_to_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let mut source = vec![0xa5; 2 * crate::realmz::MONSTER_BYTES];
        source[0] = 1;
        source[170..174].copy_from_slice(b"Raw!");
        let authored_start = crate::realmz::MONSTER_BYTES;
        source[authored_start] = 2;
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data MD1"), &source).unwrap();

        let mut records = crate::realmz::parse_monster_set(&source, "Data MD1", 1).monsters;
        records[1].hit_dice = 9;
        records[1].stamina_bonus = 200;
        records[1].display_name = "Authored Beast".to_string();
        records[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_monster_rows(
            crate::realmz::write_monsters(&records).unwrap(),
            "Data MD1",
            &records,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(
            &output[..crate::realmz::MONSTER_BYTES],
            &source[..crate::realmz::MONSTER_BYTES]
        );
        let authored = &output[authored_start..2 * crate::realmz::MONSTER_BYTES];
        assert_eq!(authored[0], 9);
        assert_eq!(authored[1], 200);
        assert_eq!(&authored[170..184], b"Authored Beast");
        assert!(authored[184..].iter().all(|byte| *byte == 0));
        assert_eq!(
            &output[2 * crate::realmz::MONSTER_BYTES..],
            &[0xde, 0xad, 0xbe]
        );
    }

    #[test]
    fn imported_monster_description_export_bounds_legacy_rows_and_tails_to_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let mut source = vec![0xa5; 2 * crate::realmz::MONSTER_DESCRIPTION_BYTES];
        source[0] = 3;
        source[1..4].copy_from_slice(b"Raw");
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data DES"), &source).unwrap();

        let mut records = crate::realmz::parse_monster_descriptions(&source);
        records[1].text = "Authored description".to_string();
        records[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_monster_description_rows(
            crate::realmz::write_monster_descriptions(&records).unwrap(),
            &records,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(
            &output[..crate::realmz::MONSTER_DESCRIPTION_BYTES],
            &source[..crate::realmz::MONSTER_DESCRIPTION_BYTES]
        );
        let authored = &output[crate::realmz::MONSTER_DESCRIPTION_BYTES
            ..2 * crate::realmz::MONSTER_DESCRIPTION_BYTES];
        assert_eq!(authored[0], 20);
        assert_eq!(&authored[1..21], b"Authored description");
        assert!(authored[21..].iter().all(|byte| *byte == 0));
        assert_eq!(
            &output[2 * crate::realmz::MONSTER_DESCRIPTION_BYTES..],
            &[0xde, 0xad, 0xbe]
        );
    }

    #[test]
    fn imported_simple_encounter_export_reads_legacy_bytes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let record_bytes = crate::realmz::SIMPLE_ENCOUNTER_BYTES;
        let mut source = vec![0; 2 * record_bytes];
        source[3] = 9;
        source[103] = 0xa5;
        let authored_start = record_bytes;
        source[authored_start + 103] = 0xb6;
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data ED"), &source).unwrap();

        let mut encounters = crate::realmz::parse_simple_encounter_records(&source);
        encounters[1].actions = vec![crate::project::EncounterActionRow {
            slot: 3,
            raw_code: -2,
            id: 0x0304,
        }];
        encounters[1].choice_results = vec![0, 0, 7, 0];
        encounters[1].can_back_out = true;
        encounters[1].max_times = -3;
        encounters[1].caste_success = 4;
        encounters[1].prompt = 0x0506;
        encounters[1].texts = vec![
            "Go".to_string(),
            String::new(),
            String::new(),
            String::new(),
        ];
        encounters[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_simple_encounter_rows(
            crate::realmz::write_simple_encounters(&encounters).unwrap(),
            &encounters,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(&output[..record_bytes], &source[..record_bytes]);
        let authored = &output[authored_start..2 * record_bytes];
        assert_eq!(authored[3] as i8, -2);
        assert_eq!(crate::realmz::i16_be(authored, 38), 0x0304);
        assert_eq!(authored[98], 7);
        assert_eq!(authored[103], 0);
        assert_eq!(crate::realmz::i16_be(authored, 104), 0x0506);
        assert_eq!(&authored[106..109], &[2, b'G', b'o']);
        assert_eq!(&output[2 * record_bytes..], &[0xde, 0xad, 0xbe]);
    }

    #[test]
    fn imported_complex_encounter_export_reads_legacy_bytes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let record_bytes = crate::realmz::COMPLEX_ENCOUNTER_BYTES;
        let mut source = vec![0; 2 * record_bytes];
        source[4] = 9;
        source[157] = 0xb6;
        let authored_start = record_bytes;
        source[authored_start + 157] = 0x5a;
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data ED2"), &source).unwrap();

        let mut encounters = crate::realmz::parse_complex_encounter_records(&source);
        encounters[1].actions = vec![crate::project::EncounterActionRow {
            slot: 3,
            raw_code: -2,
            id: 0x0304,
        }];
        encounters[1].action_result = 6;
        encounters[1].word_result = 7;
        encounters[1].groups[4] = -8;
        encounters[1].prompt = 0x0506;
        encounters[1].texts[0] = "Go".to_string();
        encounters[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_complex_encounter_rows(
            crate::realmz::write_complex_encounters(&encounters).unwrap(),
            &encounters,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(&output[..record_bytes], &source[..record_bytes]);
        let authored = &output[authored_start..2 * record_bytes];
        assert_eq!(authored[3] as i8, -2);
        assert_eq!(crate::realmz::i16_be(authored, 38), 0x0304);
        assert_eq!(&authored[96..98], &[6, 7]);
        assert_eq!(authored[102] as i8, -8);
        assert_eq!(authored[157], 0);
        assert_eq!(crate::realmz::i16_be(authored, 158), 0x0506);
        assert_eq!(&authored[160..163], &[2, b'G', b'o']);
        assert_eq!(&output[2 * record_bytes..], &[0xde, 0xad, 0xbe]);
    }

    #[test]
    fn imported_thief_encounter_export_reads_legacy_bytes_only_from_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let record_bytes = crate::realmz::THIEF_ENCOUNTER_BYTES;
        let mut source = vec![0; 2 * record_bytes];
        source[0] = 0x48;
        source[10] = 0xff;
        let authored_start = record_bytes;
        source[authored_start] = 0x6b;
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data TD2"), &source).unwrap();

        let mut encounters = crate::realmz::parse_thief_encounters(&source);
        encounters[1].type_flags[3] = true;
        encounters[1].modifiers[4] = -8;
        encounters[1].success_codes[5] = 9;
        encounters[1].failure_codes[6] = -7;
        encounters[1].success_text[2] = 0x0102;
        encounters[1].failure_sounds[5] = 0x0708;
        encounters[1].spell = 0x090a;
        encounters[1].prompts[1] = 0x1112;
        encounters[1].prompt_sounds[2] = 0x1314;
        encounters[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_thief_encounter_rows(
            crate::realmz::write_thief_encounters(&encounters).unwrap(),
            &encounters,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(&output[..record_bytes], &source[..record_bytes]);
        let authored = &output[authored_start..2 * record_bytes];
        assert_eq!(authored[3], 1);
        assert_eq!(authored[14] as i8, -8);
        assert_eq!(authored[23], 9);
        assert_eq!(authored[32] as i8, -7);
        assert_eq!(crate::realmz::i16_be(authored, 38), 0x0102);
        assert_eq!(crate::realmz::i16_be(authored, 92), 0x0708);
        assert_eq!(crate::realmz::i16_be(authored, 98), 0x090a);
        assert_eq!(crate::realmz::i16_be(authored, 108), 0x1112);
        assert_eq!(crate::realmz::i16_be(authored, 116), 0x1314);
        assert_eq!(&output[2 * record_bytes..], &[0xde, 0xad, 0xbe]);
    }

    #[test]
    fn imported_timed_encounter_export_bounds_reserved_words_to_the_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let record_bytes = crate::realmz::TIMED_ENCOUNTER_BYTES;
        let mut source = vec![0; 2 * record_bytes];
        source[0..2].copy_from_slice(&12i16.to_be_bytes());
        source[20..22].copy_from_slice(&1i16.to_be_bytes());
        source[22..24].copy_from_slice(&0x1234i16.to_be_bytes());
        let authored_start = record_bytes;
        source[authored_start..authored_start + 2].copy_from_slice(&15i16.to_be_bytes());
        source[authored_start + 20..authored_start + 22].copy_from_slice(&1i16.to_be_bytes());
        source[authored_start + 22..authored_start + 24].copy_from_slice(&0x2345i16.to_be_bytes());
        source[authored_start + 38..authored_start + 40].copy_from_slice(&(-321i16).to_be_bytes());
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data TD3"), &source).unwrap();

        let mut encounters = crate::realmz::parse_timed_encounters(&source);
        encounters[1].day = 35;
        encounters[1].increment = 5;
        encounters[1].percent = 50;
        encounters[1].door = 24;
        encounters[1].location_kind = crate::project::TimedEncounterLocationKind::Dungeon;
        encounters[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let output = preserve_imported_timed_encounter_rows(
            crate::realmz::write_timed_encounters(&encounters).unwrap(),
            &encounters,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(&output[..record_bytes], &source[..record_bytes]);
        let authored = &output[authored_start..2 * record_bytes];
        assert_eq!(crate::realmz::i16_be(authored, 0), 35);
        assert_eq!(crate::realmz::i16_be(authored, 2), 5);
        assert_eq!(crate::realmz::i16_be(authored, 4), 50);
        assert_eq!(crate::realmz::i16_be(authored, 6), 24);
        assert_eq!(crate::realmz::i16_be(authored, 20), 2);
        assert_eq!(crate::realmz::i16_be(authored, 22), 0x2345);
        assert_eq!(crate::realmz::i16_be(authored, 38), -321);
        assert_eq!(&output[2 * record_bytes..], &[0xde, 0xad, 0xbe]);
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
        let race_authored = &race_output[crate::realmz::RACE_BYTES..2 * crate::realmz::RACE_BYTES];
        assert_eq!(crate::realmz::i16_be(race_authored, 196), 12);
        assert_eq!(race_authored[350], 0x5a);
        assert_eq!(
            &caste_output[..crate::realmz::CASTE_BYTES],
            &caste_source[..crate::realmz::CASTE_BYTES]
        );
        assert_eq!(&caste_output[caste_output.len() - 3..], &[0xbe, 0xef, 0x01]);
        let caste_authored =
            &caste_output[crate::realmz::CASTE_BYTES..2 * crate::realmz::CASTE_BYTES];
        assert_eq!(crate::realmz::i16_be(caste_authored, 384), 42);
        assert_eq!(caste_authored[500], 0x6b);
    }

    #[test]
    fn imported_spell_export_bounds_legacy_rows_and_tail_to_annex() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path().join("raw-sources");
        fs::create_dir_all(&raw_dir).unwrap();

        let mut source = vec![0xa5; 2 * crate::realmz::SPELL_BYTES];
        source[28] = 0x7f;
        source[29] = 0xfe;
        source[crate::realmz::SPELL_BYTES + 28] = 1;
        source[crate::realmz::SPELL_BYTES + 29] = 0;
        source.extend_from_slice(&[0xde, 0xad, 0xbe]);
        fs::write(raw_dir.join("Data Spell"), &source).unwrap();

        let mut spells = crate::realmz::parse_spell_overrides(&source);
        spells[1].cost = 42;
        spells[1].authored = true;
        let annex = CompatibilityAnnex::from_root(&raw_dir).snapshot().unwrap();

        let mut manifest = NativeScenarioManifest::default();
        write_spell_overrides_preserving_tail(&mut manifest, Some(&annex), &spells).unwrap();
        let output = &manifest.files()["Data Spell"];

        assert_eq!(
            &output[..crate::realmz::SPELL_BYTES],
            &source[..crate::realmz::SPELL_BYTES]
        );
        assert_eq!(output[crate::realmz::SPELL_BYTES + 10], 42);
        assert_eq!(output[crate::realmz::SPELL_BYTES], 0xa5);
        assert_eq!(
            &output[2 * crate::realmz::SPELL_BYTES..],
            &[0xde, 0xad, 0xbe]
        );
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

        let bytes = compile_fixed_rows_with_compatibility_annex(
            "Data EDCD",
            vec![1u8; 10],
            10,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(bytes.len(), 30);
        assert_eq!(&bytes[..10], &[1u8; 10]);
        assert_eq!(&bytes[10..], &[0u8; 20]);

        let cleared =
            compile_fixed_rows_with_compatibility_annex("Data EDCD", Vec::new(), 10, Some(&annex))
                .unwrap();
        assert_eq!(cleared, vec![0u8; 30]);
    }

    #[test]
    fn preserves_unknown_tail_bytes_for_malformed_fixed_row_file() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        fs::write(
            raw_dir.join("Data EDCD"),
            [vec![0x7Au8; 20], vec![9u8, 8, 7, 6, 5]].concat(),
        )
        .unwrap();
        let annex = CompatibilityAnnex::from_root(raw_dir).snapshot().unwrap();

        let bytes = compile_fixed_rows_with_compatibility_annex(
            "Data EDCD",
            vec![1u8; 10],
            10,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(bytes.len(), 25);
        assert_eq!(&bytes[..10], &[1u8; 10]);
        assert_eq!(&bytes[10..20], &[0u8; 10]);
        assert_eq!(&bytes[20..], &[9u8, 8, 7, 6, 5]);
    }

    #[test]
    fn appends_malformed_tail_after_new_canonical_rows() {
        let temp = tempfile::tempdir().unwrap();
        let raw_dir = temp.path();
        fs::write(
            raw_dir.join("Data EDCD"),
            [vec![0x7Au8; 10], vec![9u8, 8, 7, 6, 5]].concat(),
        )
        .unwrap();
        let annex = CompatibilityAnnex::from_root(raw_dir).snapshot().unwrap();

        let bytes = compile_fixed_rows_with_compatibility_annex(
            "Data EDCD",
            vec![1u8; 20],
            10,
            Some(&annex),
        )
        .unwrap();

        assert_eq!(bytes.len(), 25);
        assert_eq!(&bytes[..20], &[1u8; 20]);
        assert_eq!(&bytes[20..], &[9u8, 8, 7, 6, 5]);
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
            spare2: vec![0; 7],
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
            markers: vec![
                MapMarker {
                    icon_id: 0,
                    x: 0,
                    y: 0,
                };
                crate::realmz::MAP_RECORD_MARKERS
            ],
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
