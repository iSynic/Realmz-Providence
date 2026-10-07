//! Private operation receipts identify an original mutation, independently of current values.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;

use serde_json::{Value, json};

use crate::{LOCAL_DIRECTORY, MonsterLibraryStore, ProjectStore, StoreError};

const MAX_RECEIPT_BYTES: u64 = 4 * 1024 * 1024;
const COMPLETED_RECEIPTS: usize = 256;

pub struct MonsterOperationStore {
    root: PathBuf,
}

impl MonsterOperationStore {
    pub fn for_project(store: &ProjectStore) -> Self {
        Self {
            root: store
                .root()
                .join(LOCAL_DIRECTORY)
                .join("monster-operations"),
        }
    }

    pub fn for_library(store: &MonsterLibraryStore) -> Self {
        Self {
            root: store
                .root()
                .join(LOCAL_DIRECTORY)
                .join("monster-operations"),
        }
    }

    pub fn for_personal_library(store: &crate::PersonalLibraryStore) -> Self {
        Self {
            root: store.root().join(LOCAL_DIRECTORY).join("media-operations"),
        }
    }

    pub fn reserve(&self, operation_id: &str, intent: &Value) -> Result<(), StoreError> {
        let path = self.path(operation_id)?;
        let bytes = serde_json::to_vec(&json!({"operationId": operation_id, "intent": intent}))?;
        if bytes.len() as u64 > MAX_RECEIPT_BYTES / 2 {
            return Err(invalid(
                "Authoring operation intent exceeds its bounded receipt",
            ));
        }
        fs::create_dir_all(&self.root)?;
        // create_new prevents a second submission of the original operation.
        let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
        file.write_all(&bytes)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        Ok(())
    }

    pub fn complete(&self, operation_id: &str, response: &Value) -> Result<(), StoreError> {
        let outcome = if response["ok"] == true {
            "committed"
        } else {
            "not-committed"
        };
        let bytes = serde_json::to_vec(&json!({"outcome": outcome, "response": response}))?;
        let path = self.path(operation_id)?;
        let mut file = OpenOptions::new().append(true).open(&path)?;
        if file
            .metadata()?
            .len()
            .saturating_add(bytes.len() as u64 + 1)
            > MAX_RECEIPT_BYTES
        {
            return Err(invalid(
                "Authoring operation result exceeds its bounded receipt",
            ));
        }
        file.write_all(&bytes)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        self.prune_completed()?;
        Ok(())
    }

    pub fn lookup(&self, operation_id: &str) -> Result<Value, StoreError> {
        let path = self.path(operation_id)?;
        let file = match fs::File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(unknown(operation_id));
            }
            Err(error) => return Err(error.into()),
        };
        if file.metadata()?.len() > MAX_RECEIPT_BYTES {
            return Ok(unknown(operation_id));
        }
        let mut bytes = Vec::new();
        file.take(MAX_RECEIPT_BYTES + 1).read_to_end(&mut bytes)?;
        let lines = bytes.split(|byte| *byte == b'\n').collect::<Vec<_>>();
        if lines.len() != 3 || !lines[2].is_empty() {
            return Ok(unknown(operation_id));
        }
        let Ok(reservation) = serde_json::from_slice::<Value>(lines[0]) else {
            return Ok(unknown(operation_id));
        };
        let Ok(mut final_result) = serde_json::from_slice::<Value>(lines[1]) else {
            return Ok(unknown(operation_id));
        };
        if reservation["operationId"] != operation_id
            || !matches!(
                final_result["outcome"].as_str(),
                Some("committed" | "not-committed")
            )
        {
            return Ok(unknown(operation_id));
        }
        final_result["operationId"] = Value::String(operation_id.into());
        final_result["intent"] = reservation["intent"].clone();
        Ok(final_result)
    }

    fn path(&self, operation_id: &str) -> Result<PathBuf, StoreError> {
        if operation_id.len() != 64 || !operation_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(invalid(
                "Authoring operation ID must contain exactly 64 hexadecimal characters",
            ));
        }
        Ok(self.root.join(format!("{operation_id}.jsonl")))
    }

    fn prune_completed(&self) -> Result<(), StoreError> {
        let mut completed = Vec::new();
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let Some(id) = name.strip_suffix(".jsonl") else {
                continue;
            };
            if self.path(id).is_err() {
                continue;
            }
            if self.lookup(id)?["outcome"] != "unknown" {
                completed.push((entry.metadata()?.modified()?, entry.path()));
            }
        }
        completed.sort_by_key(|entry| entry.0);
        let excess = completed.len().saturating_sub(COMPLETED_RECEIPTS);
        for (_, path) in completed.into_iter().take(excess) {
            fs::remove_file(path)?;
        }
        Ok(())
    }
}

fn unknown(operation_id: &str) -> Value {
    json!({"operationId": operation_id, "outcome": "unknown"})
}

fn invalid(reason: &str) -> StoreError {
    StoreError::Io(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        reason,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(root: &std::path::Path) -> MonsterOperationStore {
        MonsterOperationStore {
            root: root.join("receipts"),
        }
    }

    #[test]
    fn an_original_receipt_survives_reopen_and_does_not_authorize_resubmission() {
        let temp = tempfile::tempdir().unwrap();
        let id = "a".repeat(64);
        let receipts = store(temp.path());
        receipts
            .reserve(&id, &json!({"expectedRevision": 2, "draft": "one"}))
            .unwrap();
        assert_eq!(receipts.lookup(&id).unwrap()["outcome"], "unknown");
        assert!(receipts.reserve(&id, &json!({})).is_err());
        receipts
            .complete(&id, &json!({"ok": true, "result": {"revision": 3}}))
            .unwrap();
        let reopened = store(temp.path());
        assert_eq!(
            reopened.lookup(&id).unwrap()["response"]["result"]["revision"],
            3
        );
        assert_eq!(reopened.lookup(&id).unwrap()["outcome"], "committed");
    }

    #[test]
    fn absent_partial_and_rejected_receipts_have_distinct_safe_outcomes() {
        let temp = tempfile::tempdir().unwrap();
        let receipts = store(temp.path());
        let id = "b".repeat(64);
        assert_eq!(receipts.lookup(&id).unwrap()["outcome"], "unknown");
        receipts.reserve(&id, &json!({})).unwrap();
        let path = receipts.path(&id).unwrap();
        OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"{\"outcome\":")
            .unwrap();
        assert_eq!(receipts.lookup(&id).unwrap()["outcome"], "unknown");
        let rejected = "c".repeat(64);
        receipts.reserve(&rejected, &json!({})).unwrap();
        receipts
            .complete(
                &rejected,
                &json!({"ok": false, "error": "revision conflict"}),
            )
            .unwrap();
        assert_eq!(
            receipts.lookup(&rejected).unwrap()["outcome"],
            "not-committed"
        );
        assert!(receipts.lookup("../../outside").is_err());
    }
}
