use super::{
    REQUIRED_APPLICATION_DATA_FILES, classic_import_file_report, classic_native_file_length,
    resolve_classic_native_file, resolve_startup_file,
};
use serde_json::{Value, json};
use std::{collections::BTreeSet, fs, path::Path};

#[derive(Default)]
pub(super) struct ImportInventory {
    file_reports: Vec<Value>,
    blockers: Vec<Value>,
    diagnostics: Vec<Value>,
    scenario_source_bytes: u64,
    required_scenario_present: usize,
    optional_scenario_present: usize,
    required_application_present: usize,
    application_source_bytes: u64,
}

impl ImportInventory {
    pub(super) fn inspect_required_scenario(
        &mut self,
        scenario_directory: &Path,
        required_scenario_names: &BTreeSet<String>,
    ) {
        for native_path in required_scenario_names {
            let byte_length = classic_native_file_length(scenario_directory, native_path);
            if let Some(byte_length) = byte_length {
                self.required_scenario_present += 1;
                self.scenario_source_bytes = self.scenario_source_bytes.saturating_add(byte_length);
            } else {
                self.blockers.push(json!({
                    "code": "classic-import.scenario-file.missing",
                    "message": format!("Required Classic scenario file is missing: {native_path}"),
                    "nativePath": native_path,
                    "role": "scenario",
                }));
            }
            self.file_reports.push(classic_import_file_report(
                native_path,
                "scenario",
                true,
                byte_length,
            ));
        }
    }

    pub(super) fn inspect_startup(
        &mut self,
        scenario_name: &str,
        startup_path: Option<&Path>,
        startup_error: Option<&str>,
    ) {
        match (startup_path, startup_error) {
            (Some(path), _) => {
                let byte_length = path.metadata().ok().map(|metadata| metadata.len());
                if let Some(byte_length) = byte_length {
                    self.required_scenario_present += 1;
                    self.scenario_source_bytes =
                        self.scenario_source_bytes.saturating_add(byte_length);
                }
                self.file_reports.push(classic_import_file_report(
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or(scenario_name),
                    "scenario",
                    true,
                    byte_length,
                ));
            }
            (_, Some(error)) => {
                let code = serde_json::from_str::<Value>(error)
                    .ok()
                    .and_then(|value| value.get("code")?.as_str().map(str::to_owned))
                    .unwrap_or_else(|| "classic-import.startup.invalid".into());
                self.blockers.push(json!({
                    "code": code,
                    "message": error,
                    "nativePath": scenario_name,
                    "role": "scenario",
                }));
                self.file_reports.push(classic_import_file_report(
                    scenario_name,
                    "scenario",
                    true,
                    None,
                ));
            }
            (None, None) => unreachable!("startup resolution returns a path or an error"),
        }
    }

    pub(super) fn inspect_optional_scenario(
        &mut self,
        scenario_directory: &Path,
        optional_scenario_names: &BTreeSet<&str>,
    ) {
        for native_path in optional_scenario_names {
            let byte_length = classic_native_file_length(scenario_directory, native_path);
            if let Some(byte_length) = byte_length {
                self.optional_scenario_present += 1;
                self.scenario_source_bytes = self.scenario_source_bytes.saturating_add(byte_length);
            }
            self.file_reports.push(classic_import_file_report(
                native_path,
                "scenario",
                false,
                byte_length,
            ));
        }
    }

    pub(super) fn inspect_spell_pair(&mut self, scenario_directory: &Path) {
        let spell_present = resolve_classic_native_file(scenario_directory, "Data Spell").is_some();
        let spell_names_present =
            resolve_classic_native_file(scenario_directory, "Data Spell.rsrc").is_some();
        if spell_present != spell_names_present {
            self.diagnostics.push(json!({
                "code": "classic-import.scenario-spell-pair.incomplete",
                "severity": "warning",
                "message": if spell_present { "Numeric spells will be imported without names; their source bytes are retained." } else { "The names fork is retained, but no numeric spell records are available." },
                "role": "scenario",
            }));
        }
    }

