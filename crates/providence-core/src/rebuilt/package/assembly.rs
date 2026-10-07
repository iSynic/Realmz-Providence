use super::super::{RebuiltV3Start, canonical::canonical_json_bytes};
use super::integrity::{project_files, sha256_hex, sorted_capabilities};
use super::metadata::{ManifestMetadata, validate_compiler};
use super::{
    RebuiltV3CompilerIdentity, RebuiltV3FileInput, RebuiltV3FileIntegrity, RebuiltV3Manifest,
    RebuiltV3ManifestArtifact, RebuiltV3ManifestCompiler, RebuiltV3ManifestEngine,
    RebuiltV3ManifestError,
};
use crate::model::StableId;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UnhashedManifest<'a> {
    kind: &'a str,
    format: &'a str,
    format_version: u8,
    schema_version: u8,
    schema_hash: &'a str,
    campaign_id: &'a StableId,
    content_id: &'a str,
    name: &'a str,
    compiler: &'a RebuiltV3ManifestCompiler,
    engine: &'a RebuiltV3ManifestEngine,
    start: &'a RebuiltV3Start,
    capabilities: &'a [String],
    files: &'a BTreeMap<String, RebuiltV3FileIntegrity>,
}

pub(super) fn build(
    metadata: ManifestMetadata,
    identity: &RebuiltV3CompilerIdentity,
    capabilities: &[String],
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    validate_compiler(identity)?;
    let capabilities = sorted_capabilities(capabilities)?;
    let files = project_files(inputs)?;
    seal(RebuiltV3Manifest {
        kind: "realmz2.manifest".into(),
        format: "realmz2".into(),
        format_version: 2,
        schema_version: metadata.schema_version,
        schema_hash: metadata.schema_hash,
        campaign_id: metadata.campaign_id,
        content_id: files.content_id,
        name: metadata.name,
        compiler: RebuiltV3ManifestCompiler {
            name: "Providence".into(),
            version: identity.version.clone(),
            commit: identity.commit.clone(),
            project_schema_version: metadata.project_schema_version,
            project_origin: metadata.project_origin,
        },
        engine: RebuiltV3ManifestEngine {
            minimum_version: identity.minimum_engine_version.clone(),
            rules_version: metadata.rules_version,
        },
        start: metadata.start,
        capabilities,
        files: files.entries,
        package_hash: String::new(),
    })
}

fn seal(
    mut manifest: RebuiltV3Manifest,
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    let unhashed = UnhashedManifest {
        kind: &manifest.kind,
        format: &manifest.format,
        format_version: manifest.format_version,
        schema_version: manifest.schema_version,
        schema_hash: &manifest.schema_hash,
        campaign_id: &manifest.campaign_id,
        content_id: &manifest.content_id,
        name: &manifest.name,
        compiler: &manifest.compiler,
        engine: &manifest.engine,
        start: &manifest.start,
        capabilities: &manifest.capabilities,
        files: &manifest.files,
    };
    manifest.package_hash = sha256_hex(
        &canonical_json_bytes(&unhashed)
            .map_err(|error| RebuiltV3ManifestError::Serialization(error.to_string()))?,
    );
    let canonical_json = canonical_json_bytes(&manifest)
        .map_err(|error| RebuiltV3ManifestError::Serialization(error.to_string()))?;
    Ok(RebuiltV3ManifestArtifact {
        manifest,
        canonical_json,
    })
}
