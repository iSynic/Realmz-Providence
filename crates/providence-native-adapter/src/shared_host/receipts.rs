//! Pending receipts prevent replay after an uncertain checkpoint or process failure.
use crate::{Request, Response};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub(super) enum Start {
    New(PathBuf),
    Replay(Response),
}
pub fn unresolved(store: &ProjectStore) -> Result<Vec<Value>, String> {
    let directory = store.root().join(".providence").join("operation-receipts");
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut pending = Vec::new();
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let receipt: Value =
            serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| format!("invalid operation receipt {}: {e}", path.display()))?;
        if matches!(receipt["state"].as_str(), Some("pending" | "unknown")) {
            pending.push(json!({"operationId":receipt["operationId"],"method":receipt["method"],"expectedRevision":receipt["expectedRevision"],"state":receipt["state"]}));
        }
    }
    Ok(pending)
}
pub fn replay(store: &ProjectStore, request: &Request) -> Result<Option<Response>, String> {
    let Some(operation) = request.params["operationId"].as_str() else {
        return Ok(None);
    };
    if !path(store, operation)?.exists() {
        return Ok(None);
    }
    match begin(store, request)? {
        Start::Replay(mut response) => {
            response.id = request.id;
            Ok(Some(response))
        }
        Start::New(_) => Err("receipt disappeared during reconciliation".into()),
    }
}
pub(super) fn path(store: &ProjectStore, operation: &str) -> Result<PathBuf, String> {
    if operation.is_empty() || operation.len() > 128 {
        return Err("operationId must be 1 through 128 bytes".into());
    }
    let directory = store.root().join(".providence").join("operation-receipts");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join(format!("{:x}.json", Sha256::digest(operation))))
}
pub fn begin(store: &ProjectStore, request: &Request) -> Result<Start, String> {
    begin_with_provenance(store, request, Value::Null)
}
pub fn begin_with_provenance(
    store: &ProjectStore,
    request: &Request,
    provenance: Value,
) -> Result<Start, String> {
    let operation = request.params["operationId"]
        .as_str()
        .ok_or("operationId is required")?;
    let path = path(store, operation)?;
    let mut arguments = request.params.clone();
    if let Some(arguments) = arguments.as_object_mut() {
        arguments.remove("_hostSession");
    }
    let fingerprint = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&json!({"method":request.method,"params":arguments}))
                .map_err(|e| e.to_string())?
        )
    );
    if path.exists() {
        let value: Value = serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if value["fingerprint"] != fingerprint {
            return Err(
                "operation-conflict: operationId was already used with different arguments".into(),
            );
        }
        if let Some(response) = value.get("response") {
            return Ok(Start::Replay(
                serde_json::from_value(response.clone()).map_err(|e| e.to_string())?,
            ));
        }
        return Err("outcome-unknown: pending operation receipt; reopen and reconcile before further writes".into());
    }
    let value = json!({"fingerprint":fingerprint,"operationId":operation,"method":request.method,"expectedRevision":request.params["expectedRevision"],"provenance":provenance,"state":"pending"});
    write(&path, &value)?;
    Ok(Start::New(path))
}
pub fn finish(path: &Path, response: &Response) -> Result<(), String> {
    let mut value: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    value["response"] = serde_json::to_value(response).map_err(|e| e.to_string())?;
    value["state"] = json!(if response.outcome_unknown == Some(true) {
        "unknown"
    } else if response.ok {
        "committed"
    } else {
        "rejected"
    });
    write(path, &value)
}
pub(super) fn link_export_job(
    store: &ProjectStore,
    operation: &str,
    job: &str,
) -> Result<(), String> {
    let path = path(store, operation)?;
    let mut receipt: Value =
        serde_json::from_slice(&fs::read(&path).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    if receipt["method"] != "export.begin" || receipt["state"] != "pending" {
        return Err("export-receipt-invalid: expected a pending export submission".into());
    }
    receipt["exportJobId"] = json!(job);
    write(&path, &receipt)
}
pub fn status(store: &ProjectStore, params: &Value) -> Result<Value, String> {
    let path = path(
        store,
        params["operationId"]
            .as_str()
            .ok_or("operationId is required")?,
    )?;
    if !path.exists() {
        return Ok(json!({"state":"not-found","safeToReplay":false}));
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
pub(super) fn write(path: &Path, value: &Value) -> Result<(), String> {
    let mut temporary =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("missing receipt directory")?)
            .map_err(|e| e.to_string())?;
    temporary
        .write_all(&serde_json::to_vec(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
