use super::session::MonsterLibraryDraft;
use crate::{
    codecs::{MONSTER_DESCRIPTION_RECORD_BYTES, MONSTER_RECORD_BYTES},
    model::{BlobId, MonsterRecord, NativeRecordId, StableId},
    session::Revision,
};
use serde::{Deserialize, Serialize};
pub const MONSTER_LIBRARY_FORMAT_VERSION: u32 = 1;
pub const MONSTER_SCRAPBOOK_RECORD_BYTES: usize =
    MONSTER_RECORD_BYTES + MONSTER_DESCRIPTION_RECORD_BYTES;
pub const MONSTER_LIBRARY_CHANGE_LIMIT: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MonsterLibraryCopyMode {
    Normal,
    ExactAllSets,
    GenerateVariants,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibraryScenarioCopy {
    pub target_id: NativeRecordId,
    pub template: Box<MonsterRecord>,
    pub description: String,
    pub mode: MonsterLibraryCopyMode,
    pub replace: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibrarySource {
    pub identity: StableId,
    pub native_name: String,
    pub blob: BlobId,
    pub byte_length: u64,
    pub sha256: String,
    pub record_bytes: usize,
    pub record_count: usize,
    pub trailing_bytes: usize,
    pub evidence_revision: String,
    pub evidence_path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MonsterLibraryOwnership {
    BuiltIn,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum MonsterLibraryOrigin {
    BuiltInScrapbook {
        source: StableId,
        record_index: u32,
    },
    BuiltInOverride {
        source_entry: StableId,
    },
    ScenarioMonster {
        project: StableId,
        source_monster: StableId,
    },
    LibraryVariant {
        source_entry: StableId,
    },
    Blank,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibraryEntry {
    pub identity: StableId,
    pub ownership: MonsterLibraryOwnership,
    pub label: String,
    pub preferred_scenario_monster_id: NativeRecordId,
    pub template: MonsterRecord,
    pub description: String,
    pub origin: MonsterLibraryOrigin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibraryCatalog {
    pub format_version: u32,
    pub library_id: StableId,
    pub revision: Revision,
    pub next_custom_id: u64,
    pub sources: Vec<MonsterLibrarySource>,
    pub built_ins: Vec<MonsterLibraryEntry>,
    pub custom_entries: Vec<MonsterLibraryEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum MonsterLibraryCommand {
    ApplyDraft {
        draft: MonsterLibraryDraft,
    },
    ImportBuiltIns {
        source: MonsterLibrarySource,
        entries: Vec<MonsterLibraryEntry>,
    },
    CreateCustom {
        label: String,
        preferred_scenario_monster_id: NativeRecordId,
        template: Box<MonsterRecord>,
        description: String,
        origin: MonsterLibraryOrigin,
    },
    UpdateCustom {
        identity: StableId,
        label: String,
        preferred_scenario_monster_id: NativeRecordId,
        template: Box<MonsterRecord>,
        description: String,
    },
    Duplicate {
        source: StableId,
        label: String,
    },
    DeleteCustom {
        identity: StableId,
    },
    CustomizeBuiltIn {
        source: StableId,
        label: Option<String>,
    },
    RestoreBuiltIn {
        source: StableId,
    },
    Undo,
    Redo,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibraryChangeProjection {
    pub previous_revision: Revision,
    pub revision: Revision,
    pub changed_entries: Vec<StableId>,
    pub changed_entries_total: usize,
    pub truncated: bool,
    pub can_undo: bool,
    pub can_redo: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedMonsterLibrarySession {
    pub catalog: MonsterLibraryCatalog,
    pub undo: Vec<MonsterLibraryHistoryEntry>,
    pub redo: Vec<MonsterLibraryHistoryEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibraryHistoryEntry {
    pub catalog: MonsterLibraryCatalog,
    pub changed_entries: Vec<StableId>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MonsterLibraryError {
    RevisionConflict {
        expected: Revision,
        actual: Revision,
    },
    EntryNotFound(StableId),
    ProtectedBuiltIn(String),
    OverrideExists(StableId),
    OverrideNotFound(StableId),
    InvalidEntry {
        identity: StableId,
        reason: String,
    },
    InvalidCatalog(String),
    NothingToUndo,
    NothingToRedo,
}

impl std::fmt::Display for MonsterLibraryError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RevisionConflict { expected, actual } => write!(
                formatter,
                "monster library revision conflict: expected {}, actual {}",
                expected.0, actual.0
            ),
            Self::EntryNotFound(identity) => {
                write!(
                    formatter,
                    "monster library entry '{}' was not found",
                    identity.0
                )
            }
            Self::ProtectedBuiltIn(reason) => {
                write!(
                    formatter,
                    "protected built-in monster cannot be changed: {reason}"
                )
            }
            Self::OverrideExists(identity) => write!(
                formatter,
                "built-in monster '{}' already has a custom override",
                identity.0
            ),
            Self::OverrideNotFound(identity) => write!(
                formatter,
                "built-in monster '{}' has no custom override to restore",
                identity.0
            ),
            Self::InvalidEntry { identity, reason } => write!(
                formatter,
                "monster library entry '{}' is invalid: {reason}",
                identity.0
            ),
            Self::InvalidCatalog(reason) => write!(formatter, "invalid monster library: {reason}"),
            Self::NothingToUndo => write!(formatter, "nothing to undo in the monster library"),
            Self::NothingToRedo => write!(formatter, "nothing to redo in the monster library"),
        }
    }
}

impl std::error::Error for MonsterLibraryError {}
