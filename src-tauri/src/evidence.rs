use crate::error::{ProvidenceError, Result};
use crate::project::DiagnosticSeverity;
use crate::realmz::{
    parse_scenario_buffers, parse_scenario_shell, SUPPORTED_WRITE_FILES, TRACKED_FILES,
};
use crate::resource_fork::{parse_resource_fork_entries, resource_fork_payload};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub const SNAPSHOT_VERSION: u32 = 1;
pub const DIFF_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioSnapshot {
    pub snapshot_version: u32,
    pub tool_version: String,
    pub source_label: String,
    pub source_path: String,
    pub files: Vec<SnapshotFile>,
    pub decoded_summary: DecodedScenarioSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotFile {
    pub name: String,
    pub relative_path: String,
    pub role: SnapshotFileRole,
    pub size: u64,
    pub sha256: String,
    pub data_fork_base64: String,
    pub resource_fork_sha256: Option<String>,
    pub resource_fork_base64: Option<String>,
    pub resources: Vec<SnapshotResource>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SnapshotFileRole {
    SupportedWrite,
    TrackedPassThrough,
    ResourceFork,
    ScenarioShell,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotResource {
    pub resource_type: String,
    pub id: i16,
    pub name: String,
    pub attributes: u8,
    pub size: u64,
    pub sha256: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedScenarioSummary {
    pub record_counts: BTreeMap<String, usize>,
    pub maps: usize,
    pub land_layout: bool,
    pub map_records: usize,
    pub random_levels: usize,
    pub triggers: usize,
    pub messages: usize,
    pub battles: usize,
    pub monsters: usize,
    pub items: usize,
    pub treasures: usize,
    pub shops: usize,
    pub diagnostics: Vec<DecodedDiagnosticSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedDiagnosticSummary {
    pub severity: String,
    pub code: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioSnapshotDiff {
    pub diff_version: u32,
    pub before_label: String,
    pub after_label: String,
    pub files_added: Vec<SnapshotFileRef>,
    pub files_removed: Vec<SnapshotFileRef>,
    pub files_changed: Vec<FileDiff>,
    pub summary: DiffSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    pub added_files: usize,
    pub removed_files: usize,
    pub changed_files: usize,
    pub byte_ranges: usize,
    pub resources_added: usize,
    pub resources_removed: usize,
    pub resources_changed: usize,
    pub unexplained_changes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotFileRef {
    pub name: String,
    pub role: SnapshotFileRole,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub name: String,
    pub role: SnapshotFileRole,
    pub before_size: u64,
    pub after_size: u64,
    pub before_sha256: String,
    pub after_sha256: String,
    pub byte_ranges: Vec<ByteRangeDiff>,
    pub resources_added: Vec<SnapshotResourceRef>,
    pub resources_removed: Vec<SnapshotResourceRef>,
    pub resources_changed: Vec<ResourceDiff>,
    pub decoded_family: Option<String>,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByteRangeDiff {
    pub offset: u64,
    pub before_len: u64,
    pub after_len: u64,
    pub before_hex: String,
    pub after_hex: String,
    pub hex_truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotResourceRef {
    pub resource_type: String,
    pub id: i16,
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDiff {
    pub resource_type: String,
    pub id: i16,
    pub name: String,
    pub before_size: u64,
    pub after_size: u64,
    pub before_sha256: String,
    pub after_sha256: String,
}

pub fn snapshot_scenario_dir(
    source_path: &Path,
    source_label: Option<&str>,
) -> Result<ScenarioSnapshot> {
    if !source_path.is_dir() {
        return Err(ProvidenceError::message(format!(
            "Scenario source '{}' is not a directory",
            source_path.display()
        )));
    }
    let files = collect_snapshot_files(source_path)?;
    let decoded_summary = decoded_summary(&files);
    Ok(ScenarioSnapshot {
        snapshot_version: SNAPSHOT_VERSION,
        tool_version: env!("CARGO_PKG_VERSION").to_string(),
        source_label: source_label
            .map(str::to_string)
            .or_else(|| {
                source_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| "scenario".to_string()),
        source_path: source_path.to_string_lossy().to_string(),
        files,
        decoded_summary,
    })
}

pub fn diff_snapshots(
    before: &ScenarioSnapshot,
    after: &ScenarioSnapshot,
) -> Result<ScenarioSnapshotDiff> {
    if before.snapshot_version != SNAPSHOT_VERSION || after.snapshot_version != SNAPSHOT_VERSION {
        return Err(ProvidenceError::message(format!(
            "Unsupported snapshot version(s): before {}, after {}",
            before.snapshot_version, after.snapshot_version
        )));
    }

    let before_files: BTreeMap<&str, &SnapshotFile> = before
        .files
        .iter()
        .map(|file| (file.name.as_str(), file))
        .collect();
    let after_files: BTreeMap<&str, &SnapshotFile> = after
        .files
        .iter()
        .map(|file| (file.name.as_str(), file))
        .collect();
    let mut names = BTreeSet::new();
    names.extend(before_files.keys().copied());
    names.extend(after_files.keys().copied());

    let mut files_added = Vec::new();
    let mut files_removed = Vec::new();
    let mut files_changed = Vec::new();
    for name in names {
        match (before_files.get(name), after_files.get(name)) {
            (None, Some(file)) => files_added.push(file_ref(file)),
            (Some(file), None) => files_removed.push(file_ref(file)),
            (Some(before_file), Some(after_file)) => {
                if before_file.sha256 == after_file.sha256 {
                    continue;
                }
                files_changed.push(diff_file(before_file, after_file)?);
            }
            (None, None) => {}
        }
    }

    let mut summary = DiffSummary {
        added_files: files_added.len(),
        removed_files: files_removed.len(),
        changed_files: files_changed.len(),
        byte_ranges: 0,
        resources_added: 0,
        resources_removed: 0,
        resources_changed: 0,
        unexplained_changes: 0,
    };
    for file in &files_changed {
        summary.byte_ranges += file.byte_ranges.len();
        summary.resources_added += file.resources_added.len();
        summary.resources_removed += file.resources_removed.len();
        summary.resources_changed += file.resources_changed.len();
        if file.explanation == "raw-byte-change" {
            summary.unexplained_changes += 1;
        }
    }

    Ok(ScenarioSnapshotDiff {
        diff_version: DIFF_VERSION,
        before_label: before.source_label.clone(),
        after_label: after.source_label.clone(),
        files_added,
        files_removed,
        files_changed,
        summary,
    })
}

pub fn diff_to_markdown(diff: &ScenarioSnapshotDiff) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "# Scenario Snapshot Diff: {} -> {}\n\n",
        diff.before_label, diff.after_label
    ));
    out.push_str("## Summary\n\n");
    out.push_str(&format!("- Added files: {}\n", diff.summary.added_files));
    out.push_str(&format!(
        "- Removed files: {}\n",
        diff.summary.removed_files
    ));
    out.push_str(&format!(
        "- Changed files: {}\n",
        diff.summary.changed_files
    ));
    out.push_str(&format!("- Byte ranges: {}\n", diff.summary.byte_ranges));
    out.push_str(&format!(
        "- Resource changes: +{} / -{} / ~{}\n\n",
        diff.summary.resources_added,
        diff.summary.resources_removed,
        diff.summary.resources_changed
    ));

    if !diff.files_added.is_empty() {
        out.push_str("## Added Files\n\n");
        for file in &diff.files_added {
            out.push_str(&format!(
                "- `{}` ({:?}, {} bytes)\n",
                file.name, file.role, file.size
            ));
        }
        out.push('\n');
    }
    if !diff.files_removed.is_empty() {
        out.push_str("## Removed Files\n\n");
        for file in &diff.files_removed {
            out.push_str(&format!(
                "- `{}` ({:?}, {} bytes)\n",
                file.name, file.role, file.size
            ));
        }
        out.push('\n');
    }
    if !diff.files_changed.is_empty() {
        out.push_str("## Changed Files\n\n");
        for file in &diff.files_changed {
            out.push_str(&format!(
                "### `{}`\n\n- Role: `{:?}`\n- Explanation: `{}`\n- Before: `{}` ({} bytes)\n- After: `{}` ({} bytes)\n- Byte ranges: {}\n",
                file.name,
                file.role,
                file.explanation,
                file.before_sha256,
                file.before_size,
                file.after_sha256,
                file.after_size,
                file.byte_ranges.len()
            ));
            if let Some(family) = &file.decoded_family {
                out.push_str(&format!("- Decoded family: `{family}`\n"));
            }
            if !file.resources_added.is_empty()
                || !file.resources_removed.is_empty()
                || !file.resources_changed.is_empty()
            {
                out.push_str(&format!(
                    "- Resource changes: +{} / -{} / ~{}\n",
                    file.resources_added.len(),
                    file.resources_removed.len(),
                    file.resources_changed.len()
                ));
            }
            out.push('\n');
            if !file.byte_ranges.is_empty() {
                out.push_str("| Offset | Before Len | After Len | Before Hex | After Hex |\n");
                out.push_str("| ---: | ---: | ---: | --- | --- |\n");
                for range in &file.byte_ranges {
                    out.push_str(&format!(
                        "| `{}` | `{}` | `{}` | `{}` | `{}` |\n",
                        range.offset,
                        range.before_len,
                        range.after_len,
                        range.before_hex,
                        range.after_hex
                    ));
                }
                out.push('\n');
            }
        }
    }
    out
}

fn collect_snapshot_files(source_path: &Path) -> Result<Vec<SnapshotFile>> {
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
        if name == ".DS_Store" {
            continue;
        }
        let bytes = fs::read(path).map_err(|error| {
            ProvidenceError::message(format!("Failed to read '{}': {error}", path.display()))
        })?;
        let has_resource_entries = !parse_resource_fork_entries(&bytes).is_empty();
        let role = if supported.contains(name) {
            SnapshotFileRole::SupportedWrite
        } else if is_scenario_marker_source(source_path, name, &bytes) {
            SnapshotFileRole::ScenarioShell
        } else if has_resource_entries || is_resource_sidecar_file_name(name) {
            SnapshotFileRole::ResourceFork
        } else if tracked.contains(name) {
            SnapshotFileRole::TrackedPassThrough
        } else {
            SnapshotFileRole::Unknown
        };
        files.push(snapshot_file(name, name, role, bytes));
    }
    snapshot_macosx_sidecars(source_path, &mut files)?;
    files.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(files)
}

fn snapshot_macosx_sidecars(source_path: &Path, files: &mut Vec<SnapshotFile>) -> Result<()> {
    let macosx_dir = source_path.join("__MACOSX");
    if !macosx_dir.is_dir() {
        return Ok(());
    }
    let mut existing_names: BTreeSet<String> = files.iter().map(|file| file.name.clone()).collect();
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
        let bytes = fs::read(entry.path()).map_err(|error| {
            ProvidenceError::message(format!(
                "Failed to read '{}': {error}",
                entry.path().display()
            ))
        })?;
        let resource_bytes = resource_fork_payload(&bytes).to_vec();
        if parse_resource_fork_entries(&resource_bytes).is_empty() {
            continue;
        }
        let resource_name = if data_name == "Scenario" {
            "Scenario.rsrc".to_string()
        } else {
            format!("{data_name}.rsrc")
        };
        if existing_names.insert(resource_name.clone()) {
            files.push(snapshot_file(
                &resource_name,
                &format!("__MACOSX/{sidecar_name}"),
                SnapshotFileRole::ResourceFork,
                resource_bytes,
            ));
        }
    }
    Ok(())
}

fn snapshot_file(
    name: &str,
    relative_path: &str,
    role: SnapshotFileRole,
    bytes: Vec<u8>,
) -> SnapshotFile {
    let resources = snapshot_resources(&bytes);
    let (resource_fork_sha256, resource_fork_base64) = if resources.is_empty() {
        (None, None)
    } else {
        let payload = resource_fork_payload(&bytes);
        (Some(sha256_hex(payload)), Some(STANDARD.encode(payload)))
    };
    SnapshotFile {
        name: name.to_string(),
        relative_path: relative_path.to_string(),
        role,
        size: bytes.len() as u64,
        sha256: sha256_hex(&bytes),
        data_fork_base64: STANDARD.encode(bytes),
        resource_fork_sha256,
        resource_fork_base64,
        resources,
    }
}

fn snapshot_resources(bytes: &[u8]) -> Vec<SnapshotResource> {
    let mut resources: Vec<SnapshotResource> = parse_resource_fork_entries(bytes)
        .into_iter()
        .map(|entry| SnapshotResource {
            resource_type: entry.resource_type,
            id: entry.id,
            name: entry.name,
            attributes: entry.attributes,
            size: entry.data.len() as u64,
            sha256: sha256_hex(&entry.data),
            data_base64: STANDARD.encode(entry.data),
        })
        .collect();
    resources.sort_by(|left, right| {
        (
            left.resource_type.as_str(),
            left.id,
            left.name.as_str(),
            left.attributes,
        )
            .cmp(&(
                right.resource_type.as_str(),
                right.id,
                right.name.as_str(),
                right.attributes,
            ))
    });
    resources
}

fn decoded_summary(files: &[SnapshotFile]) -> DecodedScenarioSummary {
    let mut buffers = BTreeMap::new();
    for file in files {
        if matches!(
            file.role,
            SnapshotFileRole::SupportedWrite
                | SnapshotFileRole::TrackedPassThrough
                | SnapshotFileRole::ScenarioShell
                | SnapshotFileRole::ResourceFork
        ) {
            if let Ok(bytes) = STANDARD.decode(&file.data_fork_base64) {
                buffers.insert(file.name.clone(), bytes);
            }
        }
    }
    let parsed = parse_scenario_buffers(&buffers);
    parsed_summary(parsed)
}

fn parsed_summary(parsed: crate::realmz::ParsedScenario) -> DecodedScenarioSummary {
    DecodedScenarioSummary {
        record_counts: parsed.records.counts,
        maps: parsed.maps.len(),
        land_layout: parsed.land_layout.is_some(),
        map_records: parsed.map_records.len(),
        random_levels: parsed.random_levels.len(),
        triggers: parsed.triggers.len(),
        messages: parsed.messages.len(),
        battles: parsed.battles.len(),
        monsters: parsed.monsters.len(),
        items: parsed.scenario_items.len(),
        treasures: parsed.treasures.len(),
        shops: parsed.shops.len(),
        diagnostics: parsed
            .diagnostics
            .into_iter()
            .map(|diagnostic| DecodedDiagnosticSummary {
                severity: match diagnostic.severity {
                    DiagnosticSeverity::Info => "info",
                    DiagnosticSeverity::Warning => "warning",
                    DiagnosticSeverity::Error => "error",
                }
                .to_string(),
                code: diagnostic.code,
                source: diagnostic.source,
            })
            .collect(),
    }
}

fn diff_file(before: &SnapshotFile, after: &SnapshotFile) -> Result<FileDiff> {
    let before_bytes = decode_base64(&before.data_fork_base64, &before.name)?;
    let after_bytes = decode_base64(&after.data_fork_base64, &after.name)?;
    let (resources_added, resources_removed, resources_changed) =
        diff_resources(&before.resources, &after.resources);
    let explanation = if !resources_added.is_empty()
        || !resources_removed.is_empty()
        || !resources_changed.is_empty()
    {
        "resource-fork-change"
    } else if matches!(
        before.role,
        SnapshotFileRole::SupportedWrite | SnapshotFileRole::ScenarioShell
    ) {
        "known-scenario-file-change"
    } else {
        "raw-byte-change"
    };
    Ok(FileDiff {
        name: before.name.clone(),
        role: if before.role == after.role {
            before.role
        } else {
            after.role
        },
        before_size: before.size,
        after_size: after.size,
        before_sha256: before.sha256.clone(),
        after_sha256: after.sha256.clone(),
        byte_ranges: byte_ranges(&before_bytes, &after_bytes),
        resources_added,
        resources_removed,
        resources_changed,
        decoded_family: decoded_family(&before.name, before.role).map(str::to_string),
        explanation: explanation.to_string(),
    })
}

fn diff_resources(
    before: &[SnapshotResource],
    after: &[SnapshotResource],
) -> (
    Vec<SnapshotResourceRef>,
    Vec<SnapshotResourceRef>,
    Vec<ResourceDiff>,
) {
    let before_map: BTreeMap<(&str, i16, &str), &SnapshotResource> = before
        .iter()
        .map(|resource| {
            (
                (
                    resource.resource_type.as_str(),
                    resource.id,
                    resource.name.as_str(),
                ),
                resource,
            )
        })
        .collect();
    let after_map: BTreeMap<(&str, i16, &str), &SnapshotResource> = after
        .iter()
        .map(|resource| {
            (
                (
                    resource.resource_type.as_str(),
                    resource.id,
                    resource.name.as_str(),
                ),
                resource,
            )
        })
        .collect();
    let mut keys = BTreeSet::new();
    keys.extend(before_map.keys().copied());
    keys.extend(after_map.keys().copied());
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut changed = Vec::new();
    for key in keys {
        match (before_map.get(&key), after_map.get(&key)) {
            (None, Some(resource)) => added.push(resource_ref(resource)),
            (Some(resource), None) => removed.push(resource_ref(resource)),
            (Some(before), Some(after))
                if before.sha256 != after.sha256 || before.attributes != after.attributes =>
            {
                changed.push(ResourceDiff {
                    resource_type: before.resource_type.clone(),
                    id: before.id,
                    name: before.name.clone(),
                    before_size: before.size,
                    after_size: after.size,
                    before_sha256: before.sha256.clone(),
                    after_sha256: after.sha256.clone(),
                });
            }
            _ => {}
        }
    }
    (added, removed, changed)
}

fn byte_ranges(before: &[u8], after: &[u8]) -> Vec<ByteRangeDiff> {
    let shared = before.len().min(after.len());
    let mut ranges = Vec::new();
    let mut index = 0usize;
    while index < shared {
        if before[index] == after[index] {
            index += 1;
            continue;
        }
        let start = index;
        while index < shared && before[index] != after[index] {
            index += 1;
        }
        ranges.push(byte_range(
            start,
            &before[start..index],
            &after[start..index],
        ));
    }
    if before.len() != after.len() {
        let start = shared;
        ranges.push(byte_range(start, &before[start..], &after[start..]));
    }
    ranges
}

fn byte_range(offset: usize, before: &[u8], after: &[u8]) -> ByteRangeDiff {
    const HEX_LIMIT: usize = 256;
    let before_part = &before[..before.len().min(HEX_LIMIT)];
    let after_part = &after[..after.len().min(HEX_LIMIT)];
    ByteRangeDiff {
        offset: offset as u64,
        before_len: before.len() as u64,
        after_len: after.len() as u64,
        before_hex: hex::encode(before_part),
        after_hex: hex::encode(after_part),
        hex_truncated: before.len() > HEX_LIMIT || after.len() > HEX_LIMIT,
    }
}

fn file_ref(file: &SnapshotFile) -> SnapshotFileRef {
    SnapshotFileRef {
        name: file.name.clone(),
        role: file.role,
        size: file.size,
        sha256: file.sha256.clone(),
    }
}

fn resource_ref(resource: &SnapshotResource) -> SnapshotResourceRef {
    SnapshotResourceRef {
        resource_type: resource.resource_type.clone(),
        id: resource.id,
        name: resource.name.clone(),
        size: resource.size,
        sha256: resource.sha256.clone(),
    }
}

fn decode_base64(value: &str, name: &str) -> Result<Vec<u8>> {
    STANDARD.decode(value).map_err(|error| {
        ProvidenceError::message(format!(
            "Snapshot file '{name}' contains invalid base64: {error}"
        ))
    })
}

fn is_scenario_marker_source(source_path: &Path, name: &str, bytes: &[u8]) -> bool {
    let Some(scenario_dir_name) = source_path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    name.eq_ignore_ascii_case(scenario_dir_name) && parse_scenario_shell(name, bytes).is_ok()
}

fn is_resource_sidecar_file_name(name: &str) -> bool {
    name.ends_with(".rsrc") || name.ends_with(".rsf") || name.starts_with("._")
}

fn decoded_family(name: &str, role: SnapshotFileRole) -> Option<&'static str> {
    if matches!(role, SnapshotFileRole::ScenarioShell) {
        return Some("scenario-shell");
    }
    match name {
        "Scenario" => Some("scenario-support-file"),
        "Global" => Some("global-startup"),
        "Data LD" | "Data DL" => Some("map-fields"),
        "Data RD" | "Data RDD" => Some("random-levels"),
        "Data ED" | "Data ED2" | "Data ED3" | "Data EDCD" => Some("action-points"),
        "Data MD" | "Data MD1" | "Data MD-1" | "Data DES" => Some("monsters"),
        "Data BD" => Some("battles"),
        "Data SD" => Some("shops"),
        "Data SD2" => Some("messages"),
        "Data OD" => Some("option-labels"),
        "Data MD2" => Some("map-records"),
        "Data TD" => Some("treasure"),
        "Data TD2" | "Data TD3" => Some("encounters"),
        "Data NI" => Some("items"),
        "Data Spell" => Some("spells"),
        "Data Race" => Some("races"),
        "Data Caste" => Some("castes"),
        "Data CI" | "Data RI" | "Data CS" => Some("scenario-restrictions"),
        "Layout" => Some("land-layout"),
        "Data Solids" => Some("special-tile-solidity"),
        _ => None,
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ProvidenceError::message(format!("Failed to create '{}': {error}", parent.display()))
        })?;
    }
    let json = serde_json::to_string_pretty(value).map_err(|error| {
        ProvidenceError::message(format!("Failed to serialize evidence JSON: {error}"))
    })?;
    fs::write(path, format!("{json}\n")).map_err(|error| {
        ProvidenceError::message(format!("Failed to write '{}': {error}", path.display()))
    })
}

pub fn read_snapshot_file(path: &Path) -> Result<ScenarioSnapshot> {
    let bytes = fs::read(path).map_err(|error| {
        ProvidenceError::message(format!("Failed to read '{}': {error}", path.display()))
    })?;
    serde_json::from_slice(&bytes).map_err(|error| {
        ProvidenceError::message(format!(
            "Failed to parse snapshot '{}': {error}",
            path.display()
        ))
    })
}

pub fn write_text_file(path: &Path, value: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ProvidenceError::message(format!("Failed to create '{}': {error}", parent.display()))
        })?;
    }
    fs::write(path, value).map_err(|error| {
        ProvidenceError::message(format!("Failed to write '{}': {error}", path.display()))
    })
}

