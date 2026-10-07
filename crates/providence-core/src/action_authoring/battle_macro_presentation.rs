use super::ActionSemanticInventoryField;
use std::collections::BTreeMap;

pub(super) fn battle_macro_field_presentation(
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
) -> (String, String) {
    match field.index {
        0 => (
            "Activate When".into(),
            "Choose whether this battle macro checks an exact round, rolls every round, or responds to a flee/fail event.".into(),
        ),
        1 if values.get("mode") == Some(&0) => (
            "Battle Round".into(),
            "Run when combat reaches this battle round.".into(),
        ),
        1 if values.get("mode") == Some(&1) => (
            "Chance Per Round".into(),
            "Percent chance to run on each battle round.".into(),
        ),
        1 => (
            "Activation Threshold".into(),
            "The Flee / Fail trigger does not use a round or percentage threshold.".into(),
        ),
        2 => (
            "Run Script".into(),
            "Choose one Extra Action Point once, one on every matching round, or a random Extra Action Point once.".into(),
        ),
        3 if values.get("repeatMode") == Some(&2) => (
            "Random Range Low".into(),
            "Lowest Extra Action Point that may be selected for this one-time random branch.".into(),
        ),
        3 => (
            "Extra Action Point".into(),
            "Extra Action Point to run when the activation condition matches.".into(),
        ),
        4 => (
            "Random Range High".into(),
            "Highest Extra Action Point that may be selected for this one-time random branch.".into(),
        ),
        _ => (field.label.clone(), field.help.clone()),
    }
}
