use super::{
    encoding::{pretty, sha256},
    native_sources::{read, read_native_files, write},
    package_finalization::{
        ApplicationPackageIdentity, PackageFinalizationContext, finalize_package_archive,
    },
    report::SlimLock,
};
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_rebuilt_package::inspect_rebuilt_v3_archive;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::Cursor,
    path::{Path, PathBuf},
};

pub(super) fn finalize(args: &[String]) -> Result<Value, String> {
    let options = parse_options(args)?;
    let application_path = required_path(&options, "--application-package")?;
    let media_catalog_path = required_path(&options, "--application-media-catalog")?;
    let classic_application_data = required_path(&options, "--classic-application-data")?;
    let classic_scenarios_root = required_path(&options, "--classic-scenarios-root")?;
    let input_dir = required_path(&options, "--input-dir")?;
    let output_dir = required_path(&options, "--output-dir")?;
    let lock_path = required_path(&options, "--lock")?;
    let commit = providence_core::build_identity::asserted_compiler_identity(
        options.get("--commit").map(String::as_str),
        "0.1.0",
    )?
    .commit;

    let (context, application_hash, media_hash) = application_context(
        &application_path,
        &media_catalog_path,
        &classic_application_data,
        &commit,
    )?;
    if !output_dir.is_dir() {
        fs::create_dir_all(&output_dir)
            .map_err(|error| format!("could not create {}: {error}", output_dir.display()))?;
    }

    let inputs = discover_inputs(&input_dir)?;
    let mut scenarios = Vec::with_capacity(inputs.len());
    for source_path in inputs {
        scenarios.push(finalize_input(
            &source_path,
            &output_dir,
            &classic_scenarios_root,
            &context,
        )?);
    }
    let lock = SlimLock {
        kind: "providence.rebuilt-scenario-library-lock",
        format_version: 1,
        compiler_commit: commit,
        application_package_sha256: application_hash,
        application_package_hash: context.application_identity.package_hash,
        application_media_catalog_sha256: media_hash,
        scenarios,
    };
    write(&lock_path, &pretty(&lock)?)?;
    serde_json::to_value(&lock).map_err(|error| error.to_string())
}

fn application_context(
    application_path: &Path,
    media_catalog_path: &Path,
    classic_application_data: &Path,
    commit: &str,
) -> Result<(PackageFinalizationContext, String, String), String> {
    let application_bytes = read(application_path)?;
    let application = inspect_rebuilt_v3_archive(Cursor::new(&application_bytes))
        .map_err(|error| format!("{} is invalid: {error}", application_path.display()))?;
    let media_catalog_bytes = read(media_catalog_path)?;
    let media_catalog: ApplicationMediaCatalog = serde_json::from_slice(&media_catalog_bytes)
        .map_err(|error| format!("{} is invalid: {error}", media_catalog_path.display()))?;
    if media_catalog.library_id != application.manifest.campaign_id {
        return Err("application package and media catalog library IDs differ".into());
    }
    let context = PackageFinalizationContext {
        application_package: application_bytes.clone(),
        application_identity: ApplicationPackageIdentity {
            campaign_id: application.manifest.campaign_id.0.clone(),
            package_hash: application.manifest.package_hash.clone(),
        },
        media_catalog: media_catalog.clone(),
        classic_application_data: BTreeMap::from([(
            "Data Caste".into(),
            read(&classic_application_data.join("Data Caste"))?,
        )]),
        scenario_sources: BTreeMap::new(),
        compiler_commit: commit.into(),
    };
    Ok((
        context,
        sha256(&application_bytes),
        sha256(&media_catalog_bytes),
    ))
}

fn discover_inputs(input_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut inputs = fs::read_dir(input_dir)
        .map_err(|error| format!("could not read {}: {error}", input_dir.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("realmz2"))
        })
        .collect::<Vec<_>>();
    inputs.sort();
    if inputs.is_empty() {
        return Err(format!(
            "{} contains no .realmz2 packages",
            input_dir.display()
        ));
    }

    Ok(inputs)
}

fn finalize_input(
    source_path: &Path,
    output_dir: &Path,
    classic_scenarios_root: &Path,
    context: &PackageFinalizationContext,
) -> Result<Value, String> {
    let file_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("{} has no portable filename", source_path.display()))?;
    let output_path = output_dir.join(file_name);
    if output_path.exists() {
        return Err(format!("refusing to overwrite {}", output_path.display()));
    }
    let source_bytes = read(source_path)?;
    let source = inspect_rebuilt_v3_archive(Cursor::new(&source_bytes))
        .map_err(|error| format!("{} is invalid: {error}", source_path.display()))?;
    let mut scenario_context = context.clone();
    scenario_context.scenario_sources =
        read_native_files(&classic_scenarios_root.join(&source.manifest.name))?;
    let finalized = finalize_package_archive(
        &source_bytes,
        &scenario_context,
        output_dir,
        &source_path.display().to_string(),
        &output_path.display().to_string(),
    )?;
    write(&output_path, &finalized.bytes)?;
    Ok(finalized.report)
}

fn parse_options(args: &[String]) -> Result<BTreeMap<String, String>, String> {
    if !args.len().is_multiple_of(2) {
        return Err(usage());
    }
    let mut options = BTreeMap::new();
    for pair in args.as_chunks::<2>().0 {
        if !pair[0].starts_with("--") || options.insert(pair[0].clone(), pair[1].clone()).is_some()
        {
            return Err(usage());
        }
    }
    Ok(options)
}

fn required_path(options: &BTreeMap<String, String>, name: &str) -> Result<PathBuf, String> {
    options.get(name).map(PathBuf::from).ok_or_else(usage)
}

fn usage() -> String {
    "slim-scenarios requires --application-package FILE --application-media-catalog FILE --classic-application-data DIR --classic-scenarios-root DIR --input-dir DIR --output-dir DIR --lock FILE [--commit HASH]".into()
}
