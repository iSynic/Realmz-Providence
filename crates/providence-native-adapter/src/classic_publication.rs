use crate::request_params::required_string;
use providence_core::compiler::ClassicCompatibilitySources;
use providence_core::compiler::ManifestSource;
use providence_core::compiler::NativeManifest;
use providence_core::compiler::compile_classic_slice_with_application_and_asset_payloads;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;

pub(crate) fn write_classic_slice(
    session: &EditorSession,
    params: &Value,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
) -> Result<Value, String> {
    write_classic_slice_with_application(session, params, sources, asset_payloads, None)
}

pub(crate) fn write_classic_slice_with_application(
    session: &EditorSession,
    params: &Value,
    sources: ClassicCompatibilitySources<'_>,
    asset_payloads: &BTreeMap<String, Vec<u8>>,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<Value, String> {
    if let Some(expected_revision) = params.get("expectedRevision").and_then(Value::as_u64)
        && session.revision() != Revision(expected_revision)
    {
        return Err(format!(
            "revision conflict: expected {expected_revision}, current {}",
            session.revision().0
        ));
    }
    let manifest = compile_classic_slice_with_application_and_asset_payloads(
        session.snapshot(),
        sources,
        asset_payloads,
        application_media,
    )
    .map_err(|error| error.to_string())?;
    let directory = PathBuf::from(required_string(params, "directory")?);
    let digest = manifest.deterministic_sha256();
    publish_classic_directory(&directory, &manifest)?;
    let files = manifest
        .files()
        .map(|(name, entry)| json!({ "name": name, "bytes": entry.bytes.len() }))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "directory": directory,
        "manifestSha256": digest,
        "files": files,
        "warnings": crate::classic_timed_warnings::warnings(session.snapshot()),
    }))
}

pub(crate) fn publish_classic_directory(
    directory: &Path,
    manifest: &NativeManifest,
) -> Result<(), String> {
    if directory.exists() {
        return Err(format!(
            "refusing to overwrite existing Classic output {}",
            directory.display()
        ));
    }
    let parent = directory
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err(format!(
            "Classic output parent directory does not exist for {}",
            directory.display()
        ));
    }
    validate_manifest_names(directory, manifest)?;
    let staging = stage_manifest(directory, parent, manifest)?;

    if directory.exists() {
        return Err(format!(
            "refusing to overwrite existing Classic output {}",
            directory.display()
        ));
    }
    fs::rename(staging.path(), directory).map_err(|error| {
        if directory.exists() {
            format!(
                "refusing to overwrite existing Classic output {}",
                directory.display()
            )
        } else {
            format!(
                "could not publish Classic output {}: {error}",
                directory.display()
            )
        }
    })?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("could not sync Classic output parent: {error}"))?;
    Ok(())
}
use std::io::Write;

fn validate_manifest_names(directory: &Path, manifest: &NativeManifest) -> Result<(), String> {
    let startup_names = manifest
        .files()
        .filter_map(|(name, entry)| {
            matches!(
                &entry.source,
                ManifestSource::Generated {
                    family: providence_core::codecs::NativeFileFamily::ScenarioStartup
                        | providence_core::codecs::NativeFileFamily::ScenarioSecurityStartup
                }
            )
            .then_some(name)
        })
        .collect::<Vec<_>>();
    if startup_names.len() > 1 {
        return Err("Classic manifest contains more than one scenario startup file".into());
    }
    if let Some(scenario_name) = startup_names.first()
        && directory.file_name().and_then(|name| name.to_str()) != Some(*scenario_name)
    {
        return Err(format!(
            "Classic output directory must be named {scenario_name} to match its scenario startup file"
        ));
    }
    for (name, _) in manifest.files() {
        let mut components = Path::new(name).components();
        if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
            return Err(format!(
                "Classic manifest path must be one native filename: {name}"
            ));
        }
    }

    Ok(())
}

fn stage_manifest(
    directory: &Path,
    parent: &Path,
    manifest: &NativeManifest,
) -> Result<tempfile::TempDir, String> {
    let staging = tempfile::Builder::new()
        .prefix(".providence-classic-")
        .tempdir_in(parent)
        .map_err(|error| {
            format!(
                "could not create temporary Classic output beside {}: {error}",
                directory.display()
            )
        })?;
    for (name, entry) in manifest.files() {
        let path = staging.path().join(name);
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| format!("could not stage {}: {error}", path.display()))?;
        file.write_all(&entry.bytes)
            .map_err(|error| format!("could not stage {}: {error}", path.display()))?;
        file.sync_all()
            .map_err(|error| format!("could not sync {}: {error}", path.display()))?;
    }
    #[cfg(unix)]
    fs::File::open(staging.path())
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("could not sync staged Classic output: {error}"))?;

    Ok(staging)
}
