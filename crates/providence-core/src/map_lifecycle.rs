use crate::model::{LevelType, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MapCreationPlan {
    pub identity: StableId,
    pub name: String,
    pub level_type: LevelType,
    pub source: Option<StableId>,
    pub copied_cells: usize,
    pub cleared_markers: usize,
    pub reset_regions: usize,
    pub copied_action_points: usize,
    pub dark: bool,
    pub uses_los: bool,
}