pub fn copy_dir_contents(source: &Path, dest: &Path) -> Result<()> {
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|error| {
            ProvidenceError::message(format!("Failed to clear '{}': {error}", dest.display()))
        })?;
    }
    fs::create_dir_all(dest).map_err(|error| {
        ProvidenceError::message(format!("Failed to create '{}': {error}", dest.display()))
    })?;
    for entry in WalkDir::new(source).min_depth(1) {
        let entry = entry.map_err(|error| ProvidenceError::message(error.to_string()))?;
        let relative = entry.path().strip_prefix(source).map_err(|error| {
            ProvidenceError::message(format!(
                "Failed to relativize '{}': {error}",
                entry.path().display()
            ))
        })?;
        let out_path: PathBuf = dest.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&out_path).map_err(|error| {
                ProvidenceError::message(format!(
                    "Failed to create '{}': {error}",
                    out_path.display()
                ))
            })?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    ProvidenceError::message(format!(
                        "Failed to create '{}': {error}",
                        parent.display()
                    ))
                })?;
            }
            fs::copy(entry.path(), &out_path).map_err(|error| {
                ProvidenceError::message(format!(
                    "Failed to copy '{}' to '{}': {error}",
                    entry.path().display(),
                    out_path.display()
                ))
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resource_fork::{write_resource_fork, ResourceForkEntry};
    use tempfile::tempdir;

    #[test]
    fn snapshot_is_deterministic_for_same_input() {
        let dir = tempdir().unwrap();
        let scenario = dir.path().join("Tiny Scenario");
        fs::create_dir(&scenario).unwrap();
        fs::write(scenario.join("Data SD2"), vec![0u8; 512]).unwrap();
        fs::write(scenario.join("notes.txt"), b"hello").unwrap();

        let first = snapshot_scenario_dir(&scenario, Some("tiny")).unwrap();
        let second = snapshot_scenario_dir(&scenario, Some("tiny")).unwrap();

        assert_eq!(
            serde_json::to_string_pretty(&first).unwrap(),
            serde_json::to_string_pretty(&second).unwrap()
        );
        assert_eq!(first.files[0].name, "Data SD2");
        assert_eq!(first.files[1].name, "notes.txt");
    }

    #[test]
    fn diff_groups_byte_changes_and_labels_known_files() {
        let dir = tempdir().unwrap();
        let before_dir = dir.path().join("before");
        let after_dir = dir.path().join("after");
        fs::create_dir(&before_dir).unwrap();
        fs::create_dir(&after_dir).unwrap();
        fs::write(before_dir.join("Data SD2"), vec![0, 0, 0, 0, 0, 0]).unwrap();
        fs::write(after_dir.join("Data SD2"), vec![0, 1, 2, 0, 3, 0]).unwrap();

        let before = snapshot_scenario_dir(&before_dir, Some("before")).unwrap();
        let after = snapshot_scenario_dir(&after_dir, Some("after")).unwrap();
        let diff = diff_snapshots(&before, &after).unwrap();

        assert_eq!(diff.files_changed.len(), 1);
        let file = &diff.files_changed[0];
        assert_eq!(file.decoded_family.as_deref(), Some("messages"));
        assert_eq!(file.byte_ranges.len(), 2);
        assert_eq!(file.byte_ranges[0].offset, 1);
        assert_eq!(file.byte_ranges[0].before_len, 2);
    }

    #[test]
    fn snapshot_sorts_and_diffs_resource_entries() {
        let before_fork = write_resource_fork(&[
            ResourceForkEntry {
                resource_type: "snd ".to_string(),
                id: 2,
                name: "B".to_string(),
                attributes: 0,
                data: vec![2, 2],
            },
            ResourceForkEntry {
                resource_type: "cicn".to_string(),
                id: 1,
                name: "A".to_string(),
                attributes: 0,
                data: vec![1],
            },
        ])
        .unwrap();
        let after_fork = write_resource_fork(&[
            ResourceForkEntry {
                resource_type: "cicn".to_string(),
                id: 1,
                name: "A".to_string(),
                attributes: 0,
                data: vec![9],
            },
            ResourceForkEntry {
                resource_type: "PICT".to_string(),
                id: 3,
                name: "C".to_string(),
                attributes: 0,
                data: vec![3],
            },
        ])
        .unwrap();
        let before = snapshot_file(
            "Scenario.rsrc",
            "Scenario.rsrc",
            SnapshotFileRole::ResourceFork,
            before_fork,
        );
        let after = snapshot_file(
            "Scenario.rsrc",
            "Scenario.rsrc",
            SnapshotFileRole::ResourceFork,
            after_fork,
        );
        assert_eq!(before.resources[0].resource_type, "cicn");
        assert_eq!(before.resources[1].resource_type, "snd ");

        let file_diff = diff_file(&before, &after).unwrap();
        assert_eq!(file_diff.resources_added.len(), 1);
        assert_eq!(file_diff.resources_removed.len(), 1);
        assert_eq!(file_diff.resources_changed.len(), 1);
    }
}
