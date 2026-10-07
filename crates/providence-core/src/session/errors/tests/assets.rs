use super::*;

#[test]
fn preserves_duplicate_asset_resource_message() {
    let error = SessionError::DuplicateAssetResource {
        resource_type: "resource_type".into(),
        resource_id: 7,
    };
    assert_eq!(
        error.to_string(),
        "Classic resource \"resource_type\" 7 is already owned by another asset"
    );
}

#[test]
fn preserves_asset_not_found_message() {
    let error = SessionError::AssetNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "asset identity was not found");
}

#[test]
fn preserves_asset_in_use_message() {
    let error = SessionError::AssetInUse(StableId("_".into()));
    assert_eq!(
        error.to_string(),
        "This artwork is in use. Choose replacement artwork for its uses before removing it."
    );
}

#[test]
fn preserves_invalid_item_artwork_message() {
    let error = SessionError::InvalidItemArtwork("reason".into());
    assert_eq!(error.to_string(), "cannot apply item artwork: reason");
}

#[test]
fn preserves_invalid_monster_appearance_message() {
    let error = SessionError::InvalidMonsterAppearance("reason".into());
    assert_eq!(error.to_string(), "monster appearance is invalid: reason");
}
