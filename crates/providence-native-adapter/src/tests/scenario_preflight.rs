use super::*;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[test]
fn full_scenario_import_inspection_is_bounded_read_only_and_source_set_explicit() {
    let temporary = tempdir().expect("temporary root");
    let (scenario_root, application_root) = write_inspection_source_set(temporary.path());

    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "inspection-project".into(),
    )));
    let result = inspect_source_set(&mut session, &scenario_root, &application_root);

    assert_eq!(result["scenarioName"], "Inspection Scenario");
    assert_eq!(result["sourceSetStatus"], "ready");
    assert_eq!(result["readyForDecode"], true);
    assert_eq!(result["deepValidationRequired"], true);
    assert_eq!(
        result["atomicImportMethod"],
        "project.import-classic-scenario"
    );
    assert_eq!(
        result["counts"]["requiredScenarioFiles"],
        (REQUIRED_FULL_SCENARIO_FILES.len() + 1) as u64
    );
    assert_eq!(
        result["counts"]["presentRequiredScenarioFiles"],
        (REQUIRED_FULL_SCENARIO_FILES.len() + 1) as u64
    );
    assert_eq!(
        result["counts"]["presentRequiredApplicationFiles"],
        REQUIRED_APPLICATION_DATA_FILES.len() as u64
    );
    assert_eq!(
        result["counts"]["scenarioSourceBytes"],
        (REQUIRED_FULL_SCENARIO_FILES.len() + 316 + 3) as u64
    );
    assert_eq!(
        result["counts"]["applicationSourceBytes"],
        (REQUIRED_APPLICATION_DATA_FILES.len() * 2) as u64
    );
    assert_eq!(result["unownedScenarioFiles"], json!(["Read Me"]));
    assert_eq!(result["scenarioName"], "Inspection Scenario");
    assert!(result["files"].as_array().unwrap().iter().any(|file| {
        file["nativePath"] == "Global" && file["required"] == false && file["present"] == false
    }));
    assert!(result["files"].as_array().unwrap().iter().any(|file| {
        file["nativePath"] == "Scenario.rsrc"
            && file["required"] == false
            && file["present"] == false
    }));
    assert!(result["blockers"].as_array().unwrap().is_empty());
    assert!(result["files"].as_array().unwrap().len() < 64);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().classic_sources.is_empty());
}

fn inspect_source_set(
    session: &mut EditorSession,
    scenario_root: &Path,
    application_root: &Path,
) -> Value {
    dispatch_result_with_store(
        session,
        None,
        "project.inspect-classic-scenario-import",
        json!({
            "directory": scenario_root,
            "applicationDataDirectory": application_root,
        }),
    )
    .expect("inspect source set")
}

fn write_inspection_source_set(root: &Path) -> (PathBuf, PathBuf) {
    let scenario_root = root.join("Scenarios").join("Inspection Scenario");
    let application_root = root.join("Data Files");
    fs::create_dir_all(&scenario_root).expect("create scenario directory");
    fs::create_dir_all(&application_root).expect("create application directory");
    for name in REQUIRED_FULL_SCENARIO_FILES {
        let path = scenario_root.join(name);
        fs::write(path, [0x11]).expect("write required scenario file");
    }
    fs::write(
        scenario_root.join("Inspection Scenario"),
        vec![0; providence_core::codecs::SCENARIO_STARTUP_BYTES],
    )
    .expect("write scenario startup file");
    fs::write(scenario_root.join("Data CI"), [0x33, 0x34, 0x35])
        .expect("write optional scenario file");
    fs::write(scenario_root.join("Read Me"), [0x44]).expect("write unowned scenario file");
    for name in REQUIRED_APPLICATION_DATA_FILES {
        fs::write(application_root.join(name), [0x55, 0x56])
            .expect("write required application file");
    }
    (scenario_root, application_root)
}

#[test]
fn classic_native_file_resolution_prefers_direct_files_and_accepts_dot_rsrc_forks() {
    let temporary = tempdir().expect("temporary root");
    let root = temporary.path();
    fs::create_dir(root.join(".rsrc")).expect("create resource directory");
    fs::write(root.join(".rsrc/Scenario"), [0x11, 0x22]).expect("write preserved resource fork");

    assert_eq!(
        resolve_classic_native_file(root, "Scenario.rsrc"),
        Some(root.join(".rsrc/Scenario"))
    );
    assert_eq!(classic_native_file_length(root, "Scenario.rsrc"), Some(2));

    fs::write(root.join("Scenario.rsrc"), [0x33]).expect("write direct resource fork");
    assert_eq!(
        resolve_classic_native_file(root, "Scenario.rsrc"),
        Some(root.join("Scenario.rsrc"))
    );
    assert_eq!(classic_native_file_length(root, "Scenario.rsrc"), Some(1));
    assert_eq!(resolve_classic_native_file(root, "Data Spell.rsrc"), None);
}

