use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:2274-2324 stores word 2 directly in
// randlevel.percent. textbox-time.c:377 uses positive values as chances in
// 10,000, while buttonchoice.c:456 routes negative values through the
// invisible-encounter path. Divinity names zero and -1 as the canonical modes.
#[test]
fn random_encounter_frequency_uses_named_modes_instead_of_magic_numbers() {
    let snapshot = ProjectSnapshot::new_authored(StableId("random-region".into()));
    let chance = describe(&snapshot, 23, [2, 3, 250, -1, -1], Default::default());
    let control = &chance.authoring.controls[0];
    assert_eq!(control.label, "Random Encounters");
    assert_eq!(control.value, 0);
    assert_eq!(
        control
            .choices
            .iter()
            .map(|choice| choice.label.as_str())
            .collect::<Vec<_>>(),
        [
            "Use encounter chance",
            "Disable encounters",
            "Invisible encounter"
        ]
    );
    let field = field(&chance, "percent");
    assert_eq!(field.label, "Encounter Chance");
    assert_eq!((field.minimum, field.maximum), (1, 10_000));
    assert_eq!(roundtrip(&chance, [2, 3, 250, -1, -1]), [2, 3, 250, -1, -1]);
}

#[test]
fn named_frequency_changes_only_the_encounter_word() {
    let snapshot = ProjectSnapshot::new_authored(StableId("random-region-mode".into()));
    let base = [4, 5, 625, 12, 19];
    let disabled = describe(&snapshot, -23, base, mode(1));
    assert_eq!(roundtrip(&disabled, base), [4, 5, 0, 12, 19]);
    assert_eq!(field(&disabled, "level").label, "Dungeon Level");

    let invisible = describe(&snapshot, -23, base, mode(2));
    assert_eq!(roundtrip(&invisible, base), [4, 5, -1, 12, 19]);

    let mut chance = mode(0);
    chance.selections.insert("percent".into(), 777);
    let authored = describe(&snapshot, -23, base, chance);
    assert_eq!(roundtrip(&authored, base), [4, 5, 777, 12, 19]);
}

#[test]
fn unsupported_negative_import_is_preserved_until_an_author_chooses_a_mode() {
    let snapshot = ProjectSnapshot::new_authored(StableId("random-region-import".into()));
    let base = [1, 2, -9, 7, 8];
    let imported = describe(&snapshot, 23, base, Default::default());
    let control = &imported.authoring.controls[0];
    assert_eq!(control.value, 3);
    assert!(control.active_fields.is_empty());
    assert!(control.display.contains("retained unchanged"));
    assert_eq!(roundtrip(&imported, base), base);

    let mut invalid = mode(0);
    invalid.selections.insert("percent".into(), 10_001);
    let invalid = describe(&snapshot, 23, base, invalid);
    assert_eq!(
        invalid.authoring.errors,
        ["Encounter chance must be between 1 and 10,000."]
    );
}

fn mode(value: i16) -> ActionAuthoringInput {
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("encounterFrequency".into(), value);
    authoring
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
            target_native_id: 23,
            values: decode_form_values("random-region-mutation", words).unwrap(),
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
    encode_form_values("random-region-mutation", &values, Some(base)).unwrap()
}
