use super::encoding::sha256;
use providence_core::rebuilt::RebuiltV3Manifest;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
};
use zip::ZipArchive;

pub(super) fn read_archive_files(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
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

pub(super) fn validate_legacy_files(
    manifest: &RebuiltV3Manifest,
    files: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    let schema_supported = supported_schema_contract(
        manifest.schema_version,
        &manifest.schema_hash,
        &manifest.compiler.project_origin,
    );
    if manifest.kind != "realmz2.manifest"
        || manifest.format != "realmz2"
        || manifest.format_version != 2
        || !schema_supported
    {
        return Err("source package does not use a supported Realmz2 schema contract".into());
    }
    let actual_paths = files.keys().cloned().collect::<BTreeSet<_>>();
    let declared_paths = manifest.files.keys().cloned().collect::<BTreeSet<_>>();
    if actual_paths != declared_paths {
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

pub(super) fn supported_schema_contract(version: u8, hash: &str, project_origin: &str) -> bool {
    match (version, hash) {
        (3, providence_core::rebuilt::REBUILT_V3_SCHEMA_SHA256) => true,
        (4, providence_core::rebuilt::REBUILT_V4_SCHEMA_SHA256) if project_origin == "imported" => {
            true
        }
        (5, providence_core::rebuilt::REBUILT_V5_SCHEMA_SHA256) if project_origin == "imported" => {
            true
        }
        _ => false,
    }
}
