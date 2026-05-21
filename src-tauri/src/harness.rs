use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidenceHarnessConfig {
    pub enabled: bool,
    pub script_path: Option<String>,
    pub result_path: Option<String>,
    pub batch_path: Option<String>,
}

fn harness_enabled() -> bool {
    env::var("PROVIDENCE_HARNESS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn require_harness_config() -> Result<ProvidenceHarnessConfig> {
    if !harness_enabled() {
        return Err(ProvidenceError::message(
            "Providence harness mode is disabled. Set PROVIDENCE_HARNESS=1 to enable it.",
        ));
    }
    let batch_path = env::var("PROVIDENCE_HARNESS_BATCH")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let script_path = env::var("PROVIDENCE_HARNESS_SCRIPT")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let result_path = env::var("PROVIDENCE_HARNESS_RESULT")
        .ok()
        .filter(|value| !value.trim().is_empty());
    if batch_path.is_none() && (script_path.is_none() || result_path.is_none()) {
        return Err(ProvidenceError::message(
            "PROVIDENCE_HARNESS_SCRIPT and PROVIDENCE_HARNESS_RESULT must point to harness JSON files, or PROVIDENCE_HARNESS_BATCH must point to a batch manifest.",
        ));
    }
    Ok(ProvidenceHarnessConfig {
        enabled: true,
        script_path,
        result_path,
        batch_path,
    })
}

fn read_harness_json(path: PathBuf) -> Result<Value> {
    require_harness_config()?;
    let text = fs::read_to_string(&path).with_path(&path)?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).with_json_path(path)
}

fn write_harness_json(path: PathBuf, result: Value) -> Result<()> {
    require_harness_config()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    let text = serde_json::to_string_pretty(&result).with_json_path(&path)?;
    fs::write(&path, text).with_path(path)
}

#[tauri::command]
pub fn get_harness_config() -> Result<ProvidenceHarnessConfig> {
    require_harness_config()
}

#[tauri::command]
pub fn read_harness_script() -> Result<Value> {
    let config = require_harness_config()?;
    let script_path = config.script_path.ok_or_else(|| {
        ProvidenceError::message(
            "PROVIDENCE_HARNESS_SCRIPT must be set when reading a single harness script.",
        )
    })?;
    read_harness_json(PathBuf::from(script_path))
}

#[tauri::command]
pub fn read_harness_batch() -> Result<Value> {
    let config = require_harness_config()?;
    let batch_path = config.batch_path.ok_or_else(|| {
        ProvidenceError::message(
            "PROVIDENCE_HARNESS_BATCH must be set when reading a harness batch.",
        )
    })?;
    read_harness_json(PathBuf::from(batch_path))
}

#[tauri::command]
pub fn read_harness_script_at(path: String) -> Result<Value> {
    read_harness_json(PathBuf::from(path))
}

#[tauri::command]
pub fn write_harness_result(result: Value) -> Result<()> {
    let config = require_harness_config()?;
    let result_path = config.result_path.ok_or_else(|| {
        ProvidenceError::message(
            "PROVIDENCE_HARNESS_RESULT must be set when writing a single harness result.",
        )
    })?;
    write_harness_json(PathBuf::from(result_path), result)
}

#[tauri::command]
pub fn write_harness_result_at(path: String, result: Value) -> Result<()> {
    write_harness_json(PathBuf::from(path), result)
}

#[tauri::command]
pub fn harness_exit(app: tauri::AppHandle, code: i32) -> Result<()> {
    require_harness_config()?;
    app.exit(code);
    Ok(())
}
