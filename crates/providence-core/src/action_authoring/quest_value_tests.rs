use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:123-158 clamps quests to -127..127, treats a zero
// threshold as no branch, and uses one-based branch modes 1..3.
#[test]
fn zero_threshold_is_a_named_disabled_auto_branch() {
    let snapshot = ProjectSnapshot::new_authored(StableId("quest-disabled".into()));
    let base = [4, 8, 3, 0, 91];
    let description = describe(&snapshot, base, Default::default());
    let control = &description.authoring.controls[0];
    assert_eq!(control.label, "Auto Branch");
    assert_eq!(control.value, 0);
    assert!(control.active_fields.is_empty());
    assert_eq!(roundtrip(&description, base), base);
    assert_eq!(field(&description, "delta").minimum, -127);
    assert_eq!(field(&description, "delta").maximum, 127);
}

#[test]
fn enabled_auto_branch_exposes_typed_destination_and_exact_values() {
    let snapshot = ProjectSnapshot::new_authored(StableId("quest-enabled".into()));
    let mut input = ActionAuthoringInput::default();
    input.modes.insert("autoBranch".into(), 1);
    input.selections.insert("branchMode".into(), 1);
    input.selections.insert("threshold".into(), 50);
    input.selections.insert("target".into(), 0);
    let description = describe(&snapshot, [4, -8, 0, 0, -91], input);
    assert_eq!(description.authoring.resolved_values["threshold"], 50);
    assert_eq!(description.authoring.resolved_values["target"], 0);
    assert_eq!(
        field(&description, "target").target_kind,
        Some(ActionTargetKind::ExtraActionPoint)
    );
    assert_eq!(
        roundtrip(&description, [4, -8, 0, 0, -91]),
        [4, -8, 1, 50, 0]
    );
}

#[test]
fn mode_changes_retain_branch_values_and_unsupported_imports() {
    let snapshot = ProjectSnapshot::new_authored(StableId("quest-retention".into()));
    let base = [4, 8, 2, 50, 17];
    let mut input = ActionAuthoringInput::default();
    input.modes.insert("autoBranch".into(), 0);
    input.selections.insert("branchMode".into(), 2);
    input.selections.insert("threshold".into(), 75);
    input.selections.insert("target".into(), 17);
    let disabled = describe(&snapshot, base, input.clone());
    assert_eq!(roundtrip(&disabled, base), [4, 8, 2, 0, 17]);

    input.modes.insert("autoBranch".into(), 1);
    let restored = describe(&snapshot, base, input);
    assert_eq!(roundtrip(&restored, base), [4, 8, 2, 75, 17]);

    let unsupported = describe(&snapshot, [4, 8, 9, 200, -1], Default::default());
    assert_eq!(unsupported.authoring.controls[0].value, 2);
    assert!(
        unsupported.authoring.controls[0]
            .display
            .contains("retained")
    );
    assert_eq!(
        roundtrip(&unsupported, [4, 8, 9, 200, -1]),
        [4, 8, 9, 200, -1]
    );
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.76".into(),
            target_native_id: 76,
            values: decode_form_values("quest-value", words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
        },
    )
    .unwrap()
}

fn field<'a>(description: &'a ActionFormDescription, key: &str) -> &'a DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}

fn roundtrip(description: &ActionFormDescription, base: [i16; 5]) -> [i16; 5] {
    encode_form_values(
        "quest-value",
        &description.authoring.resolved_values,
        Some(base),
    )
    .unwrap()
}
