use super::*;
use crate::codecs::{MONSTER_RECORD_BYTES, decode_monster_set};
use crate::model::{ProjectSnapshot, StableId};

#[test]
fn monster_name_tags_offer_grouped_values_without_record_references() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-tags".into()));
    let mut set = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 3], "fixture", 0);
    for (monster, (name_id, display_name)) in
        set.monsters
            .iter_mut()
            .zip([(17, "Goblin"), (17, "Goblin Archer"), (42, "Ogre")])
    {
        monster.name_id = name_id;
        monster.display_name = display_name.into();
    }
    snapshot.monster_sets.push(set);

    let page = list_targets(
        &snapshot,
        &ActionTargetQuery {
            kind: ActionTargetKind::MonsterNameTag,
            search: String::new(),
            cursor: None,
            limit: 128,
            context: Default::default(),
        },
    )
    .unwrap();
    assert_eq!(page.total, 2);
    assert_eq!(page.items[0].value, 17);
    assert!(page.items[0].label.contains("Goblin"));
    assert!(page.items[0].detail.contains("2 monster definitions"));

    for (opcode, index) in [
        (87, Some(0)),
        (88, None),
        (120, Some(1)),
        (125, Some(0)),
        (127, None),
    ] {
        let description = describe_action_form(&snapshot, &query(opcode, index, 17)).unwrap();
        let field = description
            .fields
            .iter()
            .find(|field| field.index == index)
            .unwrap();
        assert_eq!(field.control, FormControl::Integer, "opcode {opcode}");
        assert_eq!(field.target_kind, None, "opcode {opcode}");
        assert_eq!(
            field.value_picker_kind,
            Some(ActionTargetKind::MonsterNameTag)
        );
        assert_eq!(field.value_picker_preview.as_ref().unwrap().value, 17);
        assert!(field.preview.is_none());
        assert!(field.uses.iter().all(|use_| use_.target_kind.is_none()));
    }
}

fn query(opcode: i16, index: Option<u8>, value: i16) -> ActionFormDescribeQuery {
    let action = action_definition_for_opcode(opcode).unwrap();
    let mut values: std::collections::BTreeMap<String, i16> = action
        .form_id
        .as_deref()
        .and_then(form_definition)
        .map(|form| {
            form.fields
                .iter()
                .map(|field| (canonical_field_key(&form.fields, field), 0))
                .collect()
        })
        .unwrap_or_default();
    if let Some(index) = index {
        let entry = semantic_inventory()
            .iter()
            .find(|entry| entry.opcode == opcode)
            .unwrap();
        let source = &entry.fields[usize::from(index)];
        values.insert(
            semantic_field_key(
                entry.form_id.as_deref().unwrap(),
                &source.internal_name,
                index,
            ),
            value,
        );
    }
    ActionFormDescribeQuery {
        action_identity: action.identity,
        target_native_id: if index.is_none() { value } else { 0 },
        values,
        secondary_values: Default::default(),
        context: Default::default(),
    }
}
