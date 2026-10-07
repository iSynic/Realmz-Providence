use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:568-581 substitutes maxmon for zero, compares
// monster.name to word 0, and includes allied monsters when word 4 is nonzero.
#[test]
fn zero_count_and_monster_tag_are_named_without_false_record_links() {
    let snapshot = ProjectSnapshot::new_authored(StableId("destroy-all".into()));
    let description = describe(&snapshot, [17, 0, -9, 88, 0], Default::default());
    let control = &description.authoring.controls[0];
    assert_eq!(control.label, "Monsters To Destroy");
    assert_eq!(control.value, 0);
    assert!(control.active_fields.is_empty());
    assert_eq!(control.choices[0].label, "All matching monsters");
    assert_eq!(field(&description, "monsterId").label, "Monster Name Tag");
    assert!(field(&description, "monsterId").target_kind.is_none());
    assert!(description.summary.contains("All matching monsters"));
    assert_eq!(
        roundtrip(&description, [17, 0, -9, 88, 0]),
        [17, 0, -9, 88, 0]
    );
}

#[test]
fn limited_count_and_allied_choice_preserve_classic_nonzero_flags() {
    let snapshot = ProjectSnapshot::new_authored(StableId("destroy-limited".into()));
    let imported = describe(&snapshot, [17, 7, -9, 88, 4], Default::default());
    assert_eq!(imported.authoring.controls[0].value, 1);
    assert_eq!(field(&imported, "maxCount").minimum, 1);
    assert_eq!(field(&imported, "maxCount").maximum, 100);
    assert_eq!(
        field(&imported, "maxCount").units.as_deref(),
        Some("monsters")
    );
    assert_eq!(field(&imported, "includeTraitorSide").choices[1].value, 4);
    assert_eq!(roundtrip(&imported, [17, 7, -9, 88, 4]), [17, 7, -9, 88, 4]);

    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("destroyCountMode".into(), 1);
    authoring.selections.insert("maxCount".into(), 12);
    let limited = describe(&snapshot, [17, 0, -9, 88, 0], authoring);
    assert_eq!(limited.authoring.resolved_values["maxCount"], 12);
    assert_eq!(roundtrip(&limited, [17, 0, -9, 88, 0]), [17, 12, -9, 88, 0]);
}

#[test]
fn negative_import_is_retained_until_a_supported_count_is_selected() {
    let snapshot = ProjectSnapshot::new_authored(StableId("destroy-negative".into()));
    let base = [17, -3, -9, 88, 0];
    let imported = describe(&snapshot, base, Default::default());
    assert_eq!(imported.authoring.controls[0].value, 2);
    assert!(
        imported.authoring.controls[0]
            .display
            .contains("destroys no monsters")
    );
    assert_eq!(roundtrip(&imported, base), base);

    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("destroyCountMode".into(), 1);
    let unresolved = describe(&snapshot, base, authoring);
    assert!(!unresolved.authoring.errors.is_empty());
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.125".into(),
            target_native_id: 125,
            values: decode_form_values("destroy-related", words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                script_kind: Some("extra-action-point".into()),
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
    encode_form_values("destroy-related", &values, Some(base)).unwrap()
}
