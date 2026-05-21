use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use crate::project::{ByteRange, Confidence, DiagnosticSeverity, SemanticEditState};
use crate::semantic::resources::{parse_resource_fork, resource_entity_id, resource_type_id};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;
pub const LIBRARY_SCHEMA_VERSION: u32 = 2;
pub const WORKSPACE_FILE_NAME: &str = "workspace.json";
pub const LIBRARY_DIR: &str = "library";
pub const LIBRARY_CATALOG_FILE: &str = "catalog.json";
pub const BUNDLED_LIBRARY_DIR: &str = "bundled-libraries";
pub const DEFAULT_DIVINITY_ROOT: &str =
    "F:\\Divinity CD\\Divinity CD\\Install Options\\World of Realmz\\Divinity";
pub const DEFAULT_REALMZ_DATA_ROOT: &str = "F:\\Realmz\\base\\Realmz\\Data Files";
pub const DEFAULT_NEW_SCENARIO_ROOT: &str = "F:\\Realmz\\base\\Realmz\\Scenarios\\New Scenario";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidenceWorkspace {
    pub schema_version: u32,
    pub app_version: String,
    pub workspace_path: String,
    pub managed_library_path: String,
    pub reference_roots: ReferenceRoots,
    pub recent_projects: Vec<String>,
    pub active_library_catalog: Option<LibraryCatalog>,
    pub diagnostics: Vec<LibraryDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceRoots {
    pub divinity: String,
    pub realmz_data: String,
    pub new_scenario: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCatalog {
    pub schema_version: u32,
    pub imported_at: String,
    pub managed_path: String,
    pub sources: Vec<LibrarySource>,
    pub records: Vec<LibraryRecord>,
    pub entities: Vec<LibraryEntity>,
    pub assets: Vec<LibraryAsset>,
    pub diagnostics: Vec<LibraryDiagnostic>,
    pub summary: LibrarySummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySource {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub original_path: String,
    pub source_kind: LibrarySourceKind,
    pub role: String,
    pub bytes: u64,
    pub sha256: String,
    pub copied_to: String,
    pub confidence: Confidence,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LibrarySourceKind {
    DivinityImport,
    RealmzReference,
    ProvidenceLibrary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRecord {
    pub id: String,
    pub source: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub label: String,
    pub edit_state: SemanticEditState,
    pub byte_range: Option<ByteRange>,
    pub confidence: Confidence,
    pub summary: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntity {
    pub id: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub label: String,
    pub source: String,
    pub record_ref: Option<String>,
    pub edit_state: SemanticEditState,
    pub confidence: Confidence,
    pub summary: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAsset {
    pub id: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub label: String,
    pub source: String,
    pub relative_path: String,
    pub bytes: u64,
    pub sha256: String,
    #[serde(default)]
    pub resource_type: Option<String>,
    #[serde(default)]
    pub resource_id: Option<i16>,
    #[serde(default)]
    pub preview_path: Option<String>,
    #[serde(default)]
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDiagnostic {
    pub id: String,
    #[serde(rename = "type")]
    pub diagnostic_type: String,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub source: Option<String>,
    pub data: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySummary {
    pub source_count: usize,
    pub record_count: usize,
    pub entity_count: usize,
    pub asset_count: usize,
    pub diagnostic_count: usize,
}

pub fn open_workspace(workspace_dir: impl AsRef<Path>) -> Result<ProvidenceWorkspace> {
    let workspace_dir = workspace_dir.as_ref();
    fs::create_dir_all(workspace_dir).with_path(workspace_dir)?;
    fs::create_dir_all(library_dir(workspace_dir)).with_path(library_dir(workspace_dir))?;
    let workspace_path = workspace_dir.join(WORKSPACE_FILE_NAME);
    if workspace_path.is_file() {
        let text = fs::read_to_string(&workspace_path).with_path(&workspace_path)?;
        let mut workspace: ProvidenceWorkspace =
            serde_json::from_str(&text).with_json_path(&workspace_path)?;
        workspace.active_library_catalog = load_catalog(workspace_dir)?;
        Ok(workspace)
    } else {
        let workspace = default_workspace(workspace_dir, load_catalog(workspace_dir)?);
        save_workspace(workspace_dir, &workspace)?;
        Ok(workspace)
    }
}

pub fn open_workspace_with_bundled_libraries(
    workspace_dir: impl AsRef<Path>,
    bundled_library_root: Option<impl AsRef<Path>>,
) -> Result<ProvidenceWorkspace> {
    let workspace_dir = workspace_dir.as_ref();
    let mut workspace = open_workspace(workspace_dir)?;
    if let Some(root) = bundled_library_root {
        if let Some(catalog) = seed_bundled_libraries(workspace_dir, root.as_ref())? {
            workspace.active_library_catalog = Some(catalog);
            save_workspace(workspace_dir, &workspace)?;
        }
    }
    Ok(workspace)
}

pub fn save_workspace(
    workspace_dir: impl AsRef<Path>,
    workspace: &ProvidenceWorkspace,
) -> Result<()> {
    let workspace_dir = workspace_dir.as_ref();
    fs::create_dir_all(workspace_dir).with_path(workspace_dir)?;
    if let Some(catalog) = &workspace.active_library_catalog {
        save_catalog(workspace_dir, catalog)?;
    }
    let workspace_path = workspace_dir.join(WORKSPACE_FILE_NAME);
    let text = serde_json::to_string_pretty(workspace).with_json_path(&workspace_path)?;
    fs::write(&workspace_path, text).with_path(&workspace_path)
}

pub fn import_divinity_libraries(
    source_path: impl AsRef<Path>,
    workspace_dir: impl AsRef<Path>,
) -> Result<LibraryCatalog> {
    import_library(source_path, workspace_dir, LibrarySourceKind::DivinityImport)
}

pub fn import_realmz_reference_data(
    source_path: impl AsRef<Path>,
    workspace_dir: impl AsRef<Path>,
) -> Result<LibraryCatalog> {
    import_library(source_path, workspace_dir, LibrarySourceKind::RealmzReference)
}

pub fn seed_bundled_libraries(
    workspace_dir: impl AsRef<Path>,
    bundled_library_root: impl AsRef<Path>,
) -> Result<Option<LibraryCatalog>> {
    let workspace_dir = workspace_dir.as_ref();
    let bundled_library_root = bundled_library_root.as_ref();
    if !bundled_library_root.is_dir() {
        return Ok(None);
    }
    let existing = load_catalog(workspace_dir)?;
    let mut catalog = existing;
    for (source_kind, folder) in [
        (LibrarySourceKind::DivinityImport, "divinity"),
        (LibrarySourceKind::RealmzReference, "realmz-reference"),
    ] {
        if catalog_has_source_kind(catalog.as_ref(), source_kind) {
            continue;
        }
        let source_path = bundled_library_root.join(folder);
        if source_path.is_dir() {
            catalog = Some(import_library(source_path, workspace_dir, source_kind)?);
        }
    }
    Ok(catalog)
}

pub fn load_library_asset(
    workspace_dir: impl AsRef<Path>,
    relative_path: impl AsRef<Path>,
) -> Result<Vec<u8>> {
    let workspace_dir = workspace_dir.as_ref();
    let relative = relative_path.as_ref();
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(ProvidenceError::message(
            "Library asset path must stay inside the workspace library folder",
        ));
    }
    let root = library_dir(workspace_dir)
        .canonicalize()
        .with_path(library_dir(workspace_dir))?;
    let target = root
        .join(relative)
        .canonicalize()
        .with_path(root.join(relative))?;
    if !target.starts_with(&root) {
        return Err(ProvidenceError::message(
            "Library asset path resolved outside the workspace library folder",
        ));
    }
    fs::read(&target).with_path(&target)
}

fn import_library(
    source_path: impl AsRef<Path>,
    workspace_dir: impl AsRef<Path>,
    source_kind: LibrarySourceKind,
) -> Result<LibraryCatalog> {
    let source_path = source_path.as_ref();
    let workspace_dir = workspace_dir.as_ref();
    let source_path = source_path
        .canonicalize()
        .with_path(source_path.to_path_buf())?;
    if !source_path.is_dir() {
        return Err(ProvidenceError::message(format!(
            "{} is not a library source folder",
            source_path.display()
        )));
    }
    let library_root = library_dir(workspace_dir);
    let raw_root = library_root.join("raw").join(source_kind.folder_name());
    fs::create_dir_all(&raw_root).with_path(&raw_root)?;

    let mut catalog = load_catalog(workspace_dir)?.unwrap_or_else(|| LibraryCatalog {
        schema_version: LIBRARY_SCHEMA_VERSION,
        imported_at: timestamp(),
        managed_path: library_root.to_string_lossy().to_string(),
        ..LibraryCatalog::default()
    });
    catalog.schema_version = LIBRARY_SCHEMA_VERSION;
    catalog.managed_path = library_root.to_string_lossy().to_string();
    catalog.imported_at = timestamp();
    catalog
        .sources
        .retain(|source| source.source_kind != source_kind);
    catalog
        .records
        .retain(|record| !record.id.starts_with(source_kind.record_prefix()));
    catalog
        .entities
        .retain(|entity| !entity.id.starts_with(source_kind.entity_prefix()));
    catalog
        .assets
        .retain(|asset| !asset.id.starts_with(source_kind.asset_prefix()));
    catalog
        .diagnostics
        .retain(|diagnostic| !diagnostic.id.starts_with(source_kind.diagnostic_prefix()));

    let mut imported_sources = Vec::new();
    for entry in WalkDir::new(&source_path).min_depth(1) {
        let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let relative = path
            .strip_prefix(&source_path)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('/', "\\");
        let bytes = fs::read(path).with_path(path)?;
        let dest = raw_root.join(&relative);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).with_path(parent)?;
        }
        fs::copy(path, &dest).with_path(&dest)?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown")
            .to_string();
        let id = format!(
            "{}:{}",
            source_kind.source_prefix(),
            stable_token(&relative)
        );
        imported_sources.push(LibrarySource {
            id,
            name,
            relative_path: relative,
            original_path: path.to_string_lossy().to_string(),
            source_kind,
            role: library_role(path),
            bytes: bytes.len() as u64,
            sha256: sha256_hex(&bytes),
            copied_to: dest.to_string_lossy().to_string(),
            confidence: Confidence::FixtureBacked,
        });
    }
    imported_sources.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    let source_by_id: BTreeMap<String, LibrarySource> = imported_sources
        .iter()
        .map(|source| (source.id.clone(), source.clone()))
        .collect();
    for source in imported_sources {
        add_source_records_entities(&mut catalog, &source, &source_by_id)?;
        catalog.sources.push(source);
    }
    summarize_catalog(&mut catalog);
    save_catalog(workspace_dir, &catalog)?;
    Ok(catalog)
}

fn add_source_records_entities(
    catalog: &mut LibraryCatalog,
    source: &LibrarySource,
    _source_by_id: &BTreeMap<String, LibrarySource>,
) -> Result<()> {
    let bytes = fs::read(&source.copied_to).with_path(&source.copied_to)?;
    let family = source_family(source);
    let source_entity_id = format!(
        "{}:{}",
        source.source_kind.entity_prefix(),
        stable_token(&source.relative_path)
    );
    let source_record_id = format!(
        "{}:file:{}",
        source.source_kind.record_prefix(),
        stable_token(&source.relative_path)
    );
    catalog.records.push(LibraryRecord {
        id: source_record_id.clone(),
        source: source.id.clone(),
        record_type: "library-source".to_string(),
        label: source.relative_path.clone(),
        edit_state: SemanticEditState::InspectOnly,
        byte_range: Some(byte_range(0, bytes.len())),
        confidence: Confidence::FixtureBacked,
        summary: summary([
            ("family", json!(family.name())),
            ("role", json!(source.role)),
            ("bytes", json!(source.bytes)),
            ("sha256", json!(source.sha256)),
        ]),
    });
    catalog.entities.push(LibraryEntity {
        id: source_entity_id,
        entity_type: family.entity_type().to_string(),
        label: family.label(source),
        source: source.id.clone(),
        record_ref: Some(source_record_id),
        edit_state: SemanticEditState::InspectOnly,
        confidence: Confidence::FixtureBacked,
        summary: summary([
            ("family", json!(family.name())),
            ("relativePath", json!(source.relative_path)),
            ("originalPath", json!(source.original_path)),
            ("role", json!(source.role)),
            ("note", json!(family.note())),
        ]),
    });

    if is_resource_file(&source.name) {
        add_resource_inventory(catalog, source, &bytes);
    }
    add_record_slots(catalog, source, &bytes);
    Ok(())
}

fn add_resource_inventory(catalog: &mut LibraryCatalog, source: &LibrarySource, bytes: &[u8]) {
    let resources = parse_resource_fork(bytes);
    if resources.is_empty() {
        catalog.diagnostics.push(LibraryDiagnostic {
            id: format!(
                "{}:resource-empty:{}",
                source.source_kind.diagnostic_prefix(),
                stable_token(&source.relative_path)
            ),
            diagnostic_type: "resource-fork-empty".to_string(),
            severity: DiagnosticSeverity::Warning,
            message: format!("{} did not expose a readable Mac resource map.", source.relative_path),
            source: Some(source.id.clone()),
            data: summary([("bytes", json!(bytes.len()))]),
        });
        return;
    }
    let mut resource_types = BTreeSet::new();
    for resource in resources {
        resource_types.insert(resource.resource_type.clone());
        let resource_id = resource_entity_id(&resource.resource_type, resource.id);
        let id = format!(
            "{}:resource:{}:{}:{}",
            source.source_kind.entity_prefix(),
            stable_token(&source.relative_path),
            printable_token(&resource.resource_type),
            resource.id
        );
        let record_id = format!(
            "{}:resource:{}:{}:{}",
            source.source_kind.record_prefix(),
            stable_token(&source.relative_path),
            printable_token(&resource.resource_type),
            resource.id
        );
        let entity_type = resource_entity_family(source, &resource.resource_type);
        let label = if resource.name.is_empty() {
            format!("{} {} {}", source.name, printable_token(&resource.resource_type), resource.id)
        } else {
            format!(
                "{} {} {}: {}",
                source.name,
                printable_token(&resource.resource_type),
                resource.id,
                resource.name
            )
        };
        let resource_sha256 = sha256_hex(&resource.data);
        let resource_summary = summary([
            ("type", json!(printable_token(&resource.resource_type))),
            ("resourceId", json!(resource.id)),
            ("resourceKey", json!(resource_id)),
            ("name", json!(resource.name)),
            ("attributes", json!(resource.attributes)),
            ("bytes", json!(resource.length)),
            ("offset", json!(resource.offset)),
            ("sha256", json!(resource_sha256.clone())),
            ("preview", json!(hex_preview(&resource.data, 20))),
        ]);
        catalog.records.push(LibraryRecord {
            id: record_id.clone(),
            source: source.id.clone(),
            record_type: "resource".to_string(),
            label: label.clone(),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(resource.offset, resource.length)),
            confidence: Confidence::FixtureBacked,
            summary: resource_summary.clone(),
        });
        catalog.entities.push(LibraryEntity {
            id,
            entity_type: entity_type.to_string(),
            label: label.clone(),
            source: source.id.clone(),
            record_ref: Some(record_id),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::FixtureBacked,
            summary: resource_summary,
        });
        if let Some(asset_type) = resource_asset_type(&resource.resource_type, entity_type) {
            catalog.assets.push(LibraryAsset {
                id: format!(
                    "{}:resource:{}:{}:{}",
                    source.source_kind.asset_prefix(),
                    stable_token(&source.relative_path),
                    printable_token(&resource.resource_type),
                    resource.id
                ),
                asset_type: asset_type.to_string(),
                label,
                source: source.id.clone(),
                relative_path: format!(
                    "{}#{}:{}",
                    source.relative_path,
                    printable_token(&resource.resource_type),
                    resource.id
                ),
                bytes: resource.length as u64,
                sha256: resource_sha256,
                resource_type: Some(printable_token(&resource.resource_type)),
                resource_id: Some(resource.id),
                preview_path: None,
                mime_type: Some(resource_mime_type(&resource.resource_type).to_string()),
            });
        }
    }
    for resource_type in resource_types {
        let id = format!(
            "{}:{}",
            source.source_kind.entity_prefix(),
            resource_type_id(&resource_type)
        );
        catalog.entities.push(LibraryEntity {
            id,
            entity_type: "resource type".to_string(),
            label: format!("{} resources", printable_token(&resource_type)),
            source: source.id.clone(),
            record_ref: None,
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::FixtureBacked,
            summary: summary([
                ("type", json!(printable_token(&resource_type))),
                ("source", json!(source.relative_path)),
            ]),
        });
    }
}

fn add_record_slots(catalog: &mut LibraryCatalog, source: &LibrarySource, bytes: &[u8]) {
    let Some((entity_type, record_bytes)) = library_record_layout(source) else {
        return;
    };
    if record_bytes == 0 {
        return;
    }
    let full = bytes.len() / record_bytes;
    let trailing = bytes.len() % record_bytes;
    if trailing > 0 {
        catalog.diagnostics.push(LibraryDiagnostic {
            id: format!(
                "{}:trailing:{}",
                source.source_kind.diagnostic_prefix(),
                stable_token(&source.relative_path)
            ),
            diagnostic_type: "library-record-trailing-bytes".to_string(),
            severity: DiagnosticSeverity::Warning,
            message: format!(
                "{} has {} trailing byte(s) after {}-byte {} records.",
                source.relative_path, trailing, record_bytes, entity_type
            ),
            source: Some(source.id.clone()),
            data: summary([
                ("recordBytes", json!(record_bytes)),
                ("trailingBytes", json!(trailing)),
            ]),
        });
    }
    for index in 0..full.min(512) {
        let start = index * record_bytes;
        let record_id = format!(
            "{}:{}:{}",
            source.source_kind.record_prefix(),
            entity_type,
            index
        );
        catalog.records.push(LibraryRecord {
            id: record_id.clone(),
            source: source.id.clone(),
            record_type: entity_type.to_string(),
            label: format!("{} {}", title(entity_type), index),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(start, record_bytes)),
            confidence: Confidence::Inferred,
            summary: summary([
                ("index", json!(index)),
                ("recordBytes", json!(record_bytes)),
                ("preview", json!(hex_preview(&bytes[start..start + record_bytes], 20))),
                ("note", json!("Library record slot is inventoried; full field taxonomy remains future work.")),
            ]),
        });
        catalog.entities.push(LibraryEntity {
            id: format!(
                "{}:{}:{}",
                source.source_kind.entity_prefix(),
                entity_type,
                index
            ),
            entity_type: entity_type.to_string(),
            label: format!("{} {}", title(entity_type), index),
            source: source.id.clone(),
            record_ref: Some(record_id),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            summary: summary([
                ("index", json!(index)),
                ("sourceFile", json!(source.relative_path)),
                ("recordBytes", json!(record_bytes)),
            ]),
        });
    }
}

fn source_family(source: &LibrarySource) -> LibraryFamily {
    let path = source.relative_path.replace('/', "\\");
    let name = source.name.as_str();
    if path.contains("Monster Scrap Book") {
        LibraryFamily::MonsterScrapbook
    } else if path.contains("Monster Mash") {
        LibraryFamily::MonsterMash
    } else if path.contains("Vault of Arcana") {
        LibraryFamily::VaultOfArcana
    } else if path.contains("Bag of Holding") {
        LibraryFamily::BagOfHolding
    } else if name == "Data ID" {
        LibraryFamily::Items
    } else if name == "Data Spell" || name == "Data S" {
        LibraryFamily::Spells
    } else if name == "Data Race" {
        LibraryFamily::Races
    } else if name == "Data Caste" {
        LibraryFamily::Castes
    } else if path.contains("Land Archive") || path.contains("Data DES") {
        LibraryFamily::SpecialLandTiles
    } else if is_resource_file(name) {
        LibraryFamily::ResourceFork
    } else {
        LibraryFamily::LibraryFile
    }
}

fn resource_entity_family(source: &LibrarySource, resource_type: &str) -> &'static str {
    let family = source_family(source);
    match (family, resource_type) {
        (LibraryFamily::MonsterMash, "cicn") => "monster-mash-icon",
        (LibraryFamily::VaultOfArcana, "cicn") => "vault-icon",
        (LibraryFamily::BagOfHolding, "cicn") => "bag-item",
        (LibraryFamily::SpecialLandTiles, "PICT" | "cicn") => "special-land-tile",
        (_, "PICT") => "picture",
        (_, "cicn") => "icon-resource",
        (_, "snd ") => "sound",
        (_, "TEXT") => "text-resource",
        (_, "styl") => "style-resource",
        (_, "STR#") => "string-list-resource",
        (_, "RLMZ") => "realmz-metadata-resource",
        (_, "vers") => "version-resource",
        _ => "resource",
    }
}

fn resource_asset_type(resource_type: &str, entity_type: &str) -> Option<&'static str> {
    match (resource_type, entity_type) {
        ("cicn", "special-land-tile") => Some("icon"),
        ("PICT", _) | (_, "picture") => Some("picture"),
        ("cicn", _)
        | (_, "icon-resource")
        | (_, "monster-mash-icon")
        | (_, "vault-icon")
        | (_, "bag-item") => Some("icon"),
        ("snd ", _) | (_, "sound") => Some("sound"),
        ("TEXT", _) | (_, "text-resource") => Some("text"),
        _ => None,
    }
}

fn resource_mime_type(resource_type: &str) -> &'static str {
    match resource_type {
        "PICT" | "cicn" => "image/png",
        "snd " => "audio/wav",
        "TEXT" | "STR#" => "text/plain",
        _ => "application/octet-stream",
    }
}

fn library_record_layout(source: &LibrarySource) -> Option<(&'static str, usize)> {
    match source.name.as_str() {
        "Monster Scrap Book" => Some(("monster-scrapbook-entry", 210)),
        "Data ID" => Some(("item", 400)),
        "Data Race" => Some(("race", 288)),
        "Data Caste" => Some(("caste", 288)),
        "Data Spell" => Some(("spell", 112)),
        "Data S" => Some(("spell", 126)),
        _ => None,
    }
}

fn library_role(path: &Path) -> String {
    let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    if is_resource_file(name) {
        "resource-fork".to_string()
    } else if matches!(name, "Data ID" | "Data Spell" | "Data S" | "Data Race" | "Data Caste") {
        "shared-data".to_string()
    } else if name.starts_with("Data ") {
        "template-data".to_string()
    } else {
        "library-file".to_string()
    }
}

#[derive(Debug, Clone, Copy)]
enum LibraryFamily {
    MonsterScrapbook,
    MonsterMash,
    VaultOfArcana,
    BagOfHolding,
    Items,
    Spells,
    Races,
    Castes,
    SpecialLandTiles,
    ResourceFork,
    LibraryFile,
}

impl LibraryFamily {
    fn name(self) -> &'static str {
        match self {
            Self::MonsterScrapbook => "monster-scrapbook",
            Self::MonsterMash => "monster-mash",
            Self::VaultOfArcana => "vault-of-arcana",
            Self::BagOfHolding => "bag-of-holding",
            Self::Items => "items",
            Self::Spells => "spells",
            Self::Races => "races",
            Self::Castes => "castes",
            Self::SpecialLandTiles => "special-land-tiles",
            Self::ResourceFork => "resource-fork",
            Self::LibraryFile => "library-file",
        }
    }

    fn entity_type(self) -> &'static str {
        "library-file"
    }

    fn label(self, source: &LibrarySource) -> String {
        match self {
            Self::MonsterScrapbook => "Monster Scrapbook".to_string(),
            Self::MonsterMash => "Monster Mash".to_string(),
            Self::VaultOfArcana => "Vault of Arcana".to_string(),
            Self::BagOfHolding => "Bag of Holding".to_string(),
            Self::Items => "Shared item catalog".to_string(),
            Self::Spells => "Shared/custom spell catalog".to_string(),
            Self::Races => "Shared/custom race catalog".to_string(),
            Self::Castes => "Shared/custom caste catalog".to_string(),
            Self::SpecialLandTiles => "Special land tile library".to_string(),
            Self::ResourceFork | Self::LibraryFile => source.relative_path.clone(),
        }
    }

    fn note(self) -> &'static str {
        match self {
            Self::MonsterScrapbook => "Divinity monster template dataset; inspect-only until writer coverage exists.",
            Self::MonsterMash => "Divinity shared monster icon pool imported into the Providence library catalog.",
            Self::VaultOfArcana => "Divinity shared item icon pool imported into the Providence library catalog.",
            Self::BagOfHolding => "Divinity shared item dataset imported into the Providence library catalog.",
            Self::Items => "Realmz item database reference; linked from shops, treasure, and item opcodes.",
            Self::Spells => "Realmz spell database reference; linked from encounters, monsters, and spell opcodes.",
            Self::Races => "Realmz race database reference; used by restrictions and selectors.",
            Self::Castes => "Realmz caste database reference; used by restrictions and selectors.",
            Self::SpecialLandTiles => "Custom/special land tile source for scenario graphics workflows.",
            Self::ResourceFork => "Classic Mac resource fork inventory.",
            Self::LibraryFile => "Imported library source file.",
        }
    }
}

