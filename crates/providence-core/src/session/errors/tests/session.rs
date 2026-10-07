use super::*;

#[test]
fn preserves_revision_conflict_message() {
    let error = SessionError::RevisionConflict {
        expected: Revision(7),
        actual: Revision(7),
    };
    assert_eq!(
        error.to_string(),
        "revision conflict: expected 7, current revision is 7"
    );
}

#[test]
fn preserves_invalid_scenario_contact_message() {
    let error = SessionError::InvalidScenarioContact("reason".into());
    assert_eq!(
        error.to_string(),
        "scenario contact information is invalid: reason"
    );
}

#[test]
fn preserves_invalid_classic_import_message() {
    let error = SessionError::InvalidClassicImport("message".into());
    assert_eq!(error.to_string(), "invalid Classic import: message");
}

#[test]
fn preserves_invalid_global_macro_target_message() {
    let error = SessionError::InvalidGlobalMacroTarget(StableId("target".into()));
    assert_eq!(
        error.to_string(),
        "global macro target 'target' must be an extra-action-point:<nonzero-signed-short> identity"
    );
}

#[test]
fn preserves_nothing_to_undo_message() {
    let error = SessionError::NothingToUndo;
    assert_eq!(error.to_string(), "nothing to undo");
}

#[test]
fn preserves_nothing_to_redo_message() {
    let error = SessionError::NothingToRedo;
    assert_eq!(error.to_string(), "nothing to redo");
}
