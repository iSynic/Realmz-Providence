use super::{RebuiltV3AssetError, RebuiltV3AssetIndex};
use crate::{
    model::{ClassicResourceKey, StableId},
    references::ResolutionState,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3MediaRequirement {
    PackageRequired,
    ApplicationRequired,
    StockFallbackAllowed,
    OptionalCompanion,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3MediaOwner {
    ScenarioPackage,
    ClassicApplication,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RebuiltV3MediaRelation {
    AppearanceCatalog,
    BattleAtlas,
    CampaignSplash,
    ItemIcon,
    ItemSound,
    MapTileset,
    MonsterFacing,
    MonsterIcon,
    PlayerMap,
    ProgramSound,
    RogueSound,
    ScenarioMusic,
    SpecialLandOverlay,
    SpellEffect,
    SpellIcon,
    SpellSound,
    TerrainSound,
    TextResource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3RuntimeMediaReference {
    pub source: StableId,
    pub field_path: String,
    pub relation: RebuiltV3MediaRelation,
    pub requirement: RebuiltV3MediaRequirement,
    pub asset_id: Option<StableId>,
    pub classic_resource: Option<ClassicResourceKey>,
    pub expected_asset_kind: Option<String>,
    pub resolution: ResolutionState,
    pub resolved_asset_id: Option<StableId>,
    pub resolved_owner: Option<RebuiltV3MediaOwner>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3ReachableMediaSelection {
    pub references: Vec<RebuiltV3RuntimeMediaReference>,
    pub assets: RebuiltV3AssetIndex,
}

pub fn is_missing_monster_presentation_reference(
    reference: &RebuiltV3RuntimeMediaReference,
) -> bool {
    matches!(
        reference.relation,
        RebuiltV3MediaRelation::MonsterIcon | RebuiltV3MediaRelation::MonsterFacing
    ) && reference.resolution == ResolutionState::Missing
}

pub fn is_missing_imported_presentation_reference(
    reference: &RebuiltV3RuntimeMediaReference,
) -> bool {
    is_missing_monster_presentation_reference(reference)
        || (matches!(
            reference.relation,
            RebuiltV3MediaRelation::SpecialLandOverlay
                | RebuiltV3MediaRelation::PlayerMap
                | RebuiltV3MediaRelation::TextResource
                | RebuiltV3MediaRelation::MapTileset
        ) && reference.resolution == ResolutionState::Missing)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ReachableMediaError {
    UnresolvedRequired(Vec<RebuiltV3RuntimeMediaReference>),
    Ambiguous(Vec<RebuiltV3RuntimeMediaReference>),
    Asset(RebuiltV3AssetError),
}

impl std::fmt::Display for RebuiltV3ReachableMediaError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnresolvedRequired(references) => write!(
                formatter,
                "reachable media selection refused {} missing required reference(s): {}",
                references.len(),
                references
                    .iter()
                    .map(|reference| format!(
                        "{} {} {:?}",
                        reference.source.0, reference.field_path, reference.classic_resource
                    ))
                    .collect::<Vec<_>>()
                    .join("; ")
            ),
            Self::Ambiguous(references) => write!(
                formatter,
                "reachable media selection refused {} ambiguous reference(s)",
                references.len()
            ),
            Self::Asset(error) => write!(formatter, "reachable media projection failed: {error}"),
        }
    }
}

impl std::error::Error for RebuiltV3ReachableMediaError {}
