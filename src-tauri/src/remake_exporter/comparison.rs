use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemakeBundleComparison {
    pub equivalent: bool,
    pub current_files: usize,
    pub candidate_files: usize,
    pub json_documents: usize,
    pub payload_files: usize,
    pub current_bytes: u64,
    pub candidate_bytes: u64,
    pub bytes_saved: i64,
    pub mismatches: Vec<RemakeBundleMismatch>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemakeBundleMismatch {
    pub path: String,
    pub kind: RemakeBundleMismatchKind,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_sha256: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RemakeBundleMismatchKind {
    MissingCurrentFile,
    MissingCandidateFile,
    JsonValue,
    PayloadBytes,
}

pub fn compare_remake_bundles(
    current_root: impl AsRef<Path>,
    candidate_root: impl AsRef<Path>,
) -> Result<RemakeBundleComparison> {
    let current_root = current_root.as_ref();
    let candidate_root = candidate_root.as_ref();
    let current_files = inventory(current_root)?;
    let candidate_files = inventory(candidate_root)?;
    let current_bytes = inventory_bytes(&current_files)?;
    let candidate_bytes = inventory_bytes(&candidate_files)?;
    let paths = current_files
        .keys()
        .chain(candidate_files.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut json_documents = 0;
    let mut payload_files = 0;
    let mut mismatches = Vec::new();

    for path in paths {
        let current_path = current_files.get(&path);
        let candidate_path = candidate_files.get(&path);
        let (Some(current_path), Some(candidate_path)) = (current_path, candidate_path) else {
            let (kind, detail) = if current_path.is_none() {
                (
                    RemakeBundleMismatchKind::MissingCurrentFile,
                    "File exists only in the candidate bundle".to_string(),
                )
            } else {
                (
                    RemakeBundleMismatchKind::MissingCandidateFile,
                    "File exists only in the current bundle".to_string(),
                )
            };
            mismatches.push(RemakeBundleMismatch {
                path,
                kind,
                detail,
                current_sha256: None,
                candidate_sha256: None,
            });
            continue;
        };

        if path.to_ascii_lowercase().ends_with(".json") {
            json_documents += 1;
            let current = read_json(current_path)?;
            let candidate = read_json(candidate_path)?;
            if current != candidate {
                mismatches.push(RemakeBundleMismatch {
                    path,
                    kind: RemakeBundleMismatchKind::JsonValue,
                    detail: first_json_mismatch(&current, &candidate, "$"),
                    current_sha256: None,
                    candidate_sha256: None,
                });
            }
        } else {
            payload_files += 1;
            let current = fs::read(current_path).with_path(current_path)?;
            let candidate = fs::read(candidate_path).with_path(candidate_path)?;
            if current != candidate {
                mismatches.push(RemakeBundleMismatch {
                    path,
                    kind: RemakeBundleMismatchKind::PayloadBytes,
                    detail: format!(
                        "Payload bytes differ (current {}, candidate {})",
                        current.len(),
                        candidate.len()
                    ),
                    current_sha256: Some(hex::encode(Sha256::digest(&current))),
                    candidate_sha256: Some(hex::encode(Sha256::digest(&candidate))),
                });
            }
        }
    }

    let difference = i128::from(current_bytes) - i128::from(candidate_bytes);
    let bytes_saved = difference.clamp(i128::from(i64::MIN), i128::from(i64::MAX)) as i64;
    Ok(RemakeBundleComparison {
        equivalent: mismatches.is_empty(),
        current_files: current_files.len(),
        candidate_files: candidate_files.len(),
        json_documents,
        payload_files,
        current_bytes,
        candidate_bytes,
        bytes_saved,
        mismatches,
    })
}

fn inventory(root: &Path) -> Result<BTreeMap<String, PathBuf>> {
    if !root.is_dir() {
        return Err(ProvidenceError::message(format!(
            "Remake bundle directory does not exist: {}",
            root.display()
        )));
    }
    let mut files = BTreeMap::new();
    collect_files(root, root, &mut files)?;
    Ok(files)
}

fn collect_files(
    root: &Path,
    directory: &Path,
    files: &mut BTreeMap<String, PathBuf>,
) -> Result<()> {
    for entry in fs::read_dir(directory).with_path(directory)? {
        let entry = entry.with_path(directory)?;
        let file_type = entry.file_type().with_path(entry.path())?;
        if file_type.is_dir() {
            collect_files(root, &entry.path(), files)?;
        } else if file_type.is_file() {
            let relative = entry
                .path()
                .strip_prefix(root)
                .map_err(|error| {
                    ProvidenceError::message(format!(
                        "Could not make {} relative to {}: {error}",
                        entry.path().display(),
                        root.display()
                    ))
                })?
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, entry.path());
        }
    }
    Ok(())
}

fn inventory_bytes(files: &BTreeMap<String, PathBuf>) -> Result<u64> {
    files.values().try_fold(0_u64, |total, path| {
        fs::metadata(path)
            .with_path(path)
            .map(|metadata| total.saturating_add(metadata.len()))
    })
}

fn read_json(path: &Path) -> Result<Value> {
    let bytes = fs::read(path).with_path(path)?;
    serde_json::from_slice(&bytes).with_json_path(path)
}

fn first_json_mismatch(current: &Value, candidate: &Value, pointer: &str) -> String {
    match (current, candidate) {
        (Value::Object(current), Value::Object(candidate)) => {
            let keys = current
                .keys()
                .chain(candidate.keys())
                .collect::<BTreeSet<_>>();
            for key in keys {
                let child_pointer = format!("{pointer}/{}", json_pointer_token(key));
                match (current.get(key), candidate.get(key)) {
                    (Some(current), Some(candidate)) if current != candidate => {
                        return first_json_mismatch(current, candidate, &child_pointer);
                    }
                    (None, Some(_)) => {
                        return format!("JSON member exists only in candidate at {child_pointer}");
                    }
                    (Some(_), None) => {
                        return format!("JSON member exists only in current at {child_pointer}");
                    }
                    _ => {}
                }
            }
        }
        (Value::Array(current), Value::Array(candidate)) => {
            if current.len() != candidate.len() {
                return format!(
                    "JSON array length differs at {pointer} (current {}, candidate {})",
                    current.len(),
                    candidate.len()
                );
            }
            for (index, (current, candidate)) in current.iter().zip(candidate).enumerate() {
                if current != candidate {
                    return first_json_mismatch(current, candidate, &format!("{pointer}/{index}"));
                }
            }
        }
        _ => {
            return format!(
                "JSON values differ at {pointer} (current {}, candidate {})",
                summarize_json(current),
                summarize_json(candidate)
            );
        }
    }
    format!("JSON values differ at {pointer}")
}

fn json_pointer_token(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn summarize_json(value: &Value) -> String {
    let serialized =
        serde_json::to_string(value).unwrap_or_else(|_| "<unserializable>".to_string());
    const LIMIT: usize = 160;
    if serialized.chars().count() <= LIMIT {
        serialized
    } else {
        format!("{}...", serialized.chars().take(LIMIT).collect::<String>())
    }
}
