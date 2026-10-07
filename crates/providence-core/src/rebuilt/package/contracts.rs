use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::super::RebuiltV3Start;
use crate::model::StableId;

pub const REBUILT_V3_SCHEMA_SHA256: &str =
    "05ced7b000683f53e6220b9ac8f7d41c801e7e2c78c874287c2ae694b585273d";
pub const REBUILT_V4_SCHEMA_SHA256: &str =
    "78b1e34503fd44fe7ce79d8225f09e36f303e8bf6c62dfbe3145472c5feaf307";
pub const REBUILT_V5_SCHEMA_SHA256: &str =
    "ab3aca6322599dc348e48ddf82cffc99568bbbf598927ccba9377b24b396943c";

pub const REBUILT_V3_REQUIRED_DOCUMENTS: [&str; 4] = [
    "content.json",
    "world.json",
    "scenario.json",
    "assets/index.json",
];
pub const REBUILT_V3_SUPPORTED_CAPABILITIES: [&str; 8] = [
    "realmz.core.classic-rules-v1",
    "realmz.presentation.battle-atlas-v1",
    "realmz.presentation.content-addressed-media-v1",
    "realmz.presentation.tileset-atlases-v1",
    "realmz.scenario.classic-vm-v1",
    "realmz.scenario.deferred-references-v1",
    "realmz.scenario.safe-actions-v1",
    "realmz.world.topology-v2",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3FileInput<'a> {
    pub path: &'a str,
    pub bytes: &'a [u8],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3CompilerIdentity {
    pub version: String,
    pub commit: String,
    pub minimum_engine_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3FileIntegrity {
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ManifestCompiler {
    pub name: String,
    pub version: String,
    pub commit: String,
    pub project_schema_version: u32,
    pub project_origin: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ManifestEngine {
    pub minimum_version: String,
    pub rules_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3Manifest {
    pub kind: String,
    pub format: String,
    pub format_version: u8,
    pub schema_version: u8,
    pub schema_hash: String,
    pub campaign_id: StableId,
    pub content_id: String,
    pub name: String,
    pub compiler: RebuiltV3ManifestCompiler,
    pub engine: RebuiltV3ManifestEngine,
    pub start: RebuiltV3Start,
    pub capabilities: Vec<String>,
    pub files: BTreeMap<String, RebuiltV3FileIntegrity>,
    pub package_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3ManifestArtifact {
    pub manifest: RebuiltV3Manifest,
    pub canonical_json: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ManifestError {
    MissingBootstrap,
    InvalidCampaignId(StableId),
    InvalidCampaignName,
    InvalidCompilerMetadata,
    SchemaV4RequiresImportedOrigin,
    UnsupportedSchemaContract { version: u8, hash: String },
    UnsupportedCapability(String),
    DuplicateCapability(String),
    MissingDocument(&'static str),
    DuplicatePath(String),
    InvalidPath(String),
    MediaHashMismatch { path: String, actual: String },
    Serialization(String),
}

impl std::fmt::Display for RebuiltV3ManifestError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingBootstrap => write!(
                formatter,
                "manifest.json requires canonical campaign metadata and a start location"
            ),
            Self::InvalidCampaignId(id) => write!(
                formatter,
                "campaign ID '{}' is not a portable installation component",
                id.0
            ),
            Self::InvalidCampaignName => {
                write!(formatter, "manifest campaign name must be non-empty")
            }
            Self::InvalidCompilerMetadata => write!(
                formatter,
                "compiler version, commit, and minimum engine version must be non-empty"
            ),
            Self::SchemaV4RequiresImportedOrigin => {
                write!(
                    formatter,
                    "Extended Rebuilt package schemas are reserved for imported projects"
                )
            }
            Self::UnsupportedSchemaContract { version, hash } => write!(
                formatter,
                "unsupported Rebuilt package schema contract v{version} ({hash})"
            ),
            Self::UnsupportedCapability(capability) => {
                write!(formatter, "unsupported Rebuilt capability '{capability}'")
            }
            Self::DuplicateCapability(capability) => {
                write!(formatter, "duplicate Rebuilt capability '{capability}'")
            }
            Self::MissingDocument(path) => {
                write!(
                    formatter,
                    "manifest input is missing required document '{path}'"
                )
            }
            Self::DuplicatePath(path) => write!(formatter, "duplicate package path '{path}'"),
            Self::InvalidPath(path) => write!(formatter, "invalid package path '{path}'"),
            Self::MediaHashMismatch { path, actual } => write!(
                formatter,
                "content-addressed media path '{path}' does not match payload SHA-256 {actual}"
            ),
            Self::Serialization(reason) => {
                write!(formatter, "manifest.json serialization failed: {reason}")
            }
        }
    }
}

impl std::error::Error for RebuiltV3ManifestError {}
