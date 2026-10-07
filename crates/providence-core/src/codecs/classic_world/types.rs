use crate::model::{CLASSIC_MAP_SIZE, NativeRecordId, StableId};

pub const MAP_LEVEL_BYTES: usize = CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE * 2;
pub const ACTION_POINT_RECORD_BYTES: usize = 40;
pub const ACTION_POINTS_PER_LEVEL: usize = 100;
pub const ACTION_POINT_LEVEL_BYTES: usize = ACTION_POINT_RECORD_BYTES * ACTION_POINTS_PER_LEVEL;
pub const EXTRA_ACTION_POINT_RECORD_BYTES: usize = ACTION_POINT_RECORD_BYTES;
pub const SIMPLE_ENCOUNTER_RECORD_BYTES: usize = 426;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedRecordFile<T> {
    pub records: Vec<T>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClassicWorldCodecError {
    DuplicateMapIndex(u32),
    SparseMapIndex {
        expected: u32,
        actual: u32,
    },
    InvalidMapCellCount {
        identity: StableId,
        actual: usize,
    },
    DuplicateActionPoint {
        level_index: u32,
        record_index: u8,
    },
    ActionPointRecordOutOfRange {
        identity: StableId,
        record_index: u8,
    },
    ActionSlotOutOfRange {
        identity: StableId,
        slot: u8,
        maximum: u8,
    },
    ActionOpcodeOutOfByteRange {
        identity: StableId,
        raw_opcode: i16,
    },
    DuplicateActionSlot {
        identity: StableId,
        slot: u8,
    },
    DuplicateEncounterId(NativeRecordId),
    DuplicateExtraActionPointId(NativeRecordId),
    ExtraActionPointOverlapsCertifiedTail {
        native_id: NativeRecordId,
        authored_records: usize,
    },
    EncounterTextTooLong {
        native_id: NativeRecordId,
        slot: usize,
        bytes: usize,
    },
    MissingEncounterCompatibilitySource(NativeRecordId),
}
