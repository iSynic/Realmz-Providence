use super::*;

#[test]
fn preserves_invalid_battle_monster_rewrite_message() {
    let error = SessionError::InvalidBattleMonsterRewrite("reason".into());
    assert_eq!(
        error.to_string(),
        "invalid battle monster reference repair: reason"
    );
}

#[test]
fn preserves_battle_not_found_message() {
    let error = SessionError::BattleNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "battle identity was not found");
}

#[test]
fn preserves_invalid_battle_message() {
    let error = SessionError::InvalidBattle {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "battle identity is invalid: reason");
}

#[test]
fn preserves_invalid_battle_reference_message() {
    let error = SessionError::InvalidBattleReference {
        source: StableId("source".into()),
        field: "field".into(),
    };
    assert_eq!(
        error.to_string(),
        "battle reference source.field was not found"
    );
}
