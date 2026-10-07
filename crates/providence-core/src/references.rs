use serde::{Deserialize, Serialize};

use crate::model::{AssetDescriptor, StableId};

pub fn reference_targets_asset(reference: &ReferenceDescriptor, asset: &AssetDescriptor) -> bool {
    reference.target_id == asset.identity.0
        || asset.classic_resource.as_ref().is_some_and(|key| {
            reference.target_id == key.resource_id.to_string()
                && matches!(
                    (&reference.target_kind, key.resource_type.as_str()),
                    (TargetKind::Icon | TargetKind::SpecialLandTile, "cicn")
                        | (TargetKind::Picture, "PICT")
                        | (TargetKind::Sound, "snd ")
                )
        })
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldPath(pub String);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TargetKind {
    Message,
    OptionLabel,
    QuestFlag,
    SimpleEncounter,
    ComplexEncounter,
    RogueEncounter,
    ActionPoint,
    ExtraActionPoint,
    Map,
    PlayerMap,
    Race,
    Caste,
    Item,
    Monster,
    Battle,
    Spell,
    Icon,
    Picture,
    TextResource,
    Sound,
    ScenarioProgram,
    SpecialLandTile,
    Treasure,
    Shop,
    Landlook,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResolutionState {
    Resolved,
    Missing,
    Ambiguous,
    StockFallback,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RepairAction {
    Retarget,
    CreateTarget,
    ClearOptional,
    ChooseCandidate,
    ImportTarget,
    EditSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByteProvenance {
    pub native_path: String,
    pub record_index: u32,
    pub byte_start: u32,
    pub byte_end: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceDescriptor {
    pub source: StableId,
    pub field: FieldPath,
    pub target_kind: TargetKind,
    pub target_id: String,
    pub required: bool,
    pub stock_fallback: Option<String>,
    pub resolution: ResolutionState,
    pub repair_actions: Vec<RepairAction>,
    pub byte_provenance: Option<ByteProvenance>,
}
