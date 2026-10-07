mod assembly;
mod errors;
mod layout;
mod maps;
mod player_maps;
mod player_selection;
mod programs;
#[cfg(test)]
mod tests;

use super::{
    ApplicationMediaCatalog, RebuiltV3BattleTerrainSet, RebuiltV3BoatReplacementProfiles,
    RebuiltV3CompactCell, RebuiltV3MapMetadata, RebuiltV3RandomRectangle,
    RebuiltV3ReachableRuntimeSelection, RebuiltV3ScenarioError, RebuiltV3TimedEncounter,
    RebuiltV3TimedEncounterError, RebuiltV3TopologyError, canonical::canonical_json_bytes,
    special_land_asset_lookup, special_land_asset_lookup_with_application,
};
use crate::model::{LevelType, ProjectSnapshot, StableId};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3WorldMap {
    pub id: StableId,
    pub name: String,
    pub level_type: LevelType,
    pub level_index: u32,
    pub width: u16,
    pub height: u16,
    pub metadata: RebuiltV3MapMetadata,
    pub topology_format: String,
    pub cells: Vec<RebuiltV3CompactCell>,
    pub boat_replacement_profiles: Option<RebuiltV3BoatReplacementProfiles>,
    pub random_rectangles: Vec<RebuiltV3RandomRectangle>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3TransitionEndpoint {
    pub map_id: StableId,
    pub edge: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3WorldTransition {
    pub id: StableId,
    pub source: RebuiltV3TransitionEndpoint,
    pub target: RebuiltV3TransitionEndpoint,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3LandLayout {
    pub rows: u8,
    pub cols: u8,
    pub cells: Vec<i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3PlayerMapCoordinate {
    pub x: i16,
    pub y: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3PlayerMapRect {
    pub top: i16,
    pub left: i16,
    pub bottom: i16,
    pub right: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3PlayerMapMarker {
    pub classic_icon_id: i16,
    pub icon_asset_id: StableId,
    pub x: i16,
    pub y: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3PlayerMap {
    pub id: StableId,
    pub classic_id: u8,
    pub name: String,
    pub unavailable_name: String,
    pub mode: String,
    pub map_id: Option<StableId>,
    pub start: RebuiltV3PlayerMapCoordinate,
    pub icon_size: i16,
    pub picture_asset_id: Option<StableId>,
    pub scrolling_text_asset_id: Option<StableId>,
    pub party_marker_asset_id: Option<StableId>,
    pub picture_rect: RebuiltV3PlayerMapRect,
    pub markers: Vec<RebuiltV3PlayerMapMarker>,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3WorldDocument {
    pub kind: String,
    pub schema_version: u8,
    pub battle_terrain_sets: Vec<RebuiltV3BattleTerrainSet>,
    pub maps: Vec<RebuiltV3WorldMap>,
    pub player_maps: Vec<RebuiltV3PlayerMap>,
    pub triggers: Vec<super::RebuiltV3Trigger>,
    pub transitions: Vec<RebuiltV3WorldTransition>,
    pub land_layout: Option<RebuiltV3LandLayout>,
    pub timed_encounters: Vec<RebuiltV3TimedEncounter>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3WorldArtifact {
    pub document: RebuiltV3WorldDocument,
    pub canonical_json: Vec<u8>,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3WorldError {
    EmptyMaps,
    DuplicateMapId(StableId),
    DuplicateLandMapIndex(u32),
    InvalidLandLayoutCellCount(usize),
    InvalidLandLayoutValue {
        row: usize,
        column: usize,
        value: i16,
    },
    MissingLandLayoutMap {
        row: usize,
        column: usize,
        native_index: u32,
    },
    DuplicateLandLayoutPlacement {
        map: StableId,
    },
    MapInputsUnavailable,
    MissingMapInput(StableId),
    MissingTopology(StableId),
    Topology(RebuiltV3TopologyError),
    Scenario(RebuiltV3ScenarioError),
    TimedEncounter(RebuiltV3TimedEncounterError),
    PlayerMapIdOutOfRange {
        program: StableId,
        native_id: i16,
    },
    MissingPlayerMap {
        program: StableId,
        native_id: u32,
    },
    DuplicatePlayerMapId(u32),
    InvalidPlayerMap {
        player_map: StableId,
        reason: String,
    },
    Serialization(String),
}

pub fn project_rebuilt_v3_world(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3WorldDocument, RebuiltV3WorldError> {
    assembly::project(snapshot, &special_land_asset_lookup(snapshot), None, None)
}

pub fn project_rebuilt_v3_world_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
) -> Result<RebuiltV3WorldDocument, RebuiltV3WorldError> {
    assembly::project(
        snapshot,
        &special_land_asset_lookup_with_application(snapshot, application_media),
        Some(application_media),
        None,
    )
}

pub fn project_rebuilt_v3_reachable_world_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    runtime: &RebuiltV3ReachableRuntimeSelection,
) -> Result<RebuiltV3WorldDocument, RebuiltV3WorldError> {
    assembly::project(
        snapshot,
        &special_land_asset_lookup_with_application(snapshot, application_media),
        Some(application_media),
        Some(runtime),
    )
}

pub fn compile_rebuilt_v3_world(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
    let document = project_rebuilt_v3_world(snapshot)?;
    compile_rebuilt_v3_world_document(document)
}

pub fn compile_rebuilt_v3_reachable_world(
    snapshot: &ProjectSnapshot,
    runtime: &RebuiltV3ReachableRuntimeSelection,
) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
    let document = assembly::project(
        snapshot,
        &special_land_asset_lookup(snapshot),
        None,
        Some(runtime),
    )?;
    compile_rebuilt_v3_world_document(document)
}

pub fn compile_rebuilt_v3_world_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
    let document = project_rebuilt_v3_world_with_application(snapshot, application_media)?;
    compile_rebuilt_v3_world_document(document)
}

pub fn compile_rebuilt_v3_reachable_world_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    runtime: &RebuiltV3ReachableRuntimeSelection,
) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
    let document =
        project_rebuilt_v3_reachable_world_with_application(snapshot, application_media, runtime)?;
    compile_rebuilt_v3_world_document(document)
}

fn compile_rebuilt_v3_world_document(
    document: RebuiltV3WorldDocument,
) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
    let canonical_json = canonical_json_bytes(&document)
        .map_err(|error| RebuiltV3WorldError::Serialization(error.to_string()))?;
    let mut hasher = Sha256::new();
    hasher.update(&canonical_json);
    let sha256 = format!("{:x}", hasher.finalize());
    Ok(RebuiltV3WorldArtifact {
        document,
        canonical_json,
        sha256,
    })
}
