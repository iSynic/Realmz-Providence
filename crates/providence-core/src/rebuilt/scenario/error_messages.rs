use super::RebuiltV3ScenarioError;
use crate::model::LevelType;

impl RebuiltV3ScenarioError {
    pub(super) fn write_application(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result {
        match self {
            Self::MissingApplicationContract => write!(
                formatter,
                "scenario application hooks must be explicitly authored, including an all-null contract"
            ),
            Self::InvalidApplicationHook { hook, program } => write!(
                formatter,
                "application hook '{hook}' has invalid program ID '{}'",
                program.0
            ),
            Self::MissingApplicationHookProgram { hook, program } => write!(
                formatter,
                "application hook '{hook}' targets program '{}' that is not emitted",
                program.0
            ),
            _ => unreachable!("message dispatcher selects application errors"),
        }
    }

    pub(super) fn write_placement(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result {
        match self {
            Self::InvalidIdentifier(id) => {
                write!(formatter, "'{}' is not a schema-v3 identifier", id.0)
            }
            Self::MissingSourceMap(id) => {
                write!(formatter, "trigger '{}' has no matching source map", id.0)
            }
            Self::MissingCoordinate(id) => {
                write!(formatter, "active trigger '{}' has no coordinate", id.0)
            }
            Self::CoordinateOutsideMap(id, coordinate) => write!(
                formatter,
                "trigger '{}' coordinate ({}, {}) is outside its Classic map",
                id.0, coordinate.x, coordinate.y
            ),
            Self::MissingDestinationMap(id, map) => write!(
                formatter,
                "trigger '{}' post-action land map {} is unavailable",
                id.0, map
            ),
            Self::DestinationOutsideMap(id, coordinate) => write!(
                formatter,
                "trigger '{}' post-action coordinate ({}, {}) is outside its Classic map",
                id.0, coordinate.x, coordinate.y
            ),
            Self::DuplicateTriggerId(id) => {
                write!(formatter, "trigger ID '{}' is duplicated", id.0)
            }
            Self::DuplicatePlacedRecord { map, record_index } => write!(
                formatter,
                "map '{}' duplicates Classic trigger record {}",
                map.0, record_index
            ),
            _ => unreachable!("message dispatcher selects placement errors"),
        }
    }

    pub(super) fn write_instruction(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result {
        match self {
            Self::ActionSlotOutOfRange { trigger, slot } => write!(
                formatter,
                "trigger '{}' action slot {} is outside the Classic 0..=7 table",
                trigger.0, slot
            ),
            Self::DuplicateActionSlot { trigger, slot } => write!(
                formatter,
                "trigger '{}' duplicates Classic action slot {}",
                trigger.0, slot
            ),
            Self::DuplicateExtraCodeRow(native_id) => {
                write!(formatter, "Data EDCD row {} is duplicated", native_id)
            }
            Self::UnsupportedClassicOpcode {
                trigger,
                raw_opcode,
            } => write!(
                formatter,
                "trigger '{}' uses Classic opcode {} that Rebuilt cannot execute",
                trigger.0, raw_opcode
            ),
            Self::MissingExtraCodeRow { trigger, native_id } => write!(
                formatter,
                "trigger '{}' opcode 92 requires Data EDCD row {}",
                trigger.0, native_id
            ),
            Self::MissingConsecutiveExtraCodeRow { trigger, native_id } => write!(
                formatter,
                "trigger '{}' opcode 92 requires consecutive Data EDCD row {}",
                trigger.0, native_id
            ),
            _ => unreachable!("message dispatcher selects instruction errors"),
        }
    }

    pub(super) fn write_battle(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingBattleRangeExtraCodeRow {
                owner,
                opcode,
                native_id,
            } => write!(
                formatter,
                "program '{}' battle opcode {} requires unavailable Data EDCD row {}",
                owner.0, opcode, native_id
            ),
            Self::MissingReferencedBattle {
                owner,
                opcode,
                battle_id,
            } => write!(
                formatter,
                "program '{}' battle opcode {} references unavailable Classic battle {}",
                owner.0, opcode, battle_id
            ),
            _ => unreachable!("message dispatcher selects battle errors"),
        }
    }

    pub(super) fn write_message(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result {
        match self {
            Self::DuplicateMessageId(id) => write!(formatter, "message ID {id} is duplicated"),
            Self::InvalidMessageIdentity { message, native_id } => write!(
                formatter,
                "message '{}' does not match native Data SD2 row {native_id}",
                message.0
            ),
            Self::MissingProgramMessage {
                program,
                message_id,
            } => write!(
                formatter,
                "scenario program '{}' references unavailable message {message_id}",
                program.0
            ),
            _ => unreachable!("message dispatcher selects message errors"),
        }
    }

    pub(super) fn write_simple(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateSimpleEncounterId(id) => {
                write!(formatter, "Simple Encounter ID {id} is duplicated")
            }
            Self::InvalidSimpleEncounterIdentity {
                encounter,
                native_id,
            } => write!(
                formatter,
                "Simple Encounter '{}' does not match native Data ED row {native_id}",
                encounter.0
            ),
            Self::SimpleEncounterActionSlotOutOfRange { encounter, slot } => write!(
                formatter,
                "Simple Encounter '{}' action slot {slot} is outside the Classic 0..=31 table",
                encounter.0
            ),
            Self::InvalidSimpleEncounterResult {
                encounter,
                choice,
                result,
            } => write!(
                formatter,
                "Simple Encounter '{}' choice {choice} has invalid Classic result {result}; expected 1 through 4",
                encounter.0
            ),
            Self::MissingSimpleEncounterResponse(encounter) => write!(
                formatter,
                "Simple Encounter '{}' has no authored response choices",
                encounter.0
            ),
            Self::MissingSimpleEncounterMessage {
                encounter,
                message_id,
            } => write!(
                formatter,
                "Simple Encounter '{}' references unavailable prompt message {message_id}",
                encounter.0
            ),
            _ => unreachable!("message dispatcher selects simple errors"),
        }
    }

    pub(super) fn write_direct(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingSimpleEncounterTarget {
                program,
                encounter_id,
            } => write!(
                formatter,
                "scenario program '{}' references unavailable Simple Encounter {encounter_id}",
                program.0
            ),
            Self::MissingComplexEncounterTarget {
                program,
                encounter_id,
            } => write!(
                formatter,
                "scenario program '{}' references unavailable Complex Encounter {encounter_id}",
                program.0
            ),
            Self::MissingExtraActionPointTarget { program, native_id } => write!(
                formatter,
                "scenario program '{}' references unavailable Extra Action Point {native_id}",
                program.0
            ),
            Self::MissingTextResourceTarget {
                program,
                resource_id,
            } => write!(
                formatter,
                "scenario program '{}' opcode 62 references unavailable TEXT resource {resource_id}",
                program.0
            ),
            Self::MissingProgramExtraCode {
                program,
                opcode,
                native_id,
            } => write!(
                formatter,
                "scenario program '{}' opcode {opcode} requires five-value Data EDCD row {native_id}",
                program.0
            ),
            Self::MissingClassicItemTarget { program, item_id } => write!(
                formatter,
                "scenario program '{}' opcode 67 references unavailable Classic item {item_id}",
                program.0
            ),
            _ => unreachable!("message dispatcher selects direct errors"),
        }
    }

    pub(super) fn write_branch(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidBranchDestinationMode {
                program,
                opcode,
                mode,
            } => write!(
                formatter,
                "scenario program '{}' opcode {opcode} has invalid destination mode {mode}",
                program.0
            ),
            Self::MissingBranchExtraActionPointTarget {
                program,
                opcode,
                native_id,
            } => write!(
                formatter,
                "scenario program '{}' opcode {opcode} references unavailable Extra Action Point {native_id}",
                program.0
            ),
            Self::MissingBranchSimpleEncounterTarget {
                program,
                opcode,
                encounter_id,
            } => write!(
                formatter,
                "scenario program '{}' opcode {opcode} references unavailable Simple Encounter {encounter_id}",
                program.0
            ),
            Self::MissingBranchComplexEncounterTarget {
                program,
                opcode,
                encounter_id,
            } => write!(
                formatter,
                "scenario program '{}' opcode {opcode} references unavailable Complex Encounter {encounter_id}",
                program.0
            ),
            Self::InvalidBranchDestinationRange {
                program,
                mode,
                low_id,
                high_id,
            } => write!(
                formatter,
                "scenario program '{}' opcode 85 has invalid destination range {low_id}..={high_id} for mode {mode}",
                program.0
            ),
            Self::MissingBranchMessage {
                program,
                message_id,
            } => write!(
                formatter,
                "scenario program '{}' opcode 85 references unavailable message {message_id}",
                program.0
            ),
            _ => unreachable!("message dispatcher selects branch errors"),
        }
    }

