use crate::classic_import_files::CAPTURED_SCENARIO_SOURCE_FILES;
use providence_core::codecs::{SCENARIO_RESTRICTIONS_BYTES, decode_scenario_startup};
use serde_json::json;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn resolve_startup_file(
    directory: &Path,
    scenario_name: &str,
) -> Result<PathBuf, String> {
    resolve_startup_file_selected(directory, scenario_name, None)
}

pub(crate) fn resolve_startup_file_selected(
    directory: &Path,
    scenario_name: &str,
    selected_file: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(selected_file) = selected_file {
        return selected_startup(directory, scenario_name, selected_file);
    }
    // Fallback discovery is for a missing name, never a malformed preferred file.
    let preferred = directory.join(scenario_name);
    if preferred.is_file() {
        validate_startup_candidate(&preferred, scenario_name)?;
        return Ok(preferred);
    }

    let candidates = startup_candidates(directory, scenario_name)?;
    match candidates.as_slice() {
        [candidate] => Ok(candidate.clone()),
        [] => Err(json!({
            "code": "classic-import.startup.missing",
            "message": "No valid scenario startup record was found",
            "scenarioName": scenario_name,
        })
        .to_string()),
        _ => Err(json!({
            "code": "classic-import.startup.ambiguous",
            "message": "Multiple valid scenario startup records were found",
            "candidates": candidates,
        })
        .to_string()),
    }
}

fn selected_startup(
    directory: &Path,
    scenario_name: &str,
    selected_file: &str,
) -> Result<PathBuf, String> {
    let relative = Path::new(selected_file);
    if relative.components().count() != 1
        || relative.file_name().and_then(|name| name.to_str()) != Some(selected_file)
        || selected_file.is_empty()
    {
        return Err(json!({
            "code": "classic-import.startup.selection-invalid",
            "message": "startupFile must be a single filename inside the selected scenario folder",
            "startupFile": selected_file,
        })
        .to_string());
    }
    let selected_path = directory.join(selected_file);
    if !selected_path.is_file() {
        return Err(json!({
            "code": "classic-import.startup.selection-missing",
            "message": "The selected startup file does not exist in the scenario folder",
            "startupFile": selected_file,
        })
        .to_string());
    }
    validate_startup_candidate(&selected_path, scenario_name)?;
    Ok(selected_path)
}

fn startup_candidates(directory: &Path, scenario_name: &str) -> Result<Vec<PathBuf>, String> {
    let excluded = CAPTURED_SCENARIO_SOURCE_FILES
        .iter()
        .copied()
        .filter(|name| *name != "Scenario")
        .collect::<BTreeSet<_>>();
    let mut candidates = Vec::new();
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("could not list {}: {error}", directory.display()))?
        .filter_map(Result::ok)
    {
        if !entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
        {
            continue;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if excluded.contains(name)
            || name.starts_with('.')
            || name.starts_with("Data ")
            || name.ends_with(".rsf")
            || name.ends_with(".rsrc")
        {
            continue;
        }
        if validate_startup_candidate(&path, scenario_name).is_ok() {
            candidates.push(path);
        }
    }
    candidates.sort();
    Ok(candidates)
}

fn validate_startup_candidate(path: &Path, scenario_name: &str) -> Result<(), String> {
    let bytes =
        fs::read(path).map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let restrictions = vec![0; SCENARIO_RESTRICTIONS_BYTES];
    decode_scenario_startup(scenario_name, &bytes, &restrictions)
        .map(|_| ())
        .map_err(|error| format!("invalid scenario startup {}: {error}", path.display()))
}
