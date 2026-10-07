use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use providence_storage::{ProjectStore, ReferenceLibraryStore};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::ExitCode,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportRequest {
    format_version: u32,
    source_directory: PathBuf,
    output_directory: PathBuf,
    support_directory: PathBuf,
    application_package: PathBuf,
    application_library_identity: ApplicationLibraryIdentity,
    #[serde(default)]
    startup_file: Option<String>,
    #[serde(default)]
    native_menu_selection: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplicationLibraryIdentity {
    campaign_id: String,
    package_hash: String,
}

pub(crate) fn run(args: &[String]) -> ExitCode {
    let result = (|| {
        if args.len() != 1 {
            return Err("import-rebuilt-scenario requires one request JSON path".into());
        }
        let request: ImportRequest =
            serde_json::from_slice(&fs::read(&args[0]).map_err(|e| e.to_string())?)
                .map_err(|e| format!("Invalid import request: {e}"))?;
        if request.format_version != 1 {
            return Err("Unsupported import request version".into());
        }
        validate_job_paths(&request)?;
        fs::create_dir(&request.output_directory)
            .map_err(|e| format!("Cannot create import job: {e}"))?;
        let mut events = fs::File::create(request.output_directory.join("events.jsonl"))
            .map_err(|e| e.to_string())?;
        match convert(&request, &mut events) {
            Ok(result) => emit(&mut events, "complete", result),
            Err(error) => {
                emit(&mut events, "failed", failure_projection(&error))?;
                Err(error)
            }
        }
    })();
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn failure_projection(error: &str) -> Value {
    let mut failure = json!({"message":error});
    if error.starts_with("Classic rule selection is unresolved") {
        failure["code"] = json!("classic-rule-selection.required");
        failure["requiredSelection"] = json!({"field":"nativeMenuSelection", "minimum":1, "maximum":32767,
            "applicationRules":{"minimum":1,"maximum":19},
            "scenarioFirst":{"minimum":20,"maximum":32767}, "origin":"explicit-intended-selection"});
    } else if error.starts_with("nativeMenuSelection must be") {
        failure["code"] = json!("classic-rule-selection.invalid");
    }
    failure
}

fn emit(events: &mut fs::File, event: &str, data: Value) -> Result<(), String> {
    let line = json!({"formatVersion":1,"event":event,"data":data}).to_string();
    writeln!(events, "{line}")
        .and_then(|_| events.flush())
        .map_err(|e| e.to_string())?;
    println!("{line}");
    Ok(())
}

fn convert(request: &ImportRequest, events: &mut fs::File) -> Result<Value, String> {
    validate_rule_choice(request)?;
    let (name, source_parent) = prepare_source(request, events)?;
    let source = source_parent.join(&name);
    let data = request.support_directory.join("application-data");
    let id = campaign_id(&name);
    let snapshot = ProjectSnapshot::new_authored(StableId(id.clone()));
    let store = ProjectStore::create_new(request.output_directory.join("project"), &snapshot)
        .map_err(|e| e.to_string())?;
    let mut session = EditorSession::new(snapshot);
    let (_, library) =
        ReferenceLibraryStore::open(request.support_directory.join("reference-library"))
            .map_err(|e| e.to_string())?;
    emit(
        events,
        "progress",
        json!({"phase":"reading_scenario","message":"Reading scenario…"}),
    )?;
    let revision = session.revision().0;
    let imported = crate::scenario_import::import_classic_scenario(
        &mut session,
        Some(&store),
        json!({
            "expectedRevision":revision,
            "directory":source,
            "applicationDataDirectory":data,
            "startupFile":name,
        }),
    )?;
    emit(events, "imported", imported)?;
    configure_rule_choice(request, &mut session, &store)?;
    let unsupported =
        providence_core::rebuilt::unsupported_classic_instructions(session.snapshot());
    let report = json!({"formatVersion":1,"campaignId":id,"sourceName":name,"unsupportedInstructions":unsupported});
    write_report(request, &report)?;
    emit(events, "diagnostics", report)?;
    emit(
        events,
        "progress",
        json!({"phase":"converting","message":"Converting…"}),
    )?;
    let compiled = compile_selected_package(request, &session, &store, &library, &id)?;
    let packages = request.output_directory.join("packages");
    let output = packages.join(format!("{id}.realmz2"));
    let package_hash = compiled["packageHash"].clone();
    if let Some(report) = compiled.get("finalization") {
        fs::write(
            request.output_directory.join("package-report.json"),
            serde_json::to_vec_pretty(report).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
    }
    let result = json!({"packagePath":output,"campaignId":compiled["campaignId"],
        "packageHash":package_hash,"warningCount":compiled["warningCount"],
        "warnings":compiled["warnings"],
        "unsupportedInstructions":unsupported,
        "readinessStatus":compiled["readinessStatus"],"message":"Scenario imported."});
    write_report(request, &result)?;
    Ok(result)
}

fn compile_selected_package(
    request: &ImportRequest,
    session: &EditorSession,
    store: &ProjectStore,
    library: &providence_core::rebuilt::ApplicationMediaCatalog,
    id: &str,
) -> Result<Value, String> {
    let packages = request.output_directory.join("packages");
    fs::create_dir(&packages).map_err(|e| e.to_string())?;
    let compiled = crate::rebuilt_packages::compile_rebuilt_package(
        session,
        store,
        Some(library),
        json!({
            "path":packages.join(format!("{id}.realmz2")),
            "minimumEngineVersion":"0.1.0",
            "expectedRevision":session.revision().0,
            "packageFinalization": {
                "applicationPackage": request.application_package.clone(),
                "applicationCampaignId": request.application_library_identity.campaign_id.clone(),
                "applicationPackageHash": request.application_library_identity.package_hash.clone(),
                "applicationMediaCatalogPath": request.support_directory.join("media.json"),
                "classicApplicationDataDirectory": request.support_directory.join("application-data"),
            },
        }),
    )?;
    Ok(compiled)
}

fn validate_rule_choice(request: &ImportRequest) -> Result<(), String> {
    match request.native_menu_selection {
        None => Err("Classic rule selection is unresolved; supply nativeMenuSelection from the intended Castle execution selection".into()),
        Some(0 | 32768..=65535) => Err("nativeMenuSelection must be from 1 through 32767".into()),
        Some(_) => Ok(()),
    }
}

fn configure_rule_choice(
    request: &ImportRequest,
    session: &mut EditorSession,
    store: &ProjectStore,
) -> Result<(), String> {
    let slot = request.native_menu_selection.ok_or("Classic rule selection is unresolved; supply nativeMenuSelection from the intended Castle execution selection")?;
    let saved =
        crate::classic_rule_selection::dispatch(session, "classic-rule-selection.open", json!({}))?;
    let change = crate::classic_rule_selection::dispatch(
        session,
        "classic-rule-selection.set",
        json!({
            "expectedRevision":session.revision().0, "expectedProjectId":saved["projectId"],
            "expectedPreviousIdentity":saved["contextIdentity"], "expectedSourceSetSha256":saved["sourceSetSha256"],
            "nativeMenuSelection":slot,
        }),
    )?;
    store
        .checkpoint_session(session, &change)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn write_report(request: &ImportRequest, value: &Value) -> Result<(), String> {
    fs::write(
        request.output_directory.join("compatibility-report.json"),
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
fn prepare_source(
    request: &ImportRequest,
    events: &mut fs::File,
) -> Result<(String, PathBuf), String> {
    emit(
        events,
        "progress",
        json!({"phase":"checking_files","message":"Checking files…"}),
    )?;
    verify_application(request)?;
    let data = request.support_directory.join("application-data");
    let preflight = crate::scenario_preflight::inspect_classic_scenario_import(json!({
        "directory": request.source_directory, "applicationDataDirectory":data,
        "startupFile":request.startup_file,
    }))?;
    // The same preflight is returned to callers; import remains the authority for decoding.
    emit(events, "preflight", preflight.clone())?;
    if let Some(blockers) = preflight["blockers"]
        .as_array()
        .filter(|items| !items.is_empty())
    {
        emit_startup_candidates(events, blockers)?;
        return Err(blockers
            .iter()
            .map(|item| {
                item["message"]
                    .as_str()
                    .unwrap_or("Scenario preflight failed")
            })
            .collect::<Vec<_>>()
            .join("\n"));
    }
    let name = preflight["scenarioName"]
        .as_str()
        .ok_or("Scenario has no identifiable startup record")?
        .to_owned();
    let source_parent = request.output_directory.join("sources");
    let source = source_parent.join(&name);
    let mut bytes = 0;
    capture(&request.source_directory, &source, &mut bytes, 0)?;
    verify_capture(&request.source_directory, &source, 0)?;
    Ok((name, source_parent))
}

fn emit_startup_candidates(events: &mut fs::File, blockers: &[Value]) -> Result<(), String> {
    for blocker in blockers
        .iter()
        .filter(|item| item["code"] == "classic-import.startup.ambiguous")
    {
        if let Ok(detail) = serde_json::from_str::<Value>(blocker["message"].as_str().unwrap_or(""))
        {
            let candidates = detail["candidates"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    Path::new(item.as_str()?)
                        .file_name()?
                        .to_str()
                        .map(str::to_owned)
                })
                .collect::<Vec<_>>();
            emit(
                events,
                "startup_selection",
                json!({"candidates":candidates}),
            )?;
        }
    }
    Ok(())
}

fn verify_application(request: &ImportRequest) -> Result<(), String> {
    let application = providence_rebuilt_package::inspect_rebuilt_v3_archive(
        fs::File::open(&request.application_package)
            .map_err(|e| format!("Cannot read application library: {e}"))?,
    )
    .map_err(|e| format!("Application library validation failed: {e}"))?;
    if application.manifest.campaign_id.0 != request.application_library_identity.campaign_id
        || application.manifest.package_hash != request.application_library_identity.package_hash
    {
        return Err("Application library identity does not match the import request".into());
    }
    Ok(())
}

fn validate_job_paths(request: &ImportRequest) -> Result<(), String> {
    let source = fs::canonicalize(&request.source_directory)
        .map_err(|e| format!("Cannot open scenario folder: {e}"))?;
    if fs::symlink_metadata(&request.source_directory)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Select the scenario folder itself, not a symbolic link".into());
    }
    let parent = request
        .output_directory
        .parent()
        .ok_or("Import staging needs a parent directory")?;
    let destination =
        fs::canonicalize(parent).map_err(|e| format!("Cannot open import staging: {e}"))?;
    if destination.starts_with(&source) {
        return Err("Import staging must be outside the read-only scenario source folder".into());
    }
    Ok(())
}

fn verify_capture(source: &Path, destination: &Path, depth: usize) -> Result<(), String> {
    if depth > 8 {
        return Err("Scenario folder changed while importing".into());
    }
    let list = |path: &Path| -> Result<Vec<std::ffi::OsString>, String> {
        let mut names = fs::read_dir(path)
            .map_err(|e| e.to_string())?
            .map(|entry| entry.map(|entry| entry.file_name()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        names.sort();
        Ok(names)
    };
    let names = list(source)?;
    if names != list(destination)? {
        return Err(format!(
            "Source files changed while importing: {}",
            source.display()
        ));
    }
    for name in names {
        let original = source.join(&name);
        let captured = destination.join(name);
        let kind = fs::symlink_metadata(&original)
            .map_err(|e| e.to_string())?
            .file_type();
        if kind.is_symlink() {
            return Err(format!(
                "Source changed to a symbolic link: {}",
                original.display()
            ));
        }
        if kind.is_dir() {
            verify_capture(&original, &captured, depth + 1)?;
        } else if !kind.is_file()
            || fs::read(&original).map_err(|e| e.to_string())?
                != fs::read(&captured).map_err(|e| e.to_string())?
        {
            return Err(format!(
                "Source changed while importing: {}",
                original.display()
            ));
        }
    }
    Ok(())
}

fn campaign_id(name: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut words = Vec::new();
    let mut word = String::new();
    for c in name.chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            word.push(c);
        } else if !word.is_empty() {
            words.push(std::mem::take(&mut word));
        }
    }
    if !word.is_empty() {
        words.push(word);
    }
    let title = words.join("-");
    if name.is_ascii() && !title.is_empty() && title.len() <= 110 {
        return format!("scenario-{title}");
    }
    // Native startup identity, not folder location or source content, groups revisions.
    let identity = format!("{:x}", Sha256::digest(name.to_lowercase().as_bytes()));
    format!(
        "scenario-{}-{}",
        title.chars().take(70).collect::<String>(),
        &identity[..24]
    )
}

fn capture(source: &Path, destination: &Path, bytes: &mut u64, depth: usize) -> Result<(), String> {
    if depth > 8 {
        return Err("Scenario folder nesting exceeds the import limit".into());
    }
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    let mut entries = fs::read_dir(source)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            return Err(format!(
                "Scenario contains a symbolic link: {}",
                entry.path().display()
            ));
        }
        let target = destination.join(entry.file_name());
        if kind.is_dir() {
            capture(&entry.path(), &target, bytes, depth + 1)?;
        } else if kind.is_file() {
            let before = entry.metadata().map_err(|e| e.to_string())?;
            *bytes = bytes
                .checked_add(before.len())
                .ok_or("Scenario size overflow")?;
            if before.len() > 256 * 1024 * 1024 || *bytes > 2 * 1024 * 1024 * 1024 {
                return Err("Scenario exceeds the import size limit".into());
            }
            let content = fs::read(entry.path()).map_err(|e| e.to_string())?;
            if content.len() as u64 != before.len() {
                return Err(format!(
                    "Source size changed while importing: {}",
                    entry.path().display()
                ));
            }
            fs::write(target, &content).map_err(|e| e.to_string())?;
            if content != fs::read(entry.path()).map_err(|e| e.to_string())? {
                return Err(format!(
                    "Source changed while importing: {}",
                    entry.path().display()
                ));
            }
        } else {
            return Err(format!(
                "Unsupported source file type: {}",
                entry.path().display()
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captured_input_rejects_later_edits_and_added_files() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let captured = root.path().join("captured");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("Data ED3"), b"original bytes").unwrap();
        capture(&source, &captured, &mut 0, 0).unwrap();
        verify_capture(&source, &captured, 0).unwrap();
        fs::write(source.join("Data ED3"), b"modified bytes").unwrap();
        assert!(verify_capture(&source, &captured, 0).is_err());
        assert_eq!(
            fs::read(captured.join("Data ED3")).unwrap(),
            b"original bytes"
        );
        fs::write(source.join("Data ED3"), b"original bytes").unwrap();
        fs::write(source.join("new file"), b"new").unwrap();
        assert!(verify_capture(&source, &captured, 0).is_err());
    }

    #[test]
    fn import_job_cannot_write_into_source_tree() {
        let root = tempfile::tempdir().unwrap();
        let request = ImportRequest {
            format_version: 1,
            source_directory: root.path().into(),
            output_directory: root.path().join("job"),
            support_directory: root.path().into(),
            application_package: root.path().join("application.realmz2"),
            startup_file: None,
            native_menu_selection: None,
            application_library_identity: ApplicationLibraryIdentity {
                campaign_id: "application".into(),
                package_hash: "hash".into(),
            },
        };
        assert!(
            validate_job_paths(&request)
                .unwrap_err()
                .contains("read-only")
        );
        assert!(!request.output_directory.exists());
    }
    #[test]
    fn folder_request_requires_explicit_selection_without_inferring_from_scenario_name() {
        let mut value = json!({"formatVersion":1, "sourceDirectory":"D:/City of Bywater",
            "outputDirectory":"D:/job", "supportDirectory":"D:/support", "applicationPackage":"D:/application.realmz2",
            "applicationLibraryIdentity":{"campaignId":"application","packageHash":"hash"}});
        let request: ImportRequest = serde_json::from_value(value.clone()).unwrap();
        let error = validate_rule_choice(&request).unwrap_err();
        let failure = failure_projection(&error);
        assert_eq!(failure["code"], "classic-rule-selection.required");
        assert_eq!(failure["requiredSelection"]["field"], "nativeMenuSelection");
        for slot in [1, 19, 20, 32767] {
            value["nativeMenuSelection"] = json!(slot);
            assert!(validate_rule_choice(&serde_json::from_value(value.clone()).unwrap()).is_ok());
        }
        for slot in [0, 32768, 65535] {
            value["nativeMenuSelection"] = json!(slot);
            let request: ImportRequest = serde_json::from_value(value.clone()).unwrap();
            let error = validate_rule_choice(&request).unwrap_err();
            assert_eq!(
                failure_projection(&error)["code"],
                "classic-rule-selection.invalid"
            );
        }
    }
}