impl LibrarySourceKind {
    fn folder_name(self) -> &'static str {
        match self {
            Self::DivinityImport => "divinity",
            Self::RealmzReference => "realmz-reference",
            Self::ProvidenceLibrary => "providence",
        }
    }

    fn source_prefix(self) -> &'static str {
        match self {
            Self::DivinityImport => "library-source:divinity",
            Self::RealmzReference => "library-source:realmz",
            Self::ProvidenceLibrary => "library-source:providence",
        }
    }

    fn record_prefix(self) -> &'static str {
        match self {
            Self::DivinityImport => "library-record:divinity",
            Self::RealmzReference => "library-record:realmz",
            Self::ProvidenceLibrary => "library-record:providence",
        }
    }

    fn entity_prefix(self) -> &'static str {
        match self {
            Self::DivinityImport => "library-entity:divinity",
            Self::RealmzReference => "library-entity:realmz",
            Self::ProvidenceLibrary => "library-entity:providence",
        }
    }

    fn asset_prefix(self) -> &'static str {
        match self {
            Self::DivinityImport => "library-asset:divinity",
            Self::RealmzReference => "library-asset:realmz",
            Self::ProvidenceLibrary => "library-asset:providence",
        }
    }

    fn diagnostic_prefix(self) -> &'static str {
        match self {
            Self::DivinityImport => "library-diagnostic:divinity",
            Self::RealmzReference => "library-diagnostic:realmz",
            Self::ProvidenceLibrary => "library-diagnostic:providence",
        }
    }
}

