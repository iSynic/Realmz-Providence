use crate::{
    request_params::required_string,
    scenario_preflight::{
        REQUIRED_APPLICATION_DATA_FILES, REQUIRED_FULL_SCENARIO_FILES, preflight_files,
        resolve_classic_native_file, resolve_startup_file_selected,
    },
};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub(super) struct ScenarioSources {
    pub(super) scenario_directory: PathBuf,
    pub(super) scenario_name: String,
    pub(super) startup_path: PathBuf,
    pub(super) application_data_directory: PathBuf,
    pub(super) spells: Option<(PathBuf, Option<PathBuf>)>,
}

impl ScenarioSources {
    pub(super) fn read(params: &Value) -> Result<Self, String> {
        let (scenario_directory, scenario_name, startup_path) = scenario_directory(params)?;
        let application_data_directory = application_directory(params, &scenario_directory)?;
        let spells = spell_pair(&scenario_directory)?;
        Ok(Self {
            scenario_directory,
            scenario_name,
            startup_path,
            application_data_directory,
            spells,
        })
    }
}

fn scenario_directory(params: &Value) -> Result<(PathBuf, String, PathBuf), String> {
    let directory = PathBuf::from(required_string(params, "directory")?);
    if !directory.is_dir() {
        return Err(format!(
            "Classic scenario directory does not exist: {}",
            directory.display()
        ));
    }
    let folder_name = directory
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Classic scenario directory has no portable final name".to_string())?
        .to_owned();
    preflight_files(&directory, REQUIRED_FULL_SCENARIO_FILES, "scenario")?;
    let startup_path = resolve_startup_file_selected(
        &directory,
        &folder_name,
        params.get("startupFile").and_then(Value::as_str),
    )?;
    let name = startup_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Classic startup file has no portable final name".to_string())?
        .to_owned();
    Ok((directory, name, startup_path))
}

fn application_directory(params: &Value, scenario_directory: &Path) -> Result<PathBuf, String> {
    let directory = params.get("applicationDataDirectory").and_then(Value::as_str).map(PathBuf::from)
        .or_else(|| scenario_directory.parent().and_then(Path::parent).map(|root| root.join("Data Files")))
        .ok_or_else(|| "applicationDataDirectory is required when the Realmz Data Files directory cannot be derived".to_string())?;
    preflight_files(
        &directory,
        REQUIRED_APPLICATION_DATA_FILES,
        "application data",
    )?;
    Ok(directory)
}

fn spell_pair(directory: &Path) -> Result<Option<(PathBuf, Option<PathBuf>)>, String> {
    let spells = resolve_classic_native_file(directory, "Data Spell");
    let names = resolve_classic_native_file(directory, "Data Spell.rsrc");
    Ok(spells.map(|spells| (spells, names)))
}
