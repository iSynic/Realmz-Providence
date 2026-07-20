use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use crate::project::*;
use crate::realmz::{
    parse_scenario_buffers, ParsedScenario, FIELD_BYTES, RANDLEVEL_BYTES, SUPPORTED_WRITE_FILES,
    TRACKED_FILES,
};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

pub const PROJECT_FILE_NAME: &str = "project.json";
pub const RAW_SOURCES_DIR: &str = "raw-sources";
pub const ASSETS_DIR: &str = "assets";
pub const TILE_ATLASES_DIR: &str = "tile-atlases";
pub const ICONS_DIR: &str = "icons";
pub const PICTURES_DIR: &str = "pictures";
pub const SOUNDS_DIR: &str = "sounds";

pub fn create_project(
    project_name: String,
    project_dir: impl AsRef<Path>,
) -> Result<ProvidenceProject> {
    let (project_name, project_dir) = unique_project_target(&project_name, project_dir.as_ref());
    fs::create_dir_all(&project_dir).with_path(&project_dir)?;
    fs::create_dir_all(project_dir.join(ASSETS_DIR)).with_path(project_dir.join(ASSETS_DIR))?;
    let project_path_text = project_dir
        .canonicalize()
        .unwrap_or_else(|_| project_dir.to_path_buf())
        .to_string_lossy()
        .to_string();
    let mut project = ProvidenceProject {
        schema_version: PROJECT_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        scenario: ScenarioMeta {
            id: scenario_id(&project_name),
            name: project_name.clone(),
            project_path: project_path_text,
            imported_at: timestamp(),
            shell: Some(default_scenario_shell(&project_name)),
            support_file: None,
            contact_info: Some(default_contact_info(&project_name)),
            restrictions: None,
            global_macro_hooks: None,
            security_backup: None,
        },
        source: SourceSnapshot {
            origin: Some(ProjectOrigin::Authored),
            source_path: format!("generated://{}", scenario_id(&project_name)),
            raw_sources_dir: String::new(),
            files: Vec::new(),
            immutable: false,
        },
        maps: vec![default_land_map()],
        land_layout: None,
        map_records: Vec::new(),
        tile_attributes: Vec::new(),
        custom_landlooks: Vec::new(),
        triggers: Vec::new(),
        random_levels: vec![default_land_random_level()],
        extracodes: Vec::new(),
        messages: Vec::new(),
        option_labels: Vec::new(),
        battles: Vec::new(),
        monsters: Vec::new(),
        monster_sets: Vec::new(),
        monster_descriptions: Vec::new(),
        monster_icon_overrides: Vec::new(),
        scenario_icon_resources: Vec::new(),
        scenario_items: Vec::new(),
        item_texts: Vec::new(),
        treasures: Vec::new(),
        shops: Vec::new(),
        simple_encounters: Vec::new(),
        complex_encounters: Vec::new(),
        thief_encounters: Vec::new(),
        timed_encounters: Vec::new(),
        quest_labels: Vec::new(),
        spell_overrides: Vec::new(),
        race_overrides: Vec::new(),
        caste_overrides: Vec::new(),
        rule_names: default_rule_names(),
        assets: Vec::new(),
        asset_catalog: default_asset_catalog(),
        editor_metadata: EditorMetadata::default(),
        records: RecordCatalog::default(),
        diagnostics: Vec::new(),
        semantic_schema: SemanticSchema::default(),
        validation: ValidationReport::default(),
    };
    project.validation = crate::validation::validate_project(&project);
    save_project(project_dir, &project)?;
    Ok(project)
}

fn unique_project_target(project_name: &str, requested_dir: &Path) -> (String, PathBuf) {
    if !project_file_path(requested_dir).exists() {
        return (project_name.to_string(), requested_dir.to_path_buf());
    }
    let parent = requested_dir.parent().unwrap_or_else(|| Path::new(""));
    let stem = requested_dir
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(project_name);
    let extension = requested_dir
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    for suffix in 2..10_000 {
        let candidate_name = format!("{project_name} {suffix}");
        let candidate_dir = parent.join(format!("{stem} {suffix}{extension}"));
        if !project_file_path(&candidate_dir).exists() {
            return (candidate_name, candidate_dir);
        }
    }
    let fallback_suffix = timestamp();
    (
        format!("{project_name} {fallback_suffix}"),
        parent.join(format!("{stem} {fallback_suffix}{extension}")),
    )
}

pub fn import_scenario(
    source_path: impl AsRef<Path>,
    project_dir: impl AsRef<Path>,
) -> Result<ProvidenceProject> {
    import_scenario_with_name(source_path, project_dir, None)
}

pub fn import_scenario_into_project(
    source_path: impl AsRef<Path>,
    project_dir: impl AsRef<Path>,
    project_name: String,
) -> Result<ProvidenceProject> {
    import_scenario_with_name(source_path, project_dir, Some(project_name))
}

fn import_scenario_with_name(
    source_path: impl AsRef<Path>,
    project_dir: impl AsRef<Path>,
    project_name: Option<String>,
) -> Result<ProvidenceProject> {
    let source_path = source_path.as_ref();
    let project_dir = project_dir.as_ref();
    let source_path = source_path
        .canonicalize()
        .with_path(source_path.to_path_buf())?;
    if !source_path.is_dir() {
        return Err(ProvidenceError::message(format!(
            "{} is not a scenario folder",
            source_path.display()
        )));
    }
    if source_path.join(PROJECT_FILE_NAME).is_file() {
        return Err(ProvidenceError::message(format!(
            "{} is a Providence project package. Use Open Project for .providence folders; import expects an original Realmz scenario folder.",
            source_path.display()
        )));
    }

    fs::create_dir_all(project_dir).with_path(project_dir)?;
    let raw_dir = project_dir.join(RAW_SOURCES_DIR);
    let assets_dir = project_dir.join(ASSETS_DIR);
    fs::create_dir_all(&raw_dir).with_path(&raw_dir)?;
    fs::create_dir_all(&assets_dir).with_path(&assets_dir)?;

    let source_files = snapshot_sources(&source_path, &raw_dir)?;
    let mut buffers = BTreeMap::new();
    for file_name in TRACKED_FILES {
        let path = source_path.join(file_name);
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            buffers.insert((*file_name).to_string(), bytes);
        }
    }
    for file in &source_files {
        if !is_resource_file_name(&file.name) || buffers.contains_key(&file.name) {
            continue;
        }
        let path = source_path.join(&file.relative_path);
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            buffers.insert(file.name.clone(), bytes);
        }
    }
    if buffers.is_empty() {
        return Err(ProvidenceError::message(format!(
            "No Realmz scenario data files were found in {}. Choose the scenario folder containing files such as Data LD, Data DD, Data ED, and Scenario.",
            source_path.display()
        )));
    }

    let mut parsed = parse_scenario_buffers(&buffers);
    parsed
        .tile_attributes
        .extend(reference_landlook_tile_attributes()?);
    crate::semantic::apply_map_name_hints(&mut parsed, &buffers);
    let scenario_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled Scenario")
        .to_string();
    let project_name = project_name.unwrap_or_else(|| scenario_name.clone());
    let project_path = project_dir
        .canonicalize()
        .unwrap_or_else(|_| project_dir.to_path_buf())
        .to_string_lossy()
        .to_string();

    let scenario_shell = read_scenario_shell(&source_path, &scenario_name)?;
    let support_file = buffers
        .get("Scenario")
        .filter(|buffer| is_scenario_support_data_file("Scenario", buffer))
        .and_then(|buffer| crate::realmz::parse_scenario_support_file("Scenario", buffer).ok());
    let contact_info = buffers
        .get("Data CI")
        .and_then(|buffer| crate::realmz::parse_scenario_contact_info(buffer).ok());
    let restrictions = buffers
        .get("Data RI")
        .and_then(|buffer| crate::realmz::parse_scenario_restrictions(buffer).ok());
    let global_macro_hooks = buffers
        .get("Global")
        .map(|buffer| crate::realmz::parse_global_macro_hooks(buffer));
    let security_backup = buffers
        .get("Data CS")
        .and_then(|buffer| crate::realmz::parse_scenario_shell("Data CS", buffer).ok());

    let mut project = ProvidenceProject {
        schema_version: PROJECT_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        scenario: ScenarioMeta {
            id: scenario_id(&project_name),
            name: project_name,
            project_path,
            imported_at: timestamp(),
            shell: scenario_shell,
            support_file,
            contact_info,
            restrictions,
            global_macro_hooks,
            security_backup,
        },
        source: SourceSnapshot {
            origin: Some(ProjectOrigin::Imported),
            source_path: source_path.to_string_lossy().to_string(),
            raw_sources_dir: RAW_SOURCES_DIR.to_string(),
            files: source_files,
            immutable: true,
        },
        maps: parsed.maps,
        land_layout: parsed.land_layout,
        map_records: parsed.map_records,
        tile_attributes: parsed.tile_attributes,
        custom_landlooks: parsed.custom_landlooks,
        triggers: parsed.triggers,
        random_levels: parsed.random_levels,
        extracodes: parsed.extracodes,
        messages: parsed.messages,
        option_labels: parsed.option_labels,
        battles: parsed.battles,
        monsters: parsed.monsters,
        monster_sets: parsed.monster_sets,
        monster_descriptions: parsed.monster_descriptions,
        monster_icon_overrides: Vec::new(),
        scenario_icon_resources: Vec::new(),
        scenario_items: parsed.scenario_items,
        item_texts: Vec::new(),
        treasures: parsed.treasures,
        shops: parsed.shops,
        simple_encounters: parsed.simple_encounters,
        complex_encounters: parsed.complex_encounters,
        thief_encounters: parsed.thief_encounters,
        timed_encounters: parsed.timed_encounters,
        quest_labels: Vec::new(),
        spell_overrides: parsed.spell_overrides,
        race_overrides: parsed.race_overrides,
        caste_overrides: parsed.caste_overrides,
        rule_names: default_rule_names(),
        assets: Vec::new(),
        asset_catalog: parsed.asset_catalog,
        editor_metadata: EditorMetadata::default(),
        records: parsed.records,
        diagnostics: parsed.diagnostics,
        semantic_schema: SemanticSchema::default(),
        validation: ValidationReport::default(),
    };
    hydrate_item_texts(&source_path, &mut project)?;
    hydrate_custom_spell_names(&source_path, &mut project)?;
    hydrate_rule_names(&source_path, Some(&raw_dir), &mut project)?;
    import_picture_assets(&source_path, &assets_dir, &mut project)?;
    import_tile_atlases(&source_path, &assets_dir, &mut project)?;
    import_icon_overlays(&source_path, &assets_dir, &mut project)?;
    import_sound_assets(&source_path, &assets_dir, &mut project)?;
    build_semantic_schema_from_imported_sources(project_dir, &mut project)?;
    project.validation = crate::validation::validate_project(&project);
    save_project(project_dir, &project)?;
    Ok(project)
}

pub fn build_project_semantic_schema(
    project_dir: impl AsRef<Path>,
    project: &ProvidenceProject,
) -> Result<SemanticSchema> {
    let mut project = project.clone();
    refresh_semantic_schema(project_dir.as_ref(), &mut project)?;
    Ok(project.semantic_schema)
}

pub fn open_project(project_dir: impl AsRef<Path>) -> Result<ProvidenceProject> {
    let project_dir = project_dir.as_ref();
    let mut project = read_saved_project(project_dir)?;
    backfill_tileset_metadata(&mut project);
    ensure_reference_tile_attributes(&mut project)?;
    hydrate_imported_compatibility_state(project_dir, &mut project, true)?;
    save_project(project_dir, &project)?;
    Ok(project)
}

pub fn open_project_for_semantic_mapping(
    project_dir: impl AsRef<Path>,
) -> Result<ProvidenceProject> {
    let project_dir = project_dir.as_ref();
    let mut project = read_saved_project(project_dir)?;
    backfill_tileset_metadata(&mut project);
    ensure_reference_tile_attributes(&mut project)?;
    hydrate_imported_compatibility_state(project_dir, &mut project, false)?;
    Ok(project)
}

fn hydrate_imported_compatibility_state(
    project_dir: &Path,
    project: &mut ProvidenceProject,
    include_asset_previews: bool,
) -> Result<()> {
    if !project.source.requires_compatibility_annex() {
        return Ok(());
    }
    hydrate_scenario_metadata(project_dir, project)?;
    let raw_dir = project_dir.join(if project.source.raw_sources_dir.is_empty() {
        RAW_SOURCES_DIR
    } else {
        project.source.raw_sources_dir.as_str()
    });
    hydrate_item_texts(&raw_dir, project)?;
    hydrate_custom_spell_names(&raw_dir, project)?;
    hydrate_rule_names(&raw_dir, None, project)?;
    if include_asset_previews {
        import_picture_assets(&raw_dir, &project_dir.join(ASSETS_DIR), project)?;
        refresh_custom_tile_atlases(project_dir, project)?;
        import_icon_overlays(&raw_dir, &project_dir.join(ASSETS_DIR), project)?;
        import_sound_assets(&raw_dir, &project_dir.join(ASSETS_DIR), project)?;
    }
    Ok(())
}

fn read_saved_project(project_dir: &Path) -> Result<ProvidenceProject> {
    let project_path = project_dir.join(PROJECT_FILE_NAME);
    let text = fs::read_to_string(&project_path).with_path(&project_path)?;
    let mut value: serde_json::Value =
        serde_json::from_str(&text).with_json_path(&project_path)?;
    migrate_legacy_map_record_raw_bytes(&mut value);
    migrate_legacy_scenario_item_raw_bytes(&mut value);
    migrate_legacy_treasure_raw_bytes(&mut value);
    migrate_legacy_shop_raw_bytes(&mut value);
    migrate_legacy_message_raw_bytes(&mut value);
    migrate_legacy_option_label_raw_bytes(&mut value);
    migrate_legacy_battle_raw_bytes(&mut value);
    migrate_legacy_monster_raw_bytes(&mut value);
    migrate_legacy_monster_description_raw_bytes(&mut value);
    migrate_legacy_simple_encounter_raw_bytes(&mut value);
    migrate_legacy_complex_encounter_raw_bytes(&mut value);
    migrate_legacy_thief_encounter_raw_bytes(&mut value);
    migrate_legacy_spell_override_raw_bytes(&mut value);
    let mut project: ProvidenceProject =
        serde_json::from_value(value).with_json_path(project_path)?;
    project.normalize_project_contract();
    Ok(project)
}

fn migrate_legacy_map_record_raw_bytes(project: &mut serde_json::Value) {
    let Some(records) = project.get_mut("mapRecords").and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for record in records {
        let Some(record) = record.as_object_mut() else {
            continue;
        };
        let raw = record
            .remove("rawBytes")
            .and_then(|value| value.as_array().cloned())
            .unwrap_or_default();
        let markers = record
            .entry("markers")
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        let Some(markers) = markers.as_array_mut() else {
            continue;
        };
        while markers.len() < crate::realmz::MAP_RECORD_MARKERS {
            let offset = markers.len() * crate::realmz::MAP_RECORD_MARKER_BYTES;
            markers.push(serde_json::json!({
                "iconId": legacy_project_i16(&raw, offset),
                "x": legacy_project_i16(&raw, offset + 2),
                "y": legacy_project_i16(&raw, offset + 4)
            }));
        }
    }
}

fn migrate_legacy_scenario_item_raw_bytes(project: &mut serde_json::Value) {
    let Some(records) = project
        .get_mut("scenarioItems")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for record in records {
        let Some(record) = record.as_object_mut() else {
            continue;
        };
        let Some(raw) = record
            .remove("rawBytes")
            .and_then(|value| value.as_array().cloned())
        else {
            continue;
        };
        let spare2 = record
            .entry("spare2")
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        let Some(spare2) = spare2.as_array_mut() else {
            continue;
        };
        while spare2.len() < 7 {
            let offset = 56 + spare2.len() * 2;
            spare2.push(serde_json::json!(legacy_project_i16(&raw, offset)));
        }
    }
}

fn migrate_legacy_treasure_raw_bytes(project: &mut serde_json::Value) {
    let Some(records) = project
        .get_mut("treasures")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for record in records {
        let Some(record) = record.as_object_mut() else {
            continue;
        };
        let Some(raw) = record
            .remove("rawBytes")
            .and_then(|value| value.as_array().cloned())
        else {
            continue;
        };
        let item_ids = record
            .entry("itemIds")
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        let Some(item_ids) = item_ids.as_array_mut() else {
            continue;
        };
        while item_ids.len() < 20 {
            let offset = item_ids.len() * 2;
            item_ids.push(serde_json::json!(legacy_project_i16(&raw, offset)));
        }
    }
}

