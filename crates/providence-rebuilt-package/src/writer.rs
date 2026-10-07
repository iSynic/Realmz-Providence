use crate::{RebuiltV3ArchiveError, integrity::sha256_hex};
use providence_core::rebuilt::{
    RebuiltV3FileInput, RebuiltV3FileIntegrity, RebuiltV3ManifestArtifact,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Seek, Write},
};
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

pub fn write_rebuilt_v3_archive<W: Write + Seek>(
    destination: W,
    manifest: &RebuiltV3ManifestArtifact,
    files: &[RebuiltV3FileInput<'_>],
) -> Result<W, RebuiltV3ArchiveError> {
    let files = validate_inputs(&manifest.manifest.files, files)?;
    let mut entries = BTreeMap::from([("manifest.json", manifest.canonical_json.as_slice())]);
    entries.extend(files);

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
        writer.start_file(path, options)?;
        writer.write_all(bytes)?;
    }
    Ok(writer.finish()?)
}

fn validate_inputs<'a>(
    expected: &BTreeMap<String, RebuiltV3FileIntegrity>,
    files: &[RebuiltV3FileInput<'a>],
) -> Result<BTreeMap<&'a str, &'a [u8]>, RebuiltV3ArchiveError> {
    let mut actual = BTreeMap::new();
    let mut seen = BTreeSet::new();
    for file in files {
        if !seen.insert(file.path) {
            return Err(RebuiltV3ArchiveError::DuplicatePath(file.path.into()));
        }
        let Some(integrity) = expected.get(file.path) else {
            return Err(RebuiltV3ArchiveError::UnexpectedFile(file.path.into()));
        };
        if integrity.bytes != file.bytes.len() as u64 || integrity.sha256 != sha256_hex(file.bytes)
        {
            return Err(RebuiltV3ArchiveError::FileIntegrityMismatch(
                file.path.into(),
            ));
        }
        actual.insert(file.path, file.bytes);
    }
    for path in expected.keys() {
        if !seen.contains(path.as_str()) {
            return Err(RebuiltV3ArchiveError::MissingFile(path.clone()));
        }
    }
    Ok(actual)
}
