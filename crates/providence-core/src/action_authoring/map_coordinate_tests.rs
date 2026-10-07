use super::*;
use crate::model::{ProjectSnapshot, StableId};

#[test]
fn direct_map_coordinates_use_classic_cell_bounds_without_links() {
    let snapshot = ProjectSnapshot::new_authored(StableId("map-coordinate-bounds".into()));
    for (identity, form_id, words, coordinate_keys) in [
        (
            "realmz.action.12",
            "tile-mutation",
            [0, 89, 0, 7, 0],
            ["xOrDungeonY", "yOrDungeonX"],
        ),
        (
            "realmz.action.37",
            "dungeon-move",
            [0, 3, 89, 0, -2],
            ["x", "y"],
        ),
    ] {
        let description = describe(&snapshot, identity, form_id, words);
        for key in coordinate_keys {
            let coordinate = field(&description, key);
            assert_eq!(coordinate.minimum, 0);
            assert_eq!(coordinate.maximum, 89);
            assert!(coordinate.target_kind.is_none());
            assert!(coordinate.preview.is_none());
        }
        assert_eq!(roundtrip(&description, form_id, words), words);
    }
}

#[test]
fn imported_out_of_range_map_coordinates_remain_exact_until_edited() {
    let snapshot = ProjectSnapshot::new_authored(StableId("map-coordinate-import".into()));
    for (identity, form_id, words) in [
        ("realmz.action.12", "tile-mutation", [0, -7, 90, 7, 0]),
        ("realmz.action.37", "dungeon-move", [0, 3, -7, 90, -2]),
    ] {
        let description = describe(&snapshot, identity, form_id, words);
        assert_eq!(roundtrip(&description, form_id, words), words);
    }
}

fn describe(
    snapshot: &ProjectSnapshot,
    action_identity: &str,
    form_id: &str,
    words: [i16; 5],
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: action_identity.into(),
            target_native_id: 12,
            values: decode_form_values(form_id, words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
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

fn roundtrip(description: &ActionFormDescription, form_id: &str, base: [i16; 5]) -> [i16; 5] {
    let mut values = description.authoring.resolved_values.clone();
    for field in description.fields.iter().filter(|field| field.preserved) {
        values.remove(&field.key);
    }
    encode_form_values(form_id, &values, Some(base)).unwrap()
}