fn migrate_legacy_shop_raw_bytes(project: &mut serde_json::Value) {
    let Some(records) = project
        .get_mut("shops")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for record in records {
        let Some(record) = record.as_object_mut() else {
            continue;
        };
        let Some(raw) = record
            .remove("rawBytes")
            .and_then(|value| value.as_array().cloned())
        else {
            continue;
        };
        let item_ids = record
            .entry("itemIds")
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        if let Some(item_ids) = item_ids.as_array_mut() {
            while item_ids.len() < 1000 {
                let offset = item_ids.len() * 2;
                item_ids.push(serde_json::json!(legacy_project_i16(&raw, offset)));
            }
        }
        let quantities = record
            .entry("quantities")
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        if let Some(quantities) = quantities.as_array_mut() {
            while quantities.len() < 1000 {
                let offset = 2000 + quantities.len();
                let quantity = raw
                    .get(offset)
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0) as u8;
                quantities.push(serde_json::json!(quantity));
            }
        }
    }
}

fn migrate_legacy_message_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "messages");
}

fn migrate_legacy_option_label_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "optionLabels");
}

fn migrate_legacy_battle_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "battles");
}

fn migrate_legacy_monster_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "monsters");
    let Some(sets) = project
        .get_mut("monsterSets")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for set in sets {
        let Some(monsters) = set
            .get_mut("monsters")
            .and_then(serde_json::Value::as_array_mut)
        else {
            continue;
        };
        for monster in monsters {
            if let Some(monster) = monster.as_object_mut() {
                monster.remove("rawBytes");
            }
        }
    }
}

fn migrate_legacy_monster_description_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "monsterDescriptions");
}

fn migrate_legacy_simple_encounter_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "simpleEncounters");
}

fn migrate_legacy_complex_encounter_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "complexEncounters");
}

fn migrate_legacy_thief_encounter_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "thiefEncounters");
}

fn migrate_legacy_spell_override_raw_bytes(project: &mut serde_json::Value) {
    migrate_legacy_record_raw_bytes(project, "spellOverrides");
}

fn migrate_legacy_record_raw_bytes(project: &mut serde_json::Value, collection: &str) {
    let Some(records) = project
        .get_mut(collection)
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for record in records {
        if let Some(record) = record.as_object_mut() {
            record.remove("rawBytes");
        }
    }
}

fn legacy_project_i16(bytes: &[serde_json::Value], offset: usize) -> i16 {
    let high = bytes.get(offset).and_then(serde_json::Value::as_u64).unwrap_or(0) as u8;
    let low = bytes
        .get(offset + 1)
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0) as u8;
    i16::from_be_bytes([high, low])
}

pub fn save_project(project_dir: impl AsRef<Path>, project: &ProvidenceProject) -> Result<()> {
    let project_dir = project_dir.as_ref();
    fs::create_dir_all(project_dir).with_path(project_dir)?;
    let project_path = project_dir.join(PROJECT_FILE_NAME);
    let file = fs::File::create(&project_path).with_path(&project_path)?;
    let writer = BufWriter::new(file);
    serde_json::to_writer(writer, &ProjectFile::from(project)).with_json_path(&project_path)
}

pub fn copy_project_template_payloads(
    source_project_dir: impl AsRef<Path>,
    target_project_dir: impl AsRef<Path>,
) -> Result<()> {
    let source_project_dir = source_project_dir.as_ref();
    let target_project_dir = target_project_dir.as_ref();
    let source_canonical = source_project_dir
        .canonicalize()
        .with_path(source_project_dir)?;
    let target_canonical = target_project_dir
        .canonicalize()
        .with_path(target_project_dir)?;
    if source_canonical == target_canonical {
        return Err(ProvidenceError::message(
            "Template source and generated project directories must be different.",
        ));
    }
    if !source_project_dir.join(PROJECT_FILE_NAME).is_file() {
        return Err(ProvidenceError::message(format!(
            "Template project '{}' does not contain {}.",
            source_project_dir.display(),
            PROJECT_FILE_NAME
        )));
    }
    for payload_dir in [RAW_SOURCES_DIR, ASSETS_DIR] {
        let source = source_project_dir.join(payload_dir);
        let target = target_project_dir.join(payload_dir);
        if source.is_dir() {
            crate::evidence::copy_dir_contents(&source, &target)?;
        } else {
            if target.exists() {
                fs::remove_dir_all(&target).with_path(&target)?;
            }
            fs::create_dir_all(&target).with_path(&target)?;
        }
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile<'a> {
    schema_version: u32,
    app_version: &'a str,
    scenario: &'a ScenarioMeta,
    source: &'a SourceSnapshot,
    maps: &'a [MapEntity],
    land_layout: &'a Option<LandLayout>,
    map_records: &'a [MapRecord],
    tile_attributes: &'a [TileAttributeProfile],
    custom_landlooks: &'a [CustomLandlookMetadata],
    triggers: &'a [TriggerRecord],
    random_levels: &'a [RandomLevel],
    extracodes: &'a [ExtraCodeRow],
    messages: &'a [MessageRecord],
    option_labels: &'a [OptionLabelRecord],
    battles: &'a [BattleRecord],
    monsters: &'a [MonsterRecord],
    monster_sets: &'a [MonsterSet],
    monster_descriptions: &'a [MonsterDescriptionRecord],
    monster_icon_overrides: &'a [MonsterIconOverride],
    scenario_icon_resources: &'a [ScenarioIconResource],
    scenario_items: &'a [ScenarioItemRecord],
    item_texts: &'a [ItemTextRecord],
    treasures: &'a [TreasureRecord],
    shops: &'a [ShopRecord],
    simple_encounters: &'a [SimpleEncounterRecord],
    complex_encounters: &'a [ComplexEncounterRecord],
    thief_encounters: &'a [ThiefEncounterRecord],
    timed_encounters: &'a [TimedEncounterRecord],
    quest_labels: &'a [QuestLabel],
    spell_overrides: &'a [ScenarioSpellOverride],
    race_overrides: &'a [ScenarioRaceOverride],
    caste_overrides: &'a [ScenarioCasteOverride],
    rule_names: &'a RuleNames,
    assets: &'a [ManagedAsset],
    asset_catalog: &'a AssetCatalog,
    editor_metadata: &'a EditorMetadata,
    records: &'a RecordCatalog,
    diagnostics: &'a [Diagnostic],
    validation: &'a ValidationReport,
}

impl<'a> From<&'a ProvidenceProject> for ProjectFile<'a> {
    fn from(project: &'a ProvidenceProject) -> Self {
        Self {
            schema_version: project.schema_version,
            app_version: &project.app_version,
            scenario: &project.scenario,
            source: &project.source,
            maps: &project.maps,
            land_layout: &project.land_layout,
            map_records: &project.map_records,
            tile_attributes: &project.tile_attributes,
            custom_landlooks: &project.custom_landlooks,
            triggers: &project.triggers,
            random_levels: &project.random_levels,
            extracodes: &project.extracodes,
            messages: &project.messages,
            option_labels: &project.option_labels,
            battles: &project.battles,
            monsters: &project.monsters,
            monster_sets: &project.monster_sets,
            monster_descriptions: &project.monster_descriptions,
            monster_icon_overrides: &project.monster_icon_overrides,
            scenario_icon_resources: &project.scenario_icon_resources,
            scenario_items: &project.scenario_items,
            item_texts: &project.item_texts,
            treasures: &project.treasures,
            shops: &project.shops,
            simple_encounters: &project.simple_encounters,
            complex_encounters: &project.complex_encounters,
            thief_encounters: &project.thief_encounters,
            timed_encounters: &project.timed_encounters,
            quest_labels: &project.quest_labels,
            spell_overrides: &project.spell_overrides,
            race_overrides: &project.race_overrides,
            caste_overrides: &project.caste_overrides,
            rule_names: &project.rule_names,
            assets: &project.assets,
            asset_catalog: &project.asset_catalog,
            editor_metadata: &project.editor_metadata,
            records: &project.records,
            diagnostics: &project.diagnostics,
            validation: &project.validation,
        }
    }
}

fn refresh_semantic_schema(project_dir: &Path, project: &mut ProvidenceProject) -> Result<()> {
    if !project.source.requires_compatibility_annex() {
        build_semantic_schema(project, &BTreeMap::new());
        return Ok(());
    }
    let raw_dir = project_dir.join(if project.source.raw_sources_dir.is_empty() {
        RAW_SOURCES_DIR
    } else {
        project.source.raw_sources_dir.as_str()
    });
    if !raw_dir.is_dir() {
        return Ok(());
    }
    let buffers = raw_source_buffers(&raw_dir, &project.source.files)?;
    if buffers.is_empty() {
        return Ok(());
    }
    backfill_target_records(project, &buffers);
    build_semantic_schema(project, &buffers);
    Ok(())
}

fn build_semantic_schema_from_imported_sources(
    project_dir: &Path,
    project: &mut ProvidenceProject,
) -> Result<()> {
    if !project.source.requires_compatibility_annex() {
        return Err(ProvidenceError::message(
            "Imported semantic enrichment requires an imported project.",
        ));
    }
    let raw_dir = project_dir.join(if project.source.raw_sources_dir.is_empty() {
        RAW_SOURCES_DIR
    } else {
        project.source.raw_sources_dir.as_str()
    });
    if !raw_dir.is_dir() {
        return Ok(());
    }
    let buffers = raw_source_buffers(&raw_dir, &project.source.files)?;
    if buffers.is_empty() {
        return Ok(());
    }
    build_semantic_schema(project, &buffers);
    Ok(())
}

fn build_semantic_schema(project: &mut ProvidenceProject, buffers: &BTreeMap<String, Vec<u8>>) {
    let semantic_parsed = ParsedScenario {
        maps: project.maps.clone(),
        land_layout: project.land_layout.clone(),
        map_records: project.map_records.clone(),
        tile_attributes: project.tile_attributes.clone(),
        custom_landlooks: project.custom_landlooks.clone(),
        triggers: project.triggers.clone(),
        random_levels: project.random_levels.clone(),
        extracodes: project.extracodes.clone(),
        messages: project.messages.clone(),
        option_labels: project.option_labels.clone(),
        battles: project.battles.clone(),
        monsters: project.monsters.clone(),
        monster_sets: project.monster_sets.clone(),
        monster_descriptions: project.monster_descriptions.clone(),
        scenario_items: project.scenario_items.clone(),
        treasures: project.treasures.clone(),
        shops: project.shops.clone(),
        simple_encounters: project.simple_encounters.clone(),
        complex_encounters: project.complex_encounters.clone(),
        thief_encounters: project.thief_encounters.clone(),
        timed_encounters: project.timed_encounters.clone(),
        spell_overrides: project.spell_overrides.clone(),
        race_overrides: project.race_overrides.clone(),
        caste_overrides: project.caste_overrides.clone(),
        records: project.records.clone(),
        diagnostics: project.diagnostics.clone(),
        asset_catalog: project.asset_catalog.clone(),
    };
    project.semantic_schema = crate::semantic::build_semantic_schema(
        &project.scenario,
        &buffers,
        &project.source.files,
        &semantic_parsed,
        &project.assets,
        !project.source.requires_compatibility_annex(),
    );
}

fn backfill_target_records(project: &mut ProvidenceProject, buffers: &BTreeMap<String, Vec<u8>>) {
    let parsed = parse_scenario_buffers(buffers);
    if project.messages.is_empty() {
        project.messages = parsed.messages;
    }
    if project.option_labels.is_empty() {
        project.option_labels = parsed.option_labels;
    }
    if project.map_records.is_empty() {
        project.map_records = parsed.map_records;
    }
    if project.tile_attributes.is_empty() {
        project.tile_attributes = parsed.tile_attributes;
    }
    if project.battles.is_empty() {
        project.battles = parsed.battles;
    }
    if project.monsters.is_empty() {
        project.monsters = parsed.monsters;
    }
    if project.monster_sets.is_empty() {
        project.monster_sets = parsed.monster_sets;
    }
    if project.monster_descriptions.is_empty() {
        project.monster_descriptions = parsed.monster_descriptions;
    }
    if project.scenario_items.is_empty() {
        project.scenario_items = parsed.scenario_items;
    }
    if project.treasures.is_empty() {
        project.treasures = parsed.treasures;
    }
    if project.shops.is_empty() {
        project.shops = parsed.shops;
    }
    if project.simple_encounters.is_empty() {
        project.simple_encounters = parsed.simple_encounters;
    }
    if project.complex_encounters.is_empty() {
        project.complex_encounters = parsed.complex_encounters;
    }
    if project.thief_encounters.is_empty() {
        project.thief_encounters = parsed.thief_encounters;
    }
    if project.timed_encounters.is_empty() {
        project.timed_encounters = parsed.timed_encounters;
    }
    if project.spell_overrides.is_empty() {
        project.spell_overrides = parsed.spell_overrides;
    }
    if project.race_overrides.is_empty() {
        project.race_overrides = parsed.race_overrides;
    }
    if project.caste_overrides.is_empty() {
        project.caste_overrides = parsed.caste_overrides;
    }
}

fn hydrate_scenario_metadata(project_dir: &Path, project: &mut ProvidenceProject) -> Result<()> {
    let raw_dir = project_dir.join(if project.source.raw_sources_dir.is_empty() {
        RAW_SOURCES_DIR
    } else {
        project.source.raw_sources_dir.as_str()
    });
    if !raw_dir.is_dir() {
        return Ok(());
    }
    if project.scenario.shell.is_none() {
        project.scenario.shell = read_scenario_shell_from_raw(&raw_dir, project)?;
    }
    if project.scenario.support_file.is_none() {
        let path = raw_dir.join("Scenario");
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            if is_scenario_support_data_file("Scenario", &bytes) {
                project.scenario.support_file =
                    crate::realmz::parse_scenario_support_file("Scenario", &bytes).ok();
            }
        }
    }
    if project.scenario.contact_info.is_none() {
        let path = raw_dir.join("Data CI");
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            project.scenario.contact_info = crate::realmz::parse_scenario_contact_info(&bytes).ok();
        }
    }
    if project.scenario.restrictions.is_none() {
        let path = raw_dir.join("Data RI");
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            project.scenario.restrictions = crate::realmz::parse_scenario_restrictions(&bytes).ok();
        }
    }
    if project.scenario.global_macro_hooks.is_none() {
        let path = raw_dir.join("Global");
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            project.scenario.global_macro_hooks =
                Some(crate::realmz::parse_global_macro_hooks(&bytes));
        }
    }
    if project.scenario.security_backup.is_none() {
        let path = raw_dir.join("Data CS");
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            project.scenario.security_backup =
                crate::realmz::parse_scenario_shell("Data CS", &bytes).ok();
        }
    }
    Ok(())
}

fn read_scenario_shell(source_path: &Path, scenario_name: &str) -> Result<Option<ScenarioShell>> {
    let path = source_path.join(scenario_name);
    if path.is_file() {
        let bytes = fs::read(&path).with_path(&path)?;
        return crate::realmz::parse_scenario_shell(scenario_name, &bytes).map(Some);
    }
    read_scenario_shell_candidate_from_dir(source_path)
}

fn read_scenario_shell_from_raw(
    raw_dir: &Path,
    project: &ProvidenceProject,
) -> Result<Option<ScenarioShell>> {
    let candidates = [
        project
            .scenario
            .shell
            .as_ref()
            .map(|shell| shell.source_file.as_str()),
        Some(project.scenario.name.as_str()),
    ];
    for candidate in candidates.into_iter().flatten() {
        let path = raw_dir.join(candidate);
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            return crate::realmz::parse_scenario_shell(candidate, &bytes).map(Some);
        }
    }
    read_scenario_shell_candidate_from_dir(raw_dir)
}

fn read_scenario_shell_candidate_from_dir(dir: &Path) -> Result<Option<ScenarioShell>> {
    let mut candidates: Vec<(usize, String, PathBuf)> = Vec::new();
    for entry in fs::read_dir(dir).with_path(dir)? {
        let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !is_scenario_marker_candidate_name(name) {
            continue;
        }
        let bytes = fs::read(&path).with_path(&path)?;
        if bytes.len() < 316 || crate::realmz::parse_scenario_shell(name, &bytes).is_err() {
            continue;
        }
        let size_rank = if bytes.len() == 316 { 0 } else { 1 };
        candidates.push((size_rank, name.to_string(), path));
    }
    candidates.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    let Some((_, name, path)) = candidates.into_iter().next() else {
        return Ok(None);
    };
    let bytes = fs::read(&path).with_path(&path)?;
    crate::realmz::parse_scenario_shell(&name, &bytes).map(Some)
}

fn default_scenario_shell(source_file: &str) -> ScenarioShell {
    ScenarioShell {
        source_file: source_file.to_string(),
        rec_level: 1,
        max_level: 999,
        land_level: 0,
        look_x: 0,
        look_y: 0,
        creator_user: String::new(),
        codeseg1: vec![0; 20],
        codeseg2: vec![0; 20],
        trailing_bytes: Vec::new(),
        raw_bytes: Vec::new(),
        authored: true,
        provenance: None,
    }
}

fn default_contact_info(name: &str) -> ScenarioContactInfo {
    ScenarioContactInfo {
        scenario_name: name.to_string(),
        version: String::new(),
        date: String::new(),
        author: String::new(),
        email: String::new(),
        web: String::new(),
        fee: String::new(),
        pay_info: vec![String::new(); 5],
        titles: vec![String::new(); 5],
        description: String::new(),
        raw_bytes: Vec::new(),
        authored: true,
        provenance: None,
    }
}

