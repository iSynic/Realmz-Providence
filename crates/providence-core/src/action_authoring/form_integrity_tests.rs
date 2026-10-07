use super::*;
use crate::model::{ProjectSnapshot, StableId};
use std::collections::BTreeMap;

#[test]
fn repeated_donor_placeholders_decode_as_distinct_preserved_words() {
    let decoded = decode_form_values("fatigue", [3, 101, 75, -303, 404]).unwrap();
    assert_eq!(decoded["mode"], 3);
    assert_eq!(decoded["unused1"], 101);
    assert_eq!(decoded["percent"], 75);
    assert_eq!(decoded["unused3"], -303);
    assert_eq!(decoded["unused4"], 404);

    let snapshot = ProjectSnapshot::new_authored(StableId("distinct-placeholders".into()));
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.68".into(),
            target_native_id: 68,
            values: decoded,
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap();
    for (key, value) in [("unused1", 101), ("unused3", -303), ("unused4", 404)] {
        let field = description
            .fields
            .iter()
            .find(|field| field.key == key)
            .unwrap();
        assert_eq!(field.value, value);
        assert!(field.preserved && !field.editable);
    }
}

#[test]
fn semantic_and_write_layers_agree_on_every_preserved_word() {
    let catalog = catalog();
    for entry in semantic_inventory() {
        let Some(form_id) = entry.form_id.as_deref() else {
            continue;
        };
        let form = catalog
            .forms
            .iter()
            .find(|form| form.identity == form_id)
            .unwrap();
        for field in &entry.fields {
            assert_eq!(
                form.fields[usize::from(field.index)].preserved,
                field.preserved,
                "preservation drift for opcode {} word {}",
                entry.opcode,
                field.index
            );
        }
    }
}

#[test]
fn xap_context_allows_combat_macro_actions_but_not_encounter_exit() {
    let snapshot = ProjectSnapshot::new_authored(StableId("macro-availability".into()));
    let describe = |identity: &str, opcode| {
        describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: identity.into(),
                target_native_id: opcode,
                values: action_definition(identity)
                    .and_then(|action| action.form_id)
                    .and_then(|form| decode_form_values(&form, [0; 5]))
                    .unwrap_or_default(),
                secondary_values: BTreeMap::new(),
                context: ActionFormContext {
                    script_kind: Some("extra-action-point".into()),
                    ..Default::default()
                },
            },
        )
        .unwrap()
    };

    let battle_macro = describe("realmz.action.126", 126);
    assert!(battle_macro.available);
    assert!(battle_macro.fields.iter().any(|field| field.editable));
    let encounter_exit = describe("realmz.action.34", 34);
    assert!(!encounter_exit.available);
}
