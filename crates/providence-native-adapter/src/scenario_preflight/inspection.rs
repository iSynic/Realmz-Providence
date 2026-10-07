use super::{
    REQUIRED_FULL_SCENARIO_FILES, inventory::ImportInventory, inventory::unowned_scenario_files,
    startup::resolve_startup_file_selected,
};
use crate::{
    classic_import_files::CAPTURED_SCENARIO_SOURCE_FILES, request_params::required_string,
};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

struct ImportInspection {
    scenario_directory: PathBuf,
    folder_name: String,
    startup_result: Result<PathBuf, String>,
    scenario_name: String,
    application_data_directory: Option<PathBuf>,
}

impl ImportInspection {
    fn resolve(params: &Value) -> Result<Self, String> {
        let scenario_directory = PathBuf::from(required_string(params, "directory")?);
        if !scenario_directory.is_dir() {
            return Err(format!(
                "Classic scenario directory does not exist: {}",
                scenario_directory.display()
            ));
        }
        let folder_name = scenario_directory
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "Classic scenario directory has no portable final name".to_string())?
            .to_owned();
        let startup_result = resolve_startup_file_selected(
            &scenario_directory,
            &folder_name,
            params.get("startupFile").and_then(Value::as_str),
        );
        let startup_path = startup_result.as_ref().ok();
        let scenario_name = startup_path
            .as_ref()
            .and_then(|path| path.file_name())
            .and_then(|name| name.to_str())
            .unwrap_or(&folder_name)
            .to_owned();
        let application_data_directory = params
            .get("applicationDataDirectory")
            .and_then(Value::as_str)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .or_else(|| {
                scenario_directory
                    .parent()
                    .and_then(Path::parent)
                    .map(|root| root.join("Data Files"))
            });

        Ok(Self {
            scenario_directory,
            folder_name,
            startup_result,
            scenario_name,
            application_data_directory,
        })
    }
}

pub(crate) fn inspect_classic_scenario_import(params: Value) -> Result<Value, String> {
    let ImportInspection {
        scenario_directory,
        folder_name,
        startup_result,
        scenario_name,
        application_data_directory,
    } = ImportInspection::resolve(&params)?;
    let startup_path = startup_result.as_ref().ok();

    let required_scenario_names = REQUIRED_FULL_SCENARIO_FILES
        .iter()
        .map(|name| name.to_string())
        .collect::<BTreeSet<_>>();
    let optional_scenario_names = CAPTURED_SCENARIO_SOURCE_FILES
        .iter()
        .copied()
        .filter(|name| *name != scenario_name && !required_scenario_names.contains(*name))
        .collect::<BTreeSet<_>>();
    let mut inventory = ImportInventory::default();
    inventory.inspect_required_scenario(&scenario_directory, &required_scenario_names);
    inventory.inspect_startup(
        &folder_name,
        startup_path.map(PathBuf::as_path),
        startup_result.as_ref().err().map(String::as_str),
    );
    inventory.inspect_optional_scenario(&scenario_directory, &optional_scenario_names);
    inventory.inspect_spell_pair(&scenario_directory);
    inventory.inspect_application(application_data_directory.as_deref());
    inventory.sort_reports();
    let unowned_scenario_files = unowned_scenario_files(
        &scenario_directory,
        &scenario_name,
        &required_scenario_names,
        &optional_scenario_names,
    )?;
    Ok(inventory.result(
        &scenario_name,
        &scenario_directory,
        application_data_directory.as_deref(),
        required_scenario_names.len() + 1,
        optional_scenario_names.len(),
        unowned_scenario_files,
    ))
}
