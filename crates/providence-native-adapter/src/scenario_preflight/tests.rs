use super::{resolve_classic_native_file, resolve_startup_file, resolve_startup_file_selected};
use providence_core::codecs::SCENARIO_STARTUP_BYTES;
use std::fs;
use tempfile::tempdir;

#[test]
fn resource_fork_resolution_prefers_direct_then_rsf_then_preserved_fork() {
    let temporary = tempdir().expect("temporary directory");
    let root = temporary.path();
    fs::create_dir(root.join(".rsrc")).expect("preserved fork directory");
    fs::write(root.join("Scenario.rsrc"), [1]).expect("direct fork");
    fs::write(root.join("Scenario.rsf"), [2]).expect("alternate fork");
    fs::write(root.join("._Scenario"), [4]).expect("AppleDouble sidecar");
    fs::write(root.join(".rsrc/Scenario"), [3]).expect("preserved fork");

    assert_eq!(
        resolve_classic_native_file(root, "Scenario.rsrc"),
        Some(root.join("Scenario.rsrc"))
    );
    fs::remove_file(root.join("Scenario.rsrc")).expect("remove direct fork");
    assert_eq!(
        resolve_classic_native_file(root, "Scenario.rsrc"),
        Some(root.join("Scenario.rsf"))
    );
    fs::remove_file(root.join("Scenario.rsf")).expect("remove alternate fork");
    assert_eq!(
        resolve_classic_native_file(root, "Scenario.rsrc"),
        Some(root.join("._Scenario"))
    );
    fs::remove_file(root.join("._Scenario")).expect("remove AppleDouble sidecar");
    assert_eq!(
        resolve_classic_native_file(root, "Scenario.rsrc"),
        Some(root.join(".rsrc/Scenario"))
    );
}

#[test]
fn resource_fork_aliases_do_not_substitute_for_data_files() {
    let temporary = tempdir().expect("temporary directory");
    let root = temporary.path();
    fs::write(root.join("Data BD.rsf"), [1]).expect("unrelated fork-like file");
    fs::write(root.join("Data BD._rsrc"), [2]).expect("unrelated sidecar-like file");

    assert_eq!(resolve_classic_native_file(root, "Data BD"), None);
}

#[test]
fn startup_fallback_uses_one_valid_record_and_rejects_ambiguity() {
    let temporary = tempdir().expect("temporary directory");
    let root = temporary.path();
    let valid = vec![0; SCENARIO_STARTUP_BYTES];
    fs::write(root.join("Data BD"), &valid).expect("startup-like critical file");
    fs::write(root.join("Data CS"), &valid).expect("startup-like unknown data file");
    fs::write(root.join("Recovered Name"), &valid).expect("alternate startup");

    assert_eq!(
        resolve_startup_file(root, "Renamed Folder").expect("unique startup"),
        root.join("Recovered Name")
    );
    fs::write(root.join("Second Candidate"), valid).expect("second startup");
    let error = resolve_startup_file(root, "Renamed Folder").expect_err("ambiguous startup");
    assert!(error.contains("classic-import.startup.ambiguous"));
    assert!(error.contains("Recovered Name"));
    assert!(error.contains("Second Candidate"));
}

#[test]
fn startup_selection_parameter_resolves_an_ambiguous_directory() {
    let temporary = tempdir().expect("temporary directory");
    let root = temporary.path();
    let valid = vec![0; SCENARIO_STARTUP_BYTES];
    fs::write(root.join("First Candidate"), &valid).expect("first startup");
    fs::write(root.join("Second Candidate"), valid).expect("second startup");

    assert_eq!(
        resolve_startup_file_selected(root, "Renamed Folder", Some("Second Candidate"))
            .expect("explicit startup selection"),
        root.join("Second Candidate")
    );
    let error = resolve_startup_file_selected(root, "Renamed Folder", Some("../outside"))
        .expect_err("selection cannot escape scenario directory");
    assert!(error.contains("classic-import.startup.selection-invalid"));
}

#[test]
fn invalid_preferred_startup_does_not_silently_choose_a_fallback() {
    let temporary = tempdir().expect("temporary directory");
    let root = temporary.path();
    fs::write(root.join("Preferred"), [0; 4]).expect("malformed preferred record");
    fs::write(root.join("Alternate"), vec![0; SCENARIO_STARTUP_BYTES]).expect("valid alternative");
    let error = resolve_startup_file(root, "Preferred").unwrap_err();
    assert!(error.contains("invalid scenario startup"));
    assert!(error.contains("Preferred"));
    assert_eq!(
        resolve_startup_file_selected(root, "Preferred", Some("Alternate")).unwrap(),
        root.join("Alternate")
    );
}
