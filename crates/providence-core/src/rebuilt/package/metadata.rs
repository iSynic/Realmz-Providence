use super::super::{RebuiltV3Start, project_rebuilt_v3_bootstrap};
use super::{
    REBUILT_V3_SCHEMA_SHA256, REBUILT_V4_SCHEMA_SHA256, REBUILT_V5_SCHEMA_SHA256,
    RebuiltV3CompilerIdentity, RebuiltV3Manifest, RebuiltV3ManifestError,
};
use crate::model::{ProjectOrigin, ProjectSnapshot, StableId};

pub(super) struct ManifestMetadata {
    pub campaign_id: StableId,
    pub name: String,
    pub start: RebuiltV3Start,
    pub schema_version: u8,
    pub schema_hash: String,
    pub project_schema_version: u32,
    pub project_origin: String,
    pub rules_version: String,
}

pub(super) fn from_snapshot(
    snapshot: &ProjectSnapshot,
    schema_version: u8,
    schema_hash: &str,
) -> Result<ManifestMetadata, RebuiltV3ManifestError> {
    let bootstrap =
        project_rebuilt_v3_bootstrap(snapshot).ok_or(RebuiltV3ManifestError::MissingBootstrap)?;
    validate_campaign(&snapshot.project_id, &bootstrap.campaign.name)?;
    Ok(ManifestMetadata {
        campaign_id: snapshot.project_id.clone(),
        name: bootstrap.campaign.name,
        start: bootstrap.start,
        schema_version,
        schema_hash: schema_hash.into(),
        project_schema_version: snapshot.format_version,
        project_origin: match snapshot.origin {
            ProjectOrigin::Authored => "authored",
            ProjectOrigin::Imported { .. } => "imported",
        }
        .into(),
        rules_version: "realmz-classic-1".into(),
    })
}

pub(super) fn from_manifest(
    source: &RebuiltV3Manifest,
) -> Result<ManifestMetadata, RebuiltV3ManifestError> {
    let schema_hash = match (source.schema_version, source.schema_hash.as_str()) {
        (3, REBUILT_V3_SCHEMA_SHA256) => REBUILT_V3_SCHEMA_SHA256,
        (4, REBUILT_V4_SCHEMA_SHA256) if source.compiler.project_origin == "imported" => {
            REBUILT_V4_SCHEMA_SHA256
        }
        (5, REBUILT_V5_SCHEMA_SHA256) if source.compiler.project_origin == "imported" => {
            REBUILT_V5_SCHEMA_SHA256
        }
        _ => {
            return Err(RebuiltV3ManifestError::UnsupportedSchemaContract {
                version: source.schema_version,
                hash: source.schema_hash.clone(),
            });
        }
    };
    validate_campaign(&source.campaign_id, &source.name)?;
    Ok(ManifestMetadata {
        campaign_id: source.campaign_id.clone(),
        name: source.name.clone(),
        start: source.start.clone(),
        schema_version: source.schema_version,
        schema_hash: schema_hash.into(),
        project_schema_version: source.compiler.project_schema_version,
        project_origin: source.compiler.project_origin.clone(),
        rules_version: source.engine.rules_version.clone(),
    })
}

pub(super) fn validate_compiler(
    compiler: &RebuiltV3CompilerIdentity,
) -> Result<(), RebuiltV3ManifestError> {
    if compiler.version.trim().is_empty()
        || compiler.commit.trim().is_empty()
        || compiler.minimum_engine_version.trim().is_empty()
    {
        return Err(RebuiltV3ManifestError::InvalidCompilerMetadata);
    }
    Ok(())
}

fn validate_campaign(id: &StableId, name: &str) -> Result<(), RebuiltV3ManifestError> {
    if !portable_campaign_id(&id.0) {
        return Err(RebuiltV3ManifestError::InvalidCampaignId(id.clone()));
    }
    if name.trim().is_empty() {
        return Err(RebuiltV3ManifestError::InvalidCampaignName);
    }
    Ok(())
}

fn portable_campaign_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}
