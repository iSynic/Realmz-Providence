use crate::model::{LevelType, MapCoordinate, StableId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3ScenarioError {
    MissingApplicationContract,
    InvalidApplicationHook {
        hook: String,
        program: StableId,
    },
    MissingApplicationHookProgram {
        hook: String,
        program: StableId,
    },
    InvalidIdentifier(StableId),
    MissingSourceMap(StableId),
    MissingCoordinate(StableId),
    CoordinateOutsideMap(StableId, MapCoordinate),
    MissingDestinationMap(StableId, u8),
    DestinationOutsideMap(StableId, MapCoordinate),
    DuplicateTriggerId(StableId),
    DuplicatePlacedRecord {
        map: StableId,
        record_index: u8,
    },
    ActionSlotOutOfRange {
        trigger: StableId,
        slot: u8,
    },
    DuplicateActionSlot {
        trigger: StableId,
        slot: u8,
    },
    DuplicateExtraCodeRow(u32),
    UnsupportedClassicOpcode {
        trigger: StableId,
        raw_opcode: i16,
    },
    MissingExtraCodeRow {
        trigger: StableId,
        native_id: i16,
    },
    MissingBattleRangeExtraCodeRow {
        owner: StableId,
        opcode: i16,
        native_id: i16,
    },
    MissingReferencedBattle {
        owner: StableId,
        opcode: i16,
        battle_id: u32,
    },
    MissingConsecutiveExtraCodeRow {
        trigger: StableId,
        native_id: i16,
    },
    DuplicateMessageId(u32),
    InvalidMessageIdentity {
        message: StableId,
        native_id: u32,
    },
    DuplicateSimpleEncounterId(u32),
    InvalidSimpleEncounterIdentity {
        encounter: StableId,
        native_id: u32,
    },
    SimpleEncounterActionSlotOutOfRange {
        encounter: StableId,
        slot: u8,
    },
    InvalidSimpleEncounterResult {
        encounter: StableId,
        choice: usize,
        result: i8,
    },
    MissingSimpleEncounterResponse(StableId),
    MissingSimpleEncounterMessage {
        encounter: StableId,
        message_id: i16,
    },
    MissingSimpleEncounterTarget {
        program: StableId,
        encounter_id: i16,
    },
    MissingProgramMessage {
        program: StableId,
        message_id: i16,
    },
    MissingComplexEncounterTarget {
        program: StableId,
        encounter_id: i16,
    },
    MissingExtraActionPointTarget {
        program: StableId,
        native_id: i16,
    },
    MissingTextResourceTarget {
        program: StableId,
        resource_id: i16,
    },
    MissingProgramExtraCode {
        program: StableId,
        opcode: i16,
        native_id: i16,
    },
    MissingClassicItemTarget {
        program: StableId,
        item_id: i16,
    },
    InvalidBranchDestinationMode {
        program: StableId,
        opcode: i16,
        mode: i16,
    },
    MissingBranchExtraActionPointTarget {
        program: StableId,
        opcode: i16,
        native_id: i16,
    },
    MissingBranchSimpleEncounterTarget {
        program: StableId,
        opcode: i16,
        encounter_id: i16,
    },
    MissingBranchComplexEncounterTarget {
        program: StableId,
        opcode: i16,
        encounter_id: i16,
    },
    InvalidBranchDestinationRange {
        program: StableId,
        mode: i16,
        low_id: i16,
        high_id: i16,
    },
    MissingBranchMessage {
        program: StableId,
        message_id: i16,
    },
    MissingRandomRectangleExtraActionPoint {
        rectangle: StableId,
        native_id: i16,
    },
    MissingRandomRectangleBattle {
        rectangle: StableId,
        battle_id: i32,
    },
    InvalidEncounterResultOpcode {
        program: StableId,
        slot: u8,
        result: i16,
    },
    MissingOpcodeMap {
        program: StableId,
        opcode: i16,
        level_type: LevelType,
        native_index: i32,
    },
    MissingOpcodeRandomRectangle {
        program: StableId,
        map: StableId,
        native_index: usize,
    },
    InvalidLandlookOpcode {
        program: StableId,
        darkness: i16,
    },
    InvalidBattleTerrain(String),
    MissingLandlookBattleTerrain {
        program: StableId,
        landlook: i16,
    },
    InvalidTimedEncounter(String),
    InvalidTimedEncounterProgram {
        encounter_id: u32,
        program: StableId,
    },
    DuplicateProgramId(StableId),
    DuplicateComplexEncounterId(u32),
    InvalidComplexEncounter {
        encounter: StableId,
        reason: String,
    },
    MissingComplexEncounterMessage {
        encounter: StableId,
        message_id: i16,
    },
    MissingRogueEncounter {
        encounter: StableId,
        rogue_id: i8,
    },
}

impl std::fmt::Display for RebuiltV3ScenarioError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingApplicationContract
            | Self::InvalidApplicationHook { .. }
            | Self::MissingApplicationHookProgram { .. } => self.write_application(formatter),
            Self::InvalidIdentifier(..)
            | Self::MissingSourceMap(..)
            | Self::MissingCoordinate(..)
            | Self::CoordinateOutsideMap(..)
            | Self::MissingDestinationMap(..)
            | Self::DestinationOutsideMap(..)
            | Self::DuplicateTriggerId(..)
            | Self::DuplicatePlacedRecord { .. } => self.write_placement(formatter),
            Self::ActionSlotOutOfRange { .. }
            | Self::DuplicateActionSlot { .. }
            | Self::DuplicateExtraCodeRow(..)
            | Self::UnsupportedClassicOpcode { .. }
            | Self::MissingExtraCodeRow { .. }
            | Self::MissingConsecutiveExtraCodeRow { .. } => self.write_instruction(formatter),
            Self::MissingBattleRangeExtraCodeRow { .. } | Self::MissingReferencedBattle { .. } => {
                self.write_battle(formatter)
            }
            Self::DuplicateMessageId(..)
            | Self::InvalidMessageIdentity { .. }
            | Self::MissingProgramMessage { .. } => self.write_message(formatter),
            Self::DuplicateSimpleEncounterId(..)
            | Self::InvalidSimpleEncounterIdentity { .. }
            | Self::SimpleEncounterActionSlotOutOfRange { .. }
            | Self::InvalidSimpleEncounterResult { .. }
            | Self::MissingSimpleEncounterResponse(..)
            | Self::MissingSimpleEncounterMessage { .. } => self.write_simple(formatter),
            Self::MissingSimpleEncounterTarget { .. }
            | Self::MissingComplexEncounterTarget { .. }
            | Self::MissingExtraActionPointTarget { .. }
            | Self::MissingTextResourceTarget { .. }
            | Self::MissingProgramExtraCode { .. }
            | Self::MissingClassicItemTarget { .. }
            | Self::InvalidBranchDestinationMode { .. }
            | Self::MissingBranchExtraActionPointTarget { .. }
            | Self::MissingBranchSimpleEncounterTarget { .. }
            | Self::MissingBranchComplexEncounterTarget { .. }
            | Self::InvalidBranchDestinationRange { .. }
            | Self::MissingBranchMessage { .. }
            | Self::MissingRandomRectangleExtraActionPoint { .. }
            | Self::MissingRandomRectangleBattle { .. }
            | Self::InvalidEncounterResultOpcode { .. }
            | Self::MissingOpcodeMap { .. }
            | Self::MissingOpcodeRandomRectangle { .. }
            | Self::InvalidLandlookOpcode { .. }
            | Self::InvalidBattleTerrain(..)
            | Self::MissingLandlookBattleTerrain { .. }
            | Self::InvalidTimedEncounter(..)
            | Self::InvalidTimedEncounterProgram { .. }
            | Self::DuplicateProgramId(..)
            | Self::DuplicateComplexEncounterId(..)
            | Self::InvalidComplexEncounter { .. }
            | Self::MissingComplexEncounterMessage { .. }
            | Self::MissingRogueEncounter { .. } => self.write_reference_message(formatter),
        }
    }
}

