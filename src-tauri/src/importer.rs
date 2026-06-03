use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use crate::project::*;
use crate::realmz::{parse_scenario_buffers, ParsedScenario, SUPPORTED_WRITE_FILES, TRACKED_FILES};
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
pub const SOUNDS_DIR: &str = "sounds";
const REFERENCE_UTILITY_ROOT: &str = "F:/Realmz Scenario Utility";

pub fn create_project(
    project_name: String,
    project_dir: impl AsRef<Path>,
) -> Result<ProvidenceProject> {
    let (project_name, project_dir) = unique_project_target(&project_name, project_dir.as_ref());
    fs::create_dir_all(&project_dir).with_path(&project_dir)?;
    fs::create_dir_all(project_dir.join(RAW_SOURCES_DIR))
        .with_path(project_dir.join(RAW_SOURCES_DIR))?;
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
            contact_info: Some(default_contact_info(&project_name)),
            restrictions: None,
            global_macro_hooks: None,
            security_backup: None,
        },
        source: SourceSnapshot {
            source_path: String::new(),
            raw_sources_dir: RAW_SOURCES_DIR.to_string(),
            files: Vec::new(),
            immutable: true,
        },
        maps: Vec::new(),
        land_layout: None,
        map_records: Vec::new(),
        tile_attributes: Vec::new(),
        custom_landlooks: Vec::new(),
        triggers: Vec::new(),
        random_levels: Vec::new(),
        extracodes: Vec::new(),
        messages: Vec::new(),
        option_labels: Vec::new(),
        battles: Vec::new(),
        monsters: Vec::new(),
        monster_sets: Vec::new(),
        monster_descriptions: Vec::new(),
        scenario_items: Vec::new(),
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
        assets: Vec::new(),
        asset_catalog: AssetCatalog::default(),
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
            contact_info,
            restrictions,
            global_macro_hooks,
            security_backup,
        },
        source: SourceSnapshot {
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
        scenario_items: parsed.scenario_items,
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
        assets: Vec::new(),
        asset_catalog: parsed.asset_catalog,
        editor_metadata: EditorMetadata::default(),
        records: parsed.records,
        diagnostics: parsed.diagnostics,
        semantic_schema: SemanticSchema::default(),
        validation: ValidationReport::default(),
    };
    hydrate_custom_spell_names(&source_path, &mut project)?;
    import_tile_atlases(&source_path, &assets_dir, &mut project)?;
    import_icon_overlays(&source_path, &assets_dir, &mut project)?;
    import_sound_assets(&source_path, &assets_dir, &mut project)?;
    build_semantic_schema_from_raw_sources(project_dir, &mut project)?;
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
    let project_path = project_dir.join(PROJECT_FILE_NAME);
    let text = fs::read_to_string(&project_path).with_path(&project_path)?;
    let mut project: ProvidenceProject =
        serde_json::from_str(&text).with_json_path(project_path)?;
    backfill_tileset_metadata(&mut project);
    ensure_reference_tile_attributes(&mut project)?;
    hydrate_scenario_metadata(project_dir, &mut project)?;
    let raw_dir = project_dir.join(if project.source.raw_sources_dir.is_empty() {
        RAW_SOURCES_DIR
    } else {
        project.source.raw_sources_dir.as_str()
    });
    hydrate_custom_spell_names(&raw_dir, &mut project)?;
    refresh_custom_tile_atlases(project_dir, &mut project)?;
    import_icon_overlays(&raw_dir, &project_dir.join(ASSETS_DIR), &mut project)?;
    import_sound_assets(&raw_dir, &project_dir.join(ASSETS_DIR), &mut project)?;
    save_project(project_dir, &project)?;
    Ok(project)
}

