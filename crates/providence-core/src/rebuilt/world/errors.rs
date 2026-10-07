use super::RebuiltV3WorldError;
use crate::codecs::LAND_LAYOUT_CELLS;
impl std::fmt::Display for RebuiltV3WorldError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyMaps => write!(formatter, "world.json requires at least one canonical map"),
            Self::DuplicateMapId(map) => {
                write!(formatter, "world.json map ID '{}' is duplicated", map.0)
            }
            Self::DuplicateLandMapIndex(index) => write!(
                formatter,
                "world.json has more than one land map with native index {index}"
            ),
            Self::InvalidLandLayoutCellCount(actual) => write!(
                formatter,
                "land Layout must contain exactly {LAND_LAYOUT_CELLS} cells; found {actual}"
            ),
            Self::InvalidLandLayoutValue { row, column, value } => write!(
                formatter,
                "land Layout cell {row},{column} has invalid Classic value {value}"
            ),
            Self::MissingLandLayoutMap {
                row,
                column,
                native_index,
            } => write!(
                formatter,
                "land Layout cell {row},{column} references missing land level {native_index}"
            ),
            Self::DuplicateLandLayoutPlacement { map } => write!(
                formatter,
                "land Layout places map '{}' more than once",
                map.0
            ),
            Self::MapInputsUnavailable => write!(
                formatter,
                "world.json requires complete source-attributed map runtime and terrain inputs"
            ),
            Self::MissingMapInput(map) => write!(
                formatter,
                "world.json map '{}' has no deterministic compiler input",
                map.0
            ),
            Self::MissingTopology(map) => write!(
                formatter,
                "world.json map '{}' has no deterministic topology",
                map.0
            ),
            Self::Topology(error) => write!(formatter, "world topology is invalid: {error}"),
            Self::Scenario(error) => write!(formatter, "world program input is invalid: {error}"),
            Self::TimedEncounter(error) => {
                write!(formatter, "world Timed Encounter input is invalid: {error}")
            }
            Self::PlayerMapIdOutOfRange { .. }
            | Self::MissingPlayerMap { .. }
            | Self::DuplicatePlayerMapId(_)
            | Self::InvalidPlayerMap { .. } => format_player_map_error(self, formatter),
            Self::Serialization(reason) => {
                write!(formatter, "world.json serialization failed: {reason}")
            }
        }
    }
}

impl std::error::Error for RebuiltV3WorldError {}

fn format_player_map_error(
    error: &RebuiltV3WorldError,
    formatter: &mut std::fmt::Formatter<'_>,
) -> std::fmt::Result {
    match error {
        RebuiltV3WorldError::PlayerMapIdOutOfRange { program, native_id } => write!(
            formatter,
            "scenario program '{}' references player map {native_id}, outside the Classic menu range 0 through 19",
            program.0
        ),
        RebuiltV3WorldError::MissingPlayerMap { program, native_id } => write!(
            formatter,
            "scenario program '{}' references undefined player map {native_id}",
            program.0
        ),
        RebuiltV3WorldError::DuplicatePlayerMapId(native_id) => write!(
            formatter,
            "Data MD2 has more than one canonical player-map record {native_id}"
        ),
        RebuiltV3WorldError::InvalidPlayerMap { player_map, reason } => {
            write!(
                formatter,
                "player map '{}' is invalid: {reason}",
                player_map.0
            )
        }
        _ => unreachable!("only Player Map errors reach this formatter"),
    }
}
