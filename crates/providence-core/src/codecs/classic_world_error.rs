use super::ClassicWorldCodecError;

impl std::fmt::Display for ClassicWorldCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        format_classic_world_error(self, formatter)
    }
}

fn format_classic_world_error(
    error: &ClassicWorldCodecError,
    formatter: &mut std::fmt::Formatter<'_>,
) -> std::fmt::Result {
    match error {
        ClassicWorldCodecError::DuplicateMapIndex(_)
        | ClassicWorldCodecError::SparseMapIndex { .. }
        | ClassicWorldCodecError::InvalidMapCellCount { .. }
        | ClassicWorldCodecError::DuplicateActionPoint { .. }
        | ClassicWorldCodecError::ActionPointRecordOutOfRange { .. } => {
            format_map_error(error, formatter)
        }
        _ => format_action_error(error, formatter),
    }
}

fn format_map_error(
    error: &ClassicWorldCodecError,
    formatter: &mut std::fmt::Formatter<'_>,
) -> std::fmt::Result {
    match error {
        ClassicWorldCodecError::DuplicateMapIndex(index) => {
            write!(formatter, "duplicate Classic map index {index}")
        }
        ClassicWorldCodecError::SparseMapIndex { expected, actual } => write!(
            formatter,
            "Classic map indices must be dense; expected {expected}, found {actual}"
        ),
        ClassicWorldCodecError::InvalidMapCellCount { identity, actual } => write!(
            formatter,
            "{} has {actual} cells; Classic maps require 8100",
            identity.0
        ),
        ClassicWorldCodecError::DuplicateActionPoint {
            level_index,
            record_index,
        } => write!(
            formatter,
            "duplicate land Action Point level {level_index} record {record_index}"
        ),
        ClassicWorldCodecError::ActionPointRecordOutOfRange {
            identity,
            record_index,
        } => write!(
            formatter,
            "{} record {record_index} is outside the 100-row Classic table",
            identity.0
        ),
        _ => unreachable!("map error dispatcher passed a non-map error"),
    }
}

fn format_action_error(
    error: &ClassicWorldCodecError,
    formatter: &mut std::fmt::Formatter<'_>,
) -> std::fmt::Result {
    match error {
        ClassicWorldCodecError::ActionSlotOutOfRange {
            identity,
            slot,
            maximum,
        } => write!(
            formatter,
            "{} action slot {slot} is outside 0..={maximum}",
            identity.0
        ),
        ClassicWorldCodecError::ActionOpcodeOutOfByteRange {
            identity,
            raw_opcode,
        } => write!(
            formatter,
            "{} encounter opcode {raw_opcode} is outside signed-byte storage",
            identity.0
        ),
        ClassicWorldCodecError::DuplicateActionSlot { identity, slot } => {
            write!(formatter, "{} duplicates action slot {slot}", identity.0)
        }
        ClassicWorldCodecError::DuplicateEncounterId(id) => {
            write!(formatter, "duplicate simple encounter id {}", id.0)
        }
        ClassicWorldCodecError::DuplicateExtraActionPointId(id) => {
            write!(formatter, "duplicate Extra Action Point id {}", id.0)
        }
        ClassicWorldCodecError::ExtraActionPointOverlapsCertifiedTail {
            native_id,
            authored_records,
        } => write!(
            formatter,
            "Extra Action Point {} overlaps the certified foreign suffix after {} authored records",
            native_id.0, authored_records
        ),
        ClassicWorldCodecError::EncounterTextTooLong {
            native_id,
            slot,
            bytes,
        } => write!(
            formatter,
            "simple encounter {} choice {slot} encodes to {bytes} bytes; Classic maximum is 79",
            native_id.0
        ),
        ClassicWorldCodecError::MissingEncounterCompatibilitySource(id) => write!(
            formatter,
            "imported simple encounter {} requires its Data ED compatibility source",
            id.0
        ),
        _ => unreachable!("action error dispatcher passed a map error"),
    }
}

impl std::error::Error for ClassicWorldCodecError {}
