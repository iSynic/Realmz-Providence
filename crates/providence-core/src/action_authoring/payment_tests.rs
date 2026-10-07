use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:2569-2580 passes positive word 0 to takegold as
// gold and non-positive word 0 as gems after taking its absolute value.
#[test]
fn payment_currency_is_a_named_author_choice() {
    let snapshot = ProjectSnapshot::new_authored(StableId("payment".into()));
    let gems = describe(&snapshot, [-250, 0, 0, 41, 0], Default::default());
    assert_eq!(gems.title, "Take Gold Or Gems");
    let control = &gems.authoring.controls[0];
    assert_eq!(control.label, "Payment Currency");
    assert_eq!(control.value, 1);
    assert_eq!(control.choices[0].label, "Gold");
    assert_eq!(control.choices[1].label, "Gems");
    let amount = field(&gems, "signedAmount");
    assert_eq!(amount.label, "Payment Amount");
    assert_eq!(amount.value, 250);
    assert_eq!(amount.minimum, 1);
    assert_eq!(roundtrip(&gems, [-250, 0, 0, 41, 0]), [-250, 0, 0, 41, 0]);
}

#[test]
fn currency_toggle_reuses_amount_and_preserves_branch_words() {
    let snapshot = ProjectSnapshot::new_authored(StableId("payment-toggle".into()));
    let base = [75, 1, 2, 3, 4];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("paymentCurrency".into(), 1);
    authoring.selections.insert("signedAmount".into(), 125);
    let gems = describe(&snapshot, base, authoring.clone());
    assert_eq!(gems.authoring.resolved_values["signedAmount"], -125);
    assert_eq!(roundtrip(&gems, base), [-125, 1, 2, 3, 4]);

    authoring.modes.insert("paymentCurrency".into(), 0);
    let gold = describe(&snapshot, base, authoring);
    assert_eq!(gold.authoring.resolved_values["signedAmount"], 125);
    assert_eq!(roundtrip(&gold, base), [125, 1, 2, 3, 4]);
}

#[test]
fn ambiguous_zero_and_minimum_imports_remain_exact_until_authored() {
    let snapshot = ProjectSnapshot::new_authored(StableId("payment-imports".into()));
    let zero = describe(&snapshot, [0, 0, 0, 0, 0], Default::default());
    assert_eq!(zero.authoring.controls[0].value, 1);
    assert_eq!(roundtrip(&zero, [0, 0, 0, 0, 0]), [0, 0, 0, 0, 0]);

    let minimum = describe(&snapshot, [i16::MIN, 0, 0, 0, 0], Default::default());
    assert!(minimum.authoring.controls[0].active_fields.is_empty());
    assert!(minimum.authoring.controls[0].display.contains("retained"));
    assert_eq!(
        roundtrip(&minimum, [i16::MIN, 0, 0, 0, 0]),
        [i16::MIN, 0, 0, 0, 0]
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
            action_identity: "realmz.action.33".into(),
            target_native_id: 33,
            values: decode_form_values("gold", words).unwrap(),
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
    let mut values = description.authoring.resolved_values.clone();
    for field in description.fields.iter().filter(|field| field.preserved) {
        values.remove(&field.key);
    }
    encode_form_values("gold", &values, Some(base)).unwrap()
}
