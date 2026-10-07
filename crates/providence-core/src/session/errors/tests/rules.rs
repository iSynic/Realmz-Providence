use super::*;

#[test]
fn preserves_duplicate_classic_rule_id_message() {
    let error = SessionError::DuplicateClassicRuleId {
        kind: "kind",
        classic_id: 7,
    };
    assert_eq!(
        error.to_string(),
        "Classic kind ID 7 is already owned by another rule"
    );
}

#[test]
fn preserves_scenario_item_not_found_message() {
    let error = SessionError::ScenarioItemNotFound(7);
    assert_eq!(error.to_string(), "Data NI record 7 was not found");
}

#[test]
fn preserves_invalid_scenario_item_identity_message() {
    let error = SessionError::InvalidScenarioItemIdentity {
        record_index: 7,
        classic_id: 7,
    };
    assert_eq!(
        error.to_string(),
        "Data NI record 7 cannot own Classic item ID 7"
    );
}

#[test]
fn preserves_scenario_spell_not_found_message() {
    let error = SessionError::ScenarioSpellNotFound(7);
    assert_eq!(error.to_string(), "Data Spell record 7 was not found");
}

#[test]
fn preserves_invalid_scenario_spell_identity_message() {
    let error = SessionError::InvalidScenarioSpellIdentity {
        record_index: 7,
        classic_id: 7,
    };
    assert_eq!(
        error.to_string(),
        "Data Spell record 7 cannot own Classic spell ID 7"
    );
}