    pub(super) fn inspect_application(&mut self, application_data_directory: Option<&Path>) {
        if let Some(directory) = application_data_directory {
            for native_path in REQUIRED_APPLICATION_DATA_FILES {
                let byte_length = classic_native_file_length(directory, native_path);
                if let Some(byte_length) = byte_length {
                    self.required_application_present += 1;
                    self.application_source_bytes =
                        self.application_source_bytes.saturating_add(byte_length);
                } else {
                    self.blockers.push(json!({
                    "code": "classic-import.application-file.missing",
                    "message": format!("Required Classic application-data file is missing: {native_path}"),
                    "nativePath": native_path,
                    "role": "application",
                }));
                }
                self.file_reports.push(classic_import_file_report(
                    native_path,
                    "application",
                    true,
                    byte_length,
                ));
            }
        } else {
            self.blockers.push(json!({
            "code": "classic-import.application-directory.unresolved",
            "message": "The Realmz Data Files directory could not be derived; provide applicationDataDirectory",
            "role": "application",
        }));
        }
    }

    pub(super) fn sort_reports(&mut self) {
        self.file_reports.sort_by(|left, right| {
            let left_key = (
                left["role"].as_str().unwrap_or_default(),
                left["nativePath"].as_str().unwrap_or_default(),
            );
            let right_key = (
                right["role"].as_str().unwrap_or_default(),
                right["nativePath"].as_str().unwrap_or_default(),
            );
            left_key.cmp(&right_key)
        });
        self.blockers.sort_by(|left, right| {
            let left_key = (
                left["code"].as_str().unwrap_or_default(),
                left["nativePath"].as_str().unwrap_or_default(),
            );
            let right_key = (
                right["code"].as_str().unwrap_or_default(),
                right["nativePath"].as_str().unwrap_or_default(),
            );
            left_key.cmp(&right_key)
        });
    }

    pub(super) fn result(
        self,
        scenario_name: &str,
        scenario_directory: &Path,
        application_data_directory: Option<&Path>,
        required_count: usize,
        optional_count: usize,
        unowned_scenario_files: Vec<String>,
    ) -> Value {
        json!({
            "scenarioName": scenario_name,
            "scenarioDirectory": scenario_directory,
            "applicationDataDirectory": application_data_directory,
            "sourceSetStatus": if self.blockers.is_empty() { "ready" } else { "incomplete" },
            "readyForDecode": self.blockers.is_empty(),
            "deepValidationRequired": true,
            "atomicImportMethod": "project.import-classic-scenario",
            "counts": {
                "requiredScenarioFiles": required_count,
                "presentRequiredScenarioFiles": self.required_scenario_present,
                "optionalScenarioFiles": optional_count,
                "presentOptionalScenarioFiles": self.optional_scenario_present,
                "requiredApplicationFiles": REQUIRED_APPLICATION_DATA_FILES.len(),
                "presentRequiredApplicationFiles": self.required_application_present,
                "scenarioSourceBytes": self.scenario_source_bytes,
                "applicationSourceBytes": self.application_source_bytes,
                "unownedScenarioFiles": unowned_scenario_files.len(),
            },
            "files": self.file_reports,
            "blockers": self.blockers,
            "diagnostics": self.diagnostics,
            "unownedScenarioFiles": unowned_scenario_files,
        })
    }
}
pub(super) fn unowned_scenario_files(
    scenario_directory: &Path,
    scenario_name: &str,
    required_scenario_names: &BTreeSet<String>,
    optional_scenario_names: &BTreeSet<&str>,
) -> Result<Vec<String>, String> {
    let captured_names = required_scenario_names
        .iter()
        .cloned()
        .chain(std::iter::once(scenario_name.to_string()))
        .chain(optional_scenario_names.iter().map(|name| name.to_string()))
        .collect::<BTreeSet<_>>();
    let mut captured_paths = captured_names
        .iter()
        .filter_map(|name| resolve_classic_native_file(scenario_directory, name))
        .collect::<BTreeSet<_>>();
    if let Ok(startup) = resolve_startup_file(scenario_directory, scenario_name) {
        captured_paths.insert(startup);
    }
    let mut unowned_scenario_files = fs::read_dir(scenario_directory)
        .map_err(|error| format!("could not list {}: {error}", scenario_directory.display()))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|kind| kind.is_file())
                .and_then(|_| entry.file_name().to_str().map(str::to_owned))
        })
        .filter(|name| {
            !captured_names.contains(name)
                && !captured_paths.contains(&scenario_directory.join(name))
        })
        .collect::<Vec<_>>();
    unowned_scenario_files.sort();

    Ok(unowned_scenario_files)
}