fn default_workspace(
    workspace_dir: &Path,
    active_library_catalog: Option<LibraryCatalog>,
) -> ProvidenceWorkspace {
    ProvidenceWorkspace {
        schema_version: WORKSPACE_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        workspace_path: workspace_dir.to_string_lossy().to_string(),
        managed_library_path: library_dir(workspace_dir).to_string_lossy().to_string(),
        reference_roots: ReferenceRoots {
            divinity: DEFAULT_DIVINITY_ROOT.to_string(),
            realmz_data: DEFAULT_REALMZ_DATA_ROOT.to_string(),
            new_scenario: DEFAULT_NEW_SCENARIO_ROOT.to_string(),
        },
        recent_projects: Vec::new(),
        active_library_catalog,
        diagnostics: Vec::new(),
    }
}

fn load_catalog(workspace_dir: &Path) -> Result<Option<LibraryCatalog>> {
    let catalog_path = catalog_path(workspace_dir);
    if !catalog_path.is_file() {
        return Ok(None);
    }
    let text = fs::read_to_string(&catalog_path).with_path(&catalog_path)?;
    let mut catalog: LibraryCatalog = serde_json::from_str(&text).with_json_path(&catalog_path)?;
    migrate_catalog(&mut catalog);
    summarize_catalog(&mut catalog);
    Ok(Some(catalog))
}

