use super::*;
use crate::model::{ProjectSnapshot, StableId};

#[test]
fn primary_random_rectangle_fields_use_their_actual_units() {
    let description = describe_action_form(
        &ProjectSnapshot::new_authored(StableId("random-shape-units".into())),
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.92".into(),
            target_native_id: 92,
            values: decode_form_values("random-region-shape-mutation", [3, 4, 0, 125, -1]).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap();

    assert_eq!(field(&description, "level").units, None);
    assert_eq!(field(&description, "rect").units, None);
    assert_eq!(
        field(&description, "percentDelta").units.as_deref(),
        Some("chance points per 10,000")
    );
    for key in ["shapeX1", "shapeY1", "shapeX2", "shapeY2"] {
        assert_eq!(field(&description, key).units.as_deref(), Some("map cells"));
    }
    assert_eq!(field(&description, "shapeFlags").units, None);
}

fn field<'a>(description: &'a ActionFormDescription, key: &str) -> &'a DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}
