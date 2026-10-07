use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_storage::ProjectStore;
use serde_json::json;
use std::path::Path;
use std::process::ExitCode;

pub(crate) fn initialize_store(snapshot_path: &str, directory: &str) -> ExitCode {
    let result = read_project_snapshot(snapshot_path).and_then(|snapshot| {
        ProjectStore::create(directory, &snapshot).map_err(|error| error.to_string())
    });
    match result {
        Ok(store) => report_store(&store),
        Err(error) => {
            eprintln!("could not initialize project store: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn create_project(project_id: &str, directory: &str) -> ExitCode {
    create_project_with_support(project_id, directory, None)
}

pub(crate) fn create_project_with_support(
    project_id: &str,
    directory: &str,
    support: Option<&Path>,
) -> ExitCode {
    if !valid_new_project_id(project_id) {
        eprintln!(
            "project id must contain 1..64 lowercase ASCII letters, digits, or hyphens and cannot begin or end with a hyphen"
        );
        return ExitCode::from(2);
    }
    let snapshot = ProjectSnapshot::new_authored(StableId(project_id.into()));
    let created = match support {
        Some(root) => crate::new_project_baseline::Baseline::read(project_id, root)
            .and_then(|baseline| baseline.create(directory)),
        None => ProjectStore::create_new(directory, &snapshot).map_err(|error| error.to_string()),
    };
    match created {
        Ok(store) => report_store(&store),
        Err(error) => {
            eprintln!("could not create project: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn valid_new_project_id(project_id: &str) -> bool {
    !project_id.is_empty()
        && project_id.len() <= 64
        && !project_id.starts_with('-')
        && !project_id.ends_with('-')
        && project_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

pub(crate) fn rebuild_store(directory: &str) -> ExitCode {
    match ProjectStore::open(Path::new(directory)) {
        Ok((store, _)) => report_store(&store),
        Err(error) => {
            eprintln!("could not rebuild project store: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn read_project_snapshot(path: &str) -> Result<ProjectSnapshot, String> {
    ProjectStore::load_snapshot_file(path).map_err(|error| error.to_string())
}

pub(crate) fn report_store(store: &ProjectStore) -> ExitCode {
    match store.index_summary() {
        Ok(summary) => {
            let report = json!({
                "projectDirectory": store.root(),
                "snapshot": store.snapshot_path(),
                "localDatabase": store.local_database_path(),
                "snapshotSha256": summary.snapshot_sha256,
                "entities": summary.entities,
                "references": summary.references,
                "journalEntries": summary.journal_entries,
            });
            println!(
                "{}",
                serde_json::to_string_pretty(&report).expect("store report is serializable")
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("could not inspect project store: {error}");
            ExitCode::FAILURE
        }
    }
}
