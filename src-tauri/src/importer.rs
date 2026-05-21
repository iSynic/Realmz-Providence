use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use crate::project::*;
use crate::realmz::{parse_scenario_buffers, ParsedScenario, SUPPORTED_WRITE_FILES, TRACKED_FILES};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

pub const PROJECT_FILE_NAME: &str = "project.json";
pub const RAW_SOURCES_DIR: &str = "raw-sources";
pub const ASSETS_DIR: &str = "assets";
pub const TILE_ATLASES_DIR: &str = "tile-atlases";
pub const ICONS_DIR: &str = "icons";
const REFERENCE_UTILITY_ROOT: &str = "F:/Realmz Scenario Utility";

pub fn create_project(
    project_name: String,
    project_dir: impl AsRef<Path>,
) -> Result<ProvidenceProject> {
    let project_dir = project_dir.as_ref();
    let project_path = project_file_path(project_dir);
    if project_path.exists() {
        return Err(ProvidenceError::message(format!(
            "{} already exists; open it instead or choose a new project name",
            project_path.display()
        )));
    }
    fs::create_dir_all(project_dir).with_path(project_dir)?;
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
            name: project_name,
            project_path: project_path_text,
            imported_at: timestamp(),
        },
        source: SourceSnapshot {
            source_path: String::new(),
            raw_sources_dir: RAW_SOURCES_DIR.to_string(),
            files: Vec::new(),
            immutable: true,
        },
        maps: Vec::new(),
        triggers: Vec::new(),
        random_levels: Vec::new(),
        extracodes: Vec::new(),
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

    let mut project = ProvidenceProject {
        schema_version: PROJECT_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        scenario: ScenarioMeta {
            id: scenario_id(&project_name),
            name: project_name,
            project_path,
            imported_at: timestamp(),
        },
        source: SourceSnapshot {
            source_path: source_path.to_string_lossy().to_string(),
            raw_sources_dir: RAW_SOURCES_DIR.to_string(),
            files: source_files,
            immutable: true,
        },
        maps: parsed.maps,
        triggers: parsed.triggers,
        random_levels: parsed.random_levels,
        extracodes: parsed.extracodes,
        assets: Vec::new(),
        asset_catalog: parsed.asset_catalog,
        editor_metadata: EditorMetadata::default(),
        records: parsed.records,
        diagnostics: parsed.diagnostics,
        semantic_schema: SemanticSchema::default(),
        validation: ValidationReport::default(),
    };
    import_tile_atlases(&source_path, &assets_dir, &mut project)?;
    import_icon_overlays(&assets_dir, &mut project)?;
    let semantic_parsed = ParsedScenario {
        maps: project.maps.clone(),
        triggers: project.triggers.clone(),
        random_levels: project.random_levels.clone(),
        extracodes: project.extracodes.clone(),
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
    project.validation = crate::validation::validate_project(&project);
    save_project(project_dir, &project)?;
    Ok(project)
}

pub fn open_project(project_dir: impl AsRef<Path>) -> Result<ProvidenceProject> {
    let project_dir = project_dir.as_ref();
    let project_path = project_dir.join(PROJECT_FILE_NAME);
    let text = fs::read_to_string(&project_path).with_path(&project_path)?;
    let mut project: ProvidenceProject =
        serde_json::from_str(&text).with_json_path(project_path)?;
    backfill_tileset_metadata(&mut project);
    refresh_semantic_schema(project_dir, &mut project)?;
    import_icon_overlays(&project_dir.join(ASSETS_DIR), &mut project)?;
    project.validation = crate::validation::validate_project(&project);
    save_project(project_dir, &project)?;
    Ok(project)
}