    pub(super) fn write_rectangle(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result {
        match self {
            Self::MissingRandomRectangleExtraActionPoint {
                rectangle,
                native_id,
            } => write!(
                formatter,
                "random rectangle '{}' references unavailable Extra Action Point {native_id}",
                rectangle.0
            ),
            Self::MissingRandomRectangleBattle {
                rectangle,
                battle_id,
            } => write!(
                formatter,
                "random rectangle '{}' references unavailable battle {battle_id}",
                rectangle.0
            ),
            _ => unreachable!("message dispatcher selects rectangle errors"),
        }
    }

    pub(super) fn write_map(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidEncounterResultOpcode {
                program,
                slot,
                result,
            } => write!(
                formatter,
                "scenario program '{}' action slot {slot} opcode 44 requires result 1 through 4 in a Simple or Complex Encounter result; found {result}",
                program.0,
            ),
            Self::MissingOpcodeMap {
                program,
                opcode,
                level_type,
                native_index,
            } => write!(
                formatter,
                "scenario program '{}' opcode {opcode} references unavailable {} map {native_index}",
                program.0,
                match level_type {
                    LevelType::Land => "land",
                    LevelType::Dungeon => "dungeon",
                }
            ),
            Self::MissingOpcodeRandomRectangle {
                program,
                map,
                native_index,
            } => write!(
                formatter,
                "scenario program '{}' opcode 92 references unavailable random rectangle {native_index} in map '{}'",
                program.0, map.0
            ),
            Self::InvalidLandlookOpcode { program, darkness } => write!(
                formatter,
                "scenario program '{}' opcode 57 has invalid darkness flag {darkness}; expected 0 or 1",
                program.0
            ),
            Self::InvalidBattleTerrain(reason) => {
                write!(formatter, "battle-terrain projection is invalid: {reason}")
            }
            Self::MissingLandlookBattleTerrain { program, landlook } => write!(
                formatter,
                "scenario program '{}' opcode 57 references unavailable battle terrain for landlook {landlook}",
                program.0
            ),
            _ => unreachable!("message dispatcher selects map errors"),
        }
    }