fn save_catalog(workspace_dir: &Path, catalog: &LibraryCatalog) -> Result<()> {
    let path = catalog_path(workspace_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    let text = serde_json::to_string_pretty(catalog).with_json_path(&path)?;
    fs::write(&path, text).with_path(path)
}

fn summarize_catalog(catalog: &mut LibraryCatalog) {
    catalog.summary = LibrarySummary {
        source_count: catalog.sources.len(),
        record_count: catalog.records.len(),
        entity_count: catalog.entities.len(),
        asset_count: catalog.assets.len(),
        diagnostic_count: catalog.diagnostics.len(),
    };
}

fn migrate_catalog(catalog: &mut LibraryCatalog) {
    if catalog.schema_version < LIBRARY_SCHEMA_VERSION {
        catalog.schema_version = LIBRARY_SCHEMA_VERSION;
    }
    for asset in &mut catalog.assets {
        if asset.resource_type.is_none() || asset.resource_id.is_none() {
            if let Some((resource_type, resource_id)) =
                split_catalog_resource_fragment(&asset.relative_path)
            {
                asset.resource_type.get_or_insert(resource_type.clone());
                asset.resource_id.get_or_insert(resource_id);
                asset
                    .mime_type
                    .get_or_insert(resource_mime_type(&resource_type).to_string());
            }
        }
    }
}

fn split_catalog_resource_fragment(relative_path: &str) -> Option<(String, i16)> {
    let (_, fragment) = relative_path.split_once('#')?;
    let (resource_type, id) = fragment.rsplit_once(':')?;
    Some((resource_type.to_string(), id.parse::<i16>().ok()?))
}

fn catalog_has_source_kind(catalog: Option<&LibraryCatalog>, source_kind: LibrarySourceKind) -> bool {
    catalog
        .map(|catalog| catalog.sources.iter().any(|source| source.source_kind == source_kind))
        .unwrap_or(false)
}

fn library_dir(workspace_dir: &Path) -> PathBuf {
    workspace_dir.join(LIBRARY_DIR)
}

fn catalog_path(workspace_dir: &Path) -> PathBuf {
    library_dir(workspace_dir).join(LIBRARY_CATALOG_FILE)
}

fn is_resource_file(name: &str) -> bool {
    name == "Scenario"
        || name.ends_with(".rsrc")
        || name.ends_with(".rsf")
        || name.starts_with("._")
}

fn byte_range(start: usize, length: usize) -> ByteRange {
    ByteRange {
        start,
        length,
        end_exclusive: start + length,
    }
}

fn summary<const N: usize>(entries: [(&str, Value); N]) -> BTreeMap<String, Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn stable_token(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn printable_token(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_graphic() || ch == ' ' {
                ch
            } else {
                '?'
            }
        })
        .collect()
}

