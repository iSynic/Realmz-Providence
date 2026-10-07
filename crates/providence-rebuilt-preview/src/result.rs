use super::file_io::{is_lower_sha256, require_absolute_file};
use super::targets::target_identity;
use super::{FORMAT_VERSION, PreviewRequest, PreviewResult, RESULT_KIND};
use serde_json::Value;
use std::{collections::BTreeSet, fs, path::Path};

pub fn read_result(path: &Path) -> Result<PreviewResult, String> {
    require_absolute_file(path, "preview result")?;
    let bytes =
        fs::read(path).map_err(|error| format!("could not read preview result: {error}"))?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("preview result is not valid JSON: {error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "preview result must be a JSON object".to_string())?;
    if object.get("kind").and_then(Value::as_str) != Some(RESULT_KIND)
        || object.get("formatVersion").and_then(Value::as_u64) != Some(FORMAT_VERSION.into())
    {
        return Err("preview result kind or formatVersion is unsupported".into());
    }
    match object.get("status").and_then(Value::as_str) {
        Some("ready") => parse_ready_result(object),
        Some("failed") => parse_failed_result(object),
        _ => Err("preview result status must be ready or failed".into()),
    }
}

pub fn read_result_for_request(
    path: &Path,
    request: &PreviewRequest,
) -> Result<PreviewResult, String> {
    if path != request.result_path {
        return Err("preview result path does not match its request".into());
    }
    let result = read_result(path)?;
    let (expected_kind, expected_id) = target_identity(&request.target);
    match &result {
        PreviewResult::Ready {
            target_kind,
            target_id,
            rng_seed,
            ..
        } => {
            if target_kind != expected_kind
                || target_id != &expected_id
                || rng_seed != &request.rng_seed
            {
                return Err("ready preview result does not match its request identity".into());
            }
        }
        PreviewResult::Failed {
            target_kind,
            target_id,
            ..
        } => {
            if target_kind != expected_kind || target_id != &expected_id {
                return Err("failed preview result does not match its request identity".into());
            }
        }
    }
    Ok(result)
}

fn parse_ready_result(object: &serde_json::Map<String, Value>) -> Result<PreviewResult, String> {
    require_exact_fields(
        object,
        &[
            "kind",
            "formatVersion",
            "status",
            "campaignId",
            "packageHash",
            "targetKind",
            "targetId",
            "rngSeed",
            "revision",
            "pendingInteractionKind",
        ],
    )?;
    Ok(PreviewResult::Ready {
        campaign_id: required_string(object, "campaignId")?,
        package_hash: required_sha256(object, "packageHash")?,
        target_kind: required_string(object, "targetKind")?,
        target_id: required_target_id(object)?,
        rng_seed: required_i64(object, "rngSeed")?,
        revision: required_u64(object, "revision")?,
        pending_interaction_kind: required_string(object, "pendingInteractionKind")?,
    })
}

fn parse_failed_result(object: &serde_json::Map<String, Value>) -> Result<PreviewResult, String> {
    require_exact_fields(
        object,
        &[
            "kind",
            "formatVersion",
            "status",
            "errorCode",
            "errorMessage",
            "targetKind",
            "targetId",
        ],
    )?;
    Ok(PreviewResult::Failed {
        error_code: required_string(object, "errorCode")?,
        error_message: required_string(object, "errorMessage")?,
        target_kind: required_string(object, "targetKind")?,
        target_id: required_target_id(object)?,
    })
}

fn require_exact_fields(
    object: &serde_json::Map<String, Value>,
    fields: &[&str],
) -> Result<(), String> {
    let actual = object.keys().map(String::as_str).collect::<BTreeSet<_>>();
    let expected = fields.iter().copied().collect::<BTreeSet<_>>();
    if actual != expected {
        return Err("preview result has unexpected or missing fields".into());
    }
    Ok(())
}

fn required_string(object: &serde_json::Map<String, Value>, field: &str) -> Result<String, String> {
    object
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("preview result field {field} must be a string"))
}

fn required_sha256(object: &serde_json::Map<String, Value>, field: &str) -> Result<String, String> {
    let value = required_string(object, field)?;
    if is_lower_sha256(&value) {
        Ok(value)
    } else {
        Err(format!(
            "preview result field {field} must be a lowercase SHA-256"
        ))
    }
}

fn required_i64(object: &serde_json::Map<String, Value>, field: &str) -> Result<i64, String> {
    object
        .get(field)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("preview result field {field} must be an integer"))
}

fn required_u64(object: &serde_json::Map<String, Value>, field: &str) -> Result<u64, String> {
    object
        .get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("preview result field {field} must be a nonnegative integer"))
}

fn required_target_id(object: &serde_json::Map<String, Value>) -> Result<Value, String> {
    let value = object
        .get("targetId")
        .cloned()
        .ok_or_else(|| "preview result field targetId is missing".to_string())?;
    if value.is_string() || value.as_i64().is_some() {
        Ok(value)
    } else {
        Err("preview result field targetId must be a string or signed integer".into())
    }
}
