use crate::model::{BlobId, SourcedSpellDefinition, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum RepairChange {
    Spell {
        record: Box<SourcedSpellDefinition>,
    },
    ItemText {
        record_index: u16,
        field: String,
        expected: String,
        recovered: String,
    },
    ItemTextSource {
        record_index: u16,
        expected: Option<BlobId>,
        recovered: Option<BlobId>,
    },
    ShopQuarantine {
        expected: Box<crate::model::ShopRecord>,
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairEntry {
    pub key: String,
    pub family: String,
    pub entity: StableId,
    pub field: String,
    pub conflict: bool,
    pub change: RepairChange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairAssessment {
    pub source_identity: String,
    pub previous_version: u32,
    pub version: u32,
    pub entries: Vec<RepairEntry>,
    pub source_requirements: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepairCommand {
    pub expected_source_identity: String,
    pub expected_previous_version: u32,
    pub changes: Vec<RepairEntry>,
}