    pub(super) fn write_timed(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidTimedEncounter(reason) => {
                write!(formatter, "Timed Encounter projection is invalid: {reason}")
            }
            Self::InvalidTimedEncounterProgram {
                encounter_id,
                program,
            } => write!(
                formatter,
                "Timed Encounter {encounter_id} references unavailable Extra Action Point program '{}'",
                program.0
            ),
            _ => unreachable!("message dispatcher selects timed errors"),
        }
    }

    pub(super) fn write_complex(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> std::fmt::Result {
        match self {
            Self::DuplicateProgramId(id) => {
                write!(formatter, "scenario program ID '{}' is duplicated", id.0)
            }
            Self::DuplicateComplexEncounterId(id) => {
                write!(formatter, "Complex Encounter ID {id} is duplicated")
            }
            Self::InvalidComplexEncounter { encounter, reason } => write!(
                formatter,
                "Complex Encounter '{}' is invalid: {reason}",
                encounter.0
            ),
            Self::MissingComplexEncounterMessage {
                encounter,
                message_id,
            } => write!(
                formatter,
                "Complex Encounter '{}' references unavailable prompt message {message_id}",
                encounter.0
            ),
            Self::MissingRogueEncounter {
                encounter,
                rogue_id,
            } => write!(
                formatter,
                "Complex Encounter '{}' references unavailable Rogue Encounter {rogue_id}",
                encounter.0
            ),
            _ => unreachable!("message dispatcher selects complex errors"),
        }
    }
}
