use super::*;

#[test]
fn preserves_message_not_found_message() {
    let error = SessionError::MessageNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "message identity was not found");
}

#[test]
fn preserves_duplicate_message_id_message() {
    let error = SessionError::DuplicateMessageId(NativeRecordId(7));
    assert_eq!(error.to_string(), "message id 7 already exists");
}

#[test]
fn preserves_option_label_not_found_message() {
    let error = SessionError::OptionLabelNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "option label identity was not found");
}

#[test]
fn preserves_invalid_option_label_message() {
    let error = SessionError::InvalidOptionLabel {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "option label identity is invalid: reason"
    );
}

#[test]
fn preserves_invalid_quest_label_message() {
    let error = SessionError::InvalidQuestLabel {
        id: 7,
        reason: "reason".into(),
    };
    assert_eq!(error.to_string(), "quest label 7 is invalid: reason");
}

#[test]
fn preserves_quest_label_not_found_message() {
    let error = SessionError::QuestLabelNotFound(7);
    assert_eq!(error.to_string(), "quest label 7 was not found");
}

#[test]
fn preserves_reference_not_found_message() {
    let error = SessionError::ReferenceNotFound {
        source: StableId("source".into()),
        field: "field".into(),
    };
    assert_eq!(error.to_string(), "reference source.field was not found");
}
