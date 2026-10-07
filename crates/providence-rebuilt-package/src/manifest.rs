use crate::{
    RebuiltV3ArchiveError,
    limits::{MAX_ARCHIVE_PAYLOAD_BYTES, MAX_ENTRY_BYTES},
};
use providence_core::rebuilt::{
    REBUILT_V3_REQUIRED_DOCUMENTS, REBUILT_V3_SCHEMA_SHA256, REBUILT_V3_SUPPORTED_CAPABILITIES,
    REBUILT_V4_SCHEMA_SHA256, REBUILT_V5_SCHEMA_SHA256, RebuiltV3Manifest,
    is_rebuilt_v3_package_path, rebuilt_v3_media_digest,
};
use std::collections::BTreeSet;

pub(crate) fn validate_manifest_contract(
    manifest: &RebuiltV3Manifest,
) -> Result<(), RebuiltV3ArchiveError> {
    validate_schema(manifest)?;
    validate_metadata(manifest)?;
    validate_capabilities(manifest)?;
    validate_files(manifest)
}

fn validate_schema(manifest: &RebuiltV3Manifest) -> Result<(), RebuiltV3ArchiveError> {
    if manifest.kind != "realmz2.manifest"
        || manifest.format != "realmz2"
        || manifest.format_version != 2
        || !matches!(
            (manifest.schema_version, manifest.schema_hash.as_str()),
            (3, REBUILT_V3_SCHEMA_SHA256)
                | (4, REBUILT_V4_SCHEMA_SHA256)
                | (5, REBUILT_V5_SCHEMA_SHA256)
        )
        || manifest.schema_version >= 4 && manifest.compiler.project_origin != "imported"
    {
        return Err(RebuiltV3ArchiveError::InvalidManifest(
            "kind, format, version, schema hash, or imported-schema origin is invalid".into(),
        ));
    }
    Ok(())
}

fn validate_metadata(manifest: &RebuiltV3Manifest) -> Result<(), RebuiltV3ArchiveError> {
    if manifest.campaign_id.0.is_empty()
        || manifest.campaign_id.0.len() > 128
        || !manifest
            .campaign_id
            .0
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        || manifest.name.trim().is_empty()
        || manifest.compiler.name != "Providence"
        || manifest.compiler.version.trim().is_empty()
        || manifest.compiler.commit.trim().is_empty()
        || !matches!(
            manifest.compiler.project_origin.as_str(),
            "authored" | "imported"
        )
        || manifest.engine.minimum_version.trim().is_empty()
        || manifest.engine.rules_version != "realmz-classic-1"
    {
        return Err(RebuiltV3ArchiveError::InvalidManifest(
            "compiler, engine, campaign, or origin metadata is incomplete".into(),
        ));
    }
    Ok(())
}

fn validate_capabilities(manifest: &RebuiltV3Manifest) -> Result<(), RebuiltV3ArchiveError> {
    let supported = REBUILT_V3_SUPPORTED_CAPABILITIES
        .into_iter()
        .collect::<BTreeSet<_>>();
    if manifest
        .capabilities
        .windows(2)
        .any(|pair| pair[0] >= pair[1])
        || manifest
            .capabilities
            .iter()
            .any(|capability| !supported.contains(capability.as_str()))
    {
        return Err(RebuiltV3ArchiveError::InvalidManifest(
            "capabilities are unsupported, duplicated, or unsorted".into(),
        ));
    }
    Ok(())
}

fn validate_files(manifest: &RebuiltV3Manifest) -> Result<(), RebuiltV3ArchiveError> {
    for required in REBUILT_V3_REQUIRED_DOCUMENTS {
        if !manifest.files.contains_key(required) {
            return Err(RebuiltV3ArchiveError::MissingFile(required.into()));
        }
    }
    let mut total_declared_bytes = 0u64;
    for (path, integrity) in &manifest.files {
        total_declared_bytes = total_declared_bytes
            .checked_add(integrity.bytes)
            .ok_or_else(|| {
                RebuiltV3ArchiveError::InvalidManifest(
                    "declared archive payload byte count overflows u64".into(),
                )
            })?;
        if !is_rebuilt_v3_package_path(path)
            || integrity.bytes > MAX_ENTRY_BYTES
            || !is_sha256(&integrity.sha256)
            || rebuilt_v3_media_digest(path).is_some_and(|digest| digest != integrity.sha256)
        {
            return Err(RebuiltV3ArchiveError::InvalidManifest(format!(
                "file declaration '{path}' is invalid"
            )));
        }
    }
    if total_declared_bytes > MAX_ARCHIVE_PAYLOAD_BYTES {
        return Err(RebuiltV3ArchiveError::InvalidManifest(format!(
            "declared archive payload is {total_declared_bytes} bytes; the inspection limit is {MAX_ARCHIVE_PAYLOAD_BYTES}"
        )));
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