fn default_land_map() -> MapEntity {
    let landlook = 0;
    let fill_tile = landlook_base_tile(landlook).unwrap_or(1);
    MapEntity {
        id: "land:0".to_string(),
        level_type: LevelType::Land,
        source: "Data LD".to_string(),
        index: 0,
        name: "Land level 0".to_string(),
        width: MAP_SIZE,
        height: MAP_SIZE,
        tiles: vec![fill_tile; MAP_SIZE * MAP_SIZE],
        render: MapRender {
            tileset_id: "landlook-0".to_string(),
            landlook: Some(landlook),
            mode: RenderMode::OutdoorLandlook,
        },
        provenance: Provenance {
            source_file: "Data LD".to_string(),
            record_index: 0,
            byte_offset: 0,
            byte_length: FIELD_BYTES,
            confidence: Confidence::Inferred,
        },
    }
}

fn default_land_random_level() -> RandomLevel {
    RandomLevel {
        id: "land:0:randlevel".to_string(),
        source: "Data RD".to_string(),
        level_type: LevelType::Land,
        level_index: 0,
        landlook: 0,
        is_dark: false,
        use_los: false,
        rects: Vec::new(),
        provenance: Provenance {
            source_file: "Data RD".to_string(),
            record_index: 0,
            byte_offset: 0,
            byte_length: RANDLEVEL_BYTES,
            confidence: Confidence::Inferred,
        },
    }
}

fn default_asset_catalog() -> AssetCatalog {
    AssetCatalog {
        tilesets: vec![TilesetAsset {
            id: "landlook-0".to_string(),
            landlook: 0,
            name: "Plains".to_string(),
            source: "Realmz reference resources".to_string(),
            available: true,
            image_path: None,
            pict_id: Some(300),
            tile_width: 32,
            tile_height: 32,
            columns: 20,
            rows: 10,
            custom: false,
            base_tile: landlook_base_tile(0),
        }],
        ..AssetCatalog::default()
    }
}

fn ensure_reference_tile_attributes(project: &mut ProvidenceProject) -> Result<()> {
    let has_mapstats = project
        .tile_attributes
        .iter()
        .any(|profile| matches!(profile.source_kind, TileAttributeSourceKind::Mapstats));
    if has_mapstats {
        return Ok(());
    }
    project
        .tile_attributes
        .extend(reference_landlook_tile_attributes()?);
    Ok(())
}

fn backfill_tileset_metadata(project: &mut ProvidenceProject) {
    for tileset in &mut project.asset_catalog.tilesets {
        if tileset.base_tile.is_none() {
            tileset.base_tile = landlook_base_tile(tileset.landlook);
        }
    }
}

fn refresh_custom_tile_atlases(project_dir: &Path, project: &mut ProvidenceProject) -> Result<()> {
    let raw_dir = project_dir.join(if project.source.raw_sources_dir.is_empty() {
        RAW_SOURCES_DIR
    } else {
        project.source.raw_sources_dir.as_str()
    });
    if !raw_dir.is_dir() {
        return Ok(());
    }
    let atlas_dir = project_dir.join(ASSETS_DIR).join(TILE_ATLASES_DIR);
    fs::create_dir_all(&atlas_dir).with_path(&atlas_dir)?;
    for tileset in &mut project.asset_catalog.tilesets {
        if !tileset.custom {
            continue;
        }
        tileset.base_tile = custom_landlook_base_tile(&raw_dir, tileset.landlook)?;
        let image_missing = tileset
            .image_path
            .as_ref()
            .map(|relative| !project_dir.join(relative).is_file())
            .unwrap_or(true);
        if !image_missing {
            continue;
        }
        if let CustomAtlasImport::Imported(relative_path) =
            import_custom_tile_atlas(&raw_dir, &atlas_dir, tileset)?
        {
            tileset.image_path = Some(relative_path);
            tileset.available = true;
        }
    }
    Ok(())
}

fn reference_landlook_tile_attributes() -> Result<Vec<TileAttributeProfile>> {
    let mut out = Vec::new();
    for (file_name, landlook) in standard_landlook_metadata_files() {
        let Some(path) = reference_landlook_metadata_path(file_name) else {
            continue;
        };
        let bytes = fs::read(&path).with_path(&path)?;
        out.extend(crate::realmz::parse_landlook_mapstats_data(
            &bytes, landlook, file_name,
        ));
    }
    Ok(out)
}

fn standard_landlook_metadata_files() -> [(&'static str, i8); 6] {
    [
        ("Data P BD", 0),
        ("Data SUB BD", 3),
        ("Data Castle BD", 4),
        ("Data Desert BD", 5),
        ("Data Swamp BD", 9),
        ("Data Snow BD", 10),
    ]
}

fn reference_landlook_metadata_path(file_name: &str) -> Option<PathBuf> {
    for base in bundled_realmz_reference_roots() {
        let path = base.join(file_name);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn landlook_base_tile(landlook: i8) -> Option<i16> {
    match landlook {
        0 => Some(156),
        3 => Some(155),
        4 => Some(111),
        5 => Some(191),
        6..=8 => Some(156),
        9 | 10 => Some(155),
        _ => None,
    }
}

fn raw_source_buffers(
    raw_dir: &Path,
    source_files: &[SourceFile],
) -> Result<BTreeMap<String, Vec<u8>>> {
    let mut buffers = BTreeMap::new();
    for file_name in TRACKED_FILES {
        let path = raw_dir.join(file_name);
        if path.is_file() {
            buffers.insert((*file_name).to_string(), fs::read(&path).with_path(&path)?);
        }
    }
    for file in source_files {
        if !is_resource_file_name(&file.name) || buffers.contains_key(&file.name) {
            continue;
        }
        let path = raw_dir.join(&file.relative_path);
        if path.is_file() {
            buffers.insert(file.name.clone(), fs::read(&path).with_path(&path)?);
        }
    }
    Ok(buffers)
}

fn snapshot_sources(source_path: &Path, raw_dir: &Path) -> Result<Vec<SourceFile>> {
    let supported: BTreeSet<&str> = SUPPORTED_WRITE_FILES.iter().copied().collect();
    let tracked: BTreeSet<&str> = TRACKED_FILES.iter().copied().collect();
    let mut files = Vec::new();
    for entry in WalkDir::new(source_path).max_depth(1).min_depth(1) {
        let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if is_ignored_os_metadata_file(name) {
            continue;
        }
        let dest = raw_dir.join(name);
        fs::copy(path, &dest).with_path(&dest)?;
        let bytes = fs::read(path).with_path(path)?;
        let role = if supported.contains(name)
            || is_scenario_marker_source(source_path, name, &bytes)
            || is_scenario_support_data_file(name, &bytes)
        {
            SourceFileRole::SupportedBinary
        } else if is_resource_file_name(name) {
            SourceFileRole::ResourceFork
        } else if tracked.contains(name) {
            SourceFileRole::PassThrough
        } else {
            SourceFileRole::Unknown
        };
        let editable = matches!(role, SourceFileRole::SupportedBinary);
        files.push(SourceFile {
            name: name.to_string(),
            relative_path: name.to_string(),
            bytes: bytes.len() as u64,
            sha256: sha256_hex(&bytes),
            role,
            editable,
        });
    }
    snapshot_macosx_resource_sidecars(source_path, raw_dir, &mut files)?;
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

fn snapshot_macosx_resource_sidecars(
    source_path: &Path,
    raw_dir: &Path,
    files: &mut Vec<SourceFile>,
) -> Result<()> {
    let macosx_dir = source_path.join("__MACOSX");
    if !macosx_dir.is_dir() {
        return Ok(());
    }
    let existing_names: BTreeSet<String> = files.iter().map(|file| file.name.clone()).collect();
    for entry in WalkDir::new(&macosx_dir).max_depth(1).min_depth(1) {
        let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let Some(sidecar_name) = entry.path().file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(data_name) = sidecar_name.strip_prefix("._") else {
            continue;
        };
        let bytes = fs::read(entry.path()).with_path(entry.path())?;
        let resource_bytes = crate::resource_fork::resource_fork_payload(&bytes).to_vec();
        if crate::resource_fork::parse_resource_fork_entries(&resource_bytes).is_empty() {
            continue;
        }
        let resource_name = if data_name == "Scenario" {
            "Scenario.rsrc".to_string()
        } else {
            format!("{data_name}.rsrc")
        };
        if existing_names.contains(&resource_name)
            || files.iter().any(|file| file.name == resource_name)
        {
            continue;
        }
        let dest = raw_dir.join(&resource_name);
        fs::write(&dest, &resource_bytes).with_path(&dest)?;
        files.push(SourceFile {
            name: resource_name.clone(),
            relative_path: resource_name,
            bytes: resource_bytes.len() as u64,
            sha256: sha256_hex(&resource_bytes),
            role: SourceFileRole::ResourceFork,
            editable: false,
        });
    }
    Ok(())
}

fn is_scenario_marker_source(source_path: &Path, name: &str, bytes: &[u8]) -> bool {
    let Some(scenario_dir_name) = source_path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    name.eq_ignore_ascii_case(scenario_dir_name)
        && crate::realmz::parse_scenario_shell(name, bytes).is_ok()
}

fn is_scenario_marker_candidate_name(name: &str) -> bool {
    !is_resource_file_name(name)
        && !TRACKED_FILES.iter().any(|tracked| *tracked == name)
        && !name.starts_with("Data ")
        && !name.starts_with("._")
}

fn is_resource_file_name(name: &str) -> bool {
    name == "Scenario"
        || name.ends_with(".rsrc")
        || name.ends_with(".rsf")
        || name.starts_with("._")
}

fn is_scenario_support_data_file(name: &str, bytes: &[u8]) -> bool {
    name == "Scenario" && bytes.len() == crate::realmz::SCENARIO_SUPPORT_FILE_BYTES
}

fn is_ignored_os_metadata_file(name: &str) -> bool {
    name == ".DS_Store"
}

fn import_tile_atlases(
    source_path: &Path,
    assets_dir: &Path,
    project: &mut ProvidenceProject,
) -> Result<()> {
    let atlas_dir = assets_dir.join(TILE_ATLASES_DIR);
    fs::create_dir_all(&atlas_dir).with_path(&atlas_dir)?;
    for tileset in &mut project.asset_catalog.tilesets {
        if tileset.custom {
            tileset.base_tile = custom_landlook_base_tile(source_path, tileset.landlook)?;
        } else if tileset.base_tile.is_none() {
            tileset.base_tile = custom_landlook_base_tile(source_path, tileset.landlook)?;
        }
        if let Some(source) = atlas_source_path(source_path, tileset) {
            if source.is_file() {
                let file_name = format!("{}.png", tileset.id);
                let dest = atlas_dir.join(&file_name);
                fs::copy(&source, &dest).with_path(&dest)?;
                tileset.image_path = Some(format!("{ASSETS_DIR}/{TILE_ATLASES_DIR}/{file_name}"));
                tileset.available = true;
                continue;
            }
        }
        if tileset.custom {
            match import_custom_tile_atlas(source_path, &atlas_dir, tileset)? {
                CustomAtlasImport::Imported(relative_path) => {
                    tileset.image_path = Some(relative_path);
                    tileset.available = true;
                    continue;
                }
                CustomAtlasImport::Unsupported(message) => {
                    tileset.available = false;
                    project.diagnostics.push(Diagnostic {
                        severity: DiagnosticSeverity::Warning,
                        code: "unsupported-custom-tile-atlas".to_string(),
                        message,
                        source: Some(tileset.id.clone()),
                    });
                    continue;
                }
                CustomAtlasImport::Missing => {}
            }
        }
        if !tileset.custom && tileset.pict_id.is_some() {
            tileset.image_path = None;
            tileset.available = true;
            continue;
        }
        tileset.available = false;
        project.diagnostics.push(Diagnostic {
            severity: DiagnosticSeverity::Warning,
            code: "missing-tile-atlas".to_string(),
            message: format!("No tile atlas source is known for {}", tileset.id),
            source: Some(tileset.id.clone()),
        });
    }
    Ok(())
}

fn import_icon_overlays(
    source_path: &Path,
    assets_dir: &Path,
    project: &mut ProvidenceProject,
) -> Result<()> {
    let icon_dir = assets_dir.join(ICONS_DIR);
    fs::create_dir_all(&icon_dir).with_path(&icon_dir)?;
    let map_icon_ids = map_icon_ids(&project.maps);
    let monster_icon_ids = project
        .monster_sets
        .iter()
        .flat_map(|set| monster_icon_ids(&set.monsters))
        .chain(monster_icon_ids(&project.monsters))
        .collect::<BTreeSet<_>>();
    let referenced_icon_ids = map_icon_ids
        .union(&monster_icon_ids)
        .copied()
        .collect::<BTreeSet<_>>();
    let bundled_map_icon_ids = bundled_reference_resource_ids("cicn", &map_icon_ids)?;
    import_scenario_icon_overlays(source_path, &icon_dir, &referenced_icon_ids, project)?;
    project
        .diagnostics
        .retain(|diagnostic| diagnostic.code != "missing-map-icon-overlay");
    let mut missing = BTreeSet::new();
    for icon_id in map_icon_ids {
        let file_name = format!("icon_{icon_id}.png");
        if !icon_dir.join(&file_name).is_file() && !bundled_map_icon_ids.contains(&icon_id) {
            missing.insert(icon_id);
        }
    }
    if !missing.is_empty() {
        project.diagnostics.push(Diagnostic {
            severity: DiagnosticSeverity::Warning,
            code: "missing-map-icon-overlay".to_string(),
            message: format!(
                "{} map icon overlay(s) referenced by Realmz special field values were not found in bundled Realmz reference resources or scenario resources: {}",
                missing.len(),
                missing
                    .iter()
                    .map(i16::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            source: Some("Data LD".to_string()),
        });
    }
    project
        .diagnostics
        .retain(|diagnostic| diagnostic.code != "missing-monster-icon-preview");
    let missing_monster_icons = monster_icon_ids
        .iter()
        .copied()
        .filter(|icon_id| is_scenario_local_monster_icon_id(*icon_id))
        .filter(|icon_id| {
            let file_name = format!("icon_{icon_id}.png");
            !icon_dir.join(&file_name).is_file()
        })
        .collect::<Vec<_>>();
    if !missing_monster_icons.is_empty() {
        project.diagnostics.push(Diagnostic {
            severity: DiagnosticSeverity::Warning,
            code: "missing-monster-icon-preview".to_string(),
            message: format!(
                "{} scenario-local monster icon preview(s) referenced by monster records were not found in scenario resources: {}",
                missing_monster_icons.len(),
                missing_monster_icons
                    .iter()
                    .map(i16::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            source: Some("Data MD".to_string()),
        });
    }
    Ok(())
}

fn import_scenario_icon_overlays(
    source_path: &Path,
    icon_dir: &Path,
    icon_ids: &BTreeSet<i16>,
    project: &mut ProvidenceProject,
) -> Result<()> {
    if icon_ids.is_empty() {
        return Ok(());
    }
    let mut imported = BTreeSet::new();
    for resource_path in scenario_resource_candidates(source_path) {
        if !resource_path.is_file() {
            continue;
        }
        let bytes = fs::read(&resource_path).with_path(&resource_path)?;
        for entry in crate::resource_fork::parse_resource_fork_entries(&bytes) {
            if entry.resource_type != "cicn"
                || !icon_ids.contains(&entry.id)
                || imported.contains(&entry.id)
            {
                continue;
            }
            let preview = crate::resource_preview::inspect_resource_preview("cicn", &entry.data)?;
            let Some(data_url) = preview.data_url else {
                let detail = preview
                    .diagnostics
                    .first()
                    .map(|diagnostic| diagnostic.message.clone())
                    .unwrap_or_else(|| format!("preview status was {:?}", preview.status));
                project.diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Warning,
                    code: "unsupported-scenario-icon-preview".to_string(),
                    message: format!(
                        "Scenario cicn {} in {} could not be decoded as an icon preview: {}",
                        entry.id,
                        resource_path.display(),
                        detail
                    ),
                    source: Some(resource_path.display().to_string()),
                });
                continue;
            };
            let Some(png_bytes) = png_bytes_from_data_url(&data_url) else {
                project.diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Warning,
                    code: "unsupported-scenario-icon-preview".to_string(),
                    message: format!(
                        "Scenario cicn {} decoded, but did not produce a PNG icon preview",
                        entry.id
                    ),
                    source: Some(resource_path.display().to_string()),
                });
                continue;
            };
            let file_name = format!("icon_{}.png", entry.id);
            let dest = icon_dir.join(&file_name);
            fs::write(&dest, png_bytes).with_path(&dest)?;
            upsert_scenario_icon_asset(
                project,
                entry.id,
                entry.name,
                resource_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("Scenario resource fork"),
                format!("{ASSETS_DIR}/{ICONS_DIR}/{file_name}"),
            );
            imported.insert(entry.id);
        }
        import_monster_icon_override_pairs(project, icon_ids, &bytes);
    }
    project
        .asset_catalog
        .icons
        .sort_by_key(|asset| asset.resource_id);
    Ok(())
}

fn import_monster_icon_override_pairs(
    project: &mut ProvidenceProject,
    icon_ids: &BTreeSet<i16>,
    resource_bytes: &[u8],
) {
    let entries = crate::resource_fork::parse_resource_fork_entries(resource_bytes);
    if entries.is_empty() {
        return;
    }
    let by_id = entries
        .iter()
        .filter(|entry| entry.resource_type == "cicn")
        .map(|entry| (absolute_i16_as_i32(entry.id), entry))
        .collect::<BTreeMap<_, _>>();
    let targets = icon_ids
        .iter()
        .filter_map(|id| monster_icon_target_id(*id))
        .collect::<BTreeSet<_>>();
    for target in targets {
        let Some(base) = by_id.get(&target) else {
            continue;
        };
        let paired_id = target.saturating_add(308);
        let Some(paired) = by_id.get(&paired_id) else {
            if by_id.contains_key(&target) {
                project.diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Warning,
                    code: "incomplete-monster-icon-override".to_string(),
                    message: format!(
                        "Scenario contains cicn {target} but not paired monster icon cicn {paired_id}; Providence preserved the preview but not an icon-set override."
                    ),
                    source: Some("Scenario resource fork".to_string()),
                });
            }
            continue;
        };
        if project
            .monster_icon_overrides
            .iter()
            .any(|override_entry| override_entry.target_base_icon_id == target)
        {
            continue;
        }
        project.monster_icon_overrides.push(MonsterIconOverride {
            target_base_icon_id: target,
            source_base_icon_id: target,
            source_label: Some(format!("Imported scenario override {target}")),
            source_kind: MonsterIconOverrideSource::ScenarioResource,
            source_base_resource_base64: STANDARD.encode(&base.data),
            source_paired_resource_base64: STANDARD.encode(&paired.data),
            imported: true,
        });
    }
    project
        .monster_icon_overrides
        .sort_by_key(|override_entry| override_entry.target_base_icon_id);
}

fn absolute_i16_as_i32(value: i16) -> i32 {
    i32::from(value).abs()
}

fn monster_icon_target_id(value: i16) -> Option<i32> {
    let target = absolute_i16_as_i32(value);
    (target <= i32::from(i16::MAX)).then_some(target)
}

fn hydrate_item_texts(source_path: &Path, project: &mut ProvidenceProject) -> Result<()> {
    for resource_path in data_id_resource_candidates(source_path) {
        if !resource_path.is_file() {
            continue;
        }
        let bytes = fs::read(&resource_path).with_path(&resource_path)?;
        for entry in crate::resource_fork::parse_resource_fork_entries(&bytes) {
            if entry.resource_type != "STR#" {
                continue;
            }
            let Some(resource_base) = item_text_resource_base(entry.id) else {
                continue;
            };
            let slot_kind = entry.id - resource_base;
            let strings = crate::resource_fork::decode_string_list_resource(&entry.data);
            for (index, text) in strings.into_iter().enumerate() {
                let item_id = i32::from(resource_base) + index as i32;
                if !(1..1000).contains(&item_id) {
                    continue;
                }
                if text.trim().is_empty() && slot_kind != 2 {
                    continue;
                }
                let item_id = item_id as i16;
                let existing_index = project
                    .item_texts
                    .iter()
                    .position(|record| record.item_id == item_id);
                let record_index = if let Some(existing_index) = existing_index {
                    if project.item_texts[existing_index].authored {
                        continue;
                    }
                    existing_index
                } else {
                    project.item_texts.push(ItemTextRecord {
                        id: item_id as usize,
                        item_id,
                        unidentified_name: String::new(),
                        identified_name: String::new(),
                        description: String::new(),
                        authored: false,
                        provenance: None,
                    });
                    project.item_texts.len() - 1
                };
                let record = &mut project.item_texts[record_index];
                match slot_kind {
                    0 => record.unidentified_name = text,
                    1 => record.identified_name = text,
                    2 => record.description = text,
                    _ => continue,
                }
                record.provenance = Some(Provenance {
                    source_file: resource_path.to_string_lossy().to_string(),
                    record_index: item_id as usize,
                    byte_offset: 0,
                    byte_length: entry.data.len(),
                    confidence: Confidence::SourceBacked,
                });
            }
        }
    }
    project.item_texts.sort_by_key(|record| record.item_id);
    Ok(())
}

fn item_text_resource_base(resource_id: i16) -> Option<i16> {
    let offset = resource_id.rem_euclid(200);
    if !matches!(offset, 0..=2) {
        return None;
    }
    let base = resource_id - offset;
    (0..1000).contains(&base).then_some(base)
}

fn hydrate_custom_spell_names(source_path: &Path, project: &mut ProvidenceProject) -> Result<()> {
    if project.spell_overrides.is_empty() {
        return Ok(());
    }
    for resource_path in data_spell_resource_candidates(source_path) {
        if !resource_path.is_file() {
            continue;
        }
        let bytes = fs::read(&resource_path).with_path(&resource_path)?;
        let mut applied = 0usize;
        for entry in crate::resource_fork::parse_resource_fork_entries(&bytes) {
            if entry.resource_type != "STR#" || !(5000..=5006).contains(&entry.id) {
                continue;
            }
            let level_index = (entry.id - 5000) as usize;
            let names = crate::resource_fork::decode_string_list_resource(&entry.data);
            for (slot_index, name) in names.into_iter().take(15).enumerate() {
                if name.trim().is_empty() {
                    continue;
                }
                let custom_id = level_index * 15 + slot_index;
                if let Some(record) = project
                    .spell_overrides
                    .iter_mut()
                    .find(|record| record.id == custom_id)
                {
                    record.display_name = name;
                    applied += 1;
                }
            }
        }
        if applied > 0 {
            return Ok(());
        }
    }
    Ok(())
}

fn hydrate_rule_names(
    source_path: &Path,
    raw_dir: Option<&Path>,
    project: &mut ProvidenceProject,
) -> Result<()> {
    normalize_rule_names(project);
    if project.rule_names.authored {
        apply_rule_names_to_records(project);
        return Ok(());
    }
    for resource_path in custom_names_resource_candidates(source_path) {
        if !resource_path.is_file() {
            continue;
        }
        let bytes = fs::read(&resource_path).with_path(&resource_path)?;
        let entries = crate::resource_fork::parse_resource_fork_entries(&bytes);
        let mut found = false;
        let mut rule_names = default_rule_names();
        rule_names.source_file = CUSTOM_NAMES_SOURCE_FILE.to_string();
        rule_names.provenance = Some(Provenance {
            source_file: resource_path.to_string_lossy().to_string(),
            record_index: 0,
            byte_offset: 0,
            byte_length: bytes.len(),
            confidence: Confidence::SourceBacked,
        });
        for entry in entries {
            if entry.resource_type != "STR#" {
                continue;
            }
            if entry.id == 129 {
                merge_rule_name_list(
                    &mut rule_names.race_names,
                    crate::resource_fork::decode_string_list_resource(&entry.data),
                );
                found = true;
            } else if entry.id == 131 {
                merge_rule_name_list(
                    &mut rule_names.caste_names,
                    crate::resource_fork::decode_string_list_resource(&entry.data),
                );
                found = true;
            }
        }
        if !found {
            continue;
        }
        if let Some(raw_dir) = raw_dir {
            let dest = raw_dir.join(CUSTOM_NAMES_SOURCE_FILE);
            if !same_path(&resource_path, &dest) {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).with_path(parent)?;
                }
                fs::copy(&resource_path, &dest).with_path(&dest)?;
            }
        }
        project.rule_names = rule_names;
        apply_rule_names_to_records(project);
        return Ok(());
    }
    apply_rule_names_to_records(project);
    Ok(())
}

