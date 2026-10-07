mod inspection;
mod inventory;
mod startup;

pub(crate) use inspection::inspect_classic_scenario_import;
use providence_core::codecs::classic_resource_fork_candidate_paths;
use serde_json::{Value, json};
pub(crate) use startup::{resolve_startup_file, resolve_startup_file_selected};
use std::path::{Path, PathBuf};

pub(crate) fn resolve_classic_native_file(directory: &Path, native_path: &str) -> Option<PathBuf> {
    if !native_path.ends_with(".rsrc") {
        let direct = directory.join(native_path);
        return direct.is_file().then_some(direct);
    }
    classic_resource_fork_candidate_paths(native_path)
        .into_iter()
        .map(|candidate| directory.join(candidate))
        .find(|candidate| candidate.is_file())
}

pub(crate) fn classic_native_file_length(directory: &Path, native_path: &str) -> Option<u64> {
    resolve_classic_native_file(directory, native_path)?
        .metadata()
        .ok()
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
}

pub(crate) fn classic_import_file_report(
    native_path: &str,
    role: &str,
    required: bool,
    byte_length: Option<u64>,
) -> Value {
    json!({
        "nativePath": native_path,
        "role": role,
        "required": required,
        "present": byte_length.is_some(),
        "byteLength": byte_length,
    })
}

pub(crate) fn preflight_files(directory: &Path, names: &[&str], role: &str) -> Result<(), String> {
    let missing = names
        .iter()
        .filter(|name| resolve_classic_native_file(directory, name).is_none())
        .copied()
        .collect::<Vec<_>>();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "full Classic {role} preflight is missing: {}",
            missing.join(", ")
        ))
    }
}

pub(crate) const REQUIRED_FULL_SCENARIO_FILES: &[&str] = &[
    "Data BD",
    "Data DD",
    "Data DDD",
    "Data DL",
    "Data ED",
    "Data ED2",
    "Data ED3",
    "Data EDCD",
    "Data LD",
    "Data MD",
    "Data NI",
    "Data RD",
    "Data RDD",
    "Data SD",
    "Data SD2",
    "Data Solids",
    "Data TD",
    "Data TD2",
    "Data TD3",
];

pub(crate) const REQUIRED_APPLICATION_DATA_FILES: &[&str] = &[
    "Combat Data BD",
    "Custom Names.rsrc",
    "Data Caste",
    "Data ID",
    "Data ID.rsrc",
    "Data P BD",
    "Data Race",
    "Data S",
    "Data SUB BD",
    "Data Castle BD",
    "Data Desert BD",
    "Data Swamp BD",
    "Data Snow BD",
];

#[cfg(test)]
mod tests;
