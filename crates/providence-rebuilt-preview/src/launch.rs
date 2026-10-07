use super::file_io::require_absolute_file;
use super::{HEADLESS_PROBE_SCRIPT, INTERACTIVE_HOST_SCENE};
use std::path::Path;

pub fn interactive_host_arguments(
    rebuilt_root: &Path,
    request_path: &Path,
) -> Result<Vec<String>, String> {
    validate_launch_inputs(
        rebuilt_root,
        request_path,
        "tools/development_preview_host.tscn",
    )?;
    Ok(vec![
        "--path".into(),
        rebuilt_root.display().to_string(),
        "--scene".into(),
        INTERACTIVE_HOST_SCENE.into(),
        "--".into(),
        request_path.display().to_string(),
    ])
}

pub fn headless_probe_arguments(
    rebuilt_root: &Path,
    request_path: &Path,
) -> Result<Vec<String>, String> {
    validate_launch_inputs(
        rebuilt_root,
        request_path,
        "tools/development_preview_probe.gd",
    )?;
    Ok(vec![
        "--headless".into(),
        "--path".into(),
        rebuilt_root.display().to_string(),
        "--script".into(),
        HEADLESS_PROBE_SCRIPT.into(),
        "--".into(),
        request_path.display().to_string(),
    ])
}

fn validate_launch_inputs(
    rebuilt_root: &Path,
    request_path: &Path,
    host_relative_path: &str,
) -> Result<(), String> {
    if !rebuilt_root.is_absolute() || !rebuilt_root.join("project.godot").is_file() {
        return Err("Rebuilt root must be an absolute Godot project directory".into());
    }
    if !rebuilt_root.join(host_relative_path).is_file() {
        return Err(format!("Rebuilt checkout is missing {host_relative_path}"));
    }
    require_absolute_file(request_path, "preview request")
}