fn normalize_rule_names(project: &mut ProvidenceProject) {
    let defaults = default_rule_names();
    if project.rule_names.source_file.trim().is_empty() {
        project.rule_names.source_file = CUSTOM_NAMES_SOURCE_FILE.to_string();
    }
    fill_rule_name_defaults(&mut project.rule_names.race_names, defaults.race_names);
    fill_rule_name_defaults(&mut project.rule_names.caste_names, defaults.caste_names);
}

fn fill_rule_name_defaults(target: &mut Vec<String>, defaults: Vec<String>) {
    if target.len() < defaults.len() {
        target.resize(defaults.len(), String::new());
    }
    for (index, value) in defaults.into_iter().enumerate() {
        if target[index].trim().is_empty() {
            target[index] = value;
        }
    }
}

fn merge_rule_name_list(target: &mut Vec<String>, source: Vec<String>) {
    if target.len() < source.len() {
        target.resize(source.len(), String::new());
    }
    for (index, value) in source.into_iter().enumerate() {
        let value = value.trim();
        if !value.is_empty() {
            target[index] = value.to_string();
        }
    }
}

fn apply_rule_names_to_records(project: &mut ProvidenceProject) {
    for record in &mut project.race_overrides {
        if let Some(name) = project.rule_names.race_names.get(record.id) {
            if !name.trim().is_empty() {
                record.display_name = name.clone();
            }
        }
    }
    for record in &mut project.caste_overrides {
        if let Some(name) = project.rule_names.caste_names.get(record.id) {
            if !name.trim().is_empty() {
                record.display_name = name.clone();
            }
        }
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

fn upsert_scenario_icon_asset(
    project: &mut ProvidenceProject,
    icon_id: i16,
    name: String,
    source_file: &str,
    preview_path: String,
) {
    if let Some(asset) = project
        .asset_catalog
        .icons
        .iter_mut()
        .find(|asset| asset.resource_type == "cicn" && asset.resource_id == i32::from(icon_id))
    {
        if asset.name.is_none() && !name.is_empty() {
            asset.name = Some(name);
        }
        asset.preview_path = Some(preview_path);
        return;
    }
    project.asset_catalog.icons.push(ResourceAsset {
        id: format!("scenario-cicn-{icon_id}"),
        resource_type: "cicn".to_string(),
        resource_id: i32::from(icon_id),
        name: (!name.is_empty()).then_some(name),
        source: format!("Scenario resource fork: {source_file}"),
        preview_path: Some(preview_path),
    });
}

fn import_picture_assets(
    source_path: &Path,
    assets_dir: &Path,
    project: &mut ProvidenceProject,
) -> Result<()> {
    let picture_dir = assets_dir.join(PICTURES_DIR);
    fs::create_dir_all(&picture_dir).with_path(&picture_dir)?;
    let mut imported = BTreeSet::new();
    for resource_path in scenario_resource_candidates(source_path) {
        if !resource_path.is_file() {
            continue;
        }
        let bytes = fs::read(&resource_path).with_path(&resource_path)?;
        for entry in crate::resource_fork::parse_resource_fork_entries(&bytes) {
            if entry.resource_type != "PICT" || imported.contains(&entry.id) {
                continue;
            }
            let preview_path = existing_picture_preview_path(project, entry.id, assets_dir);
            let preview_path = match preview_path {
                Some(path) => Some(path),
                None => {
                    let preview =
                        crate::resource_preview::inspect_resource_preview("PICT", &entry.data)?;
                    if let Some(data_url) = preview.data_url {
                        if let Some(png_bytes) = png_bytes_from_data_url(&data_url) {
                            let file_name = format!("picture_{}.png", entry.id);
                            let dest = picture_dir.join(&file_name);
                            fs::write(&dest, png_bytes).with_path(&dest)?;
                            Some(format!("{ASSETS_DIR}/{PICTURES_DIR}/{file_name}"))
                        } else {
                            None
                        }
                    } else {
                        let detail = preview
                            .diagnostics
                            .first()
                            .map(|diagnostic| diagnostic.message.clone())
                            .unwrap_or_else(|| format!("preview status was {:?}", preview.status));
                        project.diagnostics.push(Diagnostic {
                            severity: if preview.status
                                == crate::resource_preview::ResourcePreviewStatus::Malformed
                            {
                                DiagnosticSeverity::Error
                            } else {
                                DiagnosticSeverity::Warning
                            },
                            code: "unsupported-scenario-picture-preview".to_string(),
                            message: format!(
                                "Scenario PICT {} in {} could not be decoded for preview: {}",
                                entry.id,
                                resource_path.display(),
                                detail
                            ),
                            source: Some(resource_path.display().to_string()),
                        });
                        None
                    }
                }
            };
            upsert_scenario_picture_asset(
                project,
                entry.id,
                entry.name,
                resource_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("Scenario resource fork"),
                preview_path,
            );
            imported.insert(entry.id);
        }
    }
    project
        .asset_catalog
        .pictures
        .sort_by_key(|asset| asset.resource_id);
    Ok(())
}

fn existing_picture_preview_path(
    project: &ProvidenceProject,
    picture_id: i16,
    assets_dir: &Path,
) -> Option<String> {
    let preview_path = project
        .asset_catalog
        .pictures
        .iter()
        .find(|asset| asset.resource_type == "PICT" && asset.resource_id == i32::from(picture_id))
        .and_then(|asset| asset.preview_path.as_deref())?;
    let relative = preview_path
        .strip_prefix(&format!("{ASSETS_DIR}/"))
        .or_else(|| preview_path.strip_prefix(&format!("{ASSETS_DIR}\\")))
        .unwrap_or(preview_path);
    assets_dir
        .join(relative)
        .is_file()
        .then(|| preview_path.to_string())
}

fn upsert_scenario_picture_asset(
    project: &mut ProvidenceProject,
    picture_id: i16,
    name: String,
    source_file: &str,
    preview_path: Option<String>,
) {
    if let Some(asset) =
        project.asset_catalog.pictures.iter_mut().find(|asset| {
            asset.resource_type == "PICT" && asset.resource_id == i32::from(picture_id)
        })
    {
        if asset.name.is_none() && !name.is_empty() {
            asset.name = Some(name);
        }
        if preview_path.is_some() {
            asset.preview_path = preview_path;
        }
        return;
    }
    project.asset_catalog.pictures.push(ResourceAsset {
        id: format!("scenario-pict-{picture_id}"),
        resource_type: "PICT".to_string(),
        resource_id: i32::from(picture_id),
        name: (!name.is_empty()).then_some(name),
        source: format!("Scenario resource fork: {source_file}"),
        preview_path,
    });
}

fn import_sound_assets(
    source_path: &Path,
    assets_dir: &Path,
    project: &mut ProvidenceProject,
) -> Result<()> {
    let sound_dir = assets_dir.join(SOUNDS_DIR);
    fs::create_dir_all(&sound_dir).with_path(&sound_dir)?;
    let mut imported = BTreeSet::new();
    for resource_path in scenario_resource_candidates(source_path) {
        if !resource_path.is_file() {
            continue;
        }
        let bytes = fs::read(&resource_path).with_path(&resource_path)?;
        for entry in crate::resource_fork::parse_resource_fork_entries(&bytes) {
            if entry.resource_type != "snd " || imported.contains(&entry.id) {
                continue;
            }
            let preview = crate::resource_preview::inspect_resource_preview("snd ", &entry.data)?;
            let preview_path = if let Some(data_url) = preview.data_url {
                if let Some(wav_bytes) = bytes_from_data_url(&data_url) {
                    let file_name = format!("sound_{}.wav", entry.id);
                    let dest = sound_dir.join(&file_name);
                    fs::write(&dest, wav_bytes).with_path(&dest)?;
                    Some(format!("{ASSETS_DIR}/{SOUNDS_DIR}/{file_name}"))
                } else {
                    None
                }
            } else {
                let detail = preview
                    .diagnostics
                    .first()
                    .map(|diagnostic| diagnostic.message.clone())
                    .unwrap_or_else(|| format!("preview status was {:?}", preview.status));
                project.diagnostics.push(Diagnostic {
                    severity: DiagnosticSeverity::Warning,
                    code: "unsupported-scenario-sound-preview".to_string(),
                    message: format!(
                        "Scenario snd {} in {} could not be decoded for preview: {}",
                        entry.id,
                        resource_path.display(),
                        detail
                    ),
                    source: Some(resource_path.display().to_string()),
                });
                None
            };
            upsert_scenario_sound_asset(
                project,
                entry.id,
                entry.name,
                resource_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("Scenario resource fork"),
                preview_path,
            );
            imported.insert(entry.id);
        }
    }
    project
        .asset_catalog
        .sounds
        .sort_by_key(|asset| asset.resource_id);
    Ok(())
}

fn upsert_scenario_sound_asset(
    project: &mut ProvidenceProject,
    sound_id: i16,
    name: String,
    source_file: &str,
    preview_path: Option<String>,
) {
    if let Some(asset) = project
        .asset_catalog
        .sounds
        .iter_mut()
        .find(|asset| asset.resource_type == "snd " && asset.resource_id == i32::from(sound_id))
    {
        if asset.name.is_none() && !name.is_empty() {
            asset.name = Some(name);
        }
        if preview_path.is_some() {
            asset.preview_path = preview_path;
        }
        return;
    }
    project.asset_catalog.sounds.push(ResourceAsset {
        id: format!("scenario-snd-{sound_id}"),
        resource_type: "snd ".to_string(),
        resource_id: i32::from(sound_id),
        name: (!name.is_empty()).then_some(name),
        source: format!("Scenario resource fork: {source_file}"),
        preview_path,
    });
}

fn map_icon_ids(maps: &[MapEntity]) -> BTreeSet<i16> {
    let mut ids = BTreeSet::new();
    for map in maps {
        for value in &map.tiles {
            if let Some(icon_id) = normalize_icon_id(*value) {
                ids.insert(icon_id);
            }
        }
    }
    ids
}

fn monster_icon_ids(monsters: &[MonsterRecord]) -> BTreeSet<i16> {
    monsters
        .iter()
        .map(|monster| monster.icon_id)
        .filter(|icon_id| *icon_id != 0)
        .collect()
}

fn is_scenario_local_monster_icon_id(icon_id: i16) -> bool {
    icon_id < 0 || icon_id >= 1000
}

fn normalize_icon_id(value: i16) -> Option<i16> {
    if value >= 0 {
        // Positive 201-999 values are direct map icon ids. Values above 999 are
        // Realmz land-state encodings and must not be reduced into icon ids here.
        return (value > 200 && value < 1000).then_some(value);
    }
    let mut icon_id = value;
    while icon_id < -999 {
        icon_id += 1000;
    }
    Some(icon_id)
}

fn atlas_source_path(source_path: &Path, tileset: &TilesetAsset) -> Option<PathBuf> {
    if tileset.custom {
        let cache_key = scenario_cache_key(source_path);
        let cached = Path::new("tmp")
            .join("providence-tile-atlases")
            .join(cache_key)
            .join(format!("{}.png", tileset.id));
        if cached.is_file() {
            return Some(cached);
        }
    }
    None
}

fn bundled_realmz_reference_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    roots.push(
        Path::new("public")
            .join("bundled-libraries")
            .join("realmz-reference"),
    );
    roots.push(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("public")
            .join("bundled-libraries")
            .join("realmz-reference"),
    );
    roots.push(Path::new("bundled-libraries").join("realmz-reference"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.join("bundled-libraries").join("realmz-reference"));
            roots.push(
                parent
                    .join("resources")
                    .join("bundled-libraries")
                    .join("realmz-reference"),
            );
        }
    }
    let mut seen = BTreeSet::new();
    roots
        .into_iter()
        .filter(|path| seen.insert(path.to_string_lossy().to_string()))
        .collect()
}

