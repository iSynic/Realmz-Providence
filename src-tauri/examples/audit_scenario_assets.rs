use realmz_providence_lib::resource_fork::parse_resource_fork_entries;
use realmz_providence_lib::resource_preview::{inspect_resource_preview, ResourcePreviewStatus};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const PREVIEW_RESOURCE_TYPES: [&str; 7] = ["PICT", "cicn", "snd ", "TEXT", "STR#", "styl", "vers"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditRow {
    scenario: String,
    resource_file: String,
    resource_type: String,
    resource_id: i16,
    name: String,
    bytes: usize,
    status: ResourcePreviewStatus,
    classification: String,
    summary: BTreeMap<String, String>,
    diagnostics: Vec<String>,
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        eprintln!(
            "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example audit_scenario_assets -- <scenarios-dir> [output.json]"
        );
        std::process::exit(if args.is_empty() { 1 } else { 0 });
    }

    let root = PathBuf::from(&args[0]);
    let output_path = args.get(1).map(PathBuf::from);
    let mut rows = Vec::new();
    let mut scenario_count = 0usize;
    let mut resource_file_count = 0usize;

    for scenario_dir in sorted_directories(&root) {
        scenario_count += 1;
        let scenario = scenario_dir
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Unknown scenario")
            .to_string();
        for resource_path in sorted_resource_files(&scenario_dir) {
            let bytes = match fs::read(&resource_path) {
                Ok(bytes) => bytes,
                Err(error) => {
                    eprintln!("Could not read {}: {error}", resource_path.display());
                    continue;
                }
            };
            let entries = parse_resource_fork_entries(&bytes);
            if entries.is_empty() {
                continue;
            }
            resource_file_count += 1;
            let resource_file = resource_path
                .strip_prefix(&scenario_dir)
                .unwrap_or(&resource_path)
                .to_string_lossy()
                .replace('\\', "/");
            for entry in entries {
                if !PREVIEW_RESOURCE_TYPES.contains(&entry.resource_type.as_str()) {
                    continue;
                }
                let preview = match inspect_resource_preview(&entry.resource_type, &entry.data) {
                    Ok(preview) => preview,
                    Err(error) => {
                        rows.push(AuditRow {
                            scenario: scenario.clone(),
                            resource_file: resource_file.clone(),
                            resource_type: entry.resource_type.clone(),
                            resource_id: entry.id,
                            name: entry.name,
                            bytes: entry.data.len(),
                            status: ResourcePreviewStatus::Malformed,
                            classification: "decoder-error".to_string(),
                            summary: BTreeMap::new(),
                            diagnostics: vec![error.to_string()],
                        });
                        continue;
                    }
                };
                rows.push(AuditRow {
                    scenario: scenario.clone(),
                    resource_file: resource_file.clone(),
                    resource_type: entry.resource_type.clone(),
                    resource_id: entry.id,
                    name: entry.name,
                    bytes: entry.data.len(),
                    status: preview.status.clone(),
                    classification: classify_resource(&entry.resource_type, entry.id),
                    summary: preview.summary,
                    diagnostics: preview
                        .diagnostics
                        .into_iter()
                        .map(|diagnostic| format!("{}: {}", diagnostic.code, diagnostic.message))
                        .collect(),
                });
            }
        }
    }

    let report = json!({
        "generatedBy": "src-tauri/examples/audit_scenario_assets.rs",
        "root": root,
        "totals": {
            "scenarios": scenario_count,
            "resourceFiles": resource_file_count,
            "resources": rows.len(),
            "byType": count_rows(&rows, |row| row.resource_type.trim().to_string()),
            "byStatus": count_rows(&rows, |row| status_label(&row.status).to_string()),
            "byClassification": count_rows(&rows, |row| row.classification.clone()),
        },
        "attention": rows.iter().filter(|row| matches!(row.status, ResourcePreviewStatus::UnsupportedVariant | ResourcePreviewStatus::Malformed | ResourcePreviewStatus::MissingFallback)).collect::<Vec<_>>(),
        "nonstandardPictures": rows.iter().filter(|row| row.resource_type == "PICT" && row.classification != "scenario-picture").collect::<Vec<_>>(),
        "resources": rows,
    });
    let serialized = serde_json::to_string_pretty(&report).expect("serialize scenario asset audit");
    if let Some(path) = output_path {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create report directory");
        }
        fs::write(&path, format!("{serialized}\n")).expect("write scenario asset audit");
        println!("{}", path.display());
    } else {
        println!("{serialized}");
    }
}

fn sorted_directories(root: &Path) -> Vec<PathBuf> {
    let mut directories = fs::read_dir(root)
        .unwrap_or_else(|error| panic!("Could not read {}: {error}", root.display()))
        .flatten()
        .filter_map(|entry| entry.file_type().ok()?.is_dir().then_some(entry.path()))
        .collect::<Vec<_>>();
    directories.sort();
    directories
}

fn sorted_resource_files(scenario_dir: &Path) -> Vec<PathBuf> {
    let mut files = fs::read_dir(scenario_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_resource = entry.file_type().ok()?.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("rsrc"));
            is_resource.then_some(path)
        })
        .collect::<Vec<_>>();
    files.sort();
    files
}

fn classify_resource(resource_type: &str, resource_id: i16) -> String {
    match resource_type {
        "PICT" if (30000..=30128).contains(&i32::from(resource_id)) => {
            "scenario-picture".to_string()
        }
        "PICT" if (306..=308).contains(&i32::from(resource_id)) => {
            "scenario-landlook-override".to_string()
        }
        "PICT" if i32::from(resource_id) < 30000 => "system-or-ui-override-picture".to_string(),
        "PICT" => "nonstandard-scenario-picture-id".to_string(),
        "snd " if (200..=500).contains(&i32::from(resource_id)) => "scenario-sound".to_string(),
        "snd " => "nonstandard-sound-id".to_string(),
        "cicn" => "icon-resource".to_string(),
        "TEXT" | "STR#" | "styl" => "text-resource".to_string(),
        _ => "reference-metadata".to_string(),
    }
}

fn count_rows<F>(rows: &[AuditRow], key: F) -> Value
where
    F: Fn(&AuditRow) -> String,
{
    let mut counts = BTreeMap::<String, usize>::new();
    for row in rows {
        *counts.entry(key(row)).or_default() += 1;
    }
    counts
        .into_iter()
        .fold(Map::new(), |mut output, (label, count)| {
            output.insert(label, json!(count));
            output
        })
        .into()
}

fn status_label(status: &ResourcePreviewStatus) -> &'static str {
    match status {
        ResourcePreviewStatus::PreviewReady => "preview-ready",
        ResourcePreviewStatus::Playable => "playable",
        ResourcePreviewStatus::TextReady => "text-ready",
        ResourcePreviewStatus::MetadataOnly => "metadata-only",
        ResourcePreviewStatus::UnsupportedVariant => "unsupported-variant",
        ResourcePreviewStatus::Malformed => "malformed",
        ResourcePreviewStatus::MissingFallback => "missing-fallback",
    }
}
