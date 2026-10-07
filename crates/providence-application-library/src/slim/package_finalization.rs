use super::{
    report::SlimScenario,
    scenario::{self, Inputs},
};
use providence_core::rebuilt::{ApplicationMediaCatalog, RebuiltV3Manifest};
use providence_rebuilt_package::inspect_rebuilt_v3_archive;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
    path::Path,
};
use tempfile::tempdir_in;
use zip::ZipArchive;

#[derive(Debug, Clone)]
pub struct ApplicationPackageIdentity {
    pub campaign_id: String,
    pub package_hash: String,
}

#[derive(Debug, Clone)]
pub struct PackageFinalizationContext {
    pub application_package: Vec<u8>,
    pub application_identity: ApplicationPackageIdentity,
    pub media_catalog: ApplicationMediaCatalog,
    pub classic_application_data: BTreeMap<String, Vec<u8>>,
    pub scenario_sources: BTreeMap<String, Vec<u8>>,
    pub compiler_commit: String,
}

#[derive(Debug)]
pub struct FinalizedScenarioPackage {
    pub bytes: Vec<u8>,
    pub manifest: RebuiltV3Manifest,
    pub manifest_bytes: Vec<u8>,
    pub report: Value,
}

/// Finalizes one compiled package against an explicitly identified stock library and captured
/// Classic ownership inputs. Folder conversion and native export use this boundary.
pub fn finalize_package_archive(
    source_package: &[u8],
    context: &PackageFinalizationContext,
    staging_parent: &Path,
    source_label: &str,
    output_label: &str,
) -> Result<FinalizedScenarioPackage, String> {
    finalize_package_archive_internal(
        source_package,
        context,
        staging_parent,
        source_label,
        output_label,
        false,
    )
}

pub fn finalize_package_archive_with_selected_rules(
    source_package: &[u8],
    context: &PackageFinalizationContext,
    staging_parent: &Path,
    source_label: &str,
    output_label: &str,
) -> Result<FinalizedScenarioPackage, String> {
    finalize_package_archive_internal(
        source_package,
        context,
        staging_parent,
        source_label,
        output_label,
        true,
    )
}

fn finalize_package_archive_internal(
    source_package: &[u8],
    context: &PackageFinalizationContext,
    staging_parent: &Path,
    source_label: &str,
    output_label: &str,
    selected_rules: bool,
) -> Result<FinalizedScenarioPackage, String> {
    let application_content = validated_application_content(context)?;
    std::fs::create_dir_all(staging_parent).map_err(|error| {
        format!(
            "could not prepare finalization staging directory {}: {error}",
            staging_parent.display()
        )
    })?;
    let temporary = tempdir_in(staging_parent).map_err(|error| {
        format!(
            "could not stage finalization under {}: {error}",
            staging_parent.display()
        )
    })?;
    let input_path = temporary.path().join("source.realmz2");
    let output_path = temporary.path().join("final.realmz2");
    let application_root = temporary.path().join("application-data");
    let scenario_root = temporary.path().join("classic-scenarios");
    std::fs::create_dir_all(&application_root).map_err(|error| error.to_string())?;
    std::fs::write(&input_path, source_package).map_err(|error| error.to_string())?;
    write_native_files(&application_root, &context.classic_application_data)?;
    let scenario_directory = scenario_root.join("captured-sources");
    write_native_files(&scenario_directory, &context.scenario_sources)?;
    let report = scenario::finalize(
        &input_path,
        &output_path,
        Inputs {
            application: &application_content,
            media_catalog: &context.media_catalog,
            application_data: &application_root,
            scenario_directory: &scenario_directory,
            commit: &context.compiler_commit,
            selected_rules,
        },
    )?;
    read_finalized_package(&output_path, report, source_label, output_label)
}

fn validated_application_content(context: &PackageFinalizationContext) -> Result<Value, String> {
    let application = inspect_rebuilt_v3_archive(Cursor::new(&context.application_package))
        .map_err(|error| format!("application package is invalid: {error}"))?;
    if application.manifest.campaign_id.0 != context.application_identity.campaign_id
        || application.manifest.package_hash != context.application_identity.package_hash
    {
        return Err("application package identity does not match finalization context".into());
    }
    if context.media_catalog.library_id.0 != context.application_identity.campaign_id {
        return Err("application package and media catalog library IDs differ".into());
    }
    let application_content =
        serde_json::to_value(&application.content).map_err(|error| error.to_string())?;
    if !context.classic_application_data.contains_key("Data Caste") {
        return Err("finalization context is missing Classic application Data Caste".into());
    }
    Ok(application_content)
}

fn read_finalized_package(
    output_path: &Path,
    report: SlimScenario,
    source_label: &str,
    output_label: &str,
) -> Result<FinalizedScenarioPackage, String> {
    let bytes = std::fs::read(output_path).map_err(|error| error.to_string())?;
    let inspection = inspect_rebuilt_v3_archive(Cursor::new(&bytes))
        .map_err(|error| format!("finalized package failed readback: {error}"))?;
    let manifest_bytes = {
        let mut archive =
            ZipArchive::new(Cursor::new(&bytes)).map_err(|error| error.to_string())?;
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|error| error.to_string())?;
        let mut manifest_bytes = Vec::new();
        manifest_file
            .read_to_end(&mut manifest_bytes)
            .map_err(|error| error.to_string())?;
        manifest_bytes
    };
    let mut report = serde_json::to_value(report).map_err(|error| error.to_string())?;
    report["sourceFile"] = Value::String(source_label.to_string());
    report["outputFile"] = Value::String(output_label.to_string());
    Ok(FinalizedScenarioPackage {
        bytes,
        manifest: inspection.manifest,
        manifest_bytes,
        report,
    })
}

fn write_native_files(root: &Path, files: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|error| error.to_string())?;
    for (relative, bytes) in files {
        let path = Path::new(relative);
        if path.as_os_str().is_empty()
            || path
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            return Err(format!("invalid native source path '{relative}'"));
        }
        let destination = root.join(path);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(destination, bytes).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_scenario_with_no_captured_sources_has_an_explicit_empty_owner_root() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("captured-sources");
        write_native_files(&root, &BTreeMap::new()).unwrap();
        assert!(root.is_dir());
        assert!(std::fs::read_dir(root).unwrap().next().is_none());
    }

    #[test]
    fn captured_sources_cannot_escape_the_owned_root() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("captured-sources");
        assert!(
            write_native_files(&root, &BTreeMap::from([("../outside".into(), vec![1])])).is_err()
        );
        assert!(!temporary.path().join("outside").exists());
    }
}
