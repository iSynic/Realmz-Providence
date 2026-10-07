use crate::model::StableId;
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod action_semantic_contract_tests;
mod application_media;
mod assets;
mod battles;
mod bootstrap;
mod canonical;
mod classic_rule_resolution;
mod combat_selection;
mod content;
mod documents;
mod encounters;
mod item_spell_selection;
mod items;
mod map_inputs;
mod media_selection;
mod message_selection;
mod monsters;
mod option_labels;
mod owner_selection;
mod package;
mod reachability;
mod rules;
pub(crate) mod runtime_ids;
mod runtime_selection;
mod scenario;
mod shops;
mod spells;
mod terrain;
mod topology;
mod treasures;
mod world;
pub use application_media::*;
pub use assets::*;
pub use battles::*;
pub use classic_rule_resolution::*;
pub use combat_selection::*;
pub use content::*;
pub use documents::*;
pub use encounters::*;
pub use item_spell_selection::*;
pub use items::*;
pub use media_selection::*;
pub use message_selection::*;
pub use monsters::*;
pub use option_labels::*;
pub use owner_selection::*;
pub use package::*;
pub use reachability::*;
pub use rules::*;
pub use runtime_ids::rebuilt_v3_action_point_owner;
pub use runtime_selection::*;
pub use scenario::*;
pub use shops::*;
pub use spells::*;
pub use topology::*;
pub use treasures::*;
pub use world::*;

pub use bootstrap::{
    RebuiltV3Bootstrap, RebuiltV3Campaign, RebuiltV3CampaignContact, RebuiltV3Start,
    project_rebuilt_v3_bootstrap, project_rebuilt_v3_campaign,
};
pub use map_inputs::{
    RebuiltV3MapCompilerInput, RebuiltV3MapInputs, RebuiltV3MapMetadata, RebuiltV3RandomRectangle,
    project_rebuilt_v3_map_inputs, project_rebuilt_v3_random_rectangle,
};
pub use terrain::{
    RebuiltV3BattleTerrainError, RebuiltV3BattleTerrainSet, RebuiltV3TerrainSetInput,
    RebuiltV3TerrainTile, project_rebuilt_v3_battle_terrain_sets,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3DeferredDisposition {
    Deferred,
    Quarantined,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3DeferredReference {
    pub source: StableId,
    pub field: String,
    pub target_kind: String,
    pub target_id: String,
    pub reason: String,
    pub disposition: RebuiltV3DeferredDisposition,
}
