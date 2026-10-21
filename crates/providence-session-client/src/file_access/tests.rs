use super::*;
#[test]
fn collision_source_review_and_initialization_require_the_same_input_grant() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("Data Solids");
    std::fs::write(&input, vec![0; 1024]).unwrap();
    let access = FileAccess {
        input_roots: vec![root.path().into()],
        output_root: None,
    }
    .normalized()
    .unwrap();
    for method in [
        "special-land-solidity.preview",
        "special-land-solidity.initialize",
    ] {
        assert!(
            FileAccess::default()
                .authorize(method, &mut json!({"path":input}))
                .is_err()
        );
        assert!(access.authorize(method, &mut json!({"path":input})).is_ok());
    }
}
#[test]
fn classic_directory_inputs_require_two_explicit_grants_and_bounded_regular_files() {
    let root = tempfile::tempdir().unwrap();
    let scenario = root.path().join("scenario");
    let application = root.path().join("application");
    std::fs::create_dir(&scenario).unwrap();
    std::fs::create_dir(&application).unwrap();
    let mut request = json!({"directory":scenario,"applicationDataDirectory":application});
    let only_scenario = FileAccess {
        input_roots: vec![scenario.clone()],
        output_root: None,
    }
    .normalized()
    .unwrap();
    assert!(
        only_scenario
            .authorize("project.import-classic-scenario.begin", &mut request)
            .is_err()
    );
    let access = FileAccess {
        input_roots: vec![root.path().into()],
        output_root: None,
    }
    .normalized()
    .unwrap();
    access
        .authorize("project.import-classic-scenario.begin", &mut request)
        .unwrap();
    assert_eq!(
        request["directory"],
        json!(scenario.canonicalize().unwrap())
    );
    std::fs::File::create(scenario.join("too-large"))
        .unwrap()
        .set_len(128 * 1024 * 1024 + 1)
        .unwrap();
    assert!(
        access
            .authorize("project.inspect-classic-scenario-import", &mut request)
            .unwrap_err()
            .contains("128 MiB")
    );
}

#[cfg(unix)]
#[test]
fn a_classic_folder_grant_never_grants_linked_native_files() {
    let root = tempfile::tempdir().unwrap();
    let scenario = root.path().join("scenario");
    std::fs::create_dir(&scenario).unwrap();
    std::fs::write(root.path().join("outside"), b"outside").unwrap();
    std::os::unix::fs::symlink(root.path().join("outside"), scenario.join("Scenario")).unwrap();
    let access = FileAccess {
        input_roots: vec![scenario.clone()],
        output_root: None,
    }
    .normalized()
    .unwrap();
    let mut request = json!({"directory":scenario,"applicationDataDirectory":scenario});
    assert!(
        access
            .authorize("project.import-classic-scenario.begin", &mut request)
            .unwrap_err()
            .contains("linked")
    );
}
use serde_json::json;

#[test]
fn absent_grants_never_authorize_existing_inputs_or_new_outputs() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("image.png");
    std::fs::write(&input, b"input").unwrap();
    let access = FileAccess::default();
    assert!(
        access
            .authorize("media.import.prepare", &mut json!({"path":input}))
            .is_err()
    );
    assert!(
        access
            .authorize(
                "project.compile-rebuilt-package",
                &mut json!({"path":root.path().join("out.realmz2")})
            )
            .is_err()
    );
    assert!(!root.path().join("out.realmz2").exists());
}