fn bundled_reference_resource_ids(
    resource_type: &str,
    wanted: &BTreeSet<i16>,
) -> Result<BTreeSet<i16>> {
    let mut found = BTreeSet::new();
    if wanted.is_empty() {
        return Ok(found);
    }
    for root in bundled_realmz_reference_roots() {
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&root)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let bytes = fs::read(entry.path()).with_path(entry.path())?;
            for resource in crate::resource_fork::parse_resource_fork_entries(&bytes) {
                if resource.resource_type == resource_type && wanted.contains(&resource.id) {
                    found.insert(resource.id);
                }
            }
            if found.len() == wanted.len() {
                return Ok(found);
            }
        }
    }
    Ok(found)
}

enum CustomAtlasImport {
    Imported(String),
    Missing,
    Unsupported(String),
}

fn import_custom_tile_atlas(
    source_path: &Path,
    atlas_dir: &Path,
    tileset: &TilesetAsset,
) -> Result<CustomAtlasImport> {
    let Some(pict_id) = tileset.pict_id else {
        return Ok(CustomAtlasImport::Missing);
    };
    for resource_path in scenario_resource_candidates(source_path) {
        if !resource_path.is_file() {
            continue;
        }
        let bytes = fs::read(&resource_path).with_path(&resource_path)?;
        let Some(entry) = crate::resource_fork::parse_resource_fork_entries(&bytes)
            .into_iter()
            .find(|entry| entry.resource_type == "PICT" && i32::from(entry.id) == pict_id)
        else {
            continue;
        };
        let preview = crate::resource_preview::inspect_resource_preview("PICT", &entry.data)?;
        let Some(data_url) = preview.data_url else {
            let detail = preview
                .diagnostics
                .first()
                .map(|diagnostic| diagnostic.message.clone())
                .unwrap_or_else(|| format!("preview status was {:?}", preview.status));
            return Ok(CustomAtlasImport::Unsupported(format!(
                "{} PICT {} in {} could not be decoded as a tile atlas: {}",
                tileset.name,
                pict_id,
                resource_path.display(),
                detail
            )));
        };
        let Some(png_bytes) = png_bytes_from_data_url(&data_url) else {
            return Ok(CustomAtlasImport::Unsupported(format!(
                "{} PICT {} decoded, but did not produce a PNG preview",
                tileset.name, pict_id
            )));
        };
        let file_name = format!("{}.png", tileset.id);
        let dest = atlas_dir.join(&file_name);
        fs::write(&dest, png_bytes).with_path(&dest)?;
        return Ok(CustomAtlasImport::Imported(format!(
            "{ASSETS_DIR}/{TILE_ATLASES_DIR}/{file_name}"
        )));
    }
    Ok(CustomAtlasImport::Missing)
}

fn custom_landlook_base_tile(source_path: &Path, landlook: i8) -> Result<Option<i16>> {
    let Some(file_name) = custom_landlook_metadata_file(landlook) else {
        return Ok(None);
    };
    let path = source_path.join(file_name);
    if !path.is_file() {
        return Ok(custom_landlook_fallback_base_tile(landlook));
    }
    let bytes = fs::read(&path).with_path(&path)?;
    if bytes.len() < 8042 {
        return Ok(custom_landlook_fallback_base_tile(landlook));
    }
    let value = i16::from_be_bytes([bytes[8040], bytes[8041]]);
    Ok((value > 0 && value <= 999)
        .then_some(value)
        .or_else(|| custom_landlook_fallback_base_tile(landlook)))
}

fn custom_landlook_fallback_base_tile(landlook: i8) -> Option<i16> {
    (6..=8).contains(&landlook).then_some(156)
}

fn custom_landlook_metadata_file(landlook: i8) -> Option<&'static str> {
    match landlook {
        6 => Some("Data Custom 1 BD"),
        7 => Some("Data Custom 2 BD"),
        8 => Some("Data Custom 3 BD"),
        _ => None,
    }
}

fn scenario_resource_candidates(source_path: &Path) -> Vec<PathBuf> {
    let scenario_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Scenario");
    vec![
        source_path.join("Scenario.rsrc"),
        source_path.join("Scenario.rsf"),
        source_path.join(format!("{scenario_name}.rsrc")),
        source_path.join(format!("{scenario_name}.rsf")),
        source_path.join(".rsrc").join("Scenario"),
        source_path.join(".rsrc").join(scenario_name),
        source_path.join("Scenario"),
    ]
}

fn data_spell_resource_candidates(source_path: &Path) -> Vec<PathBuf> {
    vec![
        source_path.join("Data Spell.rsrc"),
        source_path.join("Data Spell.rsf"),
        source_path.join("._Data Spell"),
        source_path.join("Data Spell"),
    ]
}

fn data_id_resource_candidates(source_path: &Path) -> Vec<PathBuf> {
    dedupe_paths(vec![
        source_path.join("Data ID.rsrc"),
        source_path.join("Data ID.rsf"),
        source_path.join("._Data ID"),
        source_path.join(".rsrc").join("Data ID"),
        source_path.join("Data ID"),
    ])
}

fn custom_names_resource_candidates(source_path: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![
        source_path.join(CUSTOM_NAMES_SOURCE_FILE),
        source_path.join("Custom Names.rsrc"),
        source_path.join("Custom Names.rsf"),
        source_path.join("._Custom Names"),
    ];
    if let Some(parent) = source_path.parent() {
        candidates.push(parent.join("Data Files").join("Custom Names.rsrc"));
        candidates.push(parent.join("Data Files").join("Custom Names.rsf"));
        if let Some(grandparent) = parent.parent() {
            candidates.push(grandparent.join("Data Files").join("Custom Names.rsrc"));
            candidates.push(grandparent.join("Data Files").join("Custom Names.rsf"));
        }
    }
    dedupe_paths(candidates)
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = BTreeSet::new();
    paths
        .into_iter()
        .filter(|path| seen.insert(path.to_string_lossy().to_string()))
        .collect()
}

fn png_bytes_from_data_url(data_url: &str) -> Option<Vec<u8>> {
    let base64 = data_url.strip_prefix("data:image/png;base64,")?;
    STANDARD.decode(base64).ok()
}

fn bytes_from_data_url(data_url: &str) -> Option<Vec<u8>> {
    let (_, base64) = data_url.split_once(";base64,")?;
    STANDARD.decode(base64).ok()
}

