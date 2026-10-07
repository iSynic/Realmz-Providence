pub mod authoring_metadata;
mod authoring_migration;
mod migration;

use crate::model::{ProjectSnapshot, SNAPSHOT_FORMAT_VERSION};

#[derive(Debug)]
pub enum SnapshotError {
    Json(serde_json::Error),
    UnsupportedVersion(u32),
    InvalidClassicRuleSelection(String),
    InvalidTerrainMapping(String),
}

impl std::fmt::Display for SnapshotError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "invalid project snapshot: {error}"),
            Self::UnsupportedVersion(version) => {
                write!(formatter, "unsupported project snapshot version {version}")
            }
            Self::InvalidTerrainMapping(reason) => {
                write!(formatter, "invalid terrain mapping: {reason}")
            }
            Self::InvalidClassicRuleSelection(reason) => {
                write!(formatter, "invalid Classic rule selection: {reason}")
            }
        }
    }
}

impl std::error::Error for SnapshotError {}

pub fn to_deterministic_json(snapshot: &ProjectSnapshot) -> Result<String, SnapshotError> {
    if snapshot.format_version != SNAPSHOT_FORMAT_VERSION {
        return Err(SnapshotError::UnsupportedVersion(snapshot.format_version));
    }
    let mut normalized = snapshot.clone();
    authoring_metadata::validate(snapshot)?;
    normalized.normalize();
    serde_json::to_string_pretty(&normalized).map_err(SnapshotError::Json)
}

pub fn from_json(json: &str) -> Result<ProjectSnapshot, SnapshotError> {
    let value: serde_json::Value = serde_json::from_str(json).map_err(SnapshotError::Json)?;
    let player_map_names = authoring_migration::migrate_version_twenty_seven_names(&value);
    let mut snapshot: ProjectSnapshot =
        serde_json::from_value(value).map_err(SnapshotError::Json)?;
    let source_version = snapshot.format_version;
    migration::apply(&mut snapshot, source_version, player_map_names)?;
    Ok(snapshot)
}

#[cfg(test)]
#[path = "snapshot/editor_metadata_tests.rs"]
mod editor_metadata_tests;
#[cfg(test)]
mod tests;