#[test]
fn canonical_grants_check_both_input_files_and_output_parents() {
    let root = tempfile::tempdir().unwrap();
    let granted = root.path().join("granted");
    std::fs::create_dir(&granted).unwrap();
    std::fs::write(granted.join("image.png"), b"inside").unwrap();
    std::fs::write(root.path().join("outside.png"), b"outside").unwrap();
    let access = FileAccess {
        input_roots: vec![granted.clone()],
        output_root: Some(granted.clone()),
    }
    .normalized()
    .unwrap();
    let mut allowed = json!({"path":granted.join("image.png")});
    access
        .authorize("media.import.prepare", &mut allowed)
        .unwrap();
    assert_eq!(
        allowed["path"],
        json!(granted.join("image.png").canonicalize().unwrap())
    );
    for path in [
        granted.join("../outside.png"),
        root.path().join("outside.png"),
    ] {
        assert!(
            access
                .authorize("media.import.prepare", &mut json!({"path":path}))
                .is_err()
        );
    }
    assert!(access.authorize("media.import.prepare", &mut json!({"path":granted.join("image.png"),"reversePath":root.path().join("outside.png")})).is_err());
    access
        .authorize(
            "project.compile-classic-slice",
            &mut json!({"directory":granted.join("scenario")}),
        )
        .unwrap();
    assert!(
        access
            .authorize(
                "project.compile-classic-slice",
                &mut json!({"directory":granted.join("../escape")})
            )
            .is_err()
    );
    assert!(
        access
            .authorize(
                "project.compile-classic-slice",
                &mut json!({"directory":granted})
            )
            .is_err()
    );
    assert!(
        access
            .authorize("media.import.prepare", &mut json!({"path":"image.png"}))
            .is_err()
    );
}

#[test]
fn proxy_grants_are_per_client_and_never_application_support_options() {
    let root = tempfile::tempdir().unwrap();
    let options = vec![
        "--mcp-input-root".into(),
        root.path().to_string_lossy().into_owned(),
        "--mcp-output-root".into(),
        root.path().to_string_lossy().into_owned(),
        "--application-rules-root".into(),
        "application".into(),
    ];
    let (access, support) = FileAccess::proxy_options(&options, "mcp").unwrap();
    assert_eq!(access.input_roots.len(), 1);
    assert!(access.output_root.is_some());
    assert_eq!(support, ["--application-rules-root", "application"]);
    assert!(FileAccess::proxy_options(&options, "native").is_err());
    let (empty, _) = FileAccess::proxy_options(&support, "mcp").unwrap();
    assert!(empty.input_roots.is_empty() && empty.output_root.is_none());
    assert!(FileAccess::from_handshake(&json!({"inputRoots":[root.path()],"extra":true})).is_err());
}

#[cfg(unix)]
#[test]
fn links_to_outside_inputs_or_output_parents_do_not_extend_a_grant() {
    let root = tempfile::tempdir().unwrap();
    let granted = root.path().join("granted");
    let outside = root.path().join("outside");
    std::fs::create_dir(&granted).unwrap();
    std::fs::create_dir(&outside).unwrap();
    std::fs::write(outside.join("source.png"), b"outside").unwrap();
    std::os::unix::fs::symlink(&outside, granted.join("link")).unwrap();
    let access = FileAccess {
        input_roots: vec![granted.clone()],
        output_root: Some(granted.clone()),
    }
    .normalized()
    .unwrap();
    assert!(
        access
            .authorize(
                "media.import.prepare",
                &mut json!({"path":granted.join("link/source.png")})
            )
            .is_err()
    );
    assert!(
        access
            .authorize(
                "project.compile-rebuilt-package",
                &mut json!({"path":granted.join("link/out.realmz2")})
            )
            .is_err()
    );
}

#[test]
fn explicit_finalization_requires_each_consumed_input_grant() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("input");
    let outside = root.path().join("outside");
    std::fs::create_dir(&input).unwrap();
    std::fs::create_dir(&outside).unwrap();
    for path in [
        input.join("app.realmz2"),
        input.join("Data Caste"),
        outside.join("media.json"),
    ] {
        std::fs::write(path, b"input").unwrap();
    }
    let access = FileAccess {
        input_roots: vec![input.clone()],
        output_root: Some(input.clone()),
    }
    .normalized()
    .unwrap();
    let mut params = json!({"path":input.join("output.realmz2"),"packageFinalization":{
        "applicationPackage":input.join("app.realmz2"),"classicApplicationDataDirectory":input,
        "applicationMediaCatalogPath":outside.join("media.json")
    }});
    assert!(access.authorize("export.begin", &mut params).is_err());
    params["packageFinalization"]
        .as_object_mut()
        .unwrap()
        .remove("applicationMediaCatalogPath");
    access.authorize("export.begin", &mut params).unwrap();
    let denied = FileAccess::default();
    assert!(
        denied
            .authorize("project.inspect-rebuilt-package", &mut params)
            .is_err()
    );
}
