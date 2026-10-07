use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};

use providence_core::{
    model::ClassicResourceKey,
    rebuilt::{
        RebuiltV3AssetIndex, RebuiltV3CompilerIdentity, RebuiltV3FileInput, RebuiltV3Manifest,
        RebuiltV3ManifestArtifact, recompile_rebuilt_v3_manifest,
    },
};
use providence_rebuilt_package::write_rebuilt_v3_archive;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MigrationContract {
    kind: String,
    format_version: u8,
    source_package_sha256: String,
    source_evidence: SourceEvidence,
    asset_resource_assignments: Vec<AssetResourceAssignment>,
    shared_atlas: crate::synthetic_atlas::Migration,
    negative_mutation: NegativeMutation,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceEvidence {
    repository: String,
    commit: String,
    package_path: String,
    provenance_path: String,
    generator_commit: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AssetResourceAssignment {
    asset_id: String,
    resource_type: String,
    resource_id: i32,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NegativeMutation {
    document: String,
    exact_string: String,
    replacement: String,
    expected_replacements: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationLock {
    kind: &'static str,
    format_version: u8,
    compiler_commit: String,
    migration_contract_sha256: String,
    source_file: String,
    source_bytes: u64,
    source_sha256: String,
    output_file: String,
    output_bytes: u64,
    output_sha256: String,
    package_hash: String,
    content_id: String,
    negative_output_file: String,
    negative_output_bytes: u64,
    negative_output_sha256: String,
    source_evidence: SourceEvidence,
    assignments: Vec<AssetResourceAssignment>,
    shared_atlas: crate::synthetic_atlas::Migration,
    shared_atlas_sha256: String,
    negative_mutation: NegativeMutation,
}

struct MigrationRequest {
    source_path: PathBuf,
    migration_path: PathBuf,
    output_path: PathBuf,
    negative_output_path: PathBuf,
    lock_path: PathBuf,
    commit: String,
}

struct SourcePackage {
    files: BTreeMap<String, Vec<u8>>,
    manifest: RebuiltV3Manifest,
}

struct MigratedArchive {
    manifest: RebuiltV3ManifestArtifact,
    output: Vec<u8>,
}

pub fn run(args: &[String]) -> Result<(), String> {
    let MigrationRequest {
        source_path,
        migration_path,
        output_path,
        negative_output_path,
        lock_path,
        commit,
    } = prepare_request(args)?;

    let source_bytes = read(&source_path)?;
    let migration_bytes = read(&migration_path)?;
    let migration: MigrationContract = serde_json::from_slice(&migration_bytes)
        .map_err(|error| format!("{} is invalid: {error}", migration_path.display()))?;
    validate_contract(&migration, &source_bytes)?;

    let SourcePackage {
        mut files,
        manifest: source_manifest,
    } = source_package(&source_bytes)?;

    let shared_atlas_sha256 = migrate_assets(&mut files, &migration)?;

    let MigratedArchive { manifest, output } =
        recompile_archive(&source_manifest, &files, &commit)?;

    let negative_output = negative_archive(
        &files,
        &manifest.canonical_json,
        &migration.negative_mutation,
    )?;

    write_new(&output_path, &output)?;
    write_new(&negative_output_path, &negative_output)?;
    let lock = MigrationLock {
        kind: "providence.rebuilt-synthetic-migration-lock",
        format_version: 2,
        compiler_commit: commit,
        migration_contract_sha256: sha256(&migration_bytes),
        source_file: source_path.display().to_string(),
        source_bytes: source_bytes.len() as u64,
        source_sha256: sha256(&source_bytes),
        output_file: output_path.display().to_string(),
        output_bytes: output.len() as u64,
        output_sha256: sha256(&output),
        package_hash: manifest.manifest.package_hash,
        content_id: manifest.manifest.content_id,
        negative_output_file: negative_output_path.display().to_string(),
        negative_output_bytes: negative_output.len() as u64,
        negative_output_sha256: sha256(&negative_output),
        source_evidence: migration.source_evidence,
        assignments: migration.asset_resource_assignments,
        shared_atlas: migration.shared_atlas,
        shared_atlas_sha256,
        negative_mutation: migration.negative_mutation,
    };
    write_lock_and_receipt(&lock_path, &lock)
}

fn write_lock_and_receipt(lock_path: &Path, lock: &MigrationLock) -> Result<(), String> {
    write_new(lock_path, &pretty(lock)?)?;
    println!(
        "{}",
        serde_json::to_string(lock).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn source_package(source_bytes: &[u8]) -> Result<SourcePackage, String> {
    let mut files = read_archive_files(source_bytes)?;
    let manifest_bytes = files
        .remove("manifest.json")
        .ok_or_else(|| "source package has no manifest.json".to_string())?;
    let source_manifest: RebuiltV3Manifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("source manifest.json is invalid: {error}"))?;
    validate_source_files(&source_manifest, &files)?;
    Ok(SourcePackage {
        files,
        manifest: source_manifest,
    })
}

fn recompile_archive(
    source_manifest: &RebuiltV3Manifest,
    files: &BTreeMap<String, Vec<u8>>,
    commit: &str,
) -> Result<MigratedArchive, String> {
    let inputs = file_inputs(files);
    let manifest = recompile_rebuilt_v3_manifest(
        source_manifest,
        &RebuiltV3CompilerIdentity {
            version: env!("CARGO_PKG_VERSION").into(),
            commit: commit.into(),
            minimum_engine_version: source_manifest.engine.minimum_version.clone(),
        },
        &inputs,
    )
    .map_err(|error| error.to_string())?;
    let output = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &inputs)
        .map_err(|error| error.to_string())?
        .into_inner();
    Ok(MigratedArchive { manifest, output })
}

fn prepare_request(args: &[String]) -> Result<MigrationRequest, String> {
    let options = parse_options(args)?;
    let source_path = required_path(&options, "--source")?;
    let migration_path = required_path(&options, "--migration")?;
    let output_path = required_path(&options, "--output")?;
    let negative_output_path = required_path(&options, "--negative-output")?;
    let lock_path = required_path(&options, "--lock")?;
    let commit = providence_core::build_identity::asserted_compiler_identity(
        options.get("--commit").map(String::as_str),
        "0.1.0",
    )?
    .commit;
    for path in [&output_path, &negative_output_path, &lock_path] {
        if path.exists() {
            return Err(format!("refusing to overwrite {}", path.display()));
        }
    }
    Ok(MigrationRequest {
        source_path,
        migration_path,
        output_path,
        negative_output_path,
        lock_path,
        commit,
    })
}

fn migrate_assets(
    files: &mut BTreeMap<String, Vec<u8>>,
    migration: &MigrationContract,
) -> Result<String, String> {
    let mut assets: RebuiltV3AssetIndex = serde_json::from_slice(
        files
            .get("assets/index.json")
            .ok_or_else(|| "source package has no assets/index.json".to_string())?,
    )
    .map_err(|error| format!("source assets/index.json is invalid: {error}"))?;
    let shared_atlas_sha256 =
        crate::synthetic_atlas::apply(&mut assets, files, &migration.shared_atlas)?;
    apply_assignments(&mut assets, &migration.asset_resource_assignments)?;
    files.insert("assets/index.json".into(), canonical(&assets)?);
    Ok(shared_atlas_sha256)
}

fn negative_archive(
    files: &BTreeMap<String, Vec<u8>>,
    manifest: &[u8],
    mutation: &NegativeMutation,
) -> Result<Vec<u8>, String> {
    let mut negative_files = files.clone();
    let negative_document = negative_files
        .get_mut(&mutation.document)
        .ok_or_else(|| format!("negative mutation document {} is absent", mutation.document))?;
    let mut negative_value: Value = serde_json::from_slice(negative_document).map_err(|error| {
        format!(
            "negative mutation document {} is invalid JSON: {error}",
            mutation.document
        )
    })?;
    let replacements = replace_exact_string(
        &mut negative_value,
        &mutation.exact_string,
        &mutation.replacement,
    );
    if replacements != mutation.expected_replacements {
        return Err(format!(
            "negative mutation expected {} replacements, replaced {replacements}",
            mutation.expected_replacements
        ));
    }
    *negative_document = canonical(&negative_value)?;
    write_intentionally_invalid_archive(manifest, &negative_files)
}

fn validate_contract(contract: &MigrationContract, source_bytes: &[u8]) -> Result<(), String> {
    if contract.kind != "providence.rebuilt-synthetic-migration" || contract.format_version != 2 {
        return Err("unsupported synthetic migration contract".into());
    }
    let actual = sha256(source_bytes);
    if contract.source_package_sha256 != actual {
        return Err(format!(
            "source package SHA-256 is {actual}, expected {}",
            contract.source_package_sha256
        ));
    }
    if contract.asset_resource_assignments.is_empty() {
        return Err("synthetic migration declares no resource assignments".into());
    }
    Ok(())
}

fn apply_assignments(
    assets: &mut RebuiltV3AssetIndex,
    assignments: &[AssetResourceAssignment],
) -> Result<(), String> {
    let mut assigned_ids = BTreeSet::new();
    for assignment in assignments {
        if assignment.resource_type.len() != 4 {
            return Err(format!(
                "resource type {:?} is not exactly four bytes",
                assignment.resource_type
            ));
        }
        if !assigned_ids.insert(assignment.asset_id.as_str()) {
            return Err(format!("asset {} is assigned twice", assignment.asset_id));
        }
        let asset = assets
            .assets
            .iter_mut()
            .find(|asset| asset.id.0 == assignment.asset_id)
            .ok_or_else(|| format!("asset {} is absent", assignment.asset_id))?;
        if asset
            .resource_type
            .as_ref()
            .is_some_and(|value| value != &assignment.resource_type)
            || asset
                .resource_id
                .is_some_and(|value| value != assignment.resource_id)
        {
            return Err(format!(
                "asset {} has contradictory Classic resource metadata",
                assignment.asset_id
            ));
        }
        asset.resource_type = Some(assignment.resource_type.clone());
        asset.resource_id = Some(assignment.resource_id);
    }

    let mut keys = BTreeSet::new();
    for asset in &assets.assets {
        if let (Some(resource_type), Some(resource_id)) = (&asset.resource_type, asset.resource_id)
        {
            let key = ClassicResourceKey {
                resource_type: resource_type.clone(),
                resource_id,
            };
            if !keys.insert(key.clone()) {
                return Err(format!(
                    "asset index contains duplicate exact resource {}:{}",
                    key.resource_type, key.resource_id
                ));
            }
        }
    }
    Ok(())
}

fn replace_exact_string(value: &mut Value, needle: &str, replacement: &str) -> usize {
    match value {
        Value::String(current) if current == needle => {
            *current = replacement.into();
            1
        }
        Value::Array(values) => values
            .iter_mut()
            .map(|value| replace_exact_string(value, needle, replacement))
            .sum(),
        Value::Object(values) => values
            .values_mut()
            .map(|value| replace_exact_string(value, needle, replacement))
            .sum(),
        _ => 0,
    }
}

fn write_intentionally_invalid_archive(
    manifest: &[u8],
    files: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<u8>, String> {
    let destination = Cursor::new(Vec::new());
    let mut entries = BTreeMap::from([("manifest.json".to_string(), manifest.to_vec())]);
    entries.extend(files.clone());
    let mut writer = ZipWriter::new(destination);
    for (path, bytes) in entries {
        let compression = if path.ends_with(".json") {
            CompressionMethod::Deflated
        } else {
            CompressionMethod::Stored
        };
        let options = SimpleFileOptions::default()
            .compression_method(compression)
            .compression_level((compression == CompressionMethod::Deflated).then_some(9))
            .last_modified_time(zip::DateTime::default())
            .unix_permissions(0o644);
        writer
            .start_file(path, options)
            .map_err(|error| error.to_string())?;
        writer
            .write_all(&bytes)
            .map_err(|error| error.to_string())?;
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|error| error.to_string())
}

fn file_inputs(files: &BTreeMap<String, Vec<u8>>) -> Vec<RebuiltV3FileInput<'_>> {
    files
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect()
}

fn read_archive_files(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
    let mut files = BTreeMap::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let path = entry.name().to_string();
        let mut payload = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut payload)
            .map_err(|error| error.to_string())?;
        if files.insert(path.clone(), payload).is_some() {
            return Err(format!("archive contains duplicate path {path}"));
        }
    }
    Ok(files)
}

fn validate_source_files(
    manifest: &RebuiltV3Manifest,
    files: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    if manifest.kind != "realmz2.manifest"
        || manifest.format != "realmz2"
        || manifest.format_version != 2
        || manifest.schema_version != 3
    {
        return Err("source package does not use the supported Realmz2 schema-v3 contract".into());
    }
    let actual = files.keys().cloned().collect::<BTreeSet<_>>();
    let expected = manifest.files.keys().cloned().collect::<BTreeSet<_>>();
    if actual != expected {
        return Err("source archive entries do not match the manifest inventory".into());
    }
    for (path, integrity) in &manifest.files {
        let bytes = &files[path];
        if bytes.len() as u64 != integrity.bytes || sha256(bytes) != integrity.sha256 {
            return Err(format!(
                "source archive entry {path} fails manifest integrity"
            ));
        }
    }
    Ok(())
}

fn canonical(value: &impl Serialize) -> Result<Vec<u8>, String> {
    fn sorted(value: &Value) -> Value {
        match value {
            Value::Array(values) => Value::Array(values.iter().map(sorted).collect()),
            Value::Object(values) => Value::Object(
                values
                    .iter()
                    .map(|(key, value)| (key.clone(), sorted(value)))
                    .collect::<BTreeMap<_, _>>()
                    .into_iter()
                    .collect(),
            ),
            _ => value.clone(),
        }
    }
    let value = serde_json::to_value(value).map_err(|error| error.to_string())?;
    serde_json::to_vec(&sorted(&value)).map_err(|error| error.to_string())
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
    "migrate-synthetic-fixture requires --source FILE --migration FILE --output FILE --negative-output FILE --lock FILE --commit HASH".into()
}

fn read(path: &Path) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|error| format!("could not read {}: {error}", path.display()))
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        return Err(format!("refusing to overwrite {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    fs::write(path, bytes).map_err(|error| format!("could not write {}: {error}", path.display()))
}

fn pretty(value: &impl Serialize) -> Result<Vec<u8>, String> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn replaces_only_exact_fixture_string_values() {
        let mut value = json!({"name": "Fixture Wand", "description": "Fixture Wand text", "rows": ["Fixture Wand"]});
        assert_eq!(
            replace_exact_string(&mut value, "Fixture Wand", "Fixture Wands"),
            2
        );
        assert_eq!(value["name"], "Fixture Wands");
        assert_eq!(value["description"], "Fixture Wand text");
    }
}