pub fn save_project(project_dir: impl AsRef<Path>, project: &ProvidenceProject) -> Result<()> {
    let project_dir = project_dir.as_ref();
    fs::create_dir_all(project_dir).with_path(project_dir)?;
    let project_path = project_dir.join(PROJECT_FILE_NAME);
    let file = fs::File::create(&project_path).with_path(&project_path)?;
    let writer = BufWriter::new(file);
    serde_json::to_writer(writer, &ProjectFile::from(project)).with_json_path(&project_path)
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
    scenario_items: &'a [ScenarioItemRecord],
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
            scenario_items: &project.scenario_items,
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

fn build_semantic_schema_from_raw_sources(
    project_dir: &Path,
    project: &mut ProvidenceProject,
) -> Result<()> {
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

fn build_semantic_schema(
    project: &mut ProvidenceProject,
    buffers: &BTreeMap<String, Vec<u8>>,
) {
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
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&path).with_path(&path)?;
    crate::realmz::parse_scenario_shell(scenario_name, &bytes).map(Some)
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
        project
            .source
            .files
            .iter()
            .find(|file| {
                !is_resource_file_name(&file.name)
                    && !TRACKED_FILES.iter().any(|tracked| *tracked == file.name)
            })
            .map(|file| file.name.as_str()),
    ];
    for candidate in candidates.into_iter().flatten() {
        let path = raw_dir.join(candidate);
        if path.is_file() {
            let bytes = fs::read(&path).with_path(&path)?;
            return crate::realmz::parse_scenario_shell(candidate, &bytes).map(Some);
        }
    }
    Ok(None)
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
    for base in [
        Path::new("public")
            .join("bundled-libraries")
            .join("realmz-reference"),
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("public")
            .join("bundled-libraries")
            .join("realmz-reference"),
        Path::new(REFERENCE_UTILITY_ROOT)
            .join("assets")
            .join("realmz")
            .join("resources")
            .join("binary"),
        Path::new("F:\\Realmz\\base\\Realmz\\Data Files").to_path_buf(),
    ] {
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
        let role =
            if supported.contains(name) || is_scenario_marker_source(source_path, name, &bytes) {
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
        if existing_names.contains(&resource_name) || files.iter().any(|file| file.name == resource_name) {
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

fn is_resource_file_name(name: &str) -> bool {
    name == "Scenario"
        || name.ends_with(".rsrc")
        || name.ends_with(".rsf")
        || name.starts_with("._")
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
    let referenced_icon_ids = map_icon_ids(&project.maps);
    let reference_icon_dir = Path::new(REFERENCE_UTILITY_ROOT)
        .join("assets")
        .join("realmz")
        .join("resources")
        .join("icons");
    if reference_icon_dir.is_dir() {
        for icon_id in &referenced_icon_ids {
            let file_name = format!("icon_{icon_id}.png");
            let path = reference_icon_dir.join(&file_name);
            if !path.is_file() {
                continue;
            }
            let dest = icon_dir.join(&file_name);
            fs::copy(&path, &dest).with_path(&dest)?;
        }
    }
    import_scenario_icon_overlays(source_path, &icon_dir, &referenced_icon_ids, project)?;
    project
        .diagnostics
        .retain(|diagnostic| diagnostic.code != "missing-map-icon-overlay");
    let mut missing = BTreeSet::new();
    for icon_id in referenced_icon_ids {
        let file_name = format!("icon_{icon_id}.png");
        if !icon_dir.join(&file_name).is_file() {
            missing.insert(icon_id);
        }
    }
    if !missing.is_empty() {
        project.diagnostics.push(Diagnostic {
            severity: DiagnosticSeverity::Warning,
            code: "missing-map-icon-overlay".to_string(),
            message: format!(
                "{} map icon overlay(s) referenced by Realmz special field values were not found in the Scenario Utility reference assets or scenario resources: {}",
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
                    code: "unsupported-map-icon-overlay".to_string(),
                    message: format!(
                        "Scenario cicn {} in {} could not be decoded as a map icon overlay: {}",
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
                    code: "unsupported-map-icon-overlay".to_string(),
                    message: format!(
                        "Scenario cicn {} decoded, but did not produce a PNG map icon overlay",
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
    }
    project
        .asset_catalog
        .icons
        .sort_by_key(|asset| asset.resource_id);
    Ok(())
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

fn normalize_icon_id(value: i16) -> Option<i16> {
    if value >= 0 {
        let icon_id = normalize_realmz_field_state(value);
        return (379..900).contains(&icon_id).then_some(icon_id);
    }
    let mut icon_id = value;
    while icon_id < -999 {
        icon_id += 1000;
    }
    Some(icon_id)
}

fn normalize_realmz_field_state(value: i16) -> i16 {
    let mut tile = clear_realmz_short_bit(value, 1);
    tile = clear_realmz_short_bit(tile, 2);
    while tile > 999 {
        tile -= 1000;
    }
    tile
}

fn clear_realmz_short_bit(value: i16, bit: u8) -> i16 {
    let cleared = (value as u16) & !(1u16 << (15 - bit));
    cleared as i16
}

fn atlas_source_path(source_path: &Path, tileset: &TilesetAsset) -> Option<PathBuf> {
    if tileset.custom {
        let cache_key = scenario_cache_key(source_path);
        let cached = Path::new(REFERENCE_UTILITY_ROOT)
            .join("tmp")
            .join("tile-atlases")
            .join(cache_key)
            .join(format!("{}.png", tileset.id));
        if cached.is_file() {
            return Some(cached);
        }
    }
    tileset.pict_id.map(|pict_id| {
        Path::new(REFERENCE_UTILITY_ROOT)
            .join("assets")
            .join("realmz")
            .join("resources")
            .join("pictures")
            .join(format!("picture_{pict_id}.png"))
    })
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

fn scenario_id(name: &str) -> String {
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

    #[test]
    fn map_icon_normalization_matches_realmz_positive_and_negative_specials() {
        assert_eq!(normalize_icon_id(200), None);
        assert_eq!(normalize_icon_id(378), None);
        assert_eq!(normalize_icon_id(379), Some(379));
        assert_eq!(normalize_icon_id(462), Some(462));
        assert_eq!(normalize_icon_id(1462), Some(462));
        assert_eq!(normalize_icon_id(1224), None);
        assert_eq!(normalize_icon_id(5081), None);
        assert_eq!(normalize_icon_id(969), None);
        assert_eq!(normalize_icon_id(-462), Some(-462));
        assert_eq!(normalize_icon_id(-1462), Some(-462));
    }

    #[test]
    fn create_project_iterates_colliding_default_package_names() {
        let temp = tempfile::tempdir().expect("tempdir");
        let requested = temp
            .path()
            .join("Untitled Scenario 2026-06-01.providence");
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
    fn save_project_omits_derived_semantic_schema() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("Semantic Omit.providence");
        let mut project =
            create_project("Semantic Omit".to_string(), &project_dir).expect("create project");
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
    }
}
