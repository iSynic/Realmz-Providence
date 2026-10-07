use super::*;

#[test]
fn preserves_map_not_found_message() {
    let error = SessionError::MapNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "map identity was not found");
}

#[test]
fn preserves_invalid_map_kind_message() {
    let error = SessionError::InvalidMapKind {
        identity: StableId("identity".into()),
        expected: LevelType::Land,
    };
    assert_eq!(error.to_string(), "map identity is not a Land map");
}

#[test]
fn preserves_invalid_map_catalog_message() {
    let error = SessionError::InvalidMapCatalog {
        level_type: LevelType::Land,
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "Land map catalog is invalid: reason");
}

#[test]
fn preserves_invalid_map_paint_message() {
    let error = SessionError::InvalidMapPaint {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "map identity paint is invalid: reason");
}

#[test]
fn preserves_invalid_dungeon_primitive_message() {
    let error = SessionError::InvalidDungeonPrimitive {
        identity: StableId("identity".into()),
        primitive: crate::codecs::DungeonPrimitive::Wall,
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "dungeon map identity cannot edit Wall: reason"
    );
}

#[test]
fn preserves_map_runtime_not_found_message() {
    let error = SessionError::MapRuntimeNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "map identity has no runtime metadata");
}