impl RebuiltV3ScenarioError {
    fn write_reference_message(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingSimpleEncounterTarget { .. }
            | Self::MissingComplexEncounterTarget { .. }
            | Self::MissingExtraActionPointTarget { .. }
            | Self::MissingTextResourceTarget { .. }
            | Self::MissingProgramExtraCode { .. }
            | Self::MissingClassicItemTarget { .. } => self.write_direct(formatter),
            Self::InvalidBranchDestinationMode { .. }
            | Self::MissingBranchExtraActionPointTarget { .. }
            | Self::MissingBranchSimpleEncounterTarget { .. }
            | Self::MissingBranchComplexEncounterTarget { .. }
            | Self::InvalidBranchDestinationRange { .. }
            | Self::MissingBranchMessage { .. } => self.write_branch(formatter),
            Self::MissingRandomRectangleExtraActionPoint { .. }
            | Self::MissingRandomRectangleBattle { .. } => self.write_rectangle(formatter),
            Self::InvalidEncounterResultOpcode { .. }
            | Self::MissingOpcodeMap { .. }
            | Self::MissingOpcodeRandomRectangle { .. }
            | Self::InvalidLandlookOpcode { .. }
            | Self::InvalidBattleTerrain(..)
            | Self::MissingLandlookBattleTerrain { .. } => self.write_map(formatter),
            Self::InvalidTimedEncounter(..) | Self::InvalidTimedEncounterProgram { .. } => {
                self.write_timed(formatter)
            }
            Self::DuplicateProgramId(..)
            | Self::DuplicateComplexEncounterId(..)
            | Self::InvalidComplexEncounter { .. }
            | Self::MissingComplexEncounterMessage { .. }
            | Self::MissingRogueEncounter { .. } => self.write_complex(formatter),
            _ => unreachable!("native record errors use the outer message dispatcher"),
        }
    }
}

impl std::error::Error for RebuiltV3ScenarioError {}
