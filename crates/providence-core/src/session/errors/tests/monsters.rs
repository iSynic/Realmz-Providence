use super::*;

#[test]
fn preserves_monster_not_found_message() {
    let error = SessionError::MonsterNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "monster identity was not found");
}

#[test]
fn preserves_monster_description_not_found_message() {
    let error = SessionError::MonsterDescriptionNotFound(NativeRecordId(7));
    assert_eq!(error.to_string(), "monster description 7 was not found");
}

#[test]
fn preserves_invalid_monster_message() {
    let error = SessionError::InvalidMonster {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "monster identity is invalid: reason");
}

#[test]
fn preserves_invalid_monster_reference_message() {
    let error = SessionError::InvalidMonsterReference {
        source: StableId("source".into()),
        field: "field".into(),
    };
    assert_eq!(
        error.to_string(),
        "monster reference source.field was not found"
    );
}
