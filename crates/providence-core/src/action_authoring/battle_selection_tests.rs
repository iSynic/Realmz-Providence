use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:1466-1469, 3086-3089, 3406-3409 and
// 727-730 select the first Battle directly when word 1 is zero and otherwise
// pass words 0 and 1 to randrange.
#[test]
fn battle_actions_expose_single_or_random_range_as_a_named_choice() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle-selection".into()));
    for opcode in [2, 48, 56, 107] {
        let single = describe(&snapshot, opcode, [12, 0, 0, 0, 0], Default::default());
        let control = &single.authoring.controls[0];
        assert_eq!(control.label, "Battle Selection");
        assert_eq!(control.value, 0);
        assert_eq!(control.choices[0].label, "Single battle");
        assert_eq!(control.choices[1].label, "Random range");
        assert!(control.active_fields.is_empty());

        let range = describe(&snapshot, opcode, [12, 15, 0, 0, 0], Default::default());
        assert_eq!(range.authoring.controls[0].value, 1);
        let high = field(&range, "battleHigh").unwrap();
        assert_eq!(high.label, "High Battle");
        assert_eq!(high.control, FormControl::Target);
        assert_eq!(high.target_kind, Some(ActionTargetKind::Battle));
        assert_eq!(range.authoring.resolved_values["battleHigh"], 15);
    }
}

#[test]
fn switching_modes_preserves_the_pending_range_endpoint() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle-selection-mode".into()));
    let single = describe(&snapshot, 48, [12, 15, 0, 0, 0], mode(0));
    assert_eq!(single.authoring.resolved_values["battleHigh"], 0);
    assert!(single.authoring.controls[0].active_fields.is_empty());

    let range = describe(&snapshot, 48, [12, 15, 0, 0, 0], mode(1));
    assert_eq!(range.authoring.resolved_values["battleHigh"], 15);
    assert_eq!(field(&range, "battleHigh").unwrap().value, 15);
}

#[test]
fn unsupported_or_incomplete_ranges_are_not_silently_rewritten() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle-selection-import".into()));
    let imported = describe(&snapshot, 107, [12, -7, 0, 0, 0], Default::default());
    let control = &imported.authoring.controls[0];
    assert_eq!(control.value, 2);
    assert!(control.active_fields.is_empty());
    assert!(control.display.contains("retained unchanged"));
    assert_eq!(imported.authoring.resolved_values["battleHigh"], -7);

    let incomplete = describe(&snapshot, 107, [12, 0, 0, 0, 0], mode(1));
    assert_eq!(
        incomplete.authoring.errors,
        ["Select a positive high Battle for the random range."]
    );
    assert_eq!(
        field(&incomplete, "battleHigh")
            .unwrap()
            .availability_reason
            .as_deref(),
        Some("Select a positive high Battle for the random range.")
    );
}

fn mode(value: i16) -> ActionAuthoringInput {
    let mut input = ActionAuthoringInput::default();
    input.modes.insert("battleSelection".into(), value);
    input
}

fn describe(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    let form_id = action_definition_for_opcode(opcode)
        .unwrap()
        .form_id
        .unwrap();
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: format!("realmz.action.{opcode}"),
            target_native_id: 1,
            values: decode_form_values(&form_id, words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
        },
    )
    .unwrap()
}

fn field<'a>(
    description: &'a ActionFormDescription,
    key: &str,
) -> Option<&'a DescribedActionField> {
    description
        .fields
        .iter()
        .find(|field| field.key == key && field.editable)
}
