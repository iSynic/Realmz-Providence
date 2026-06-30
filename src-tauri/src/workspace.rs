use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use crate::project::{ByteRange, Confidence, DiagnosticSeverity, SemanticEditState};
use crate::resource_preview::decode_classic_text;
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
pub const LIBRARY_SCHEMA_VERSION: u32 = 4;
pub const WORKSPACE_FILE_NAME: &str = "workspace.json";
pub const LIBRARY_DIR: &str = "library";
pub const LIBRARY_CATALOG_FILE: &str = "catalog.json";
pub const BUNDLED_LIBRARY_DIR: &str = "bundled-libraries";
pub const DEFAULT_DIVINITY_ROOT: &str = "bundled://divinity";
pub const DEFAULT_REALMZ_DATA_ROOT: &str = "bundled://realmz-reference";
pub const DEFAULT_NEW_SCENARIO_ROOT: &str = "bundled://new-scenario-template";

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
    import_library(
        source_path,
        workspace_dir,
        LibrarySourceKind::DivinityImport,
    )
}

pub fn import_realmz_reference_data(
    source_path: impl AsRef<Path>,
    workspace_dir: impl AsRef<Path>,
) -> Result<LibraryCatalog> {
    import_library(
        source_path,
        workspace_dir,
        LibrarySourceKind::RealmzReference,
    )
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
        let source_path = bundled_library_root.join(folder);
        if source_path.is_dir()
            && should_refresh_bundled_library(catalog.as_ref(), source_kind, &source_path)?
        {
            catalog = Some(import_library(source_path, workspace_dir, source_kind)?);
        }
    }
    Ok(catalog)
}

fn should_refresh_bundled_library(
    catalog: Option<&LibraryCatalog>,
    source_kind: LibrarySourceKind,
    source_path: &Path,
) -> Result<bool> {
    let Some(catalog) = catalog else {
        return Ok(true);
    };
    if !catalog_has_source_kind(Some(catalog), source_kind) {
        return Ok(true);
    }
    if bundled_source_signatures_changed(catalog, source_kind, source_path)? {
        return Ok(true);
    }
    if bundled_item_catalog_is_stale(catalog, source_kind) {
        return Ok(true);
    }
    if source_kind == LibrarySourceKind::RealmzReference
        && realmz_reference_rule_catalog_is_stale(catalog)
    {
        return Ok(true);
    }
    Ok(false)
}

