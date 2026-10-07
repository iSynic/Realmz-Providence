use super::*;
use crate::model::{NativeRecordId, ProjectSnapshot, ShopRecord, StableId};

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("current-shop".into()));
    for id in [0, 33] {
        snapshot.shops.push(ShopRecord {
            identity: StableId(format!("shop:{id}")),
            native_id: NativeRecordId(id),
            item_ids: vec![0; 1000],
            quantities: vec![0; 1000],
            inflation: 100,
            authored: false,
        });
    }
    snapshot
}

fn query(shop: i16) -> ActionFormDescribeQuery {
    ActionFormDescribeQuery {
        action_identity: "realmz.action.51".into(),
        target_native_id: 7,
        values: decode_form_values("shop-mutation", [shop, -5, 12, 3, 91]).unwrap(),
        secondary_values: Default::default(),
        context: Default::default(),
    }
}

#[test]
fn alter_shop_zero_uses_runtime_current_shop_not_record_zero() {
    // newland.c:3183 calls loadshop(word0); loadsavedgame.c:837 only changes currentshop if nonzero.
    let snapshot = snapshot();
    let description = describe_action_form(&snapshot, &query(0)).unwrap();
    let control = &description.authoring.controls[0];
    assert_eq!(control.choices[0].label, "Current shop");
    assert_eq!(control.value, 0);
    assert!(control.active_fields.is_empty());
    assert!(control.display.contains("caller"));
    let field = &description.fields[0];
    assert_eq!(field.uses[0].role, ActionFieldRole::ContextualReference);
    assert!(field.target_kind.is_none() && field.preview.is_none());
    assert!(
        settings_target_fields(51, [0, -5, 12, 3, 91], false)
            .iter()
            .all(|field| field.index != 0)
    );
    let specific = describe_action_form(&snapshot, &query(33)).unwrap();
    assert_eq!(
        specific.fields[0].preview.as_ref().unwrap().identity.0,
        "shop:33"
    );
    let negative = describe_action_form(&snapshot, &query(-33)).unwrap();
    assert_eq!(negative.unresolved_field_count, 1);
    assert!(negative.fields[0].preview.is_none());
    assert_eq!(negative.authoring.resolved_values["shop"], -33);
}

#[test]
fn named_specific_shop_requires_a_valid_selection_and_keeps_other_words() {
    let mut query = query(0);
    query
        .context
        .authoring
        .modes
        .insert("shopSelection".into(), 1);
    let missing = describe_action_form(&snapshot(), &query).unwrap();
    assert_eq!(missing.authoring.errors.len(), 1);
    assert_eq!(missing.fields[0].target_kind, Some(ActionTargetKind::Shop));
    query.context.authoring.selections.insert("shop".into(), 33);
    let selected = describe_action_form(&snapshot(), &query).unwrap();
    assert!(selected.authoring.errors.is_empty());
    let mut expected = query.values.clone();
    expected.insert("shop".into(), 33);
    assert_eq!(selected.authoring.resolved_values, expected);
    query
        .context
        .authoring
        .modes
        .insert("shopSelection".into(), 0);
    let current = describe_action_form(&snapshot(), &query).unwrap();
    assert_eq!(current.authoring.resolved_values, query.values);
    query
        .context
        .authoring
        .modes
        .insert("shopSelection".into(), 1);
    assert_eq!(
        describe_action_form(&snapshot(), &query).unwrap().authoring,
        selected.authoring
    );
}