fn hex_preview(buffer: &[u8], limit: usize) -> String {
    buffer
        .iter()
        .take(limit)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn title(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn divinity_import_builds_managed_catalog() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("Divinity");
        let data = source.join("Divinity Data");
        fs::create_dir_all(&data).expect("source");
        fs::write(data.join("Monster Scrap Book"), vec![1u8; 420]).expect("monster scrapbook");
        fs::write(data.join("Monster Mash.rsrc"), vec![0u8; 64]).expect("monster mash");
        fs::write(data.join("Vault of Arcana.rsrc"), vec![0u8; 64]).expect("vault");
        fs::write(data.join("Bag of Holding"), vec![2u8; 128]).expect("bag");
        let workspace = temp.path().join("workspace");

        let catalog = import_divinity_libraries(&source, &workspace).expect("import");

        assert!(catalog.sources.iter().any(|source| source.name == "Monster Scrap Book"));
        assert!(catalog.entities.iter().any(|entity| entity.entity_type == "monster-scrapbook-entry"));
        assert!(catalog.sources.iter().any(|source| source.name == "Monster Mash.rsrc"));
        assert!(catalog.sources.iter().any(|source| source.name == "Vault of Arcana.rsrc"));
        assert!(catalog.sources.iter().any(|source| source.name == "Bag of Holding"));
        assert!(catalog.entities.iter().any(|entity| entity.entity_type == "library-file"));
        assert!(workspace.join("library").join("catalog.json").is_file());
    }

    #[test]
    fn realmz_reference_import_emits_core_catalog_entities() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("Data Files");
        fs::create_dir_all(&source).expect("source");
        fs::write(source.join("Data ID"), vec![1u8; 800]).expect("items");
        fs::write(source.join("Data Spell"), vec![2u8; 224]).expect("spells");
        fs::write(source.join("Data Race"), vec![3u8; 576]).expect("races");
        fs::write(source.join("Data Caste"), vec![4u8; 576]).expect("castes");
        let workspace = temp.path().join("workspace");

        let catalog = import_realmz_reference_data(&source, &workspace).expect("import");
        let entity_types: BTreeSet<_> = catalog
            .entities
            .iter()
            .map(|entity| entity.entity_type.as_str())
            .collect();

        assert!(entity_types.contains("item"));
        assert!(entity_types.contains("spell"));
        assert!(entity_types.contains("race"));
        assert!(entity_types.contains("caste"));
    }

    #[test]
    fn workspace_auto_seeds_bundled_libraries() {
        let temp = tempfile::tempdir().expect("tempdir");
        let bundled = temp.path().join(BUNDLED_LIBRARY_DIR);
        let divinity = bundled.join("divinity").join("Divinity Data");
        let realmz = bundled.join("realmz-reference");
        fs::create_dir_all(&divinity).expect("divinity");
        fs::create_dir_all(&realmz).expect("realmz");
        fs::write(divinity.join("Monster Scrap Book"), vec![1u8; 420]).expect("scrapbook");
        fs::write(realmz.join("Data ID"), vec![2u8; 800]).expect("items");
        let workspace_dir = temp.path().join("workspace");

        let workspace =
            open_workspace_with_bundled_libraries(&workspace_dir, Some(&bundled)).expect("workspace");
        let catalog = workspace.active_library_catalog.expect("catalog");

        assert!(catalog
            .sources
            .iter()
            .any(|source| source.source_kind == LibrarySourceKind::DivinityImport));
        assert!(catalog
            .sources
            .iter()
            .any(|source| source.source_kind == LibrarySourceKind::RealmzReference));
        assert!(catalog
            .entities
            .iter()
            .any(|entity| entity.entity_type == "monster-scrapbook-entry"));
        assert!(catalog.entities.iter().any(|entity| entity.entity_type == "item"));
    }
}
