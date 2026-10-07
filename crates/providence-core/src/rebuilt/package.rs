use crate::model::{ProjectOrigin, ProjectSnapshot};

mod assembly;
mod contracts;
mod integrity;
mod metadata;

pub use contracts::{
    REBUILT_V3_REQUIRED_DOCUMENTS, REBUILT_V3_SCHEMA_SHA256, REBUILT_V3_SUPPORTED_CAPABILITIES,
    REBUILT_V4_SCHEMA_SHA256, REBUILT_V5_SCHEMA_SHA256, RebuiltV3CompilerIdentity,
    RebuiltV3FileInput, RebuiltV3FileIntegrity, RebuiltV3Manifest, RebuiltV3ManifestArtifact,
    RebuiltV3ManifestCompiler, RebuiltV3ManifestEngine, RebuiltV3ManifestError,
};
pub use integrity::{is_rebuilt_v3_package_path, rebuilt_v3_media_digest};

pub fn imported_requires_rebuilt_v4(snapshot: &ProjectSnapshot) -> bool {
    matches!(snapshot.origin, ProjectOrigin::Imported { .. })
        && snapshot
            .monster_sets
            .iter()
            .flat_map(|set| &set.monsters)
            .any(|monster| {
                monster.magic_to_hit < 0
                    || (monster.weapon < 0 && i32::from(monster.weapon).unsigned_abs() > 10)
            })
}
pub fn compile_rebuilt_v3_manifest(
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    capabilities: &[String],
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    compile_rebuilt_manifest(
        snapshot,
        compiler_identity,
        capabilities,
        inputs,
        3,
        REBUILT_V3_SCHEMA_SHA256,
    )
}

pub fn compile_rebuilt_v4_manifest(
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    capabilities: &[String],
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Err(RebuiltV3ManifestError::SchemaV4RequiresImportedOrigin);
    }
    compile_rebuilt_manifest(
        snapshot,
        compiler_identity,
        capabilities,
        inputs,
        4,
        REBUILT_V4_SCHEMA_SHA256,
    )
}

pub fn compile_rebuilt_v5_manifest(
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    capabilities: &[String],
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Err(RebuiltV3ManifestError::SchemaV4RequiresImportedOrigin);
    }
    compile_rebuilt_manifest(
        snapshot,
        compiler_identity,
        capabilities,
        inputs,
        5,
        REBUILT_V5_SCHEMA_SHA256,
    )
}

fn compile_rebuilt_manifest(
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    capabilities: &[String],
    inputs: &[RebuiltV3FileInput<'_>],
    schema_version: u8,
    schema_hash: &str,
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    let metadata = metadata::from_snapshot(snapshot, schema_version, schema_hash)?;
    assembly::build(metadata, compiler_identity, capabilities, inputs)
}

/// Rebuilds a manifest after a deterministic package-only migration while
/// preserving the source package's campaign bootstrap and project provenance.
/// The caller must supply the complete replacement file set.
pub fn recompile_rebuilt_v3_manifest(
    source: &RebuiltV3Manifest,
    compiler_identity: &RebuiltV3CompilerIdentity,
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    if source.schema_version != 3 || source.schema_hash != REBUILT_V3_SCHEMA_SHA256 {
        return Err(RebuiltV3ManifestError::UnsupportedSchemaContract {
            version: source.schema_version,
            hash: source.schema_hash.clone(),
        });
    }
    recompile_rebuilt_manifest(source, compiler_identity, inputs)
}

/// Rebuilds a package manifest without changing its accepted schema contract.
pub fn recompile_rebuilt_manifest(
    source: &RebuiltV3Manifest,
    compiler_identity: &RebuiltV3CompilerIdentity,
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3ManifestArtifact, RebuiltV3ManifestError> {
    let metadata = metadata::from_manifest(source)?;
    assembly::build(metadata, compiler_identity, &source.capabilities, inputs)
}

#[cfg(test)]
mod tests;
