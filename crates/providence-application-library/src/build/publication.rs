use super::{
    archive,
    catalogs::{ApplicationLibraryCounts, Library},
    documents, encoding,
    options::BuildOptions,
    sources::{SourceManifestFile, VerifiedSources},
};
use crate::{corrections::CertifiedApplicationCorrection, fixtures};
use providence_core::rebuilt::{REALMZ_CLASSIC_APPLICATION_LIBRARY_ID, REBUILT_V3_SCHEMA_SHA256};
use serde::Serialize;
use std::{collections::BTreeMap, fs, path::Path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadableSourceCatalog<'a> {
    kind: &'static str,
    format_version: u8,
    package_id: &'static str,
    source_repository: &'a str,
    source_commit: &'a str,
    donor_repository: &'a str,
    donor_commit: &'a str,
    files: Vec<&'a SourceManifestFile>,
    corrections: &'a [CertifiedApplicationCorrection],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogHash {
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationLibraryLock {
    kind: &'static str,
    format_version: u8,
    package_id: &'static str,
    schema_version: u8,
    schema_sha256: &'static str,
    rules_version: &'static str,
    compiler_commit: String,
    source_manifest_sha256: String,
    catalogs: BTreeMap<String, CatalogHash>,
    package_hash: String,
    content_id: String,
    archive_bytes: u64,
    archive_sha256: String,
    counts: ApplicationLibraryCounts,
}

// Publication order is part of failure behavior: catalogs, package, fixtures, lock.
pub(super) fn publish(
    options: &BuildOptions,
    sources: &VerifiedSources,
    library: Library,
) -> Result<(), String> {
    let catalog_hashes = write_catalogs(&options.catalog_root, sources, &library)?;
    let content = documents::content(library.items, library.spells, library.rules);
    let archive = archive::build(
        &library.snapshot,
        &content,
        &library.assets,
        &library.media.runtime_payloads,
        &options.commit,
    )?;
    write_bytes(&options.package_path, &archive.bytes)?;
    if let Some(fixture_root) = &options.fixture_root {
        fixtures::write_alignment_fixtures(
            fixture_root,
            &options.fixture_commit,
            &archive.package_hash,
            &content.items,
            &content.spells,
            &library.media.catalog,
            &library.media.runtime_payloads,
        )?;
    }
    let lock = ApplicationLibraryLock {
        kind: "realmz2.application-library-lock",
        format_version: 1,
        package_id: REALMZ_CLASSIC_APPLICATION_LIBRARY_ID,
        schema_version: 3,
        schema_sha256: REBUILT_V3_SCHEMA_SHA256,
        rules_version: "realmz-classic-1",
        compiler_commit: options.commit.clone(),
        source_manifest_sha256: encoding::sha256(&sources.manifest_bytes),
        catalogs: catalog_hashes,
        package_hash: archive.package_hash,
        content_id: archive.content_id,
        archive_bytes: archive.bytes.len() as u64,
        archive_sha256: encoding::sha256(&archive.bytes),
        counts: library.counts,
    };
    write_bytes(&options.lock_path, &encoding::pretty(&lock)?)?;
    println!(
        "{}",
        serde_json::to_string(&lock).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn write_catalogs(
    root: &Path,
    sources: &VerifiedSources,
    library: &Library,
) -> Result<BTreeMap<String, CatalogHash>, String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("could not create {}: {error}", root.display()))?;
    let mut catalog_hashes = BTreeMap::new();
    write_catalog(
        root,
        "sources.json",
        &ReadableSourceCatalog {
            kind: "providence.application-library-sources",
            format_version: 2,
            package_id: REALMZ_CLASSIC_APPLICATION_LIBRARY_ID,
            source_repository: &sources.manifest.source_repository,
            source_commit: &sources.manifest.source_commit,
            donor_repository: &sources.manifest.donor_repository,
            donor_commit: &sources.manifest.donor_commit,
            files: sources.manifest.files.iter().collect(),
            corrections: &library.corrections,
        },
        &mut catalog_hashes,
    )?;
    write_catalog(root, "items.json", &library.items, &mut catalog_hashes)?;
    write_catalog(root, "spells.json", &library.spells, &mut catalog_hashes)?;
    write_catalog(
        root,
        "races.json",
        &library.rules.races,
        &mut catalog_hashes,
    )?;
    write_catalog(
        root,
        "castes.json",
        &library.rules.castes,
        &mut catalog_hashes,
    )?;
    write_catalog(
        root,
        "media.json",
        &library.media.catalog,
        &mut catalog_hashes,
    )?;
    Ok(catalog_hashes)
}

fn write_catalog(
    root: &Path,
    name: &str,
    value: &impl Serialize,
    hashes: &mut BTreeMap<String, CatalogHash>,
) -> Result<(), String> {
    let payload = encoding::pretty(value)?;
    write_bytes(&root.join(name), &payload)?;
    hashes.insert(
        name.into(),
        CatalogHash {
            bytes: payload.len() as u64,
            sha256: encoding::sha256(&payload),
        },
    );
    Ok(())
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    fs::write(path, bytes).map_err(|error| format!("could not write {}: {error}", path.display()))
}