fn scenario_cache_key(source_path: &Path) -> String {
    let raw = source_path.to_string_lossy().replace('/', "\\");
    let normalized = raw.strip_prefix(r"\\?\").unwrap_or(&raw);
    URL_SAFE_NO_PAD
        .encode(normalized.as_bytes())
        .chars()
        .take(64)
        .collect()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub(crate) fn scenario_id(name: &str) -> String {
    let slug: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    format!("scenario:{}", slug.trim_matches('-'))
}

fn timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("unix:{seconds}")
}

pub fn project_file_path(project_dir: impl AsRef<Path>) -> PathBuf {
    project_dir.as_ref().join(PROJECT_FILE_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat_file_bytes(dir: &Path) -> BTreeMap<String, Vec<u8>> {
        fs::read_dir(dir)
            .expect("read export directory")
            .filter_map(|entry| {
                let entry = entry.expect("read export entry");
                entry
                    .file_type()
                    .expect("read export entry type")
                    .is_file()
                    .then(|| {
                        (
                            entry.file_name().to_string_lossy().to_string(),
                            fs::read(entry.path()).expect("read exported file"),
                        )
                    })
            })
            .collect()
    }

    #[test]
    fn map_icon_normalization_matches_realmz_positive_and_negative_specials() {
        assert_eq!(normalize_icon_id(200), None);
        assert_eq!(normalize_icon_id(204), Some(204));
        assert_eq!(normalize_icon_id(378), Some(378));
        assert_eq!(normalize_icon_id(379), Some(379));
        assert_eq!(normalize_icon_id(462), Some(462));
        assert_eq!(normalize_icon_id(1462), None);
        assert_eq!(normalize_icon_id(1224), None);
        assert_eq!(normalize_icon_id(5081), None);
        assert_eq!(normalize_icon_id(969), Some(969));
        assert_eq!(normalize_icon_id(-462), Some(-462));
        assert_eq!(normalize_icon_id(-1462), Some(-462));
    }

    #[test]
    fn monster_icon_target_normalization_does_not_overflow_i16_min() {
        assert_eq!(monster_icon_target_id(385), Some(385));
        assert_eq!(monster_icon_target_id(-385), Some(385));
        assert_eq!(monster_icon_target_id(i16::MIN), None);
        assert_eq!(absolute_i16_as_i32(i16::MIN), 32768);
    }

    #[test]
    fn exact_scenario_support_data_is_distinct_from_the_resource_fork() {
        assert!(is_resource_file_name("Scenario"));
        assert!(is_scenario_support_data_file("Scenario", &[0; 600]));
        assert!(!is_scenario_support_data_file("Scenario", &[0; 599]));
        assert!(!is_scenario_support_data_file("Scenario.rsrc", &[0; 600]));
    }

    #[test]
    fn create_project_iterates_colliding_default_package_names() {
        let temp = tempfile::tempdir().expect("tempdir");
        let requested = temp.path().join("Untitled Scenario 2026-06-01.providence");
        let first = create_project("Untitled Scenario 2026-06-01".to_string(), &requested)
            .expect("first project");
        let second = create_project("Untitled Scenario 2026-06-01".to_string(), &requested)
            .expect("second project");

        assert_eq!(first.scenario.name, "Untitled Scenario 2026-06-01");
        assert_eq!(second.scenario.name, "Untitled Scenario 2026-06-01 2");
        assert!(requested.join(PROJECT_FILE_NAME).is_file());
        assert!(temp
            .path()
            .join("Untitled Scenario 2026-06-01 2.providence")
            .join(PROJECT_FILE_NAME)
            .is_file());
        assert_ne!(first.scenario.project_path, second.scenario.project_path);
    }

    #[test]
    fn open_project_upgrades_legacy_source_origin() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Legacy Starter.providence");
        create_project("Legacy Starter".to_string(), &project_dir).expect("create project");
        let project_path = project_dir.join(PROJECT_FILE_NAME);
        let mut saved: serde_json::Value =
            serde_json::from_slice(&fs::read(&project_path).expect("read project fixture"))
                .expect("parse project fixture");
        saved["schemaVersion"] = serde_json::json!(4);
        saved["source"]
            .as_object_mut()
            .expect("source object")
            .remove("origin");
        saved
            .as_object_mut()
            .expect("project object")
            .remove("itemTexts");
        saved["complexEncounters"] = serde_json::json!([{
            "id": 0,
            "actions": [],
            "groups": [],
            "spellIds": [],
            "spellResults": [],
            "itemIds": [],
            "itemResults": [],
            "choiceResults": [254],
            "wordResults": [7],
            "canBackOut": false,
            "thief": false,
            "maxTimes": 0,
            "casteSuccess": 0,
            "thiefSuccess": 0,
            "thiefFail": 0,
            "prompt": 0,
            "texts": [],
            "rawBytes": vec![0xa5u8; crate::realmz::COMPLEX_ENCOUNTER_BYTES],
            "provenance": {
                "sourceFile": "Data ED2",
                "recordIndex": 0,
                "byteOffset": 0,
                "byteLength": 520,
                "confidence": "fixture-backed"
            }
        }]);
        saved["thiefEncounters"] = serde_json::json!([{
            "id": 1,
            "typeFlags": [true],
            "modifiers": [-2],
            "spell": 17,
            "lowDamage": 3,
            "highDamage": 9,
            "tumblers": 5,
            "prompts": [4],
            "rawBytes": vec![0xa5u8; crate::realmz::THIEF_ENCOUNTER_BYTES],
            "provenance": {
                "sourceFile": "Data TD2",
                "recordIndex": 1,
                "byteOffset": 118,
                "byteLength": 118,
                "confidence": "fixture-backed"
            }
        }]);
        let mut legacy_map_record = vec![0u8; crate::realmz::MAP_RECORD_BYTES];
        legacy_map_record[0..2].copy_from_slice(&400i16.to_be_bytes());
        legacy_map_record[2..4].copy_from_slice(&12i16.to_be_bytes());
        legacy_map_record[4..6].copy_from_slice(&13i16.to_be_bytes());
        saved["mapRecords"] = serde_json::json!([{
            "id": 0,
            "startX": 12,
            "startY": 13,
            "level": 0,
            "pictId": 30128,
            "iconSize": 16,
            "show": 1,
            "isDungeon": false,
            "rect": { "top": 0, "left": 0, "bottom": 10, "right": 10 },
            "note": "Legacy map",
            "rawBytes": legacy_map_record,
            "provenance": {
                "sourceFile": "Data MD2",
                "recordIndex": 0,
                "byteOffset": 0,
                "byteLength": 340,
                "confidence": "fixture-backed"
            }
        }]);
        let mut legacy_item = crate::realmz::parse_scenario_items(&vec![
            0;
            crate::realmz::ITEM_BYTES
        ])
        .into_iter()
        .next()
        .expect("legacy scenario item");
        legacy_item.spare2[0] = -321;
        let mut legacy_item_value = serde_json::to_value(legacy_item).expect("serialize item");
        legacy_item_value
            .as_object_mut()
            .expect("item object")
            .remove("spare2");
        let mut legacy_item_raw = vec![0u8; crate::realmz::ITEM_BYTES];
        legacy_item_raw[56..58].copy_from_slice(&(-321i16).to_be_bytes());
        legacy_item_value["rawBytes"] = serde_json::json!(legacy_item_raw);
        saved["scenarioItems"] = serde_json::json!([legacy_item_value]);
        let mut legacy_treasure =
            crate::realmz::parse_treasures(&vec![0; crate::realmz::TREASURE_BYTES])
                .into_iter()
                .next()
                .expect("legacy treasure");
        legacy_treasure.item_ids = vec![901];
        let mut legacy_treasure_value =
            serde_json::to_value(legacy_treasure).expect("serialize treasure");
        let mut legacy_treasure_raw = vec![0u8; crate::realmz::TREASURE_BYTES];
        legacy_treasure_raw[2..4].copy_from_slice(&(-321i16).to_be_bytes());
        legacy_treasure_value["rawBytes"] = serde_json::json!(legacy_treasure_raw);
        saved["treasures"] = serde_json::json!([legacy_treasure_value]);
        let mut legacy_shop = crate::realmz::parse_shops(&vec![0; crate::realmz::SHOP_BYTES])
            .into_iter()
            .next()
            .expect("legacy shop");
        legacy_shop.item_ids = vec![901];
        legacy_shop.quantities = vec![3];
        let mut legacy_shop_value = serde_json::to_value(legacy_shop).expect("serialize shop");
        let mut legacy_shop_raw = vec![0u8; crate::realmz::SHOP_BYTES];
        legacy_shop_raw[2..4].copy_from_slice(&(-321i16).to_be_bytes());
        legacy_shop_raw[2001] = 7;
        legacy_shop_value["rawBytes"] = serde_json::json!(legacy_shop_raw);
        saved["shops"] = serde_json::json!([legacy_shop_value]);
        let mut legacy_message_raw = vec![0u8; crate::realmz::MESSAGE_BYTES];
        legacy_message_raw[0] = 5;
        legacy_message_raw[1..6].copy_from_slice(b"Bytes");
        saved["messages"] = serde_json::json!([{
            "id": 0,
            "text": "Semantic legacy message",
            "rawBytes": legacy_message_raw,
            "authored": false
        }]);
        let mut legacy_option_raw = vec![0u8; crate::realmz::OPTION_LABEL_BYTES];
        legacy_option_raw[0] = 5;
        legacy_option_raw[1..6].copy_from_slice(b"Bytes");
        saved["optionLabels"] = serde_json::json!([{
            "id": 0,
            "text": "Semantic option",
            "rawBytes": legacy_option_raw,
            "authored": false
        }]);
        let mut legacy_battle =
            crate::realmz::parse_battles(&vec![0; crate::realmz::BATTLE_BYTES])
                .into_iter()
                .next()
                .expect("legacy battle");
        legacy_battle.grid[0] = 7;
        legacy_battle.dist = -2;
        legacy_battle.message_before = 12;
        legacy_battle.message_after = 13;
        legacy_battle.battle_macro = 14;
        let mut legacy_battle_value =
            serde_json::to_value(legacy_battle).expect("serialize battle");
        legacy_battle_value["rawBytes"] =
            serde_json::json!(vec![0xa5u8; crate::realmz::BATTLE_BYTES]);
        saved["battles"] = serde_json::json!([legacy_battle_value]);
        let mut legacy_monster =
            crate::realmz::parse_monsters(&vec![0; crate::realmz::MONSTER_BYTES])
                .into_iter()
                .next()
                .expect("legacy monster");
        legacy_monster.id = 2;
        legacy_monster.hit_dice = 7;
        legacy_monster.icon_id = 321;
        legacy_monster.display_name = "Semantic legacy monster".to_string();
        let mut legacy_monster_value =
            serde_json::to_value(&legacy_monster).expect("serialize legacy monster");
        legacy_monster_value["rawBytes"] =
            serde_json::json!(vec![0xa5u8; crate::realmz::MONSTER_BYTES]);
        saved["monsters"] = serde_json::json!([legacy_monster_value]);
        legacy_monster.id = 3;
        legacy_monster.icon_id = 322;
        legacy_monster.display_name = "Semantic legacy normal monster".to_string();
        let mut legacy_set_monster_value =
            serde_json::to_value(&legacy_monster).expect("serialize legacy set monster");
        legacy_set_monster_value["rawBytes"] =
            serde_json::json!(vec![0xb6u8; crate::realmz::MONSTER_BYTES]);
        saved["monsterSets"] = serde_json::json!([{
            "sourceFile": "Data MD1",
            "setId": 1,
            "monsters": [legacy_set_monster_value]
        }]);
        saved["monsterDescriptions"] = serde_json::json!([{
            "id": 7,
            "text": "Semantic monster description",
            "rawBytes": vec![0xa5u8; crate::realmz::MONSTER_DESCRIPTION_BYTES],
            "authored": false,
            "provenance": {
                "sourceFile": "Data DES",
                "recordIndex": 7,
                "byteOffset": 7 * crate::realmz::MONSTER_DESCRIPTION_BYTES,
                "byteLength": crate::realmz::MONSTER_DESCRIPTION_BYTES,
                "confidence": "fixture-backed"
            }
        }]);
        let mut legacy_simple = crate::realmz::parse_simple_encounter_records(&vec![
            0;
            crate::realmz::SIMPLE_ENCOUNTER_BYTES
        ])
        .into_iter()
        .next()
        .expect("legacy simple encounter");
        legacy_simple.id = 8;
        legacy_simple.actions = vec![crate::project::EncounterActionRow {
            slot: 3,
            raw_code: -2,
            id: 260,
        }];
        legacy_simple.choice_results = vec![1, 2, 3, 4];
        legacy_simple.can_back_out = true;
        legacy_simple.prompt = 17;
        legacy_simple.texts[0] = "Semantic legacy choice".to_string();
        let mut legacy_simple_value =
            serde_json::to_value(legacy_simple).expect("serialize legacy simple encounter");
        legacy_simple_value["rawBytes"] =
            serde_json::json!(vec![0xa5u8; crate::realmz::SIMPLE_ENCOUNTER_BYTES]);
        saved["simpleEncounters"] = serde_json::json!([legacy_simple_value]);
        let mut legacy_spell =
            crate::realmz::parse_spell_overrides(&vec![0; crate::realmz::SPELL_BYTES])
                .into_iter()
                .next()
                .expect("legacy spell override");
        legacy_spell.id = 16;
        legacy_spell.cost = 41;
        let mut legacy_spell_value =
            serde_json::to_value(legacy_spell).expect("serialize legacy spell override");
        legacy_spell_value["rawBytes"] =
            serde_json::json!(vec![0xa5u8; crate::realmz::SPELL_BYTES]);
        saved["spellOverrides"] = serde_json::json!([legacy_spell_value]);
        fs::write(
            &project_path,
            serde_json::to_vec(&saved).expect("serialize legacy project fixture"),
        )
        .expect("write legacy project fixture");

        let opened = open_project(&project_dir).expect("open legacy project");
        assert_eq!(opened.schema_version, PROJECT_SCHEMA_VERSION);
        assert_eq!(opened.source.origin, Some(ProjectOrigin::Authored));
        assert!(opened.item_texts.is_empty());
        assert_eq!(opened.complex_encounters[0].action_result, -2);
        assert_eq!(opened.complex_encounters[0].word_result, 7);
        assert!(opened.complex_encounters[0].choice_results.is_empty());
        assert!(opened.complex_encounters[0].word_results.is_empty());
        assert_eq!(opened.complex_encounters[0].groups.len(), 8);
        assert_eq!(opened.complex_encounters[0].texts.len(), 9);
        assert_eq!(opened.thief_encounters[0].type_flags.len(), 10);
        assert!(opened.thief_encounters[0].type_flags[0]);
        assert_eq!(opened.thief_encounters[0].modifiers.len(), 8);
        assert_eq!(opened.thief_encounters[0].modifiers[0], -2);
        assert_eq!(opened.thief_encounters[0].success_codes.len(), 8);
        assert_eq!(opened.thief_encounters[0].prompts.len(), 3);
        assert_eq!(opened.thief_encounters[0].prompt_sounds.len(), 3);
        assert_eq!(opened.map_records[0].markers.len(), 10);
        assert_eq!(opened.map_records[0].markers[0].icon_id, 400);
        assert_eq!(opened.map_records[0].markers[0].x, 12);
        assert_eq!(opened.map_records[0].markers[0].y, 13);
        assert_eq!(opened.scenario_items[0].spare2.len(), 7);
        assert_eq!(opened.scenario_items[0].spare2[0], -321);
        assert_eq!(opened.treasures[0].item_ids.len(), 20);
        assert_eq!(opened.treasures[0].item_ids[0], 901);
        assert_eq!(opened.treasures[0].item_ids[1], -321);
        assert_eq!(opened.shops[0].item_ids.len(), 1000);
        assert_eq!(opened.shops[0].quantities.len(), 1000);
        assert_eq!(opened.shops[0].item_ids[..2], [901, -321]);
        assert_eq!(opened.shops[0].quantities[..2], [3, 7]);
        assert_eq!(opened.messages[0].text, "Semantic legacy message");
        assert_eq!(opened.option_labels[0].text, "Semantic option");
        assert_eq!(opened.battles[0].grid[0], 7);
        assert_eq!(opened.battles[0].dist, -2);
        assert_eq!(opened.battles[0].message_before, 12);
        assert_eq!(opened.battles[0].message_after, 13);
        assert_eq!(opened.battles[0].battle_macro, 14);
        assert_eq!(opened.monsters[0].id, 2);
        assert_eq!(opened.monsters[0].hit_dice, 7);
        assert_eq!(opened.monsters[0].icon_id, 321);
        assert_eq!(opened.monsters[0].display_name, "Semantic legacy monster");
        assert_eq!(opened.monster_sets[0].monsters[0].id, 3);
        assert_eq!(opened.monster_sets[0].monsters[0].icon_id, 322);
        assert_eq!(
            opened.monster_sets[0].monsters[0].display_name,
            "Semantic legacy normal monster"
        );
        assert_eq!(
            opened.monster_descriptions[0].text,
            "Semantic monster description"
        );
        assert_eq!(opened.simple_encounters[0].id, 8);
        assert_eq!(opened.simple_encounters[0].actions[0].slot, 3);
        assert_eq!(opened.simple_encounters[0].actions[0].raw_code, -2);
        assert_eq!(opened.simple_encounters[0].actions[0].id, 260);
        assert_eq!(opened.simple_encounters[0].choice_results, [1, 2, 3, 4]);
        assert!(opened.simple_encounters[0].can_back_out);
        assert_eq!(opened.simple_encounters[0].prompt, 17);
        assert_eq!(opened.simple_encounters[0].texts[0], "Semantic legacy choice");
        assert_eq!(opened.spell_overrides[0].id, 16);
        assert_eq!(opened.spell_overrides[0].cost, 41);
        let upgraded: serde_json::Value =
            serde_json::from_slice(&fs::read(&project_path).expect("read upgraded project"))
                .expect("parse upgraded project");
        assert_eq!(upgraded["schemaVersion"], PROJECT_SCHEMA_VERSION);
        assert_eq!(upgraded["source"]["origin"], "authored");
        assert_eq!(upgraded["itemTexts"], serde_json::json!([]));
        assert!(upgraded["complexEncounters"][0]
            .get("choiceResults")
            .is_none());
        assert!(upgraded["complexEncounters"][0]
            .get("wordResults")
            .is_none());
        assert!(upgraded["complexEncounters"][0].get("rawBytes").is_none());
        assert_eq!(
            upgraded["thiefEncounters"][0]["typeFlags"]
                .as_array()
                .unwrap()
                .len(),
            10
        );
        assert_eq!(
            upgraded["thiefEncounters"][0]["successCodes"]
                .as_array()
                .unwrap()
                .len(),
            8
        );
        assert!(upgraded["thiefEncounters"][0].get("rawBytes").is_none());
        assert!(upgraded["mapRecords"][0].get("rawBytes").is_none());
        assert!(upgraded["scenarioItems"][0].get("rawBytes").is_none());
        assert!(upgraded["treasures"][0].get("rawBytes").is_none());
        assert!(upgraded["shops"][0].get("rawBytes").is_none());
        assert!(upgraded["messages"][0].get("rawBytes").is_none());
        assert!(upgraded["optionLabels"][0].get("rawBytes").is_none());
        assert!(upgraded["battles"][0].get("rawBytes").is_none());
        assert!(upgraded["monsters"][0].get("rawBytes").is_none());
        assert!(upgraded["monsterSets"][0]["monsters"][0]
            .get("rawBytes")
            .is_none());
        assert!(upgraded["monsterDescriptions"][0].get("rawBytes").is_none());
        assert!(upgraded["simpleEncounters"][0].get("rawBytes").is_none());
        assert!(upgraded["spellOverrides"][0].get("rawBytes").is_none());
    }

    #[test]
    fn hydrates_item_texts_from_data_id_resource_fork() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source_dir = temp.path().join("Scenario");
        fs::create_dir_all(&source_dir).expect("source directory");
        let mut unidentified = vec![String::new(); 200];
        let mut identified = vec![String::new(); 200];
        let mut descriptions = vec![String::new(); 200];
        unidentified[101] = "Unknown Providence Token".to_string();
        identified[101] = "Providence Token".to_string();
        descriptions[101] = "Compiled from canonical Providence data.".to_string();
        let bytes = crate::resource_fork::write_resource_fork(&[
            crate::resource_fork::ResourceForkEntry {
                resource_type: "STR#".to_string(),
                id: 800,
                name: "Item Unidentified Names".to_string(),
                attributes: 0,
                data: crate::resource_fork::encode_string_list_resource(&unidentified),
            },
            crate::resource_fork::ResourceForkEntry {
                resource_type: "STR#".to_string(),
                id: 801,
                name: "Item Names".to_string(),
                attributes: 0,
                data: crate::resource_fork::encode_string_list_resource(&identified),
            },
            crate::resource_fork::ResourceForkEntry {
                resource_type: "STR#".to_string(),
                id: 802,
                name: "Item Descriptions".to_string(),
                attributes: 0,
                data: crate::resource_fork::encode_string_list_resource(&descriptions),
            },
        ])
        .expect("item text resource fork");
        fs::write(source_dir.join("Data ID.rsrc"), bytes).expect("write Data ID resource fork");
        let project_dir = temp.path().join("Project.providence");
        let mut project = create_project("Project".to_string(), &project_dir).expect("project");

        hydrate_item_texts(&source_dir, &mut project).expect("hydrate item texts");

        let record = project
            .item_texts
            .iter()
            .find(|record| record.item_id == 901)
            .expect("item 901 text");
        assert_eq!(record.unidentified_name, "Unknown Providence Token");
        assert_eq!(record.identified_name, "Providence Token");
        assert_eq!(
            record.description,
            "Compiled from canonical Providence data."
        );
        assert!(!record.authored);
        assert!(matches!(
            record.provenance.as_ref().unwrap().confidence,
            Confidence::SourceBacked
        ));
    }

    #[test]
    fn create_project_seeds_default_land_level_zero() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Starter.providence");
        let project = create_project("Starter".to_string(), &project_dir).expect("create project");

        let land = project
            .maps
            .iter()
            .find(|map| map.level_type == LevelType::Land && map.index == 0)
            .expect("default land level");
        assert_eq!(land.id, "land:0");
        assert_eq!(land.width, MAP_SIZE);
        assert_eq!(land.height, MAP_SIZE);
        assert_eq!(land.tiles.len(), MAP_SIZE * MAP_SIZE);
        assert!(land.tiles.iter().all(|tile| *tile == 156));
        assert_eq!(land.render.landlook, Some(0));
        assert_eq!(land.render.tileset_id, "landlook-0");
        assert!(project.random_levels.iter().any(|level| {
            level.level_type == LevelType::Land && level.level_index == 0 && level.landlook == 0
        }));
        assert!(project
            .asset_catalog
            .tilesets
            .iter()
            .any(|tileset| { tileset.id == "landlook-0" && tileset.base_tile == Some(156) }));
        assert!(
            project.validation.ok,
            "seeded new project should validate cleanly: {:?}",
            project.validation.errors
        );
        assert!(
            project_dir.join(PROJECT_FILE_NAME).is_file(),
            "created project should still be saved to disk"
        );
    }

    #[test]
    fn authored_semantic_mapping_ignores_stray_annex_and_indexes_managed_resources() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Semantic Boundary.providence");
        let mut project =
            create_project("Semantic Boundary".to_string(), &project_dir).expect("project");
        project.source.immutable = true;
        project.source.raw_sources_dir = RAW_SOURCES_DIR.to_string();
        project.assets.push(ManagedAsset {
            id: "managed:TEXT:-200:authored".to_string(),
            label: "Authored Scrolling Text".to_string(),
            kind: ManagedAssetKind::Text,
            resource_type: "TEXT".to_string(),
            resource_id: -200,
            file_name: "scrolling-text--200.txt".to_string(),
            original_path: String::new(),
            preview_path: String::new(),
            resource_path: format!(
                "data:text/plain;base64,{}",
                STANDARD.encode(b"canonical text")
            ),
            mime_type: "text/plain".to_string(),
            bytes: 14,
            sha256: "canonical".to_string(),
            width: None,
            height: None,
            duration_ms: None,
            sample_rate: None,
            channels: None,
            export_state: ManagedAssetExportState::Ready,
            library_scope: None,
            provenance: "authored test".to_string(),
            linked_entity: Some("resource:TEXT:-200".to_string()),
            conversion: None,
        });
        save_project(&project_dir, &project).expect("save authored project");

        let raw_dir = project_dir.join(RAW_SOURCES_DIR);
        fs::create_dir_all(&raw_dir).expect("create annex trap");
        let mut treasure = vec![0_u8; crate::realmz::TREASURE_BYTES];
        treasure[1] = 42;
        treasure[43] = 99;
        fs::write(raw_dir.join("Data TD"), treasure).expect("write treasure trap");
        fs::write(raw_dir.join("Data RI"), vec![0_u8; 320]).expect("write metadata trap");

        let opened = open_project(&project_dir).expect("open authored project");
        assert!(opened.scenario.restrictions.is_none());
        assert!(opened.treasures.is_empty());

        let schema = build_project_semantic_schema(&project_dir, &opened)
            .expect("build authored semantic schema");
        assert!(schema
            .entities
            .iter()
            .any(|entity| entity.id == "map:land:0"));
        assert!(schema.entities.iter().any(|entity| entity.id == "contact:0"
            && entity.summary.get("canonical") == Some(&serde_json::json!(true))));
        assert!(schema
            .entities
            .iter()
            .any(|entity| entity.id == "resource:TEXT:-200"
                && entity.editable
                && entity.summary.get("managed") == Some(&serde_json::json!(true))));
        assert!(!schema
            .entities
            .iter()
            .any(|entity| entity.id == "treasure:0"));
        assert!(!schema.sources.iter().any(|source| source.name == "Data TD"));
        assert!(schema.sources.iter().any(|source| {
            source.name == "Data CI"
                && source.path.as_deref() == Some("project.json#scenario/contactInfo")
                && source.origin == SemanticSourceOrigin::AuthoredSource
        }));
        assert!(!schema.sources.iter().any(|source| source.name == "Data RI"));
    }

    #[test]
    fn imported_semantic_mapping_retains_raw_buffer_enrichment() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Imported Semantic Boundary.providence");
        let mut project = create_project("Imported Semantic Boundary".to_string(), &project_dir)
            .expect("project");
        project.source.origin = Some(ProjectOrigin::Imported);
        project.source.immutable = true;
        project.source.raw_sources_dir = RAW_SOURCES_DIR.to_string();
        save_project(&project_dir, &project).expect("save imported project");

        let raw_dir = project_dir.join(RAW_SOURCES_DIR);
        fs::create_dir_all(&raw_dir).expect("create annex");
        let mut treasure = vec![0_u8; crate::realmz::TREASURE_BYTES];
        treasure[1] = 42;
        treasure[43] = 77;
        fs::write(raw_dir.join("Data TD"), treasure).expect("write imported treasure");
        let mut message = vec![0_u8; crate::realmz::MESSAGE_BYTES];
        message[0] = 8;
        message[1..9].copy_from_slice(b"Imported");
        fs::write(raw_dir.join("Data SD2"), message).expect("write imported message");
        let mut option_label = vec![0_u8; crate::realmz::OPTION_LABEL_BYTES];
        option_label[0] = 15;
        option_label[1..16].copy_from_slice(b"Imported option");
        fs::write(raw_dir.join("Data OD"), option_label).expect("write imported option label");
        let mut monster_description = vec![0_u8; crate::realmz::MONSTER_DESCRIPTION_BYTES];
        monster_description[0] = 16;
        monster_description[1..17].copy_from_slice(b"Imported monster");
        fs::write(raw_dir.join("Data DES"), monster_description)
            .expect("write imported monster description");
        let mut battle = vec![0_u8; crate::realmz::BATTLE_BYTES];
        battle[338] = (-4_i8) as u8;
        fs::write(raw_dir.join("Data BD"), battle).expect("write imported battle");
        let mut monster = vec![0_u8; crate::realmz::MONSTER_BYTES];
        monster[0] = 7;
        crate::realmz::write_i16_be(&mut monster, 98, 321);
        monster[170..186].copy_from_slice(b"Imported monster");
        fs::write(raw_dir.join("Data MD"), &monster).expect("write imported monster");
        monster[170..186].copy_from_slice(b"Imported normal ");
        fs::write(raw_dir.join("Data MD1"), &monster).expect("write imported normal set");
        monster[170..186].copy_from_slice(b"Imported mega   ");
        fs::write(raw_dir.join("Data MD-1"), monster).expect("write imported mega set");
        let mut shop = vec![0_u8; crate::realmz::SHOP_BYTES];
        crate::realmz::write_i16_be(&mut shop, 0, 901);
        shop[2000] = 3;
        crate::realmz::write_i16_be(&mut shop, 3000, 120);
        fs::write(raw_dir.join("Data SD"), shop).expect("write imported shop");
        let mut simple = vec![0_u8; crate::realmz::SIMPLE_ENCOUNTER_BYTES];
        simple[100] = 1;
        crate::realmz::write_i16_be(&mut simple, 104, 12);
        fs::write(raw_dir.join("Data ED"), simple).expect("write imported simple encounter");
        let mut complex = vec![0_u8; crate::realmz::COMPLEX_ENCOUNTER_BYTES];
        complex[152] = 1;
        complex[155] = 2;
        crate::realmz::write_i16_be(&mut complex, 158, 18);
        fs::write(raw_dir.join("Data ED2"), complex).expect("write imported complex encounter");
        let mut spell = vec![0_u8; crate::realmz::SPELL_BYTES];
        spell[10] = 41;
        fs::write(raw_dir.join("Data Spell"), spell).expect("write imported spell override");
        let mut race = vec![0_u8; crate::realmz::RACE_BYTES];
        crate::realmz::write_i16_be(&mut race, 196, 13);
        fs::write(raw_dir.join("Data Race"), race).expect("write imported race override");
        let mut caste = vec![0_u8; crate::realmz::CASTE_BYTES];
        crate::realmz::write_i16_be(&mut caste, 384, 222);
        fs::write(raw_dir.join("Data Caste"), caste).expect("write imported caste override");

        let schema = build_project_semantic_schema(&project_dir, &project)
            .expect("build imported semantic schema");
        let treasure = schema
            .entities
            .iter()
            .find(|entity| entity.id == "treasure:0")
            .expect("raw-enriched treasure entity");
        assert_eq!(treasure.summary.get("gold"), Some(&serde_json::json!(77)));
        assert_eq!(treasure.edit_state, SemanticEditState::InspectOnly);
        assert!(matches!(treasure.confidence, Confidence::SourceBacked));
        assert!(!treasure.editable);
        assert!(!treasure.summary.contains_key("canonical"));
        assert!(schema.sources.iter().any(|source| source.name == "Data TD"));
        for entity_id in [
            "message:0",
            "option-label:0",
            "monster-description:0",
            "battle:0",
            "monster:0",
            "monster-set:1:0",
            "monster-set:-1:0",
            "shop:0",
            "encounter:simple:0",
            "encounter:complex:0",
            "spell-override:0",
            "race-override:0",
            "caste-override:0",
        ] {
            let entity = schema
                .entities
                .iter()
                .find(|entity| entity.id == entity_id)
                .unwrap_or_else(|| panic!("imported entity {entity_id}"));
            assert_eq!(entity.edit_state, SemanticEditState::InspectOnly);
            assert!(matches!(entity.confidence, Confidence::SourceBacked));
            assert!(!entity.editable);
            assert!(!entity.summary.contains_key("canonical"));
        }
    }

    #[test]
    fn authored_semantic_mapping_indexes_canonical_record_collections_without_sparse_slots() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Canonical Supporting Records.providence");
        let mut project = create_project("Canonical Supporting Records".to_string(), &project_dir)
            .expect("project");
        let shell = project
            .scenario
            .shell
            .as_mut()
            .expect("fresh scenario shell");
        shell.look_x = 12;
        shell.raw_bytes = vec![0xa5; 320];
        shell.trailing_bytes = vec![0xde, 0xad, 0xbe, 0xef];
        shell.authored = false;

        let contact = project
            .scenario
            .contact_info
            .as_mut()
            .expect("fresh contact info");
        contact.scenario_name = "Canonical contact".to_string();
        contact.description = "Canonical contact description".to_string();
        contact.authored = false;
        contact.raw_bytes = vec![0xa5; crate::realmz::SCENARIO_CONTACT_INFO_BYTES];
        let mut restrictions = crate::realmz::parse_scenario_restrictions(&vec![
            0;
            crate::realmz::SCENARIO_RESTRICTIONS_BYTES
        ])
        .expect("restriction template");
        restrictions.description = "No giants".to_string();
        restrictions.max_party_characters = 4;
        restrictions.max_party_level = 20;
        restrictions.banned_races = vec![1, 30];
        restrictions.banned_castes = vec![2, 29];
        restrictions.authored = false;
        restrictions.raw_bytes.fill(0xa5);
        project.scenario.restrictions = Some(restrictions);
        let mut global_hooks = crate::realmz::parse_global_macro_hooks(&vec![
                0xa5;
                crate::realmz::GLOBAL_MACRO_HOOK_BYTES
            ]);
        global_hooks.slots[0].door = 11;
        project.scenario.global_macro_hooks = Some(global_hooks);

        let mut item = crate::realmz::parse_scenario_items(&vec![0; crate::realmz::ITEM_BYTES])
            .into_iter()
            .next()
            .expect("item template");
        item.id = 4;
        item.item_id = 901;
        item.icon_id = 321;
        item.cost = 45;
        item.authored = false;
        project.scenario_items = vec![item];

        let mut message = crate::realmz::parse_messages(&vec![0; crate::realmz::MESSAGE_BYTES])
            .into_iter()
            .next()
            .expect("message template");
        message.id = 5;
        message.text = "Canonical message".to_string();
        message.authored = false;
        project.messages = vec![message];

        let mut option_label =
            crate::realmz::parse_option_labels(&vec![0; crate::realmz::OPTION_LABEL_BYTES])
                .into_iter()
                .next()
                .expect("option-label template");
        option_label.id = 6;
        option_label.text = "Canonical option".to_string();
        option_label.authored = false;
        project.option_labels = vec![option_label];

        let mut monster_description = crate::realmz::parse_monster_descriptions(&vec![
            0;
            crate::realmz::MONSTER_DESCRIPTION_BYTES
        ])
        .into_iter()
        .next()
        .expect("monster-description template");
        monster_description.id = 7;
        monster_description.text = "Canonical monster description".to_string();
        monster_description.authored = false;
        project.monster_descriptions = vec![monster_description];

        let mut battle = crate::realmz::parse_battles(&vec![0; crate::realmz::BATTLE_BYTES])
            .into_iter()
            .next()
            .expect("battle template");
        battle.id = 3;
        battle.grid[0] = 2;
        battle.dist = -4;
        battle.message_before = 5;
        battle.authored = false;
        project.battles = vec![battle];

        let mut monster = crate::realmz::parse_monsters(&vec![0; crate::realmz::MONSTER_BYTES])
            .into_iter()
            .next()
            .expect("monster template");
        monster.id = 2;
        monster.hit_dice = 7;
        monster.icon_id = 321;
        monster.exp = 88;
        monster.display_name = "Canonical monster".to_string();
        monster.authored = false;
        project.monsters = vec![monster];

        let mut normal_set =
            crate::realmz::parse_monster_set(&vec![0; crate::realmz::MONSTER_BYTES], "Data MD1", 1);
        normal_set.monsters[0].id = 1;
        normal_set.monsters[0].icon_id = 322;
        normal_set.monsters[0].death_macro = 11;
        normal_set.monsters[0].display_name = "Canonical normal monster".to_string();
        normal_set.monsters[0].authored = false;
        let mut mega_set = crate::realmz::parse_monster_set(
            &vec![0; crate::realmz::MONSTER_BYTES],
            "Data MD-1",
            -1,
        );
        mega_set.monsters[0].id = 2;
        mega_set.monsters[0].icon_id = 323;
        mega_set.monsters[0].death_macro = 12;
        mega_set.monsters[0].display_name = "Canonical mega monster".to_string();
        mega_set.monsters[0].authored = false;
        project.monster_sets = vec![normal_set, mega_set];

        let mut shop = crate::realmz::parse_shops(&vec![0; crate::realmz::SHOP_BYTES])
            .into_iter()
            .next()
            .expect("shop template");
        shop.id = 2;
        shop.item_ids = [vec![901], vec![0; 999]].concat();
        shop.quantities = [vec![3], vec![0; 999]].concat();
        shop.inflation = 120;
        shop.authored = false;
        project.shops = vec![shop];

        let mut simple = crate::realmz::parse_simple_encounter_records(&vec![
            0;
            crate::realmz::SIMPLE_ENCOUNTER_BYTES
        ])
        .into_iter()
        .next()
        .expect("simple encounter template");
        simple.id = 2;
        simple.can_back_out = true;
        simple.prompt = 12;
        simple.texts[0] = "A simple choice".to_string();
        simple.authored = false;
        project.simple_encounters = vec![simple];

        let mut complex = crate::realmz::parse_complex_encounter_records(&vec![
            0;
            crate::realmz::COMPLEX_ENCOUNTER_BYTES
        ])
        .into_iter()
        .next()
        .expect("complex encounter template");
        complex.id = 4;
        complex.thief = true;
        complex.thief_success = 2;
        complex.prompt = 18;
        complex.texts[0] = "A complex choice".to_string();
        complex.authored = false;
        project.complex_encounters = vec![complex];

        let mut treasure = crate::realmz::parse_treasures(&vec![0; crate::realmz::TREASURE_BYTES])
            .into_iter()
            .next()
            .expect("treasure template");
        treasure.id = 3;
        treasure.item_ids = vec![0; 20];
        treasure.item_ids[0] = 901;
        treasure.gold = 77;
        treasure.authored = false;
        project.treasures = vec![treasure];

        let mut thief =
            crate::realmz::parse_thief_encounters(&vec![0; crate::realmz::THIEF_ENCOUNTER_BYTES])
                .into_iter()
                .next()
                .expect("thief template");
        thief.id = 2;
        thief.type_flags[0] = true;
        thief.prompts[0] = 17;
        thief.authored = false;
        project.thief_encounters = vec![thief];

        let mut timed =
            crate::realmz::parse_timed_encounters(&vec![0; crate::realmz::TIMED_ENCOUNTER_BYTES])
                .into_iter()
                .next()
                .expect("timed template");
        timed.id = 3;
        timed.day = 5;
        timed.required_item = 901;
        timed.required_quest = 6;
        timed.location_kind = crate::project::TimedEncounterLocationKind::Land;
        timed.authored = false;
        project.timed_encounters = vec![timed];

        let mut spell = crate::realmz::parse_spell_overrides(&vec![0; crate::realmz::SPELL_BYTES])
            .into_iter()
            .next()
            .expect("spell template");
        spell.id = 16;
        spell.cost = 41;
        spell.authored = false;
        project.spell_overrides = vec![spell];

        let mut race = crate::realmz::parse_race_overrides(&vec![0; crate::realmz::RACE_BYTES])
            .into_iter()
            .next()
            .expect("race template");
        race.id = 2;
        race.base_move = 13;
        race.authored = false;
        race.raw_bytes.fill(0xA5);
        project.race_overrides = vec![race];

        let mut caste = crate::realmz::parse_caste_overrides(&vec![0; crate::realmz::CASTE_BYTES])
            .into_iter()
            .next()
            .expect("caste template");
        caste.id = 3;
        caste.start_money = 222;
        caste.authored = false;
        caste.raw_bytes.fill(0xA5);
        project.caste_overrides = vec![caste];

        let schema = build_project_semantic_schema(&project_dir, &project)
            .expect("build authored semantic schema");
        for entity_id in [
            "message:5",
            "option-label:6",
            "monster-description:7",
            "battle:3",
            "monster:2",
            "monster-set:1:1",
            "monster-set:-1:2",
            "shop:2",
            "encounter:simple:2",
            "encounter:complex:4",
            "item:901",
            "treasure:3",
            "thief:2",
            "time:3",
            "spell-override:16",
            "race-override:2",
            "caste-override:3",
            "contact:0",
            "restriction:0",
            "global:0",
        ] {
            let entity = schema
                .entities
                .iter()
                .find(|entity| entity.id == entity_id)
                .unwrap_or_else(|| panic!("canonical entity {entity_id}"));
            assert_eq!(entity.edit_state, SemanticEditState::Editable);
            assert!(matches!(entity.confidence, Confidence::Confirmed));
            assert!(entity.editable);
            assert_eq!(
                entity.summary.get("canonical"),
                Some(&serde_json::json!(true))
            );
            let record = schema
                .records
                .iter()
                .find(|record| Some(&record.id) == entity.record_ref.as_ref())
                .unwrap_or_else(|| panic!("canonical record for {entity_id}"));
            assert_eq!(record.edit_state, SemanticEditState::Editable);
            assert!(matches!(record.confidence, Confidence::Confirmed));
            assert_eq!(
                record.summary.get("canonical"),
                Some(&serde_json::json!(true))
            );
        }
        for entity_id in [
            "message:0",
            "option-label:0",
            "monster-description:0",
            "battle:0",
            "monster:0",
            "monster-set:1:0",
            "monster-set:-1:0",
            "shop:0",
            "encounter:simple:0",
            "encounter:complex:0",
            "item:800",
            "treasure:0",
            "thief:0",
            "time:0",
            "spell-override:0",
            "race-override:0",
            "caste-override:0",
        ] {
            assert!(
                !schema.entities.iter().any(|entity| entity.id == entity_id),
                "sparse compiler slot {entity_id} must not become a semantic entity"
            );
        }
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "treasure:3")
                .and_then(|entity| entity.summary.get("gold")),
            Some(&serde_json::json!(77))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "message:5")
                .and_then(|entity| entity.summary.get("text")),
            Some(&serde_json::json!("Canonical message"))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "option-label:6")
                .and_then(|entity| entity.summary.get("text")),
            Some(&serde_json::json!("Canonical option"))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "monster-description:7")
                .and_then(|entity| entity.summary.get("text")),
            Some(&serde_json::json!("Canonical monster description"))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "battle:3")
                .and_then(|entity| entity.summary.get("dist")),
            Some(&serde_json::json!(-4))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "monster:2")
                .and_then(|entity| entity.summary.get("name")),
            Some(&serde_json::json!("Canonical monster"))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "shop:2")
                .and_then(|entity| entity.summary.get("inflation")),
            Some(&serde_json::json!(120))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "encounter:simple:2")
                .and_then(|entity| entity.summary.get("prompt")),
            Some(&serde_json::json!(12))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "spell-override:16")
                .and_then(|entity| entity.summary.get("cost")),
            Some(&serde_json::json!(41))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "race-override:2")
                .and_then(|entity| entity.summary.get("baseMove")),
            Some(&serde_json::json!(13))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "caste-override:3")
                .and_then(|entity| entity.summary.get("startMoney")),
            Some(&serde_json::json!(222))
        );
        assert!(schema.links.iter().any(|link| {
            link.from == "encounter:complex:4"
                && link.to == "thief:2"
                && link.kind == "uses_thief_encounter"
        }));
        for (from, to, kind) in [
            ("battle:3", "monster:2", "uses_monster"),
            ("battle:3", "message:5", "shows_message_before"),
            ("monster:2", "resource:cicn:321", "uses_resource"),
            ("monster-set:1:1", "resource:cicn:322", "uses_resource"),
            ("monster-set:-1:2", "resource:cicn:323", "uses_resource"),
            ("monster-set:1:1", "macro:11", "calls_macro"),
            ("monster-set:-1:2", "macro:12", "calls_macro"),
            ("global:0", "macro:11", "calls_macro"),
        ] {
            assert!(schema
                .links
                .iter()
                .any(|link| link.from == from && link.to == to && link.kind == kind));
        }
        for (source, path) in [
            ("Data SD2", "project.json#messages"),
            ("Data OD", "project.json#optionLabels"),
            ("Data DES", "project.json#monsterDescriptions"),
            ("Data BD", "project.json#battles"),
            ("Data MD", "project.json#monsters"),
            ("Data MD1", "project.json#monsterSets/1"),
            ("Data MD-1", "project.json#monsterSets/-1"),
            ("Data SD", "project.json#shops"),
            ("Data ED", "project.json#simpleEncounters"),
            ("Data ED2", "project.json#complexEncounters"),
            ("Data NI", "project.json#scenarioItems"),
            ("Data TD", "project.json#treasures"),
            ("Data TD2", "project.json#thiefEncounters"),
            ("Data TD3", "project.json#timedEncounters"),
            ("Data Spell", "project.json#spellOverrides"),
            ("Data Race", "project.json#raceOverrides"),
            ("Data Caste", "project.json#casteOverrides"),
            (
                "Canonical Supporting Records",
                "project.json#scenario/shell",
            ),
            ("Data CS", "project.json#scenario/shell"),
            ("Data CI", "project.json#scenario/contactInfo"),
            ("Data RI", "project.json#scenario/restrictions"),
            ("Global", "project.json#scenario/globalMacroHooks"),
        ] {
            let source = schema
                .sources
                .iter()
                .find(|candidate| candidate.name == source)
                .unwrap_or_else(|| panic!("canonical source {source}"));
            assert_eq!(source.path.as_deref(), Some(path));
            assert!(matches!(source.confidence, Confidence::Confirmed));
            assert_eq!(source.origin, SemanticSourceOrigin::AuthoredSource);
        }
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.entity_type == "scenario-startup")
                .and_then(|entity| entity.summary.get("lookX")),
            Some(&serde_json::json!(12))
        );
        assert!(schema.entities.iter().any(|entity| {
            entity.entity_type == "scenario-startup"
                && entity.editable
                && entity.edit_state == SemanticEditState::Editable
                && matches!(entity.confidence, Confidence::Confirmed)
                && entity.summary.get("canonical") == Some(&serde_json::json!(true))
        }));
        assert!(schema.entities.iter().any(|entity| {
            entity.entity_type == "registration-security"
                && entity.editable
                && entity.edit_state == SemanticEditState::Editable
                && matches!(entity.confidence, Confidence::Confirmed)
                && entity.summary.get("canonical") == Some(&serde_json::json!(true))
        }));
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "contact:0")
                .and_then(|entity| entity.summary.get("scenarioName")),
            Some(&serde_json::json!("Canonical contact"))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "restriction:0")
                .and_then(|entity| entity.summary.get("bannedRaceCount")),
            Some(&serde_json::json!(2))
        );
        assert_eq!(
            schema
                .entities
                .iter()
                .find(|entity| entity.id == "global:0")
                .and_then(|entity| entity.summary.get("activeSlots"))
                .and_then(serde_json::Value::as_array)
                .and_then(|slots| slots.first())
                .and_then(|slot| slot.get("door")),
            Some(&serde_json::json!(11))
        );
        for (source, bytes) in [
            (
                "Data Spell",
                crate::realmz::SPELL_OVERRIDE_RECORDS * crate::realmz::SPELL_BYTES,
            ),
            (
                "Data Race",
                crate::realmz::RACE_OVERRIDE_RECORDS * crate::realmz::RACE_BYTES,
            ),
            (
                "Data Caste",
                crate::realmz::CASTE_OVERRIDE_RECORDS * crate::realmz::CASTE_BYTES,
            ),
        ] {
            assert_eq!(
                schema
                    .sources
                    .iter()
                    .find(|candidate| candidate.name == source)
                    .map(|source| source.bytes),
                Some(bytes as u64)
            );
        }
    }

    #[test]
    fn create_project_exports_complete_runtime_baseline_without_raw_sources() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Starter.providence");
        let mut project =
            create_project("Starter".to_string(), &project_dir).expect("create project");
        let raw_dir = project_dir.join(RAW_SOURCES_DIR);
        assert!(
            !raw_dir.exists(),
            "fresh projects must not create a preservation annex"
        );
        assert!(project.source.raw_sources_dir.is_empty());
        assert!(project.source.files.is_empty());
        assert!(!project.source.immutable);
        assert_eq!(project.source.origin, Some(ProjectOrigin::Authored));

        // Origin, not legacy snapshot flags or a stray directory, owns the compiler boundary.
        project.source.immutable = true;
        project.source.raw_sources_dir = RAW_SOURCES_DIR.to_string();
        fs::create_dir_all(&raw_dir).expect("create authored annex trap");
        fs::write(
            raw_dir.join("Data NI"),
            vec![0xA5_u8; 200 * crate::realmz::ITEM_BYTES + 1],
        )
        .expect("write authored annex tail-read trap");
        fs::write(raw_dir.join("ANNEX READ TRAP"), [1_u8, 2, 3])
            .expect("write authored annex pass-through trap");

        let mut item = crate::realmz::parse_scenario_items(&vec![0; crate::realmz::ITEM_BYTES])
            .into_iter()
            .next()
            .expect("blank item record");
        item.authored = true;
        item.item_id = 901;
        project.scenario_items.push(item);

        let output_dir = temp.path().join("Starter");
        let report = crate::exporter::export_project(
            &project_dir,
            &project,
            &output_dir,
            ScenarioTarget::WindowsRealmzFolder,
        )
        .expect("export generated project");
        assert!(report.pass_through_files.is_empty());
        assert_eq!(
            fs::metadata(output_dir.join("Data NI"))
                .expect("generated item table")
                .len() as usize,
            200 * crate::realmz::ITEM_BYTES,
            "authored compilation must not preserve a malformed tail from a stray annex"
        );
        assert!(
            !output_dir.join("ANNEX READ TRAP").exists(),
            "authored compilation must not enumerate a stray annex"
        );
        for (name, expected_bytes) in [
            ("Starter", 316),
            ("Scenario", 600),
            ("Data CS", 316),
            ("Data DD", crate::realmz::DOOR_LEVEL_BYTES),
            ("Data DDD", 0),
            ("Data LD", FIELD_BYTES),
            ("Data DL", 0),
            ("Data RD", RANDLEVEL_BYTES),
            ("Data RDD", 0),
            ("Data SD", 0),
            ("Data TD2", 0),
            ("Data TD3", 0),
            ("Data ED", 0),
            ("Data ED2", 0),
            ("Data MD", 0),
            ("Data Solids", 1024),
        ] {
            assert_eq!(
                fs::metadata(output_dir.join(name))
                    .unwrap_or_else(|_| panic!("missing generated runtime file {name}"))
                    .len() as usize,
                expected_bytes,
                "unexpected generated size for {name}"
            );
        }
        let resource_bytes = fs::read(output_dir.join("Scenario.rsrc")).expect("resource fork");
        assert!(
            resource_bytes.len() >= 46,
            "empty resource fork should be structurally valid"
        );
        assert!(crate::resource_fork::parse_resource_fork_entries(&resource_bytes).is_empty());

        let repeat_output_dir = temp.path().join("Starter Repeat");
        crate::exporter::export_project(
            &project_dir,
            &project,
            &repeat_output_dir,
            ScenarioTarget::WindowsRealmzFolder,
        )
        .expect("repeat generated project export");
        assert_eq!(
            flat_file_bytes(&output_dir),
            flat_file_bytes(&repeat_output_dir),
            "fresh compilation should be byte-deterministic"
        );

        let classic_output_dir = temp.path().join("Starter Classic");
        let classic_report = crate::exporter::export_project(
            &project_dir,
            &project,
            &classic_output_dir,
            ScenarioTarget::MacClassicFolder,
        )
        .expect("export generated project for classic Realmz");
        assert!(classic_report.pass_through_files.is_empty());
        assert_eq!(
            fs::metadata(classic_output_dir.join("Scenario"))
                .expect("classic Scenario support file")
                .len(),
            600
        );
        assert!(classic_output_dir.join("Scenario.rsrc").is_file());

        let reimport_dir = temp.path().join("Reimported.providence");
        let mut reimported =
            import_scenario(&output_dir, &reimport_dir).expect("reimport generated export");
        assert_eq!(reimported.source.origin, Some(ProjectOrigin::Imported));
        assert_eq!(
            reimported
                .maps
                .iter()
                .filter(|map| map.level_type == LevelType::Land)
                .count(),
            1
        );

        // Imported origin still requires the annex even if legacy flags are cleared.
        reimported.source.immutable = false;
        reimported.source.files.clear();
        fs::remove_dir_all(reimport_dir.join(RAW_SOURCES_DIR)).expect("remove imported annex");
        let error = crate::exporter::export_project(
            &reimport_dir,
            &reimported,
            temp.path().join("Unsafe re-export"),
            ScenarioTarget::WindowsRealmzFolder,
        )
        .expect_err("imported projects must retain their preservation annex");
        assert!(error.to_string().contains("Missing raw source snapshot"));
    }

    #[test]
    fn copy_project_template_payloads_preserves_generated_project_metadata() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source_dir = temp.path().join("Template.providence");
        let target_dir = temp.path().join("Generated.providence");
        create_project("Template".to_string(), &source_dir).expect("create template");
        create_project("Generated".to_string(), &target_dir).expect("create generated project");
        fs::create_dir_all(source_dir.join(RAW_SOURCES_DIR).join("nested"))
            .expect("create raw source fixture");
        fs::write(
            source_dir
                .join(RAW_SOURCES_DIR)
                .join("nested")
                .join("Data LD"),
            [1_u8, 2, 3, 4],
        )
        .expect("write raw source fixture");
        fs::create_dir_all(source_dir.join(ASSETS_DIR).join(ICONS_DIR))
            .expect("create asset fixture");
        fs::write(
            source_dir
                .join(ASSETS_DIR)
                .join(ICONS_DIR)
                .join("fixture.bin"),
            [5_u8, 6, 7],
        )
        .expect("write asset fixture");
        let target_project_json = fs::read(target_dir.join(PROJECT_FILE_NAME))
            .expect("read target project json before copy");

        copy_project_template_payloads(&source_dir, &target_dir).expect("copy template payloads");

        assert_eq!(
            fs::read(
                target_dir
                    .join(RAW_SOURCES_DIR)
                    .join("nested")
                    .join("Data LD")
            )
            .expect("read copied raw source"),
            vec![1_u8, 2, 3, 4]
        );
        assert_eq!(
            fs::read(
                target_dir
                    .join(ASSETS_DIR)
                    .join(ICONS_DIR)
                    .join("fixture.bin")
            )
            .expect("read copied asset"),
            vec![5_u8, 6, 7]
        );
        assert_eq!(
            fs::read(target_dir.join(PROJECT_FILE_NAME))
                .expect("read target project json after copy"),
            target_project_json,
            "template payload copy must not replace generated project metadata"
        );
        assert!(
            copy_project_template_payloads(&target_dir, &target_dir).is_err(),
            "template copy must reject identical source and target directories"
        );
    }

    #[test]
    fn read_scenario_shell_falls_back_to_mismatched_marker_names() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(temp.path().join("Scenario"), vec![0; 600]).expect("write support file");
        fs::write(temp.path().join("Custom 1 Music"), vec![0; 60_224]).expect("write custom music");

        let mut marker = vec![0; 316];
        marker[0..4].copy_from_slice(&70_i32.to_be_bytes());
        marker[4..8].copy_from_slice(&55_i32.to_be_bytes());
        fs::write(temp.path().join("Prince of Darkness"), marker).expect("write marker");

        let shell = read_scenario_shell(temp.path(), "Prince Of Darkness v1.6")
            .expect("read shell")
            .expect("fallback shell");
        assert_eq!(shell.source_file, "Prince of Darkness");
        assert_eq!(shell.rec_level, 70);
        assert_eq!(shell.max_level, 55);
    }

    #[test]
    fn save_project_omits_derived_semantic_schema() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Semantic Omit.providence");
        let mut project =
            create_project("Semantic Omit".to_string(), &project_dir).expect("create project");
        project.monster_icon_overrides.push(MonsterIconOverride {
            target_base_icon_id: 385,
            source_base_icon_id: 371,
            source_label: Some("Test Monster Mash Pair".to_string()),
            source_kind: MonsterIconOverrideSource::ProvidenceLibrary,
            source_base_resource_base64: "AAAA".to_string(),
            source_paired_resource_base64: "BBBB".to_string(),
            imported: true,
        });
        project.scenario_icon_resources.push(ScenarioIconResource {
            resource_id: 501,
            label: "Test scenario icon".to_string(),
            source_kind: ScenarioIconResourceSource::ProvidenceLibrary,
            resource_base64: "CCCC".to_string(),
            preview_path: None,
            imported: true,
        });
        project.semantic_schema.schema_version = 999;
        project.semantic_schema.entities.push(SemanticEntity {
            id: "derived:test".to_string(),
            entity_type: "derived".to_string(),
            label: "Derived Test".to_string(),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "test".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: BTreeMap::new(),
        });
        assert!(
            serde_json::to_string(&project)
                .expect("serialize project response")
                .contains("semanticSchema"),
            "live project serialization should keep semantic schema for app responses"
        );
        save_project(&project_dir, &project).expect("save project");
        let text =
            fs::read_to_string(project_dir.join(PROJECT_FILE_NAME)).expect("read project json");
        assert!(
            !text.contains("semanticSchema"),
            "project.json should not persist derived semantic schema"
        );
        assert!(
            text.contains("monsterIconOverrides") && text.contains("scenarioIconResources"),
            "project.json should persist authored icon override/resource intent"
        );
        let reopened = open_project(&project_dir).expect("open project");
        assert_eq!(reopened.monster_icon_overrides.len(), 1);
        assert_eq!(
            reopened.monster_icon_overrides[0].source_base_resource_base64,
            "AAAA"
        );
        assert_eq!(reopened.scenario_icon_resources.len(), 1);
        assert_eq!(reopened.scenario_icon_resources[0].resource_base64, "CCCC");
    }

    #[test]
    fn import_scenario_rejects_non_scenario_project_package() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("Empty.providence");
        fs::create_dir_all(source.join(RAW_SOURCES_DIR)).expect("create raw sources");
        fs::write(source.join(PROJECT_FILE_NAME), "{}").expect("write project json");
        let target = temp.path().join("Imported.providence");

        let error = import_scenario(&source, &target)
            .expect_err("project packages should not import as scenarios");
        let message = error.to_string();
        assert!(
            message.contains("Providence project package"),
            "unexpected error: {message}"
        );
        assert!(
            !target.join(PROJECT_FILE_NAME).exists(),
            "invalid scenario imports should not save an empty project"
        );
    }

    #[test]
    fn import_scenario_rejects_empty_source_folder() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("Not A Scenario");
        fs::create_dir_all(&source).expect("create source");
        let target = temp.path().join("Imported.providence");

        let error = import_scenario(&source, &target)
            .expect_err("empty folders should not import as scenarios");
        let message = error.to_string();
        assert!(
            message.contains("No Realmz scenario data files"),
            "unexpected error: {message}"
        );
        assert!(
            !target.join(PROJECT_FILE_NAME).exists(),
            "invalid scenario imports should not save an empty project"
        );
    }
}
