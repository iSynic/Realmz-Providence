use crate::{
    codecs::{
        CodecDescriptor, CompatibilityOverlayPolicy, NativeFileFamily, OwnedByteRange,
        ResourceForkError,
    },
    model::{SourcedSpellDefinition, StableId},
};

pub const SPELL_RECORD_BYTES: usize = 30;
pub const STANDARD_SPELL_CLASSES: usize = 4;
pub const SPELLS_PER_CLASS: usize = 105;
pub const STANDARD_SPELL_RECORDS: usize = STANDARD_SPELL_CLASSES * SPELLS_PER_CLASS;
pub const STANDARD_SPELL_BYTES: usize = SPELL_RECORD_BYTES * STANDARD_SPELL_RECORDS;
pub const SCENARIO_SPELL_RECORDS: usize = 105;
pub const SCENARIO_SPELL_BYTES: usize = SPELL_RECORD_BYTES * SCENARIO_SPELL_RECORDS;
pub const SPELL_NAME_RESOURCE_MIN_ID: i16 = 5000;
pub const SPELL_NAME_RESOURCE_MAX_ID: i16 = 5006;
pub const SPELL_NAMES_PER_RESOURCE: usize = 15;

const OWNED_BYTES: [OwnedByteRange; 1] = [OwnedByteRange { start: 0, end: 30 }];

pub const SCENARIO_SPELL_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioSpellDefinitions,
    native_path: "Data Spell",
    record_bytes: SPELL_RECORD_BYTES,
    owned_byte_ranges: &OWNED_BYTES,
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const STANDARD_SPELL_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::StandardSpellDefinitions,
    native_path: "Data S",
    record_bytes: SPELL_RECORD_BYTES,
    owned_byte_ranges: &OWNED_BYTES,
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedSpellFile {
    pub spells: Vec<SourcedSpellDefinition>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpellCodecError {
    DuplicateRecordIndex(u16),
    RecordIndexOutOfRange(u16),
    InvalidClassicId {
        record_index: u16,
        expected: i16,
        actual: i16,
    },
    InvalidStableId {
        classic_id: i16,
        actual: StableId,
    },
    ResourceFork(ResourceForkError),
    UnsupportedNameCharacter(i16),
    NameTooLong(i16),
    MissingStandardNameResource(i16),
    DuplicateStandardNameResource(i16),
    DuplicateScenarioNameResource(i16),
    TooManyStandardNames {
        resource_id: i16,
        actual: usize,
    },
    TruncatedStandardNameResource(i16),
    TruncatedScenarioNameResource(i16),
}

impl std::fmt::Display for SpellCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateRecordIndex(index) => {
                write!(formatter, "Data Spell record index {index} is duplicated")
            }
            Self::RecordIndexOutOfRange(index) => write!(
                formatter,
                "Data Spell record index {index} is outside 0..=104"
            ),
            Self::InvalidClassicId {
                record_index,
                expected,
                actual,
            } => write!(
                formatter,
                "Data Spell record {record_index} must use packed Classic spell ID {expected}, not {actual}"
            ),
            Self::InvalidStableId { classic_id, actual } => write!(
                formatter,
                "Classic spell {classic_id} must use stable ID 'classic.spell.{classic_id}', not '{}'",
                actual.0
            ),
            Self::ResourceFork(error) => error.fmt(formatter),
            Self::UnsupportedNameCharacter(classic_id) => write!(
                formatter,
                "Classic spell {classic_id} name contains a character outside MacRoman"
            ),
            Self::NameTooLong(classic_id) => write!(
                formatter,
                "Classic spell {classic_id} name exceeds the 255-byte STR# limit"
            ),
            Self::MissingStandardNameResource(resource_id) => write!(
                formatter,
                "Custom Names is missing standard spell STR# {resource_id}"
            ),
            Self::DuplicateStandardNameResource(resource_id) => write!(
                formatter,
                "Custom Names contains duplicate standard spell STR# {resource_id}"
            ),
            Self::DuplicateScenarioNameResource(resource_id) => write!(
                formatter,
                "Data Spell name resource contains duplicate scenario spell STR# {resource_id}"
            ),
            Self::TooManyStandardNames {
                resource_id,
                actual,
            } => write!(
                formatter,
                "Custom Names STR# {resource_id} contains {actual} names; Classic permits at most 15"
            ),
            Self::TruncatedStandardNameResource(resource_id) => write!(
                formatter,
                "Custom Names STR# {resource_id} ends before its declared string count"
            ),
            Self::TruncatedScenarioNameResource(resource_id) => write!(
                formatter,
                "Spell names STR# {resource_id} is incomplete; repair its source before editing that name family"
            ),
        }
    }
}

impl std::error::Error for SpellCodecError {}

impl From<ResourceForkError> for SpellCodecError {
    fn from(error: ResourceForkError) -> Self {
        Self::ResourceFork(error)
    }
}
