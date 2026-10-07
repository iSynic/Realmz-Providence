use super::*;

#[test]
fn launch_arguments_name_only_the_external_host_boundary() {
    let temporary = tempdir().unwrap();
    fs::write(temporary.path().join("project.godot"), "").unwrap();
    fs::create_dir_all(temporary.path().join("tools")).unwrap();
    fs::write(
        temporary.path().join("tools/development_preview_host.tscn"),
        "",
    )
    .unwrap();
    fs::write(
        temporary.path().join("tools/development_preview_probe.gd"),
        "",
    )
    .unwrap();
    let request = temporary.path().join("request.json");
    fs::write(&request, "{}").unwrap();
    assert_eq!(
        interactive_host_arguments(temporary.path(), &request).unwrap()[2..5],
        ["--scene", INTERACTIVE_HOST_SCENE, "--"]
    );
    assert_eq!(
        headless_probe_arguments(temporary.path(), &request).unwrap()[0..5],
        [
            "--headless",
            "--path",
            temporary.path().to_str().unwrap(),
            "--script",
            HEADLESS_PROBE_SCRIPT
        ]
    );
}
