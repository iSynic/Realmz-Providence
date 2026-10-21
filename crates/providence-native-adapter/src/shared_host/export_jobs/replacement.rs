//! Replacement is bound to the whole artifact, never an unconditional overwrite.
use super::{
    artifact,
    model::{BackupState, Format, Replacement},
};
use serde_json::Value;
use std::path::Path;

pub(super) fn prepare(
    params: &Value,
    path: &Path,
    format: Format,
    job: &str,
) -> Result<Option<Replacement>, String> {
    let Some(value) = params.get("replacement") else {
        return Ok(None);
    };
    let expected = value["expectedSha256"]
        .as_str()
        .ok_or("invalid-input: replacement requires expectedSha256")?;
    if value.as_object().is_none_or(|object| object.len() != 1)
        || expected.len() != 64
        || !expected
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(
            "invalid-input: replacement requires only a lowercase SHA-256 expectedSha256".into(),
        );
    }
    if artifact::digest(path, format)?.0 != expected {
        return Err(
            "export-artifact-changed: current artifact differs from the requested replacement hash"
                .into(),
        );
    }
    let name = path
        .file_name()
        .ok_or("Missing artifact name")?
        .to_str()
        .ok_or("Artifact name must be UTF-8")?;
    Ok(Some(Replacement {
        expected_sha256: expected.into(),
        backup_path: path.with_file_name(format!(".{name}.providence-backup-{job}")),
        state: BackupState::Planned,
    }))
}

pub(super) fn inspect(params: &Value) -> Result<Value, String> {
    let format: Format = serde_json::from_value(params["format"].clone())
        .map_err(|_| "Choose classic or rebuilt")?;
    let path = Path::new(params["path"].as_str().ok_or("path is required")?);
    if !path.is_absolute() {
        return Err("file-access: artifact path must be absolute".into());
    }
    let (hash, bytes) = artifact::digest(path, format)?;
    Ok(
        serde_json::json!({"path":path,"format":format,"artifactSha256":hash,"artifactBytes":bytes,
        "hashAlgorithm":if format == Format::Classic {"providence.directory-sha256.v1"} else {"sha256"}}),
    )
}
