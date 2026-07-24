use realmz_providence_lib::importer::{import_scenario_into_project, open_project};
use realmz_providence_lib::project::ProvidenceProject;
use realmz_providence_lib::remake_exporter::{
    export_remake_campaign, RemakeExportCounts, RemakeExportReport,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const DEFAULT_ROOT: &str = "F:/Realmz/out_win_clang/Scenarios";
const DEFAULT_OUTPUT: &str = "tmp/remake-export-corpus";
const RUN_MARKER: &str = ".providence-remake-export-corpus";

#[derive(Debug, Default)]
struct Args {
    root: PathBuf,
    output: PathBuf,
    replace: bool,
    keep_successes: bool,
    skip_legacy_catalog_check: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CorpusReport {
    schema_version: u32,
    generated_by: &'static str,
    generated_at_unix: u64,
    source_root: String,
    output_root: String,
    aggregate: CorpusAggregate,
    scenarios: Vec<ScenarioResult>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct CorpusAggregate {
    scenarios: usize,
    passed: usize,
    failed: usize,
    import_failures: usize,
    export_failures: usize,
    legacy_catalog_failures: usize,
    harness_failures: usize,
    normal_written_files: usize,
    legacy_written_files: usize,
    normal_packaged_asset_payloads: usize,
    legacy_packaged_asset_payloads: usize,
    error_clusters: Vec<ErrorCluster>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorCluster {
    error: String,
    count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScenarioResult {
    name: String,
    source_path: String,
    status: ScenarioStatus,
    duration_ms: u64,
    imported_maps: Option<usize>,
    imported_asset_catalog_icons: Option<usize>,
    negative_catalog_rows_removed: Option<usize>,
    import_error: Option<String>,
    normal_export: ExportAttempt,
    legacy_catalog_export: ExportAttempt,
    harness_error: Option<String>,
    retained_case_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ScenarioStatus {
    Passed,
    ImportFailed,
    ExportFailed,
    LegacyCatalogExportFailed,
    HarnessFailed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportAttempt {
    status: AttemptStatus,
    error: Option<String>,
    written_files: Option<usize>,
    counts: Option<RemakeExportCounts>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AttemptStatus {
    Passed,
    Failed,
    Skipped,
}

impl ExportAttempt {
    fn skipped() -> Self {
        Self {
            status: AttemptStatus::Skipped,
            error: None,
            written_files: None,
            counts: None,
        }
    }

    fn failed(error: impl Into<String>) -> Self {
        Self {
            status: AttemptStatus::Failed,
            error: Some(error.into()),
            written_files: None,
            counts: None,
        }
    }

    fn passed(report: RemakeExportReport) -> Self {
        Self {
            status: AttemptStatus::Passed,
            error: None,
            written_files: Some(report.written_files.len()),
            counts: Some(report.counts),
        }
    }
}

fn main() {
    let args = match parse_args() {
        Ok(args) => args,
        Err(error) => {
            eprintln!("{error}");
            print_usage();
            std::process::exit(2);
        }
    };
    match run(&args) {
        Ok(has_failures) if has_failures => std::process::exit(1),
        Ok(_) => {}
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    }
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        root: PathBuf::from(DEFAULT_ROOT),
        output: PathBuf::from(DEFAULT_OUTPUT),
        ..Args::default()
    };
    let mut values = env::args().skip(1);
    while let Some(value) = values.next() {
        match value.as_str() {
            "--root" => {
                args.root = PathBuf::from(
                    values
                        .next()
                        .ok_or_else(|| "--root requires a path".to_string())?,
                );
            }
            "--output" => {
                args.output = PathBuf::from(
                    values
                        .next()
                        .ok_or_else(|| "--output requires a path".to_string())?,
                );
            }
            "--replace" => args.replace = true,
            "--keep-successes" => args.keep_successes = true,
            "--skip-legacy-catalog-check" => args.skip_legacy_catalog_check = true,
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            _ => return Err(format!("Unknown argument: {value}")),
        }
    }
    Ok(args)
}

fn print_usage() {
    eprintln!(
        "Usage: cargo run --manifest-path src-tauri/Cargo.toml --example remake_export_corpus -- \
         [--root PATH] [--output PATH] [--replace] [--keep-successes] \
         [--skip-legacy-catalog-check]"
    );
}

fn run(args: &Args) -> Result<bool, String> {
    let source_root = absolute_path(&args.root)?;
    let output_root = absolute_path(&args.output)?;
    if !source_root.is_dir() {
        return Err(format!(
            "Scenario corpus root does not exist: {}",
            source_root.display()
        ));
    }
    prepare_output_root(&output_root, args.replace)?;
    let scenarios = discover_scenarios(&source_root)?;
    if scenarios.is_empty() {
        return Err(format!(
            "No scenario directories found under {}",
            source_root.display()
        ));
    }

    println!(
        "Remake export corpus: {} scenario(s) from {}",
        scenarios.len(),
        source_root.display()
    );
    let cases_root = output_root.join("cases");
    fs::create_dir_all(&cases_root).map_err(|error| {
        format!(
            "Failed to create corpus cases directory {}: {error}",
            cases_root.display()
        )
    })?;

    let mut results = Vec::with_capacity(scenarios.len());
    for (index, source_path) in scenarios.iter().enumerate() {
        let name = source_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("unnamed-scenario")
            .to_string();
        println!("[{}/{}] {}", index + 1, scenarios.len(), name);
        let case_name = format!("{:03}-{}", index + 1, slugify(&name));
        let case_path = cases_root.join(case_name);
        let result = run_scenario(
            &name,
            source_path,
            &case_path,
            args.keep_successes,
            args.skip_legacy_catalog_check,
        );
        if result.status == ScenarioStatus::Passed {
            println!("  passed in {} ms", result.duration_ms);
        } else {
            println!("  FAILED ({})", status_label(result.status));
        }
        results.push(result);
    }

    let aggregate = aggregate(&results);
    let report = CorpusReport {
        schema_version: 1,
        generated_by: "src-tauri/examples/remake_export_corpus.rs",
        generated_at_unix: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        source_root: source_root.to_string_lossy().to_string(),
        output_root: output_root.to_string_lossy().to_string(),
        aggregate,
        scenarios: results,
    };
    write_reports(&output_root, &report)?;

    println!(
        "Remake export corpus complete: {} passed, {} failed.",
        report.aggregate.passed, report.aggregate.failed
    );
    println!("Wrote {}", output_root.join("report.json").display());
    println!("Wrote {}", output_root.join("report.md").display());
    println!("Wrote {}", output_root.join("errors.log").display());
    Ok(report.aggregate.failed > 0)
}

fn absolute_path(path: &Path) -> Result<PathBuf, String> {
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    env::current_dir()
        .map(|current| current.join(path))
        .map_err(|error| format!("Failed to resolve current directory: {error}"))
}

fn prepare_output_root(output: &Path, replace: bool) -> Result<(), String> {
    if output.exists() {
        if !output.is_dir() {
            return Err(format!(
                "Corpus output path is not a directory: {}",
                output.display()
            ));
        }
        let has_entries = fs::read_dir(output)
            .map_err(|error| format!("Failed to inspect {}: {error}", output.display()))?
            .next()
            .is_some();
        if has_entries {
            if !replace {
                return Err(format!(
                    "Corpus output is not empty; pass --replace to reuse it: {}",
                    output.display()
                ));
            }
            if !output.join(RUN_MARKER).is_file() {
                return Err(format!(
                    "Refusing to replace an unrecognized directory without {}: {}",
                    RUN_MARKER,
                    output.display()
                ));
            }
            fs::remove_dir_all(output)
                .map_err(|error| format!("Failed to replace {}: {error}", output.display()))?;
        }
    }
    fs::create_dir_all(output)
        .map_err(|error| format!("Failed to create {}: {error}", output.display()))?;
    fs::write(
        output.join(RUN_MARKER),
        b"Generated by Providence Remake export corpus harness.\n",
    )
    .map_err(|error| format!("Failed to write corpus run marker: {error}"))
}

fn discover_scenarios(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut scenarios = fs::read_dir(root)
        .map_err(|error| format!("Failed to read {}: {error}", root.display()))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|file_type| file_type.is_dir())
                .map(|_| entry.path())
        })
        .collect::<Vec<_>>();
    scenarios.sort_by(|left, right| {
        left.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_ascii_lowercase()
            .cmp(
                &right
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_ascii_lowercase(),
            )
    });
    Ok(scenarios)
}

fn run_scenario(
    name: &str,
    source_path: &Path,
    case_path: &Path,
    keep_successes: bool,
    skip_legacy_catalog_check: bool,
) -> ScenarioResult {
    let started = Instant::now();
    let project_dir = case_path.join("project.providence");
    let normal_output = case_path.join("remake");
    let legacy_output = case_path.join("remake-without-negative-icon-catalog");
    let retained_case_path = Some(case_path.to_string_lossy().to_string());
    if let Err(error) = fs::create_dir_all(case_path) {
        return ScenarioResult {
            name: name.to_string(),
            source_path: source_path.to_string_lossy().to_string(),
            status: ScenarioStatus::HarnessFailed,
            duration_ms: elapsed_ms(started),
            imported_maps: None,
            imported_asset_catalog_icons: None,
            negative_catalog_rows_removed: None,
            import_error: None,
            normal_export: ExportAttempt::skipped(),
            legacy_catalog_export: ExportAttempt::skipped(),
            harness_error: Some(format!(
                "Failed to create case directory {}: {error}",
                case_path.display()
            )),
            retained_case_path,
        };
    }

    let project = match import_scenario_into_project(source_path, &project_dir, name.to_string())
        .and_then(|_| open_project(&project_dir))
    {
        Ok(project) => project,
        Err(error) => {
            return ScenarioResult {
                name: name.to_string(),
                source_path: source_path.to_string_lossy().to_string(),
                status: ScenarioStatus::ImportFailed,
                duration_ms: elapsed_ms(started),
                imported_maps: None,
                imported_asset_catalog_icons: None,
                negative_catalog_rows_removed: None,
                import_error: Some(error.to_string()),
                normal_export: ExportAttempt::skipped(),
                legacy_catalog_export: ExportAttempt::skipped(),
                harness_error: None,
                retained_case_path,
            };
        }
    };

    let normal_export = run_export(&project, &project_dir, &normal_output);
    let negative_catalog_rows_removed = project
        .asset_catalog
        .icons
        .iter()
        .filter(|asset| asset.resource_type == "cicn" && asset.resource_id < 0)
        .count();
    let legacy_catalog_export = if skip_legacy_catalog_check {
        ExportAttempt::skipped()
    } else {
        let mut legacy_project: ProvidenceProject = project.clone();
        legacy_project
            .asset_catalog
            .icons
            .retain(|asset| asset.resource_type != "cicn" || asset.resource_id >= 0);
        run_export(&legacy_project, &project_dir, &legacy_output)
    };
    let mut status = if normal_export.status == AttemptStatus::Failed {
        ScenarioStatus::ExportFailed
    } else if legacy_catalog_export.status == AttemptStatus::Failed {
        ScenarioStatus::LegacyCatalogExportFailed
    } else {
        ScenarioStatus::Passed
    };
    let mut harness_error = None;
    let mut retained_case_path = retained_case_path;
    if status == ScenarioStatus::Passed && !keep_successes {
        match fs::remove_dir_all(case_path) {
            Ok(_) => retained_case_path = None,
            Err(error) => {
                status = ScenarioStatus::HarnessFailed;
                harness_error = Some(format!(
                    "Exports passed, but cleanup failed for {}: {error}",
                    case_path.display()
                ));
            }
        }
    }

    ScenarioResult {
        name: name.to_string(),
        source_path: source_path.to_string_lossy().to_string(),
        status,
        duration_ms: elapsed_ms(started),
        imported_maps: Some(project.maps.len()),
        imported_asset_catalog_icons: Some(project.asset_catalog.icons.len()),
        negative_catalog_rows_removed: Some(negative_catalog_rows_removed),
        import_error: None,
        normal_export,
        legacy_catalog_export,
        harness_error,
        retained_case_path,
    }
}

fn run_export(project: &ProvidenceProject, project_dir: &Path, output: &Path) -> ExportAttempt {
    match export_remake_campaign(project, project_dir, output) {
        Ok(report) => ExportAttempt::passed(report),
        Err(error) => ExportAttempt::failed(error.to_string()),
    }
}

fn aggregate(results: &[ScenarioResult]) -> CorpusAggregate {
    let mut aggregate = CorpusAggregate {
        scenarios: results.len(),
        ..CorpusAggregate::default()
    };
    let mut errors = BTreeMap::<String, usize>::new();
    for result in results {
        match result.status {
            ScenarioStatus::Passed => aggregate.passed += 1,
            ScenarioStatus::ImportFailed => aggregate.import_failures += 1,
            ScenarioStatus::ExportFailed => aggregate.export_failures += 1,
            ScenarioStatus::LegacyCatalogExportFailed => aggregate.legacy_catalog_failures += 1,
            ScenarioStatus::HarnessFailed => aggregate.harness_failures += 1,
        }
        accumulate_attempt(&mut aggregate, &result.normal_export, true);
        accumulate_attempt(&mut aggregate, &result.legacy_catalog_export, false);
        for (phase, error) in [
            ("import", result.import_error.as_deref()),
            ("export", result.normal_export.error.as_deref()),
            (
                "legacy-catalog-export",
                result.legacy_catalog_export.error.as_deref(),
            ),
            ("harness", result.harness_error.as_deref()),
        ] {
            if let Some(error) = error {
                *errors.entry(format!("{phase}: {error}")).or_default() += 1;
            }
        }
    }
    aggregate.failed = aggregate.scenarios.saturating_sub(aggregate.passed);
    aggregate.error_clusters = errors
        .into_iter()
        .map(|(error, count)| ErrorCluster { error, count })
        .collect();
    aggregate
}

fn accumulate_attempt(aggregate: &mut CorpusAggregate, attempt: &ExportAttempt, normal: bool) {
    if attempt.status != AttemptStatus::Passed {
        return;
    }
    let written_files = attempt.written_files.unwrap_or_default();
    let packaged_assets = attempt
        .counts
        .as_ref()
        .map(|counts| counts.packaged_asset_payloads)
        .unwrap_or_default();
    if normal {
        aggregate.normal_written_files += written_files;
        aggregate.normal_packaged_asset_payloads += packaged_assets;
    } else {
        aggregate.legacy_written_files += written_files;
        aggregate.legacy_packaged_asset_payloads += packaged_assets;
    }
}

fn write_reports(output: &Path, report: &CorpusReport) -> Result<(), String> {
    let json = serde_json::to_string_pretty(report)
        .map_err(|error| format!("Failed to serialize corpus report: {error}"))?;
    fs::write(output.join("report.json"), format!("{json}\n"))
        .map_err(|error| format!("Failed to write report.json: {error}"))?;
    fs::write(output.join("report.md"), render_markdown(report))
        .map_err(|error| format!("Failed to write report.md: {error}"))?;
    fs::write(output.join("errors.log"), render_errors(report))
        .map_err(|error| format!("Failed to write errors.log: {error}"))
}

fn render_markdown(report: &CorpusReport) -> String {
    let mut markdown = format!(
        "# Realmz Remake export corpus\n\n\
         - Source: `{}`\n\
         - Scenarios: {}\n\
         - Passed: {}\n\
         - Failed: {}\n\
         - Normal packaged payload files: {}\n\
         - Legacy-catalog packaged payload files: {}\n\n\
         The legacy-catalog pass removes derived negative `cicn` catalog rows before export. \
         It verifies that preserved scenario resource forks remain sufficient for older projects.\n\n\
         | Scenario | Result | Normal export | Legacy catalog | Duration (ms) |\n\
         |---|---:|---:|---:|---:|\n",
        report.source_root,
        report.aggregate.scenarios,
        report.aggregate.passed,
        report.aggregate.failed,
        report.aggregate.normal_packaged_asset_payloads,
        report.aggregate.legacy_packaged_asset_payloads,
    );
    for scenario in &report.scenarios {
        markdown.push_str(&format!(
            "| {} | {} | {} | {} | {} |\n",
            escape_markdown(&scenario.name),
            status_label(scenario.status),
            attempt_label(scenario.normal_export.status),
            attempt_label(scenario.legacy_catalog_export.status),
            scenario.duration_ms,
        ));
    }
    let failed = report
        .scenarios
        .iter()
        .filter(|scenario| scenario.status != ScenarioStatus::Passed)
        .collect::<Vec<_>>();
    if !failed.is_empty() {
        markdown.push_str("\n## Failures\n");
        for scenario in failed {
            markdown.push_str(&format!("\n### {}\n\n", scenario.name));
            if let Some(error) = &scenario.import_error {
                markdown.push_str(&format!("- Import: `{}`\n", inline_error(error)));
            }
            if let Some(error) = &scenario.normal_export.error {
                markdown.push_str(&format!("- Export: `{}`\n", inline_error(error)));
            }
            if let Some(error) = &scenario.legacy_catalog_export.error {
                markdown.push_str(&format!(
                    "- Legacy catalog export: `{}`\n",
                    inline_error(error)
                ));
            }
            if let Some(error) = &scenario.harness_error {
                markdown.push_str(&format!("- Harness: `{}`\n", inline_error(error)));
            }
            if let Some(path) = &scenario.retained_case_path {
                markdown.push_str(&format!("- Retained case: `{path}`\n"));
            }
        }
    }
    markdown
}

fn render_errors(report: &CorpusReport) -> String {
    let mut output = String::new();
    for scenario in &report.scenarios {
        for (phase, error) in [
            ("import", scenario.import_error.as_deref()),
            ("export", scenario.normal_export.error.as_deref()),
            (
                "legacy-catalog-export",
                scenario.legacy_catalog_export.error.as_deref(),
            ),
            ("harness", scenario.harness_error.as_deref()),
        ] {
            if let Some(error) = error {
                output.push_str(&format!(
                    "{}\t{}\t{}\n",
                    scenario.name,
                    phase,
                    error.replace(['\r', '\n'], " ")
                ));
            }
        }
    }
    if output.is_empty() {
        output.push_str("No failures.\n");
    }
    output
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash && !slug.is_empty() {
            slug.push('-');
            previous_dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "scenario".to_string()
    } else {
        slug
    }
}

fn status_label(status: ScenarioStatus) -> &'static str {
    match status {
        ScenarioStatus::Passed => "passed",
        ScenarioStatus::ImportFailed => "import-failed",
        ScenarioStatus::ExportFailed => "export-failed",
        ScenarioStatus::LegacyCatalogExportFailed => "legacy-catalog-export-failed",
        ScenarioStatus::HarnessFailed => "harness-failed",
    }
}

fn attempt_label(status: AttemptStatus) -> &'static str {
    match status {
        AttemptStatus::Passed => "passed",
        AttemptStatus::Failed => "failed",
        AttemptStatus::Skipped => "skipped",
    }
}

fn escape_markdown(value: &str) -> String {
    value.replace('|', "\\|")
}

fn inline_error(value: &str) -> String {
    value.replace('`', "'").replace(['\r', '\n'], " ")
}
