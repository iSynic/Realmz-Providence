use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Format {
    Classic,
    Rebuilt,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Phase {
    Queued,
    Compiling,
    Publishing,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
    Uncertain,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Record {
    pub job_id: String,
    pub project_id: String,
    pub source_revision: u64,
    pub source_provenance: Value,
    pub format: Format,
    pub destination: PathBuf,
    pub state: Phase,
    pub cancel_requested: bool,
    pub committed: Option<bool>,
    pub artifact_sha256: Option<String>,
    pub artifact_bytes: Option<u64>,
    pub result: Option<Value>,
    pub error: Option<String>,
    pub journal_error: Option<String>,
    #[serde(default)]
    pub replacement: Option<Replacement>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum BackupState {
    Planned,
    Retained,
    Restored,
    RestoreBlocked,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Replacement {
    pub expected_sha256: String,
    pub backup_path: PathBuf,
    pub state: BackupState,
}

pub(super) fn path(root: &Path, job_id: &str) -> Result<PathBuf, String> {
    if job_id.len() != 64 || !job_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("invalid-input: jobId must be the native 64-digit hexadecimal identity".into());
    }
    Ok(root
        .join(".providence/export-jobs")
        .join(format!("{job_id}.json")))
}

pub(super) fn write(path: &Path, record: &Record) -> Result<(), String> {
    let bytes = serde_json::to_vec(record).map_err(|error| error.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(
            "export-result-too-large: job metadata exceeds 2 MiB; no publication attempted".into(),
        );
    }
    let parent = path.parent().ok_or("Missing job directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| error.to_string())?;
    temporary.persist(path).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(super) fn read(path: &Path, project: &str) -> Result<Record, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|error| format!("export-job-unavailable: {error}"))?
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("export-job-invalid: journal exceeds its bound".into());
    }
    let record: Record =
        serde_json::from_slice(&bytes).map_err(|error| format!("export-job-invalid: {error}"))?;
    if record.project_id != project {
        return Err("export-job-invalid: journal belongs to another project".into());
    }
    Ok(record)
}

pub(super) fn terminal(state: Phase) -> bool {
    matches!(
        state,
        Phase::Completed | Phase::Failed | Phase::Cancelled | Phase::Interrupted | Phase::Uncertain
    )
}

pub(super) fn projection(record: &Record, params: &Value) -> Value {
    let mut result = serde_json::to_value(record).expect("serializable export record");
    if let Some(compilation) = result.get_mut("result").and_then(Value::as_object_mut) {
        for (field, offset_field) in [("files", "fileOffset"), ("warnings", "warningOffset")] {
            if let Some(Value::Array(rows)) = compilation.remove(field) {
                let offset = params[offset_field].as_u64().unwrap_or(0) as usize;
                let limit = params["limit"].as_u64().unwrap_or(64).clamp(1, 128) as usize;
                compilation.insert(format!("{field}Total"), rows.len().into());
                compilation.insert(format!("{field}Offset"), offset.into());
                compilation.insert(
                    format!("{field}Truncated"),
                    (offset.saturating_add(limit) < rows.len()).into(),
                );
                compilation.insert(
                    field.into(),
                    Value::Array(rows.into_iter().skip(offset).take(limit).collect()),
                );
            }
        }
    }
    result
}
