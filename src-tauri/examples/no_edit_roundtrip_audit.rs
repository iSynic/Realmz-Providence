use realmz_providence_lib::exporter::export_project;
use realmz_providence_lib::importer::import_scenario;
use realmz_providence_lib::project::SourceFileRole;
use realmz_providence_lib::realmz::{SUPPORTED_WRITE_FILES, TRACKED_FILES};
use serde::{Serialize, Serializer};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

const DEFAULT_ROOTS: &[&str] = &[
    "F:/Realmz/out_win_clang/Scenarios",
    "F:/Realmz/base/Realmz/Scenarios",
    "F:/Divinity CD/Divinity CD/Install Options/Scenarios",
    "F:/Divinity CD/Divinity CD/Install Options/3rd Party Scenarios",
    "F:/Divinity CD/Divinity CD/Realmz 8.0.7 Beta/Scenarios",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditReport {
    generated_at_unix: u64,
    roots: Vec<String>,
    aggregate: AuditAggregate,
    scenarios: Vec<ScenarioAudit>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditAggregate {
    roots_found: usize,
    candidate_scenarios: usize,
    imported: usize,
    import_errors: usize,
    export_errors: usize,
    byte_identical_scenarios: usize,
    mismatched_scenarios: usize,
    missing_export_scenarios: usize,
    source_files: usize,
    byte_identical_files: usize,
    mismatched_files: usize,
    missing_export_files: usize,
    extra_export_files: usize,
    #[serde(serialize_with = "serialize_counts")]
    files_by_role: BTreeMap<String, usize>,
    #[serde(serialize_with = "serialize_counts")]
    supported_files_by_name: BTreeMap<String, usize>,
    #[serde(serialize_with = "serialize_counts")]
    pass_through_files_by_name: BTreeMap<String, usize>,
    #[serde(serialize_with = "serialize_counts")]
    resource_files_by_name: BTreeMap<String, usize>,
    #[serde(serialize_with = "serialize_counts")]
    unknown_files_by_name: BTreeMap<String, usize>,
    #[serde(serialize_with = "serialize_counts")]
    mismatches_by_file: BTreeMap<String, usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NameCount {
    name: String,
    count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScenarioAudit {
    name: String,
    source_root: String,
    source_path: String,
    status: ScenarioStatus,
    import_error: Option<String>,
    export_error: Option<String>,
    source_files: usize,
    byte_identical_files: usize,
    mismatched_files: usize,
    missing_export_files: usize,
    extra_export_files: usize,
    files: Vec<FileAudit>,
    extra_exports: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ScenarioStatus {
    ByteIdentical,
    HasMismatch,
    MissingExport,
    ImportError,
    ExportError,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileAudit {
    name: String,
    role: String,
    classification: FileClassification,
    source_bytes: u64,
    exported_bytes: Option<u64>,
    source_sha256: String,
    exported_sha256: Option<String>,
    first_diff_offset: Option<u64>,
    note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum FileClassification {
    ByteIdentical,
    ByteMismatch,
    MissingExport,
}

fn main() {
    let args = parse_args();
    let roots = if args.roots.is_empty() {
        DEFAULT_ROOTS.iter().map(PathBuf::from).collect()
    } else {
        args.roots
    };
    let report = run_audit(&roots);
    let json = serde_json::to_string_pretty(&report).expect("audit report should serialize");
    if let Some(output) = args.output {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).expect("audit output parent should be creatable");
        }
        fs::write(&output, format!("{json}\n")).expect("audit output should be writable");
        eprintln!("Wrote {}", output.display());
    } else {
        println!("{json}");
    }
}

#[derive(Debug, Default)]
struct Args {
    roots: Vec<PathBuf>,
    output: Option<PathBuf>,
}

fn parse_args() -> Args {
    let mut out = Args::default();
    let mut iter = env::args().skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--root" => {
                if let Some(value) = iter.next() {
                    out.roots.push(PathBuf::from(value));
                }
            }
            "--output" => {
                if let Some(value) = iter.next() {
                    out.output = Some(PathBuf::from(value));
                }
            }
            "--help" | "-h" => {
                eprintln!(
                    "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example no_edit_roundtrip_audit -- [--root PATH ...] [--output PATH]"
                );
                std::process::exit(0);
            }
            other => {
                eprintln!("Ignoring unknown argument: {other}");
            }
        }
    }
    out
}

fn run_audit(roots: &[PathBuf]) -> AuditReport {
    let generated_at_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut aggregate = AuditAggregate::default();
    let mut scenarios = Vec::new();
    let mut seen_paths = BTreeSet::new();
    for root in roots {
        if !root.is_dir() {
            continue;
        }
        aggregate.roots_found += 1;
        for entry in WalkDir::new(root).max_depth(1).min_depth(1) {
            let Ok(entry) = entry else {
                continue;
            };
            if !entry.file_type().is_dir() {
                continue;
            }
            let path = entry.path().to_path_buf();
            let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
            if !seen_paths.insert(canonical.to_string_lossy().to_string()) {
                continue;
            }
            if !looks_like_scenario_dir(&path) {
                continue;
            }
            aggregate.candidate_scenarios += 1;
            let scenario = audit_scenario(root, &path);
            accumulate_scenario(&mut aggregate, &scenario);
            scenarios.push(scenario);
        }
    }
    aggregate.byte_identical_scenarios = scenarios
        .iter()
        .filter(|scenario| matches!(scenario.status, ScenarioStatus::ByteIdentical))
        .count();
    aggregate.mismatched_scenarios = scenarios
        .iter()
        .filter(|scenario| matches!(scenario.status, ScenarioStatus::HasMismatch))
        .count();
    aggregate.missing_export_scenarios = scenarios
        .iter()
        .filter(|scenario| matches!(scenario.status, ScenarioStatus::MissingExport))
        .count();
    AuditReport {
        generated_at_unix,
        roots: roots
            .iter()
            .map(|root| root.to_string_lossy().to_string())
            .collect(),
        aggregate,
        scenarios,
    }
}

fn looks_like_scenario_dir(path: &Path) -> bool {
    let supported: BTreeSet<&str> = SUPPORTED_WRITE_FILES.iter().copied().collect();
    let tracked: BTreeSet<&str> = TRACKED_FILES.iter().copied().collect();
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if supported.contains(name.as_str()) || tracked.contains(name.as_str()) {
                return true;
            }
        }
    }
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| path.join(name).is_file())
        .unwrap_or(false)
}

