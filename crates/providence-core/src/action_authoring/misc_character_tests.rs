use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn query(selector: i16, value: i16) -> ActionFormDescribeQuery {
    ActionFormDescribeQuery {
        action_identity: "realmz.action.52".into(),
        target_native_id: 52,
        values: decode_form_values("character-selector", [selector, value, 0, 0, 0]).unwrap(),
        secondary_values: Default::default(),
        context: Default::default(),
    }
}

#[test]
fn each_miscellaneous_check_gets_its_authored_control() {
    let snapshot = ProjectSnapshot::new_authored(StableId("misc-check".into()));
    let expectations = [
        (0, "Movement Maximum Below", FormControl::Integer, None),
        (1, "Party Position Before", FormControl::Integer, None),
        (
            2,
            "Item To Possess",
            FormControl::Target,
            Some(ActionTargetKind::Item),
        ),
        (3, "Chance", FormControl::Integer, None),
        (4, "Attribute Save", FormControl::Choice, None),
        (5, "Resistance Save", FormControl::Choice, None),
        (
            7,
            "Item To Wear",
            FormControl::Target,
            Some(ActionTargetKind::Item),
        ),
        (8, "Party Position", FormControl::Choice, None),
    ];
    for (mode, label, control, target) in expectations {
        let description = describe_action_form(&snapshot, &query(mode, 3)).unwrap();
        let field = description
            .fields
            .iter()
            .find(|field| field.key == "value")
            .unwrap();
        assert_eq!(
            (field.label.as_str(), field.control, field.target_kind),
            (label, control, target)
        );
    }
    assert_eq!(
        describe_action_form(&snapshot, &query(4, 0))
            .unwrap()
            .fields[1]
            .choices[0]
            .label,
        "Brawn"
    );
    assert_eq!(
        describe_action_form(&snapshot, &query(5, 0))
            .unwrap()
            .fields[1]
            .choices[3]
            .label,
        "Electrical"
    );
    let chance = describe_action_form(&snapshot, &query(3, 33)).unwrap();
    let value = chance
        .fields
        .iter()
        .find(|field| field.key == "value")
        .unwrap();
    assert_eq!((value.minimum, value.maximum), (0, 100));
    assert_eq!(value.value, 33);
}

#[test]
fn out_of_range_imported_chance_remains_exact_for_explicit_repair() {
    let snapshot = ProjectSnapshot::new_authored(StableId("misc-chance-import".into()));
    let description = describe_action_form(&snapshot, &query(3, 150)).unwrap();
    let value = description
        .fields
        .iter()
        .find(|field| field.key == "value")
        .unwrap();
    assert_eq!(value.value, 150);
    assert_eq!((value.minimum, value.maximum), (0, 100));
}

#[test]
fn current_character_hides_value_and_mode_changes_preserve_it() {
    let snapshot = ProjectSnapshot::new_authored(StableId("misc-check-retention".into()));
    let mut query = query(2, 851);
    query
        .context
        .authoring
        .modes
        .insert("miscellaneousCheck".into(), 6);
    let current = describe_action_form(&snapshot, &query).unwrap();
    assert!(current.authoring.controls[0].active_fields.is_empty());
    assert_eq!(current.authoring.resolved_values["value"], 851);
    query
        .context
        .authoring
        .modes
        .insert("miscellaneousCheck".into(), 8);
    let position = describe_action_form(&snapshot, &query).unwrap();
    assert_eq!(position.authoring.resolved_values["value"], 851);
    let mut values = position.authoring.resolved_values.clone();
    values.remove("unused3");
    values.remove("unused4");
    assert_eq!(
        encode_form_values("character-selector", &values, Some([2, 851, 0, 0, 0])).unwrap(),
        [8, 851, 0, 0, 0]
    );
}
