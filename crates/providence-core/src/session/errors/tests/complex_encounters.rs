use super::*;

#[test]
fn preserves_simple_encounter_not_found_message() {
    let error = SessionError::SimpleEncounterNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "simple encounter identity was not found");
}

#[test]
fn preserves_invalid_simple_encounter_message() {
    let error = SessionError::InvalidSimpleEncounter {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "simple encounter identity is invalid: reason"
    );
}

#[test]
fn preserves_complex_encounter_not_found_message() {
    let error = SessionError::ComplexEncounterNotFound(StableId("identity".into()));
    assert_eq!(
        error.to_string(),
        "complex encounter identity was not found"
    );
}

#[test]
fn preserves_invalid_complex_encounter_message() {
    let error = SessionError::InvalidComplexEncounter {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "complex encounter identity is invalid: reason"
    );
}

#[test]
fn preserves_invalid_complex_encounter_reference_message() {
    let error = SessionError::InvalidComplexEncounterReference {
        source: StableId("source".into()),
        field: "field".into(),
    };
    assert_eq!(
        error.to_string(),
        "complex encounter reference source.field was not found"
    );
}
