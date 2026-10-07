use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:2840-2868 adds word 2 directly to the condition.
// getup.c:124-127 decrements only positive condition values, so negative values
// retain both permanence and their absolute effect magnitude.
#[test]
fn give_condition_exposes_timed_and_permanent_modes() {
    let snapshot = ProjectSnapshot::new_authored(StableId("condition-duration".into()));
    let timed = describe(&snapshot, [0, 5, 6, 91, 44], Default::default());
    let control = &timed.authoring.controls[0];
    assert_eq!(control.label, "Condition Duration");
    assert_eq!(control.value, 0);
    assert_eq!(control.choices[0].label, "Timed");
    assert_eq!(control.choices[1].label, "Permanent");
    assert_eq!(field(&timed).label, "Magnitude");
    assert_eq!(field(&timed).value, 6);

    let permanent = describe(&snapshot, [0, 5, -6, 91, 44], Default::default());
    assert_eq!(permanent.authoring.controls[0].value, 1);
    assert_eq!(field(&permanent).value, 6);
    assert_eq!(
        roundtrip(&permanent, [0, 5, -6, 91, 44]),
        [0, 5, -6, 91, 44]
    );
}

#[test]
fn mode_changes_only_the_condition_magnitude_word() {
    let snapshot = ProjectSnapshot::new_authored(StableId("condition-toggle".into()));
    let base = [2, 17, 8, 91, 44];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("conditionDuration".into(), 1);
    authoring.selections.insert("durationOrDelta".into(), 12);
    let permanent = describe(&snapshot, base, authoring.clone());
    assert_eq!(roundtrip(&permanent, base), [2, 17, -12, 91, 44]);

    authoring.modes.insert("conditionDuration".into(), 0);
    let timed = describe(&snapshot, base, authoring);
    assert_eq!(roundtrip(&timed, base), [2, 17, 12, 91, 44]);
}

#[test]
fn zero_import_is_timed_but_preserved_until_replaced() {
    let snapshot = ProjectSnapshot::new_authored(StableId("condition-imports".into()));
    let base = [1, 17, 0, 91, 44];
    let imported = describe(&snapshot, base, Default::default());
    assert_eq!(imported.authoring.controls[0].value, 0);
    assert!(!imported.authoring.controls[0].active_fields.is_empty());
    assert_eq!(field(&imported).value, 0);
    assert_eq!(roundtrip(&imported, base), base);
}

#[test]
fn minimum_import_is_preserved_until_replaced() {
    let snapshot = ProjectSnapshot::new_authored(StableId("condition-minimum".into()));
    let base = [1, 17, i16::MIN, 91, 44];
    let imported = describe(&snapshot, base, Default::default());
    assert!(imported.authoring.controls[0].active_fields.is_empty());
    assert!(imported.authoring.controls[0].display.contains("retained"));
    assert_eq!(roundtrip(&imported, base), base);
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.43".into(),
            target_native_id: 43,
            values: decode_form_values("condition", words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
        },
    )
    .unwrap()
}

fn field(description: &ActionFormDescription) -> &DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == "durationOrDelta")
        .unwrap()
}

fn roundtrip(description: &ActionFormDescription, base: [i16; 5]) -> [i16; 5] {
    let mut values = description.authoring.resolved_values.clone();
    for field in description.fields.iter().filter(|field| field.preserved) {
        values.remove(&field.key);
    }
    encode_form_values("condition", &values, Some(base)).unwrap()
}