pub fn save_project(project_dir: impl AsRef<Path>, project: &ProvidenceProject) -> Result<()> {
    let project_dir = project_dir.as_ref();
    fs::create_dir_all(project_dir).with_path(project_dir)?;
    let project_path = project_dir.join(PROJECT_FILE_NAME);
    let text = serde_json::to_string_pretty(project).with_json_path(&project_path)?;
    fs::write(&project_path, text).with_path(&project_path)
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
    let semantic_parsed = ParsedScenario {
        maps: project.maps.clone(),
        triggers: project.triggers.clone(),
        random_levels: project.random_levels.clone(),
        extracodes: project.extracodes.clone(),
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
    Ok(())
}

fn backfill_tileset_metadata(project: &mut ProvidenceProject) {
    for tileset in &mut project.asset_catalog.tilesets {
        if tileset.base_tile.is_none() {
            tileset.base_tile = landlook_base_tile(tileset.landlook);
        }
    }
}

fn landlook_base_tile(landlook: i8) -> Option<i16> {
    match landlook {
        0 => Some(156),
        3 => Some(155),
        4 => Some(111),
        5 => Some(191),
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
        let dest = raw_dir.join(name);
        fs::copy(path, &dest).with_path(&dest)?;
        let bytes = fs::read(path).with_path(path)?;
        let role = if supported.contains(name) {
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
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

fn is_resource_file_name(name: &str) -> bool {
    name == "Scenario"
        || name.ends_with(".rsrc")
        || name.ends_with(".rsf")
        || name.starts_with("._")
}

fn import_tile_atlases(
    source_path: &Path,
    assets_dir: &Path,
    project: &mut ProvidenceProject,
) -> Result<()> {
    let atlas_dir = assets_dir.join(TILE_ATLASES_DIR);
    fs::create_dir_all(&atlas_dir).with_path(&atlas_dir)?;
    for tileset in &mut project.asset_catalog.tilesets {
        let Some(source) = atlas_source_path(source_path, tileset) else {
            tileset.available = false;
            project.diagnostics.push(Diagnostic {
                severity: DiagnosticSeverity::Warning,
                code: "missing-tile-atlas".to_string(),
                message: format!("No tile atlas source is known for {}", tileset.id),
                source: Some(tileset.id.clone()),
            });
            continue;
        };
        if !source.is_file() {
            tileset.available = false;
            project.diagnostics.push(Diagnostic {
                severity: DiagnosticSeverity::Warning,
                code: "missing-tile-atlas".to_string(),
                message: format!("{} was not found at {}", tileset.name, source.display()),
                source: Some(tileset.id.clone()),
            });
            continue;
        }
        let file_name = format!("{}.png", tileset.id);
        let dest = atlas_dir.join(&file_name);
        fs::copy(&source, &dest).with_path(&dest)?;
        tileset.image_path = Some(format!("{ASSETS_DIR}/{TILE_ATLASES_DIR}/{file_name}"));
        tileset.available = true;
    }
    Ok(())
}

fn import_icon_overlays(assets_dir: &Path, project: &mut ProvidenceProject) -> Result<()> {
    let icon_dir = assets_dir.join(ICONS_DIR);
    fs::create_dir_all(&icon_dir).with_path(&icon_dir)?;
    let reference_icon_dir = Path::new(REFERENCE_UTILITY_ROOT)
        .join("assets")
        .join("realmz")
        .join("resources")
        .join("icons");
    let mut missing = BTreeSet::new();
    for icon_id in map_icon_ids(&project.maps) {
        let file_name = format!("icon_{icon_id}.png");
        let source = reference_icon_dir.join(&file_name);
        if !source.is_file() {
            missing.insert(icon_id);
            continue;
        }
        let dest = icon_dir.join(file_name);
        fs::copy(&source, &dest).with_path(&dest)?;
    }
    if !missing.is_empty() {
        project.diagnostics.push(Diagnostic {
            severity: DiagnosticSeverity::Warning,
            code: "missing-map-icon-overlay".to_string(),
            message: format!(
                "{} map icon overlay(s) referenced by negative field values were not found in the Scenario Utility reference assets",
                missing.len()
            ),
            source: Some("Data LD".to_string()),
        });
    }
    Ok(())
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
        return None;
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
