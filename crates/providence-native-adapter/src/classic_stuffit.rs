mod checksum;
mod classic_format;
mod forks;
mod names;
mod publication;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod verify;

use providence_core::{
    codecs::NativeFileFamily,
    compiler::{ManifestSource, NativeManifest},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use stuffit::SitEntry;

// The writer buffers whole archives. Bound the canonical inputs before cloning them.
pub(crate) const MAX_SOURCE_BYTES: usize = 64 * 1024 * 1024;
pub(crate) const MAX_FILES: usize = 512;
pub(crate) const MAX_ARCHIVE_BYTES: usize = MAX_SOURCE_BYTES * 2 + 1024 * 1024;

pub(crate) struct Prepared {
    pub entries: Vec<SitEntry>,
    pub manifest_sha256: String,
    pub warnings: Vec<String>,
}

pub(crate) fn prepare(manifest: &NativeManifest, fallback_name: &str) -> Result<Prepared, String> {
    validate_size(manifest)?;
    let folder = scenario_name(manifest).unwrap_or(fallback_name);
    names::encode(folder)?;
    let mut entries = vec![SitEntry {
        name: folder.into(),
        is_folder: true,
        ..Default::default()
    }];
    let mut keys = BTreeSet::new();
    let mut warnings = BTreeSet::new();
    for (path, file) in manifest.files() {
        if forks::is_sidecar(path) {
            continue;
        }
        let resource = manifest
            .get(&format!("{path}.rsrc"))
            .filter(|_| forks::is_sidecar(&format!("{path}.rsrc")));
        add_file(
            &mut entries,
            &mut keys,
            &mut warnings,
            folder,
            path,
            &file.bytes,
            resource.map(|entry| entry.bytes.as_slice()),
        )?;
    }
    for (path, file) in manifest.files().filter(|(path, _)| forks::is_sidecar(path)) {
        let base = path.strip_suffix(".rsrc").expect("known sidecar");
        if manifest.get(base).is_none() {
            add_file(
                &mut entries,
                &mut keys,
                &mut warnings,
                folder,
                base,
                &[],
                Some(&file.bytes),
            )?;
        }
    }
    warnings.insert("Classic stored StuffIt preserves both forks without compression. Original StuffIt Expander 5.5 and Realmz 7.1.2 testing covers the Hax diagnostic; other scenarios still require testing.".into());
    Ok(Prepared {
        entries,
        manifest_sha256: manifest.deterministic_sha256(),
        warnings: warnings.into_iter().collect(),
    })
}

fn add_file(
    entries: &mut Vec<SitEntry>,
    keys: &mut BTreeSet<Vec<u8>>,
    warnings: &mut BTreeSet<String>,
    folder: &str,
    path: &str,
    data: &[u8],
    resource: Option<&[u8]>,
) -> Result<(), String> {
    let name = names::encode(path)?;
    if !keys.insert(names::hfs_key(&name)) {
        return Err(format!(
            "Classic HFS filename collision: {path}. Names were not changed."
        ));
    }
    let parts = forks::decode(resource)?;
    if !parts.metadata_known {
        warnings.insert("Some original Finder metadata was not captured; unknown type, creator and dates remain unset.".into());
    }
    if parts.omitted_metadata {
        warnings.insert("Additional AppleDouble metadata remains in the project source; StuffIt preserves its supported Finder fields and dates.".into());
    }
    entries.push(SitEntry {
        name: format!("{folder}/{path}"),
        data_fork: data.to_vec(),
        resource_fork: parts.resource.to_vec(),
        file_type: parts.file_type,
        creator: parts.creator,
        finder_flags: parts.flags,
        creation_date: parts.created,
        modification_date: parts.modified,
        ..Default::default()
    });
    Ok(())
}

fn validate_size(manifest: &NativeManifest) -> Result<(), String> {
    if manifest.files().len() > MAX_FILES {
        return Err(format!(
            "StuffIt export supports at most {MAX_FILES} native files."
        ));
    }
    let total = manifest
        .files()
        .try_fold(0usize, |total, (_, file)| {
            total.checked_add(file.bytes.len())
        })
        .ok_or("StuffIt input size overflow")?;
    if total > MAX_SOURCE_BYTES {
        return Err(
            "StuffIt export currently supports at most 64 MiB of native scenario bytes.".into(),
        );
    }
    Ok(())
}

fn scenario_name(manifest: &NativeManifest) -> Option<&str> {
    manifest.files().find_map(|(path, entry)| {
        matches!(
            entry.source,
            ManifestSource::Generated {
                family: NativeFileFamily::ScenarioStartup
                    | NativeFileFamily::ScenarioSecurityStartup
            }
        )
        .then_some(path)
    })
}

#[derive(serde::Deserialize)]
struct PageRequest {
    #[serde(default)]
    offset: usize,
    #[serde(default = "crate::rebuilt_export_plan::default_limit")]
    limit: usize,
}

pub(crate) fn plan(
    manifest: &NativeManifest,
    revision: u64,
    fallback_name: &str,
    params: Value,
) -> Result<Value, String> {
    let request: PageRequest = serde_json::from_value(params)
        .map_err(|error| format!("Invalid StuffIt plan parameters: {error}"))?;
    let prepared = prepare(manifest, fallback_name)?;
    let total = prepared.entries.len() - 1;
    let limit = request.limit.clamp(1, 128);
    let items = prepared.entries.iter().skip(1).skip(request.offset).take(limit).map(|entry|
        json!({"path": entry.name, "kind": "native forks", "bytes": entry.data_fork.len() + entry.resource_fork.len(), "dataBytes": entry.data_fork.len(), "resourceBytes": entry.resource_fork.len()})).collect::<Vec<_>>();
    Ok(
        json!({"revision": revision, "format": "stuffit-classic", "manifestSha256": prepared.manifest_sha256, "requiredDirectoryName": prepared.entries[0].name, "fileCount": total, "warnings": prepared.warnings,
        "files": {"items": items, "offset": request.offset, "limit": limit, "total": total, "truncated": request.offset.saturating_add(limit) < total}}),
    )
}

pub(crate) fn validate_revision(params: &Value, revision: u64) -> Result<(), String> {
    let expected = crate::request_params::required_u64(params, "expectedRevision")?;
    if expected != revision {
        return Err(format!(
            "revision conflict: expected {expected}, current {revision}"
        ));
    }
    Ok(())
}

pub(crate) fn execute(
    manifest: &NativeManifest,
    revision: u64,
    params: Value,
    inspect: bool,
) -> Result<Value, String> {
    if inspect {
        return plan(manifest, revision, "Realmz Scenario", params);
    }
    validate_revision(&params, revision)?;
    let prepared = prepare(manifest, "Realmz Scenario")?;
    if params
        .get("manifestSha256")
        .and_then(Value::as_str)
        .is_some_and(|digest| digest != prepared.manifest_sha256)
    {
        return Err("The StuffIt export plan changed. Recheck before exporting.".into());
    }
    let path = std::path::PathBuf::from(crate::request_params::required_string(&params, "path")?);
    publish(&prepared, &path, revision)
}

pub(crate) fn serialize(prepared: &Prepared) -> Result<Vec<u8>, String> {
    classic_format::serialize(&prepared.entries)
}

pub(crate) fn publish(
    prepared: &Prepared,
    path: &std::path::Path,
    revision: u64,
) -> Result<Value, String> {
    publication::check_destination(path)?;
    let bytes = serialize(prepared)?;
    publication::write(path, &bytes)?;
    Ok(
        json!({"revision": revision, "path": path, "format": "stuffit-classic", "fileCount": prepared.entries.len() - 1, "bytes": bytes.len(), "archiveSha256": format!("{:x}", Sha256::digest(&bytes)), "manifestSha256": prepared.manifest_sha256, "warnings": prepared.warnings, "forksVerified": true, "originalExpanderVerified": false}),
    )
}
