use super::*;

#[test]
fn preserves_treasure_not_found_message() {
    let error = SessionError::TreasureNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "treasure identity was not found");
}

#[test]
fn preserves_invalid_treasure_message() {
    let error = SessionError::InvalidTreasure {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "treasure identity is invalid: reason");
}

#[test]
fn preserves_invalid_treasure_reference_message() {
    let error = SessionError::InvalidTreasureReference {
        source: StableId("source".into()),
        slot: 7,
    };
    assert_eq!(
        error.to_string(),
        "treasure item reference source.itemIds[7] was not found"
    );
}

#[test]
fn preserves_shop_not_found_message() {
    let error = SessionError::ShopNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "shop identity was not found");
}

#[test]
fn preserves_invalid_shop_message() {
    let error = SessionError::InvalidShop {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "shop identity is invalid: reason");
}

#[test]
fn preserves_invalid_shop_reference_message() {
    let error = SessionError::InvalidShopReference {
        source: StableId("source".into()),
        slot: 7,
    };
    assert_eq!(
        error.to_string(),
        "shop item reference source.itemIds[7] was not found"
    );
}