fn bundled_source_signatures_changed(
    catalog: &LibraryCatalog,
    source_kind: LibrarySourceKind,
    source_path: &Path,
) -> Result<bool> {
    let sources_by_id = catalog
        .sources
        .iter()
        .filter(|source| source.source_kind == source_kind)
        .map(|source| (source.id.as_str(), source))
        .collect::<BTreeMap<_, _>>();
    for entry in WalkDir::new(source_path).min_depth(1) {
        let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let relative = path
            .strip_prefix(source_path)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('/', "\\");
        let id = format!(
            "{}:{}",
            source_kind.source_prefix(),
            stable_token(&relative)
        );
        let bytes = fs::read(path).with_path(path)?;
        let Some(source) = sources_by_id.get(id.as_str()) else {
            return Ok(true);
        };
        if source.bytes != bytes.len() as u64 || source.sha256 != sha256_hex(&bytes) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn bundled_item_catalog_is_stale(catalog: &LibraryCatalog, source_kind: LibrarySourceKind) -> bool {
    let item_sources = catalog
        .sources
        .iter()
        .filter(|source| {
            source.source_kind == source_kind
                && matches!(source.name.as_str(), "Data ID" | "Data NI")
        })
        .collect::<Vec<_>>();
    for source in item_sources {
        let source_items = catalog
            .entities
            .iter()
            .filter(|entity| entity.source == source.id && entity.entity_type == "item")
            .collect::<Vec<_>>();
        if source_items.is_empty() {
            return true;
        }
        if source_items
            .iter()
            .any(|entity| entity.summary.get("recordBytes").and_then(Value::as_u64) != Some(100))
        {
            return true;
        }
        if source.name == "Data NI"
            && !source_items.iter().any(|entity| {
                entity
                    .summary
                    .get("itemId")
                    .and_then(Value::as_i64)
                    .is_some_and(|id| (800..1000).contains(&id))
            })
        {
            return true;
        }
    }
    false
}

fn realmz_reference_rule_catalog_is_stale(catalog: &LibraryCatalog) -> bool {
    let mut spells = 0usize;
    let mut races = 0usize;
    let mut castes = 0usize;
    for entity in &catalog.entities {
        if !entity
            .source
            .starts_with(LibrarySourceKind::RealmzReference.source_prefix())
        {
            continue;
        }
        match entity.entity_type.as_str() {
            "spell"
                if entity.summary.get("recordBytes").and_then(Value::as_u64) == Some(30)
                    && entity.summary.contains_key("packedSpellId") =>
            {
                spells += 1;
            }
            "race"
                if entity.summary.get("recordBytes").and_then(Value::as_u64) == Some(408)
                    && entity.summary.contains_key("raceNumber")
                    && entity.summary.contains_key("baseMove") =>
            {
                races += 1;
            }
            "caste"
                if entity.summary.get("recordBytes").and_then(Value::as_u64) == Some(576)
                    && entity.summary.contains_key("casteNumber")
                    && entity.summary.contains_key("victory") =>
            {
                castes += 1;
            }
            _ => {}
        }
    }
    spells < 500 || races < 60 || castes < 30
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
    decorate_rule_catalog(&mut catalog);
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
            message: format!(
                "{} did not expose a readable Mac resource map.",
                source.relative_path
            ),
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
            format!(
                "{} {} {}",
                source.name,
                printable_token(&resource.resource_type),
                resource.id
            )
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
        let mut resource_summary = summary([
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
        resource_summary.extend(resource_payload_summary(
            &resource.resource_type,
            &resource.data,
        ));
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
    let limit = match entity_type {
        "item" => full.min(1000),
        "spell" => full.min(525),
        _ => full.min(512),
    };
    for index in 0..limit {
        let start = index * record_bytes;
        let record = &bytes[start..start + record_bytes];
        let record_id = format!(
            "{}:{}:{}",
            source.source_kind.record_prefix(),
            entity_type,
            index
        );
        let record_summary = library_record_summary(
            source.name.as_str(),
            entity_type,
            index,
            record_bytes,
            record,
        );
        let record_label = library_record_label(entity_type, index, &record_summary);
        catalog.records.push(LibraryRecord {
            id: record_id.clone(),
            source: source.id.clone(),
            record_type: entity_type.to_string(),
            label: record_label.clone(),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(start, record_bytes)),
            confidence: Confidence::Inferred,
            summary: record_summary.clone(),
        });
        catalog.entities.push(LibraryEntity {
            id: format!(
                "{}:{}:{}",
                source.source_kind.entity_prefix(),
                entity_type,
                index
            ),
            entity_type: entity_type.to_string(),
            label: record_label,
            source: source.id.clone(),
            record_ref: Some(record_id),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            summary: record_summary,
        });
    }
}

fn decorate_rule_catalog(catalog: &mut LibraryCatalog) {
    let mut strings_by_id: BTreeMap<i64, Vec<String>> = BTreeMap::new();
    for entity in &catalog.entities {
        if entity.entity_type != "string-list-resource" {
            continue;
        }
        let Some(resource_id) = entity.summary.get("resourceId").and_then(Value::as_i64) else {
            continue;
        };
        let Some(strings) = entity.summary.get("strings").and_then(Value::as_array) else {
            continue;
        };
        let strings = strings
            .iter()
            .filter_map(Value::as_str)
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        if !strings.is_empty() {
            strings_by_id.insert(resource_id, strings);
        }
    }
    fn decorate_entry(
        entity_type: &str,
        label: &mut String,
        summary: &mut BTreeMap<String, Value>,
        strings_by_id: &BTreeMap<i64, Vec<String>>,
    ) {
        let name = match entity_type {
            "spell" => {
                let resource_id = summary.get("spellNameResourceId").and_then(Value::as_i64);
                let slot = summary
                    .get("spellSlot")
                    .and_then(Value::as_u64)
                    .map(|value| value as usize);
                resource_id
                    .and_then(|id| strings_by_id.get(&id))
                    .and_then(|strings| slot.and_then(|index| strings.get(index)))
                    .cloned()
            }
            "race" => {
                let number = summary
                    .get("raceNumber")
                    .and_then(Value::as_u64)
                    .map(|value| value as usize);
                strings_by_id
                    .get(&129)
                    .and_then(|strings| {
                        number.and_then(|index| strings.get(index.saturating_sub(1)))
                    })
                    .cloned()
            }
            "caste" => {
                let number = summary
                    .get("casteNumber")
                    .and_then(Value::as_u64)
                    .map(|value| value as usize);
                strings_by_id
                    .get(&131)
                    .and_then(|strings| {
                        number.and_then(|index| strings.get(index.saturating_sub(1)))
                    })
                    .cloned()
            }
            _ => None,
        };
        if let Some(name) = name {
            summary.insert("displayName".to_string(), json!(name));
            if entity_type == "spell" {
                let packed = summary
                    .get("packedSpellId")
                    .and_then(Value::as_i64)
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "Spell".to_string());
                *label = format!("{packed} {name}");
            } else {
                *label = name;
            }
        }
    }
    for record in &mut catalog.records {
        let entity_type = record.record_type.clone();
        decorate_entry(
            &entity_type,
            &mut record.label,
            &mut record.summary,
            &strings_by_id,
        );
    }
    for entity in &mut catalog.entities {
        let entity_type = entity.entity_type.clone();
        decorate_entry(
            &entity_type,
            &mut entity.label,
            &mut entity.summary,
            &strings_by_id,
        );
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
    } else if name == "Data ID" || name == "Data NI" {
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
        "Monster Scrap Book" => Some(("monster-scrapbook-entry", 466)),
        "Data ID" | "Data NI" => Some(("item", 100)),
        "Data Race" => Some(("race", 408)),
        "Data Caste" => Some(("caste", 576)),
        "Data Spell" => Some(("spell", 30)),
        "Data S" => Some(("spell", 30)),
        _ => None,
    }
}

fn library_record_summary(
    source_name: &str,
    entity_type: &str,
    index: usize,
    record_bytes: usize,
    record: &[u8],
) -> BTreeMap<String, Value> {
    let mut out = summary([
        ("index", json!(index)),
        ("recordBytes", json!(record_bytes)),
        ("rawBytes", json!(record)),
        ("preview", json!(hex_preview(record, 20))),
        ("note", json!("Built-in Realmz catalog record.")),
    ]);
    if entity_type == "item" && record.len() >= 100 {
        out.extend(item_record_summary(index, record, source_name));
    } else if entity_type == "monster-scrapbook-entry" && record.len() >= 210 {
        out.extend(monster_record_summary(index, record));
    } else if entity_type == "spell" && record.len() >= 30 {
        out.extend(spell_record_summary(index, record));
    } else if entity_type == "race" && record.len() >= 408 {
        out.extend(race_record_summary(index, record));
    } else if entity_type == "caste" && record.len() >= 576 {
        out.extend(caste_record_summary(index, record));
    }
    out
}

fn library_record_label(
    entity_type: &str,
    index: usize,
    summary: &BTreeMap<String, Value>,
) -> String {
    if entity_type == "item" {
        if let Some(item_id) = summary.get("itemId").and_then(Value::as_i64) {
            let category = summary
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or("Item");
            return format!("{category} {item_id}");
        }
    }
    if let Some(display_name) = summary.get("displayName").and_then(Value::as_str) {
        if !display_name.is_empty() {
            return display_name.to_string();
        }
    }
    if let Some(packed_spell_id) = summary.get("packedSpellId").and_then(Value::as_i64) {
        return format!("Spell {packed_spell_id}");
    }
    if entity_type == "race" {
        return format!("Race {}", index + 1);
    }
    if entity_type == "caste" {
        return format!("Caste {}", index + 1);
    }
    format!("{} {}", title(entity_type), index)
}

fn monster_record_summary(index: usize, record: &[u8]) -> BTreeMap<String, Value> {
    summary([
        (
            "displayName",
            json!(decoded_fixed_text(record, 170, 40)
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| format!("Monster {index}"))),
        ),
        ("description", json!(decoded_pascal_text(record, 210, 256))),
        ("hitDice", json!(record[0])),
        ("staminaBonus", json!(record[1])),
        ("agility", json!(record[2])),
        ("movementMax", json!(record[4])),
        ("armor", json!(signed_byte(record[5]))),
        ("magicResistance", json!(signed_byte(record[6]))),
        ("distance", json!(signed_byte(record[7]))),
        ("traitor", json!(signed_byte(record[8]))),
        ("size", json!(signed_byte(record[9]))),
        (
            "typeFlags",
            json!(record[10..18]
                .iter()
                .map(|byte| signed_byte(*byte))
                .collect::<Vec<_>>()),
        ),
        ("attackCount", json!(signed_byte(record[18]))),
        ("magicAttackCount", json!(signed_byte(record[19]))),
        (
            "attacks",
            json!((0..5)
                .map(|row| record[20 + row * 4..24 + row * 4]
                    .iter()
                    .map(|byte| signed_byte(*byte))
                    .collect::<Vec<_>>())
                .collect::<Vec<_>>()),
        ),
        ("damageBonus", json!(signed_byte(record[40]))),
        ("castPercent", json!(signed_byte(record[41]))),
        ("runPercent", json!(signed_byte(record[42]))),
        ("surrenderPercent", json!(signed_byte(record[43]))),
        ("missilePercent", json!(signed_byte(record[44]))),
        ("canSummon", json!(signed_byte(record[45]))),
        (
            "saves",
            json!(record[46..52]
                .iter()
                .map(|byte| signed_byte(*byte))
                .collect::<Vec<_>>()),
        ),
        (
            "spellImmunities",
            json!(record[52..58]
                .iter()
                .map(|byte| signed_byte(*byte))
                .collect::<Vec<_>>()),
        ),
        ("money", json!(read_i16s(record, 58, 3))),
        ("spells", json!(read_i16s(record, 64, 10))),
        ("items", json!(read_i16s(record, 84, 6))),
        ("weapon", json!(i16_be(record, 96))),
        ("iconId", json!(i16_be(record, 98))),
        ("spellPoints", json!(i16_be(record, 100))),
        ("exp", json!(i16_be(record, 102))),
        ("stamina", json!(i16_be(record, 104))),
        ("staminaMax", json!(i16_be(record, 106))),
        ("underneath", json!(read_i16s(record, 108, 4))),
        ("target", json!(signed_byte(record[116]))),
        ("guarding", json!(signed_byte(record[117]))),
        ("notOnMenu", json!(record[118] != 0)),
        ("beenAttacked", json!(signed_byte(record[119]))),
        ("movement", json!(signed_byte(record[120]))),
        ("magicToHit", json!(signed_byte(record[121]))),
        (
            "conditions",
            json!(record[122..162]
                .iter()
                .map(|byte| signed_byte(*byte))
                .collect::<Vec<_>>()),
        ),
        ("lr", json!(signed_byte(record[162]))),
        ("up", json!(signed_byte(record[163]))),
        ("attackNum", json!(signed_byte(record[164]))),
        ("bonusAttack", json!(signed_byte(record[165]))),
        ("deathMacro", json!(i16_be(record, 166))),
        ("maxSpellPoints", json!(i16_be(record, 168))),
    ])
}

fn item_record_summary(index: usize, record: &[u8], source_name: &str) -> BTreeMap<String, Value> {
    let base_id = if source_name == "Data NI" { 800 } else { 0 };
    let item_number = base_id + index;
    let category_index = item_number / 200;
    let category_slot = item_number % 200;
    let category = match category_index {
        0 => "Weapon",
        1 => "Armor",
        2 => "Accessory",
        3 => "Magic",
        4 => "Supply / Special",
        _ => "Item",
    };
    let fallback_id = item_number;
    let stored_id = i16_be(record, 2);
    let item_id = if stored_id != 0 {
        stored_id
    } else {
        fallback_id as i16
    };
    summary([
        ("itemId", json!(item_id)),
        ("category", json!(category)),
        ("categorySlot", json!(category_slot)),
        ("sourceFile", json!(source_name)),
        ("scenarioLocal", json!(source_name == "Data NI")),
        (
            "divinityEditableRange",
            json!((900..=999).contains(&item_id)),
        ),
        ("st", json!(i16_be(record, 0))),
        ("storedItemId", json!(stored_id)),
        ("iconId", json!(i16_be(record, 4))),
        ("type", json!(i16_be(record, 6))),
        ("blunt", json!(i16_be(record, 8))),
        ("hands", json!(i16_be(record, 10))),
        ("lu", json!(i16_be(record, 12))),
        ("movement", json!(i16_be(record, 14))),
        ("ac", json!(i16_be(record, 16))),
        ("magicResistance", json!(i16_be(record, 18))),
        ("damage", json!(i16_be(record, 20))),
        ("spellPoints", json!(i16_be(record, 22))),
        ("sound", json!(i16_be(record, 24))),
        ("weight", json!(i16_be(record, 26))),
        ("cost", json!(i16_be(record, 28))),
        ("charge", json!(i16_be(record, 30))),
        ("cursedItemId", json!(i16_be(record, 32))),
        ("magical", json!(i16_be(record, 34))),
        ("itemCat0", json!(i32_be(record, 36))),
        ("itemCat1", json!(i32_be(record, 40))),
        ("raceRestrictions", json!(i16_be(record, 44))),
        ("casteRestrictions", json!(i16_be(record, 46))),
        ("specificRace", json!(i16_be(record, 48))),
        ("specificCaste", json!(i16_be(record, 50))),
        ("raceClassOnly", json!(i16_be(record, 52))),
        ("casteClassOnly", json!(i16_be(record, 54))),
        ("vSmall", json!(i16_be(record, 70))),
        ("vLarge", json!(i16_be(record, 72))),
        ("heat", json!(i16_be(record, 74))),
        ("cold", json!(i16_be(record, 76))),
        ("electric", json!(i16_be(record, 78))),
        ("vsUndead", json!(i16_be(record, 80))),
        ("vsDemonDevil", json!(i16_be(record, 82))),
        ("vsEvil", json!(i16_be(record, 84))),
        ("special1", json!(i16_be(record, 86))),
        ("special2", json!(i16_be(record, 88))),
        ("special3", json!(i16_be(record, 90))),
        ("special4", json!(i16_be(record, 92))),
        ("special5", json!(i16_be(record, 94))),
        ("weightPerCharge", json!(i16_be(record, 96))),
        ("dropOnEmpty", json!(i16_be(record, 98))),
    ])
}

fn resource_payload_summary(resource_type: &str, data: &[u8]) -> BTreeMap<String, Value> {
    if resource_type == "STR#" {
        let strings = parse_string_list_resource(data);
        return summary([
            ("family", json!("string-list")),
            ("stringCount", json!(strings.len())),
            ("strings", json!(strings)),
        ]);
    }
    BTreeMap::new()
}

fn spell_record_summary(index: usize, record: &[u8]) -> BTreeMap<String, Value> {
    let spellcaster_class = index / 105;
    let within_class = index % 105;
    let level_index = within_class / 15;
    let spell_slot = within_class % 15;
    let packed_spell_id = (spellcaster_class + 1) * 1000 + (level_index + 1) * 100 + spell_slot + 1;
    summary([
        ("packedSpellId", json!(packed_spell_id)),
        ("spellcasterClass", json!(spellcaster_class)),
        ("spellLevel", json!(level_index + 1)),
        ("spellSlot", json!(spell_slot)),
        ("visibleSpellSlot", json!(spell_slot < 12)),
        (
            "spellNameResourceId",
            json!((spellcaster_class + 1) * 1000 + level_index),
        ),
        ("range1", json!(record[0])),
        ("range2", json!(record[1])),
        ("queueIcon", json!(record[2])),
        ("toHitBonus", json!(signed_byte(record[3]))),
        ("saveBonus", json!(signed_byte(record[4]))),
        ("fixedTargetNum", json!(record[5])),
        ("canRotate", json!(record[6])),
        ("saveAdjust", json!(signed_byte(record[7]))),
        ("cannot", json!(record[8])),
        ("resistAdjust", json!(signed_byte(record[9]))),
        ("cost", json!(record[10])),
        ("damage1", json!(record[11])),
        ("damage2", json!(record[12])),
        ("powerDamage1", json!(record[13])),
        ("powerDamage2", json!(record[14])),
        ("duration1", json!(record[15])),
        ("duration2", json!(record[16])),
        ("powerDuration1", json!(record[17])),
        ("powerDuration2", json!(record[18])),
        ("spellLook1", json!(record[19])),
        ("spellLook2", json!(record[20])),
        ("sound1", json!(record[21])),
        ("sound2", json!(record[22])),
        ("targetType", json!(record[23])),
        ("size", json!(record[24])),
        ("special", json!(record[25])),
        ("damageType", json!(record[26])),
        ("spellClass", json!(record[27])),
        ("inCombat", json!(record[28] != 0)),
        ("inCamp", json!(record[29] != 0)),
    ])
}

fn race_record_summary(index: usize, record: &[u8]) -> BTreeMap<String, Value> {
    summary([
        ("raceNumber", json!(index + 1)),
        ("plusMinusToHit", json!(read_i16s(record, 0, 8))),
        ("specialAbility", json!(read_i16s(record, 16, 14))),
        ("drvBonus", json!(read_i16s(record, 44, 8))),
        ("attBonus", json!(read_i16s(record, 60, 6))),
        ("minMax", json!(read_i16s(record, 72, 12))),
        ("conditions", json!(read_i16s(record, 112, 40))),
        ("maxAge", json!(i16_be(record, 192))),
        ("doesNotDie", json!(i16_be(record, 194))),
        ("baseMove", json!(i16_be(record, 196))),
        ("magRes", json!(i16_be(record, 198))),
        ("twoHand", json!(i16_be(record, 200))),
        ("missile", json!(i16_be(record, 202))),
        ("numOfAttacks", json!(read_i16s(record, 204, 2))),
        ("canCaste", json!(record[208..238].to_vec())),
        (
            "ageRange",
            json!((0..5)
                .map(|band| read_i16s(record, 238 + band * 4, 2))
                .collect::<Vec<_>>()),
        ),
        (
            "ageChange",
            json!((0..5)
                .map(|band| record[258 + band * 15..258 + (band + 1) * 15]
                    .iter()
                    .map(|byte| signed_byte(*byte))
                    .collect::<Vec<_>>())
                .collect::<Vec<_>>()),
        ),
        ("canRegenerate", json!(record[333])),
        ("defaultIconSet", json!(i16_be(record, 334))),
        (
            "itemTypes",
            json!([i32_be(record, 336), i32_be(record, 340)]),
        ),
        ("descriptors", json!(i16_be(record, 344))),
    ])
}

fn caste_record_summary(index: usize, record: &[u8]) -> BTreeMap<String, Value> {
    summary([
        ("casteNumber", json!(index + 1)),
        (
            "specialAbility",
            json!([read_i16s(record, 0, 14), read_i16s(record, 28, 14)]),
        ),
        ("drvBonus", json!(read_i16s(record, 56, 8))),
        ("attBonus", json!(read_i16s(record, 72, 6))),
        (
            "spellcasters",
            json!((0..4)
                .map(|row| read_i16s(record, 84 + row * 6, 3))
                .collect::<Vec<_>>()),
        ),
        ("minMax", json!(read_i16s(record, 108, 12))),
        ("conditions", json!(read_i16s(record, 132, 40))),
        ("canUseMissile", json!(i16_be(record, 212))),
        ("getsMissileBonus", json!(i16_be(record, 214))),
        ("stamina", json!(read_i16s(record, 216, 2))),
        ("strength", json!(read_i16s(record, 220, 2))),
        ("dodge", json!(read_i16s(record, 224, 2))),
        ("toHit", json!(read_i16s(record, 228, 2))),
        ("missile", json!(read_i16s(record, 232, 2))),
        ("hand2Hand", json!(read_i16s(record, 236, 2))),
        ("casteClass", json!(i16_be(record, 248))),
        ("minimumAgeGroup", json!(i16_be(record, 250))),
        ("moveBonus", json!(i16_be(record, 252))),
        ("magRes", json!(i16_be(record, 254))),
        ("twoHand", json!(i16_be(record, 256))),
        ("maxStaminaBonus", json!(i16_be(record, 258))),
        ("bonusAttacks", json!(i16_be(record, 260))),
        ("maxAttacks", json!(i16_be(record, 262))),
        ("victory", json!(read_i32s(record, 264, 30))),
        ("startMoney", json!(i16_be(record, 384))),
        ("startItems", json!(read_i16s(record, 386, 20))),
        ("attacks", json!(record[426..436].to_vec())),
        (
            "itemTypes",
            json!([i32_be(record, 436), i32_be(record, 440)]),
        ),
        ("defaultIcon", json!(i16_be(record, 444))),
        ("maxSpellsAttacks", json!(i16_be(record, 446))),
        ("spellsSoFar", json!(i16_be(record, 448))),
    ])
}

fn read_i16s(record: &[u8], offset: usize, count: usize) -> Vec<i16> {
    (0..count)
        .map(|index| i16_be(record, offset + index * 2))
        .collect()
}

fn decoded_fixed_text(record: &[u8], offset: usize, length: usize) -> Option<String> {
    if record.len() <= offset {
        return None;
    }
    let end = (offset + length).min(record.len());
    let text = decode_classic_text(&record[offset..end])
        .trim_matches(char::from(0))
        .trim()
        .to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn decoded_pascal_text(record: &[u8], offset: usize, max_length: usize) -> String {
    if record.len() <= offset {
        return String::new();
    }
    let end = (offset + max_length).min(record.len());
    let bytes = &record[offset..end];
    if bytes.is_empty() {
        return String::new();
    }
    let length = usize::from(bytes[0]).min(bytes.len().saturating_sub(1));
    decode_classic_text(&bytes[1..1 + length])
        .trim_end()
        .to_string()
}

fn signed_byte(value: u8) -> i8 {
    value as i8
}

fn library_role(path: &Path) -> String {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if is_resource_file(name) {
        "resource-fork".to_string()
    } else if matches!(
        name,
        "Data ID" | "Data NI" | "Data Spell" | "Data S" | "Data Race" | "Data Caste"
    ) {
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
    decorate_rule_catalog(catalog);
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

fn catalog_has_source_kind(
    catalog: Option<&LibraryCatalog>,
    source_kind: LibrarySourceKind,
) -> bool {
    catalog
        .map(|catalog| {
            catalog
                .sources
                .iter()
                .any(|source| source.source_kind == source_kind)
        })
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

fn i16_be(buffer: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([buffer[offset], buffer[offset + 1]])
}

fn i32_be(buffer: &[u8], offset: usize) -> i32 {
    i32::from_be_bytes([
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3],
    ])
}

fn read_i32s(record: &[u8], offset: usize, count: usize) -> Vec<i32> {
    (0..count)
        .map(|index| i32_be(record, offset + index * 4))
        .collect()
}

fn u16_be(buffer: &[u8], offset: usize) -> Option<u16> {
    if offset + 2 > buffer.len() {
        return None;
    }
    Some(u16::from_be_bytes([buffer[offset], buffer[offset + 1]]))
}

fn parse_string_list_resource(data: &[u8]) -> Vec<String> {
    let Some(count) = u16_be(data, 0) else {
        return Vec::new();
    };
    let mut strings = Vec::new();
    let mut cursor = 2usize;
    for _ in 0..count {
        if cursor >= data.len() {
            break;
        }
        let length = data[cursor] as usize;
        cursor += 1;
        let end = cursor.saturating_add(length);
        if end > data.len() {
            strings.push(decode_classic_text(&data[cursor..]));
            break;
        }
        strings.push(decode_classic_text(&data[cursor..end]));
        cursor = end;
    }
    strings
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

    fn write_i16(bytes: &mut [u8], offset: usize, value: i16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
    }

    fn item_record(item_id: i16, icon_id: i16, damage: i16, cost: i16) -> Vec<u8> {
        let mut bytes = vec![0u8; 100];
        write_i16(&mut bytes, 2, item_id);
        write_i16(&mut bytes, 4, icon_id);
        write_i16(&mut bytes, 20, damage);
        write_i16(&mut bytes, 28, cost);
        bytes
    }

    fn stale_source_for(
        workspace: &Path,
        source_kind: LibrarySourceKind,
        relative_path: &str,
        bytes: &[u8],
    ) -> LibrarySource {
        LibrarySource {
            id: format!(
                "{}:{}",
                source_kind.source_prefix(),
                stable_token(relative_path)
            ),
            name: relative_path.to_string(),
            relative_path: relative_path.to_string(),
            original_path: relative_path.to_string(),
            source_kind,
            role: "test".to_string(),
            bytes: bytes.len() as u64,
            sha256: sha256_hex(bytes),
            copied_to: workspace
                .join("library")
                .join("raw")
                .join(source_kind.folder_name())
                .join(relative_path)
                .to_string_lossy()
                .to_string(),
            confidence: Confidence::FixtureBacked,
        }
    }

    #[test]
    fn divinity_import_builds_managed_catalog() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("Divinity");
        let data = source.join("Divinity Data");
        fs::create_dir_all(&data).expect("source");
        fs::write(data.join("Monster Scrap Book"), vec![1u8; 466]).expect("monster scrapbook");
        fs::write(data.join("Monster Mash.rsrc"), vec![0u8; 64]).expect("monster mash");
        fs::write(data.join("Vault of Arcana.rsrc"), vec![0u8; 64]).expect("vault");
        fs::write(data.join("Bag of Holding"), vec![2u8; 128]).expect("bag");
        let workspace = temp.path().join("workspace");

        let catalog = import_divinity_libraries(&source, &workspace).expect("import");

        assert!(catalog
            .sources
            .iter()
            .any(|source| source.name == "Monster Scrap Book"));
        assert!(catalog
            .entities
            .iter()
            .any(|entity| entity.entity_type == "monster-scrapbook-entry"));
        assert!(catalog
            .sources
            .iter()
            .any(|source| source.name == "Monster Mash.rsrc"));
        assert!(catalog
            .sources
            .iter()
            .any(|source| source.name == "Vault of Arcana.rsrc"));
        assert!(catalog
            .sources
            .iter()
            .any(|source| source.name == "Bag of Holding"));
        assert!(catalog
            .entities
            .iter()
            .any(|entity| entity.entity_type == "library-file"));
        assert!(workspace.join("library").join("catalog.json").is_file());
    }

    #[test]
    fn realmz_reference_import_emits_core_catalog_entities() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("Data Files");
        fs::create_dir_all(&source).expect("source");
        fs::write(source.join("Data ID"), vec![1u8; 1000]).expect("items");
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
    fn realmz_reference_import_decodes_item_catalog_records() {
        let temp = tempfile::tempdir().expect("tempdir");
        let source = temp.path().join("Data Files");
        fs::create_dir_all(&source).expect("source");
        let mut data_id = Vec::new();
        data_id.extend(item_record(12, 345, 9, 1250));
        data_id.extend(item_record(0, 0, 0, 0));
        fs::write(source.join("Data ID"), data_id).expect("items");
        let workspace = temp.path().join("workspace");

        let catalog = import_realmz_reference_data(&source, &workspace).expect("import");
        let item = catalog
            .entities
            .iter()
            .find(|entity| entity.entity_type == "item")
            .expect("item entity");

        assert_eq!(item.label, "Weapon 12");
        assert_eq!(item.summary.get("recordBytes"), Some(&json!(100)));
        assert_eq!(item.summary.get("itemId"), Some(&json!(12)));
        assert_eq!(item.summary.get("category"), Some(&json!("Weapon")));
        assert_eq!(item.summary.get("iconId"), Some(&json!(345)));
        assert_eq!(item.summary.get("damage"), Some(&json!(9)));
        assert_eq!(item.summary.get("cost"), Some(&json!(1250)));
    }

    #[test]
    fn workspace_auto_seeds_bundled_libraries() {
        let temp = tempfile::tempdir().expect("tempdir");
        let bundled = temp.path().join(BUNDLED_LIBRARY_DIR);
        let divinity = bundled.join("divinity").join("Divinity Data");
        let realmz = bundled.join("realmz-reference");
        fs::create_dir_all(&divinity).expect("divinity");
        fs::create_dir_all(&realmz).expect("realmz");
        fs::write(divinity.join("Monster Scrap Book"), vec![1u8; 466]).expect("scrapbook");
        fs::write(realmz.join("Data ID"), vec![2u8; 1000]).expect("items");
        let workspace_dir = temp.path().join("workspace");

        let workspace = open_workspace_with_bundled_libraries(&workspace_dir, Some(&bundled))
            .expect("workspace");
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
        assert!(catalog
            .entities
            .iter()
            .any(|entity| entity.entity_type == "item"));
    }

    #[test]
    fn workspace_refreshes_stale_bundled_realmz_rule_catalog() {
        let temp = tempfile::tempdir().expect("tempdir");
        let bundled = temp.path().join(BUNDLED_LIBRARY_DIR);
        let realmz = bundled.join("realmz-reference");
        fs::create_dir_all(&realmz).expect("realmz");
        let spells = vec![0u8; 30 * 525];
        let races = vec![0u8; 408 * 70];
        let castes = vec![0u8; 576 * 30];
        fs::write(realmz.join("Data S"), &spells).expect("spells");
        fs::write(realmz.join("Data Race"), &races).expect("races");
        fs::write(realmz.join("Data Caste"), &castes).expect("castes");
        let workspace_dir = temp.path().join("workspace");
        let stale_catalog = LibraryCatalog {
            schema_version: LIBRARY_SCHEMA_VERSION,
            imported_at: timestamp(),
            managed_path: library_dir(&workspace_dir).to_string_lossy().to_string(),
            sources: vec![
                stale_source_for(
                    &workspace_dir,
                    LibrarySourceKind::RealmzReference,
                    "Data S",
                    &spells,
                ),
                stale_source_for(
                    &workspace_dir,
                    LibrarySourceKind::RealmzReference,
                    "Data Race",
                    &races,
                ),
                stale_source_for(
                    &workspace_dir,
                    LibrarySourceKind::RealmzReference,
                    "Data Caste",
                    &castes,
                ),
            ],
            entities: vec![LibraryEntity {
                id: "library-entity:realmz:spell:0".to_string(),
                entity_type: "spell".to_string(),
                label: "Spell 0".to_string(),
                source: "library-source:realmz:data-s".to_string(),
                record_ref: None,
                edit_state: SemanticEditState::InspectOnly,
                confidence: Confidence::Inferred,
                summary: summary([("recordBytes", json!(126))]),
            }],
            ..LibraryCatalog::default()
        };
        save_catalog(&workspace_dir, &stale_catalog).expect("stale catalog");

        let workspace = open_workspace_with_bundled_libraries(&workspace_dir, Some(&bundled))
            .expect("workspace");
        let catalog = workspace.active_library_catalog.expect("catalog");
        let decoded_spells = catalog
            .entities
            .iter()
            .filter(|entity| {
                entity.entity_type == "spell"
                    && entity.summary.get("recordBytes").and_then(Value::as_u64) == Some(30)
                    && entity.summary.contains_key("packedSpellId")
            })
            .count();
        let decoded_races = catalog
            .entities
            .iter()
            .filter(|entity| {
                entity.entity_type == "race"
                    && entity.summary.get("recordBytes").and_then(Value::as_u64) == Some(408)
                    && entity.summary.contains_key("raceNumber")
            })
            .count();
        let decoded_castes = catalog
            .entities
            .iter()
            .filter(|entity| {
                entity.entity_type == "caste"
                    && entity.summary.get("recordBytes").and_then(Value::as_u64) == Some(576)
                    && entity.summary.contains_key("casteNumber")
            })
            .count();

        assert_eq!(decoded_spells, 525);
        assert_eq!(decoded_races, 70);
        assert_eq!(decoded_castes, 30);
    }
}
