use super::*;

#[test]
fn preserves_rogue_encounter_not_found_message() {
    let error = SessionError::RogueEncounterNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "Rogue encounter identity was not found");
}

#[test]
fn preserves_invalid_rogue_encounter_message() {
    let error = SessionError::InvalidRogueEncounter {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "Rogue encounter identity is invalid: reason"
    );
}

#[test]
fn preserves_invalid_rogue_encounter_reference_message() {
    let error = SessionError::InvalidRogueEncounterReference {
        source: StableId("source".into()),
        field: "field".into(),
    };
    assert_eq!(
        error.to_string(),
        "Rogue encounter reference source.field was not found"
    );
}

#[test]
fn preserves_timed_encounter_not_found_message() {
    let error = SessionError::TimedEncounterNotFound(StableId("identity".into()));
    assert_eq!(error.to_string(), "Timed Encounter identity was not found");
}

#[test]
fn preserves_invalid_timed_encounter_message() {
    let error = SessionError::InvalidTimedEncounter {
        identity: StableId("identity".into()),
        reason: "reason".into(),
    };
    assert_eq!(
        error.to_string(),
        "Timed Encounter identity is invalid: reason"
    );
}

#[test]
fn preserves_invalid_timed_encounter_reference_message() {
    let error = SessionError::InvalidTimedEncounterReference {
        source: StableId("source".into()),
        field: "field".into(),
    };
    assert_eq!(
        error.to_string(),
        "Timed Encounter reference source.field was not found"
    );
}