fn audit_scenario(root: &Path, source: &Path) -> ScenarioAudit {
    let name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Unknown Scenario")
        .to_string();
    let base = temp_workspace(&name);
    let project_dir = base.join("project");
    let export_dir = base.join("export");
    let mut audit = ScenarioAudit {
        name,
        source_root: root.to_string_lossy().to_string(),
        source_path: source.to_string_lossy().to_string(),
        status: ScenarioStatus::ImportError,
        import_error: None,
        export_error: None,
        source_files: 0,
        byte_identical_files: 0,
        mismatched_files: 0,
        missing_export_files: 0,
        extra_export_files: 0,
        files: Vec::new(),
        extra_exports: Vec::new(),
    };
    let import_result = import_scenario(source, &project_dir);
    let Ok(project) = import_result else {
        audit.import_error = Some(import_result.err().unwrap().to_string());
        return audit;
    };
    let export_result = export_project(&project_dir, &project, &export_dir);
    if let Err(error) = export_result {
        audit.status = ScenarioStatus::ExportError;
        audit.export_error = Some(error.to_string());
        return audit;
    }

    let mut source_names = BTreeSet::new();
    for source_file in &project.source.files {
        source_names.insert(source_file.relative_path.clone());
        let source_path = source.join(&source_file.relative_path);
        if !source_path.is_file() {
            continue;
        }
        audit.source_files += 1;
        let exported_path = export_dir.join(&source_file.relative_path);
        let role = format_source_role(&source_file.role);
        let source_bytes = fs::read(&source_path).unwrap_or_default();
        let source_hash = sha256_hex(&source_bytes);
        if !exported_path.is_file() {
            audit.missing_export_files += 1;
            audit.files.push(FileAudit {
                name: source_file.relative_path.clone(),
                role,
                classification: FileClassification::MissingExport,
                source_bytes: source_bytes.len() as u64,
                exported_bytes: None,
                source_sha256: source_hash,
                exported_sha256: None,
                first_diff_offset: None,
                note: Some("Source file was imported but not exported.".to_string()),
            });
            continue;
        }
        let exported_bytes = fs::read(&exported_path).unwrap_or_default();
        let exported_hash = sha256_hex(&exported_bytes);
        if source_bytes == exported_bytes {
            audit.byte_identical_files += 1;
            audit.files.push(FileAudit {
                name: source_file.relative_path.clone(),
                role,
                classification: FileClassification::ByteIdentical,
                source_bytes: source_bytes.len() as u64,
                exported_bytes: Some(exported_bytes.len() as u64),
                source_sha256: source_hash,
                exported_sha256: Some(exported_hash),
                first_diff_offset: None,
                note: None,
            });
        } else {
            audit.mismatched_files += 1;
            audit.files.push(FileAudit {
                name: source_file.relative_path.clone(),
                role,
                classification: FileClassification::ByteMismatch,
                source_bytes: source_bytes.len() as u64,
                exported_bytes: Some(exported_bytes.len() as u64),
                source_sha256: source_hash,
                exported_sha256: Some(exported_hash),
                first_diff_offset: first_diff_offset(&source_bytes, &exported_bytes),
                note: None,
            });
        }
    }

    for entry in WalkDir::new(&export_dir).max_depth(1).min_depth(1) {
        let Ok(entry) = entry else {
            continue;
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !source_names.contains(&name) {
            audit.extra_exports.push(name);
        }
    }
    audit.extra_export_files = audit.extra_exports.len();
    audit.status = if audit.missing_export_files > 0 {
        ScenarioStatus::MissingExport
    } else if audit.mismatched_files > 0 || audit.extra_export_files > 0 {
        ScenarioStatus::HasMismatch
    } else {
        ScenarioStatus::ByteIdentical
    };
    let _ = fs::remove_dir_all(&base);
    audit
}

fn accumulate_scenario(aggregate: &mut AuditAggregate, scenario: &ScenarioAudit) {
    match scenario.status {
        ScenarioStatus::ImportError => aggregate.import_errors += 1,
        ScenarioStatus::ExportError => {
            aggregate.imported += 1;
            aggregate.export_errors += 1;
        }
        ScenarioStatus::ByteIdentical
        | ScenarioStatus::HasMismatch
        | ScenarioStatus::MissingExport => {
            aggregate.imported += 1;
        }
    }
    aggregate.source_files += scenario.source_files;
    aggregate.byte_identical_files += scenario.byte_identical_files;
    aggregate.mismatched_files += scenario.mismatched_files;
    aggregate.missing_export_files += scenario.missing_export_files;
    aggregate.extra_export_files += scenario.extra_export_files;
    for file in &scenario.files {
        *aggregate
            .files_by_role
            .entry(file.role.clone())
            .or_insert(0) += 1;
        match file.role.as_str() {
            "supported-binary" => {
                *aggregate
                    .supported_files_by_name
                    .entry(file.name.clone())
                    .or_insert(0) += 1;
            }
            "pass-through" => {
                *aggregate
                    .pass_through_files_by_name
                    .entry(file.name.clone())
                    .or_insert(0) += 1;
            }
            "resource-fork" => {
                *aggregate
                    .resource_files_by_name
                    .entry(file.name.clone())
                    .or_insert(0) += 1;
            }
            "unknown" => {
                *aggregate
                    .unknown_files_by_name
                    .entry(file.name.clone())
                    .or_insert(0) += 1;
            }
            _ => {}
        }
        if matches!(file.classification, FileClassification::ByteMismatch) {
            *aggregate
                .mismatches_by_file
                .entry(file.name.clone())
                .or_insert(0) += 1;
        }
    }
}

fn temp_workspace(name: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    env::temp_dir()
        .join("realmz-providence-roundtrip-audit")
        .join(format!("{}-{}-{stamp}", std::process::id(), sanitize(name)))
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn format_source_role(role: &SourceFileRole) -> String {
    match role {
        SourceFileRole::SupportedBinary => "supported-binary",
        SourceFileRole::ResourceFork => "resource-fork",
        SourceFileRole::PassThrough => "pass-through",
        SourceFileRole::Unknown => "unknown",
    }
    .to_string()
}

fn first_diff_offset(left: &[u8], right: &[u8]) -> Option<u64> {
    let shared = left.len().min(right.len());
    for index in 0..shared {
        if left[index] != right[index] {
            return Some(index as u64);
        }
    }
    (left.len() != right.len()).then_some(shared as u64)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn serialize_counts<S>(
    counts: &BTreeMap<String, usize>,
    serializer: S,
) -> std::result::Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let entries: Vec<NameCount> = counts
        .iter()
        .map(|(name, count)| NameCount {
            name: name.clone(),
            count: *count,
        })
        .collect();
    entries.serialize(serializer)
}
