use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn describe(opcode: i16, words: [i16; 5]) -> ActionFormDescription {
    let identity = format!("realmz.action.{opcode}");
    let action = action_definition(&identity).unwrap();
    describe_action_form(
        &ProjectSnapshot::new_authored(StableId("authoring-flow".into())),
        &ActionFormDescribeQuery {
            action_identity: identity,
            target_native_id: 0,
            values: action
                .form_id
                .and_then(|id| decode_form_values(&id, words))
                .unwrap_or_default(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                script_kind: Some("extra-action-point".into()),
                ..Default::default()
            },
        },
    )
    .unwrap()
}

#[test]
fn author_questions_precede_dependent_routing_and_modes() {
    for (opcode, first, second) in [
        (3, "promptB", "replyPolarity"),
        (3, "replyPolarity", "branchMode"),
        (40, "condition", "expectedState"),
        (40, "expectedState", "branchMode"),
        (12, "isDungeon", "level"),
        (31, "attributeFlag", "abilityOrAttribute"),
        (67, "minimumCharges", "branchMode"),
        (76, "threshold", "branchMode"),
        (92, "shapeMode", "shapeX1"),
    ] {
        let form = describe(opcode, [0; 5]);
        let position = |key| {
            form.fields
                .iter()
                .position(|field| field.key == key)
                .unwrap()
        };
        assert!(
            position(first) < position(second),
            "code {opcode}: {first} before {second}"
        );
    }
}

#[test]
fn presentation_order_keeps_all_catalog_word_identities_and_values() {
    for action in catalog().actions {
        let form = describe(action.opcode, [0; 5]);
        if let Some(form_id) = action.form_id {
            let words = [101, 202, 303, 404, 505];
            let storage = decode_form_values(&form_id, words).unwrap();
            for field in form
                .fields
                .iter()
                .filter(|field| field.row == FormRow::Primary)
            {
                if let Some(index) = field.index {
                    assert_eq!(storage[&field.key], words[usize::from(index)]);
                    assert_eq!(form.authoring.resolved_values[&field.key], field.value);
                }
            }
        }
    }
    let form = describe(40, [1, 1, 12, 3, 327]);
    let values = form
        .fields
        .iter()
        .filter(|field| !field.preserved)
        .map(|field| (field.key.clone(), field.value))
        .collect();
    assert_eq!(
        encode_form_values("party-condition-branch", &values, Some([1, 1, 12, 3, 327])).unwrap(),
        [1, 1, 12, 3, 327]
    );
}

#[test]
fn branch_names_and_signed_actions_remain_distinct() {
    assert_eq!(
        action_definition("realmz.action.40").unwrap().label,
        "Branch On Party Condition"
    );
    assert_eq!(
        action_definition("realmz.action.81").unwrap().label,
        "Branch On Character Condition"
    );
    for code in [-23, -14, 14, 23] {
        assert_eq!(
            action_definition(&format!("realmz.action.{code}"))
                .unwrap()
                .opcode,
            code
        );
    }
}

pub(super) fn named<'a>(
    description: &'a ActionFormDescription,
    key: &str,
) -> &'a DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}

pub(super) fn word(description: &ActionFormDescription, index: usize) -> &DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.index.map(usize::from) == Some(index))
        .unwrap()
}
