use crate::{
    RebuiltV3ArchiveError, RebuiltV3ArchiveInspection,
    documents::Documents,
    integrity::{
        content_id_from_documents, package_hash_from_manifest_value, parse_canonical_json,
        sha256_hex,
    },
    limits::{MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES, MAX_MANIFEST_BYTES},
    manifest::validate_manifest_contract,
};
use providence_core::rebuilt::{
    REBUILT_V3_REQUIRED_DOCUMENTS, RebuiltV3Manifest, rebuilt_v3_media_digest,
};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Read, Seek},
};
use zip::{CompressionMethod, ZipArchive};

pub fn inspect_rebuilt_v3_archive<R: Read + Seek>(
    source: R,
) -> Result<RebuiltV3ArchiveInspection, RebuiltV3ArchiveError> {
    let mut archive = ZipArchive::new(source)?;
    let (names, seen) = entry_names(&mut archive)?;
    let (manifest_value, manifest) = read_manifest(&mut archive, &names)?;
    validate_manifest_contract(&manifest)?;
    validate_entry_set(&manifest, &names, &seen)?;
    let bytes = read_documents(&mut archive, &manifest, &names)?;
    validate_hashes(&manifest, manifest_value, &bytes)?;
    // Verify every payload before trusting typed document relationships.
    let documents = Documents::parse(&bytes)?;
    documents.validate(&manifest)?;
    let media_file_count = manifest
        .files
        .keys()
        .filter(|path| rebuilt_v3_media_digest(path).is_some())
        .count();
    Ok(RebuiltV3ArchiveInspection {
        manifest,
        content: documents.content,
        world: documents.world,
        scenario: documents.scenario,
        asset_index: documents.assets,
        archive_file_count: names.len(),
        media_file_count,
    })
}

fn entry_names<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<(Vec<String>, BTreeSet<String>), RebuiltV3ArchiveError> {
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(RebuiltV3ArchiveError::TooManyEntries(archive.len()));
    }
    let mut names = Vec::with_capacity(archive.len());
    let mut seen = BTreeSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let path = entry.name().to_string();
        if !seen.insert(path.clone()) {
            return Err(RebuiltV3ArchiveError::DuplicateArchiveEntry(path));
        }
        names.push(path);
    }
    if names.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(RebuiltV3ArchiveError::NondeterministicEntryOrder);
    }

    Ok((names, seen))
}

fn read_manifest<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    names: &[String],
) -> Result<(Value, RebuiltV3Manifest), RebuiltV3ArchiveError> {
    let manifest_index = names
        .iter()
        .position(|path| path == "manifest.json")
        .ok_or(RebuiltV3ArchiveError::MissingManifest)?;
    let manifest_bytes =
        read_certified_entry(archive, manifest_index, "manifest.json", MAX_MANIFEST_BYTES)?;
    let (manifest_value, manifest): (Value, RebuiltV3Manifest) =
        parse_canonical_json("manifest.json", &manifest_bytes)?;

    Ok((manifest_value, manifest))
}

fn validate_entry_set(
    manifest: &RebuiltV3Manifest,
    names: &[String],
    seen: &BTreeSet<String>,
) -> Result<(), RebuiltV3ArchiveError> {
    let expected_names = manifest
        .files
        .keys()
        .cloned()
        .chain(std::iter::once("manifest.json".into()))
        .collect::<BTreeSet<_>>();
    for path in names {
        if !expected_names.contains(path) {
            return Err(RebuiltV3ArchiveError::UnexpectedArchiveEntry(path.clone()));
        }
    }
    if expected_names.len() != names.len() {
        let missing = expected_names
            .into_iter()
            .find(|path| !seen.contains(path))
            .expect("a count mismatch must have a missing entry");
        return Err(RebuiltV3ArchiveError::MissingFile(missing));
    }

    Ok(())
}

fn read_documents<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &RebuiltV3Manifest,
    names: &[String],
) -> Result<BTreeMap<String, Vec<u8>>, RebuiltV3ArchiveError> {
    let mut documents = BTreeMap::new();
    for (index, path) in names.iter().enumerate() {
        if path == "manifest.json" {
            continue;
        }
        let integrity = &manifest.files[path];
        let bytes = read_certified_entry(archive, index, path, MAX_ENTRY_BYTES)?;
        if bytes.len() as u64 != integrity.bytes || sha256_hex(&bytes) != integrity.sha256 {
            return Err(RebuiltV3ArchiveError::FileIntegrityMismatch(path.clone()));
        }
        if REBUILT_V3_REQUIRED_DOCUMENTS.contains(&path.as_str()) {
            documents.insert(path.clone(), bytes);
        }
    }

    Ok(documents)
}

fn validate_hashes(
    manifest: &RebuiltV3Manifest,
    manifest_value: Value,
    documents: &BTreeMap<String, Vec<u8>>,
) -> Result<(), RebuiltV3ArchiveError> {
    let actual_content_id = content_id_from_documents(documents);
    if actual_content_id != manifest.content_id {
        return Err(RebuiltV3ArchiveError::ContentIdMismatch {
            expected: manifest.content_id.clone(),
            actual: actual_content_id,
        });
    }
    let actual_package_hash = package_hash_from_manifest_value(manifest_value)?;
    if actual_package_hash != manifest.package_hash {
        return Err(RebuiltV3ArchiveError::PackageHashMismatch {
            expected: manifest.package_hash.clone(),
            actual: actual_package_hash,
        });
    }

    Ok(())
}

fn read_certified_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    index: usize,
    path: &str,
    maximum_bytes: u64,
) -> Result<Vec<u8>, RebuiltV3ArchiveError> {
    let mut entry = archive.by_index(index)?;
    let bytes = entry.size();
    if bytes > maximum_bytes {
        return Err(RebuiltV3ArchiveError::EntryTooLarge {
            path: path.into(),
            bytes,
        });
    }
    let expected_compression = if path.ends_with(".json") {
        CompressionMethod::Deflated
    } else {
        CompressionMethod::Stored
    };
    if entry.compression() != expected_compression
        || entry.last_modified() != Some(zip::DateTime::default())
        || entry.unix_mode() != Some(0o100644)
    {
        return Err(RebuiltV3ArchiveError::NondeterministicEntryMetadata(
            path.into(),
        ));
    }
    let mut output = Vec::with_capacity(bytes as usize);
    entry.read_to_end(&mut output)?;
    Ok(output)
}
