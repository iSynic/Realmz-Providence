use super::*;

#[test]
fn preserves_random_rectangle_not_found_message() {
    let error = SessionError::RandomRectangleNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "random rectangle identity was not found");
}

#[test]
fn preserves_invalid_random_rectangle_message() {
    let error = SessionError::InvalidRandomRectangle {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "random rectangle identity is invalid: reason"
    );
}

#[test]
fn preserves_map_coordinate_out_of_range_message() {
    let error = SessionError::MapCoordinateOutOfRange { x: 7, y: 7 };
    assert_eq!(
        error.to_string(),
        "map coordinate (7,7) is outside 90 by 90"
    );
}

#[test]
fn preserves_land_layout_coordinate_out_of_range_message() {
    let error = SessionError::LandLayoutCoordinateOutOfRange { row: 7, column: 7 };
    assert_eq!(
        error.to_string(),
        "land Layout coordinate (7,7) is outside 8 by 16"
    );
}

#[test]
fn preserves_invalid_land_layout_cell_count_message() {
    let error = SessionError::InvalidLandLayoutCellCount(7);
    assert_eq!(
        error.to_string(),
        "land Layout must contain exactly 128 cells; found 7"
    );
}

#[test]
fn preserves_invalid_land_layout_target_message() {
    let error = SessionError::InvalidLandLayoutTarget(StableId("identity".into()));
    assert_eq!(
        error.to_string(),
        "land Layout target 'identity' is not a Classic-addressable land map"
    );
}

#[test]
fn preserves_player_map_not_found_message() {
    let error = SessionError::PlayerMapNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "player map identity was not found");
}

#[test]
fn preserves_invalid_player_map_message() {
    let error = SessionError::InvalidPlayerMap {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "player map identity is invalid: reason");
}
