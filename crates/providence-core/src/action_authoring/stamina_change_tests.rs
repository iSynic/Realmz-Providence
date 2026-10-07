use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:1941-1961 sends multiplier * randrange(low, high)
// to heal(); opcode 15 applies it to track[] and opcode 16 to the whole party.
#[test]
fn both_stamina_actions_expose_named_heal_and_damage_directions() {
    let snapshot = ProjectSnapshot::new_authored(StableId("stamina-directions".into()));
    for opcode in [15, 16] {
        let heal = describe(&snapshot, opcode, [2, 3, 8, 91, 44], Default::default());
        assert_eq!(heal.authoring.controls[0].value, 0);
        assert_eq!(heal.authoring.controls[0].choices[0].label, "Heal stamina");
        assert_eq!(field(&heal).value, 2);

        let damage = describe(&snapshot, opcode, [-2, 3, 8, 91, 44], Default::default());
        assert_eq!(damage.authoring.controls[0].value, 1);
        assert_eq!(field(&damage).value, 2);
        assert_eq!(roundtrip(&damage, [-2, 3, 8, 91, 44]), [-2, 3, 8, 91, 44]);
    }
}

#[test]
fn changing_direction_preserves_magnitude_and_unrelated_words() {
    let snapshot = ProjectSnapshot::new_authored(StableId("stamina-toggle".into()));
    let base = [4, 3, 8, 91, 44];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("staminaDirection".into(), 1);
    authoring.selections.insert("multiplier".into(), 6);
    let damage = describe(&snapshot, 15, base, authoring.clone());
    assert_eq!(damage.authoring.resolved_values["multiplier"], -6);
    assert_eq!(roundtrip(&damage, base), [-6, 3, 8, 91, 44]);

    authoring.modes.insert("staminaDirection".into(), 0);
    let heal = describe(&snapshot, 15, base, authoring);
    assert_eq!(heal.authoring.resolved_values["multiplier"], 6);
    assert_eq!(roundtrip(&heal, base), [6, 3, 8, 91, 44]);
}

#[test]
fn minimum_signed_import_is_retained_until_explicitly_replaced() {
    let snapshot = ProjectSnapshot::new_authored(StableId("stamina-min".into()));
    let base = [i16::MIN, 3, 8, 91, 44];
    let imported = describe(&snapshot, 16, base, Default::default());
    assert!(imported.authoring.controls[0].active_fields.is_empty());
    assert!(imported.authoring.controls[0].display.contains("retained"));
    assert_eq!(roundtrip(&imported, base), base);
}

#[test]
fn random_magnitude_endpoints_are_nonnegative_without_rewriting_imports() {
    let snapshot = ProjectSnapshot::new_authored(StableId("stamina-range".into()));
    for opcode in [15, 16] {
        let ordinary = describe(&snapshot, opcode, [2, 3, 8, 91, 44], Default::default());
        assert_eq!(field_by_key(&ordinary, "low").minimum, 0);
        assert_eq!(field_by_key(&ordinary, "high").minimum, 0);

        let base = [2, -3, -8, 91, 44];
        let imported = describe(&snapshot, opcode, base, Default::default());
        assert_eq!(field_by_key(&imported, "low").value, -3);
        assert_eq!(field_by_key(&imported, "high").value, -8);
        assert_eq!(roundtrip(&imported, base), base);
    }
}

fn describe(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: format!("realmz.action.{opcode}"),
            target_native_id: opcode,
            values: decode_form_values("damage-heal", words).unwrap(),
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
        .find(|field| field.key == "multiplier")
        .unwrap()
}

fn field_by_key<'a>(description: &'a ActionFormDescription, key: &str) -> &'a DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}

fn roundtrip(description: &ActionFormDescription, base: [i16; 5]) -> [i16; 5] {
    encode_form_values(
        "damage-heal",
        &description.authoring.resolved_values,
        Some(base),
    )
    .unwrap()
}
