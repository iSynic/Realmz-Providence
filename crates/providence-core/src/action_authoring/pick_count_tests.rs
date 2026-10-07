use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:1919-1937 passes abs(ID)-1 as the selection
// count and uses only the sign to enable conscious/animated filtering. The
// negative opcode then inverts the resulting selection.
#[test]
fn pick_count_separates_eligibility_from_the_number_to_pick() {
    let snapshot = ProjectSnapshot::new_authored(StableId("pick-count".into()));
    for opcode in [-14, 14] {
        let description = describe(&snapshot, opcode, -3, Default::default());
        let control = &description.authoring.controls[0];
        assert_eq!(control.label, "Eligible Characters");
        assert_eq!(control.value, 1);
        assert_eq!(control.choices[0].label, "Any party member");
        assert_eq!(control.choices[1].label, "Conscious or animated only");
        let field = field(&description);
        assert_eq!(field.label, "Number To Pick");
        assert_eq!(field.value, 3);
        assert_eq!((field.minimum, field.maximum), (1, 6));
        assert_eq!(description.authoring.resolved_values["targetNativeId"], -3);
    }
}

#[test]
fn changing_eligibility_reapplies_only_the_direct_argument_sign() {
    let snapshot = ProjectSnapshot::new_authored(StableId("pick-count-mode".into()));
    let mut authoring = mode(0);
    authoring.selections.insert("targetNativeId".into(), 4);
    let all = describe(&snapshot, 14, -2, authoring);
    assert_eq!(all.authoring.resolved_values["targetNativeId"], 4);

    let conscious = describe(&snapshot, 14, 4, mode(1));
    assert_eq!(conscious.authoring.resolved_values["targetNativeId"], -4);
}

#[test]
fn unsupported_direct_arguments_remain_exact_until_replaced() {
    let snapshot = ProjectSnapshot::new_authored(StableId("pick-count-import".into()));
    for imported in [0, i16::MIN] {
        let description = describe(&snapshot, -14, imported, Default::default());
        let control = &description.authoring.controls[0];
        assert_eq!(control.value, 2);
        assert!(control.active_fields.is_empty());
        assert!(control.display.contains("retained unchanged"));
        assert_eq!(
            description.authoring.resolved_values["targetNativeId"],
            imported
        );
    }

    let mut invalid = mode(0);
    invalid.selections.insert("targetNativeId".into(), 7);
    let invalid = describe(&snapshot, 14, 2, invalid);
    assert_eq!(
        invalid.authoring.errors,
        ["Number of characters to pick must be between 1 and 6."]
    );
}

fn mode(value: i16) -> ActionAuthoringInput {
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("pickEligibility".into(), value);
    authoring
}

fn describe(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    target_native_id: i16,
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: format!("realmz.action.{opcode}"),
            target_native_id,
            values: Default::default(),
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
        .find(|field| field.key == "targetNativeId")
        .unwrap()
}
