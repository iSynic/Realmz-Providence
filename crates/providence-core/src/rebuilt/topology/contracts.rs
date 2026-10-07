use crate::model::StableId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuiltV3CompactEdge(
    pub String,
    pub u8,
    pub Option<StableId>,
    pub Option<StableId>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuiltV3CompactFeature(
    pub StableId,
    pub String,
    pub Option<String>,
    pub Option<String>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuiltV3CompactCell(
    pub StableId,
    pub i16,
    pub u16,
    pub Option<i16>,
    pub Vec<StableId>,
    pub Vec<StableId>,
    pub [RebuiltV3CompactEdge; 4],
    pub Vec<RebuiltV3CompactFeature>,
    pub i16,
    pub StableId,
    pub Option<StableId>,
    pub i16,
    pub i16,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RebuiltV3CompactLandTileProfile(
    pub StableId,
    pub i16,
    pub u16,
    pub Option<i16>,
    pub i16,
    pub i16,
    pub i16,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3BoatReplacementProfiles {
    pub removed: RebuiltV3CompactLandTileProfile,
    pub placed: RebuiltV3CompactLandTileProfile,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3Topology {
    pub id: StableId,
    pub topology_format: String,
    pub cells: Vec<RebuiltV3CompactCell>,
    pub boat_replacement_profiles: Option<RebuiltV3BoatReplacementProfiles>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3TopologyError {
    MissingRuntimeMetadata(StableId),
    InvalidCellCount { map: StableId, actual: usize },
    MissingTerrainProfile { map: StableId, tile: i16 },
    AmbiguousTerrainProfile { landlook: Option<i8>, tile: i16 },
    InvalidBoatRequirement { tile: i16, requirement: i16 },
    MissingSpecialLandAssets(Vec<i16>),
    MissingSpecialLandSolidity,
    InvalidSpecialLandSolidityCount(usize),
}

impl std::fmt::Display for RebuiltV3TopologyError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingRuntimeMetadata(map) => {
                write!(formatter, "map '{}' lacks runtime metadata", map.0)
            }
            Self::InvalidCellCount { map, actual } => write!(
                formatter,
                "map '{}' has {actual} cells; compact Classic topology requires 8100",
                map.0
            ),
            Self::MissingTerrainProfile { map, tile } => write!(
                formatter,
                "map '{}' lacks a terrain profile for normalized tile {tile}",
                map.0
            ),
            Self::AmbiguousTerrainProfile { landlook, tile } => write!(
                formatter,
                "terrain tile {tile} has multiple profiles for landlook {landlook:?}"
            ),
            Self::InvalidBoatRequirement { tile, requirement } => write!(
                formatter,
                "terrain tile {tile} has unsupported boat requirement {requirement}"
            ),
            Self::MissingSpecialLandAssets(resource_ids) => write!(
                formatter,
                "special land resources {} have no certified asset identities",
                resource_ids
                    .iter()
                    .map(i16::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Self::MissingSpecialLandSolidity => write!(
                formatter,
                "negative Special Land cells require the scenario Data Solids catalog"
            ),
            Self::InvalidSpecialLandSolidityCount(actual) => write!(
                formatter,
                "Data Solids has {actual} entries; Classic requires exactly 1024"
            ),
        }
    }
}

impl std::error::Error for RebuiltV3TopologyError {}
