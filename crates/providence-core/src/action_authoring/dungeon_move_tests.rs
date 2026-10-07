use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn describe(words: [i16; 5]) -> ActionFormDescription {
    describe_action_form(
        &ProjectSnapshot::new_authored(StableId("dungeon-move".into())),
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.37".into(),
            target_native_id: 37,
            values: decode_form_values("dungeon-move", words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}

#[test]
fn dungeon_entry_exposes_named_heading_and_view_combinations() {
    // Classic 491816ad newland.c:2673-2684 reads abs(word 4) as heading and a
    // negative sign as the 3D-only flag, but only on dungeon entry.
    let entry = describe([0, 3, 12, 9, -2]);
    let level = &entry.fields[1];
    let heading = &entry.fields[4];
    assert_eq!(level.label, "Dungeon Level");
    assert_eq!(heading.control, FormControl::Choice);
    assert_eq!(heading.choices.len(), 8);
    assert_eq!(heading.choices[5].label, "East · 3D view only");
    assert!(heading.editable);
    assert_eq!(
        encode_form_values("dungeon-move", &entry.authoring.resolved_values, None).unwrap(),
        [0, 3, 12, 9, -2]
    );
}

#[test]
fn land_return_preserves_inactive_heading_and_unknown_imports() {
    let returning = describe([1, 4, 8, 6, -27]);
    assert_eq!(returning.fields[1].label, "Land Level");
    assert!(!returning.fields[4].editable);
    assert!(returning.fields[4].availability_reason.is_some());
    assert_eq!(
        encode_form_values(
            "dungeon-move",
            &returning.authoring.resolved_values,
            Some([1, 4, 8, 6, -27]),
        )
        .unwrap(),
        [1, 4, 8, 6, -27]
    );

    let imported = describe([0, 7, 2, 5, 27]);
    assert_eq!(imported.fields[4].value, 27);
    assert_eq!(
        encode_form_values("dungeon-move", &imported.authoring.resolved_values, None).unwrap(),
        [0, 7, 2, 5, 27]
    );
}