#[test]
fn full_scenario_import_inspection_names_missing_files_and_optional_pair_failure() {
    let temporary = tempdir().expect("temporary root");
    let scenario_root = temporary
        .path()
        .join("Scenarios")
        .join("Incomplete Scenario");
    let application_root = temporary.path().join("Data Files");
    fs::create_dir_all(&scenario_root).expect("create scenario directory");
    fs::create_dir_all(&application_root).expect("create application directory");
    fs::write(
        scenario_root.join("Incomplete Scenario"),
        vec![0; providence_core::codecs::SCENARIO_STARTUP_BYTES],
    )
    .expect("write startup file");
    fs::write(scenario_root.join("Data Spell"), [0x22])
        .expect("write unpaired optional spell file");

    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "incomplete-inspection".into(),
    )));
    let result = dispatch_result_with_store(
        &mut session,
        None,
        "project.inspect-classic-scenario-import",
        json!({
            "directory": scenario_root,
            "applicationDataDirectory": application_root,
        }),
    )
    .expect("inspect incomplete source set");

    assert_eq!(result["sourceSetStatus"], "incomplete");
    assert_eq!(result["readyForDecode"], false);
    let blockers = result["blockers"].as_array().unwrap();
    assert!(blockers.iter().any(|blocker| {
        blocker["code"] == "classic-import.scenario-file.missing"
            && blocker["nativePath"] == "Data BD"
    }));
    assert!(blockers.iter().any(|blocker| {
        blocker["code"] == "classic-import.application-file.missing"
            && blocker["nativePath"] == "Data Race"
    }));
    assert!(
        !blockers
            .iter()
            .any(|blocker| { blocker["code"] == "classic-import.scenario-spell-pair.incomplete" })
    );
    assert!(
        result["diagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|diagnostic| {
                diagnostic["code"] == "classic-import.scenario-spell-pair.incomplete"
                    && diagnostic["severity"] == "warning"
            })
    );
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn full_scenario_import_preflight_failure_preserves_the_open_project() {
    let temporary = tempdir().expect("temporary root");
    let project_root = temporary.path().join("project");
    let scenario_root = temporary.path().join("Incomplete Scenario");
    let application_root = temporary.path().join("Data Files");
    fs::create_dir(&scenario_root).expect("create incomplete scenario");
    fs::create_dir(&application_root).expect("create incomplete application data");

    let snapshot = ProjectSnapshot::new_authored(StableId("preserved-project".into()));
    let store = ProjectStore::create(&project_root, &snapshot).expect("create project store");
    let mut session = EditorSession::new(snapshot.clone());
    let error = import_classic_scenario(
        &mut session,
        Some(&store),
        json!({
            "expectedRevision": 0,
            "directory": scenario_root,
            "applicationDataDirectory": application_root,
        }),
    )
    .expect_err("incomplete source must fail before replacing the project");

    assert!(error.starts_with("full Classic scenario preflight is missing:"));
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(session.snapshot(), &snapshot);
    let (_, reopened) = ProjectStore::open_session(&project_root).expect("reopen project store");
    assert_eq!(reopened.revision(), Revision(0));
    assert_eq!(reopened.snapshot(), &snapshot);
}

#[test]
fn full_scenario_import_decode_failure_preserves_live_and_durable_project() {
    let temporary = tempdir().expect("temporary root");
    let project_root = temporary.path().join("project");
    let scenario_root = temporary.path().join("Broken Scenario");
    let application_root = temporary.path().join("Data Files");
    fs::create_dir(&scenario_root).expect("create scenario");
    fs::create_dir(&application_root).expect("create application data");
    for name in REQUIRED_FULL_SCENARIO_FILES {
        fs::write(scenario_root.join(name), []).expect("write required scenario file");
    }
    fs::write(
        scenario_root.join("Broken Scenario"),
        vec![0; providence_core::codecs::SCENARIO_STARTUP_BYTES],
    )
    .expect("write scenario startup file");
    for name in REQUIRED_APPLICATION_DATA_FILES {
        fs::write(application_root.join(name), []).expect("write required application data file");
    }

    let snapshot = ProjectSnapshot::new_authored(StableId("preserved-project".into()));
    let store = ProjectStore::create(&project_root, &snapshot).expect("create project store");
    let mut session = EditorSession::new(snapshot.clone());
    let error = import_classic_scenario(
        &mut session,
        Some(&store),
        json!({
            "expectedRevision": 0,
            "directory": scenario_root,
            "applicationDataDirectory": application_root,
        }),
    )
    .expect_err("invalid family bytes must fail before replacing the project");

    assert!(error.starts_with("Data Race must contain at least 30 complete 408-byte records"));
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(session.snapshot(), &snapshot);
    let (_, reopened) = ProjectStore::open_session(&project_root).expect("reopen project store");
    assert_eq!(reopened.revision(), Revision(0));
    assert_eq!(reopened.snapshot(), &snapshot);
}
use crate::dispatch_result_with_store;
use crate::scenario_import::import_classic_scenario;
use crate::scenario_preflight::REQUIRED_APPLICATION_DATA_FILES;
use crate::scenario_preflight::REQUIRED_FULL_SCENARIO_FILES;
use crate::scenario_preflight::classic_native_file_length;
use crate::scenario_preflight::resolve_classic_native_file;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;
