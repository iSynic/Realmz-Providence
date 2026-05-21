use crate::error::{IoPath, JsonPath, ProvidenceError, Result};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidenceHarnessConfig {
    pub enabled: bool,
    pub script_path: String,
    pub result_path: String,
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
    let script_path = env::var("PROVIDENCE_HARNESS_SCRIPT").map_err(|_| {
        ProvidenceError::message(
            "PROVIDENCE_HARNESS_SCRIPT must point to a harness script JSON file.",
        )
    })?;
    let result_path = env::var("PROVIDENCE_HARNESS_RESULT").map_err(|_| {
        ProvidenceError::message(
            "PROVIDENCE_HARNESS_RESULT must point to a harness result JSON file.",
        )
    })?;
    Ok(ProvidenceHarnessConfig {
        enabled: true,
        script_path,
        result_path,
    })
}

#[tauri::command]
pub fn get_harness_config() -> Result<ProvidenceHarnessConfig> {
    require_harness_config()
}

#[tauri::command]
pub fn read_harness_script() -> Result<Value> {
    let config = require_harness_config()?;
    let path = PathBuf::from(&config.script_path);
    let text = fs::read_to_string(&path).with_path(&path)?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).with_json_path(path)
}

#[tauri::command]
pub fn write_harness_result(result: Value) -> Result<()> {
    let config = require_harness_config()?;
    let path = PathBuf::from(&config.result_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_path(parent)?;
    }
    let text = serde_json::to_string_pretty(&result).with_json_path(&path)?;
    fs::write(&path, text).with_path(path)
}

#[tauri::command]
pub fn harness_exit(app: tauri::AppHandle, code: i32) -> Result<()> {
    require_harness_config()?;
    app.exit(code);
    Ok(())
}
