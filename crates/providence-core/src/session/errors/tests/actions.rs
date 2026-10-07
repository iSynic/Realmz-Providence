use super::*;

#[test]
fn preserves_action_reference_not_found_message() {
    let error = SessionError::ActionReferenceNotFound {
        source: StableId("source".into()),
        slot: 7,
    };
    assert_eq!(
        error.to_string(),
        "action reference source slot 7 was not found"
    );
}

#[test]
fn preserves_invalid_action_settings_message() {
    let error = SessionError::InvalidActionSettings {
        source: StableId("source".into()),
        slot: 7,
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "action settings for source slot 7 are invalid: reason"
    );
}

#[test]
fn preserves_extra_action_point_not_found_message() {
    let error = SessionError::ExtraActionPointNotFound(StableId("identity".into()));
    assert_eq!(
        error.to_string(),
        "Extra Action Point identity was not found"
    );
}

#[test]
fn preserves_invalid_extra_action_point_message() {
    let error = SessionError::InvalidExtraActionPoint {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "Extra Action Point identity is invalid: reason"
    );
}

#[test]
fn preserves_action_point_not_found_message() {
    let error = SessionError::ActionPointNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "Action Point identity was not found");
}

#[test]
fn preserves_invalid_action_point_message() {
    let error = SessionError::InvalidActionPoint {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "Action Point identity is invalid: reason"
    );
}

#[test]
fn preserves_invalid_extra_code_reference_message() {
    let error = SessionError::InvalidExtraCodeReference {
        source: StableId("source".into()),
        index: 7,
    };
    assert_eq!(
        error.to_string(),
        "extra-code reference source.values[7] was not found"
    );
}

#[test]
fn preserves_invalid_extra_code_branch_mode_message() {
    let error = SessionError::InvalidExtraCodeBranchMode {
        source: StableId("source".into()),
        layout: ExtraCodeBranchLayout::Choice,
        mode: 7,
    };
    assert_eq!(
        error.to_string(),
        "extra-code source Choice branch mode 7 is outside the Classic switch"
    );
}
