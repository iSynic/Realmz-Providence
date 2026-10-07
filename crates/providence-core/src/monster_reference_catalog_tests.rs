use super::*;
use crate::codecs::{
    ITEM_RECORD_BYTES, SCENARIO_ITEM_DEFINITIONS, SPELL_RECORD_BYTES, decode_scenario_item_rules,
    decode_standard_spells,
};
use crate::model::{BlobId, SourcedItemRule, StableId};

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("reference-catalog".into()));
    let mut rule = decode_scenario_item_rules(
        &vec![0; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS],
        None,
        BlobId("fixture:item".into()),
        None,
    )
    .unwrap()
    .rules
    .remove(0);
    rule.definition.classic_id = 93;
    rule.definition.id = StableId("classic.item.93".into());
    rule.definition.name = "Stock spear".into();
    snapshot.item_rules.push(SourcedItemRule {
        definition: rule.definition.clone(),
        source: "catalog fixture".into(),
        source_blob: BlobId("fixture:item".into()),
        text_source_blob: BlobId("fixture:text".into()),
    });
    rule.definition.name = "Scenario spear".into();
    snapshot.scenario_item_rules.push(rule);
    snapshot.standard_spells =
        decode_standard_spells(&vec![0; SPELL_RECORD_BYTES * 130], None).spells;
    snapshot
}

fn query(field: &str, current: i16, search: &str) -> MonsterReferenceQuery {
    MonsterReferenceQuery {
        field: field.into(),
        current_value: current,
        search: search.into(),
        ownership: "all".into(),
        show_unavailable: true,
        offset: 0,
        seek_current: false,
        limit: 128,
    }
}

#[test]
fn item_overlay_signed_identity_collision_and_no_results_remain_exact() {
    let mut snapshot = snapshot();
    let page = monster_reference_choices(&snapshot, None, &query("items.5", -93, "-93")).unwrap();
    assert_eq!(page.total, 1);
    let choice = &page.items[0];
    assert_eq!(
        (
            choice.value,
            choice.label.as_str(),
            choice.ownership.as_str()
        ),
        (-93, "Scenario spear", "scenario")
    );
    assert!(choice.available);
    assert_eq!(choice.target_identity.as_deref(), Some("classic.item.93"));
    let mut collision = snapshot.scenario_item_rules[0].clone();
    collision.definition.id = StableId("custom.item.93".into());
    snapshot.scenario_item_rules.push(collision);
    let page = monster_reference_choices(&snapshot, None, &query("items.5", -93, "-93")).unwrap();
    assert_eq!(page.total, 2);
    assert!(
        page.items
            .iter()
            .all(|choice| !choice.available && choice.target_identity.is_none())
    );
    assert_eq!(
        monster_reference_choices(&snapshot, None, &query("items.5", 93, "no-such-item"))
            .unwrap()
            .total,
        0
    );
    let weapon = monster_reference_choices(&snapshot, None, &query("weapon", -93, "-93")).unwrap();
    assert!(weapon.items.iter().all(|choice| !choice.available));
}

#[test]
fn complete_catalog_search_paging_current_and_preserved_signed_spells_do_not_mutate() {
    let mut snapshot = snapshot();
    snapshot.standard_spells[100].definition.name = "Needle across later pages".into();
    let current = snapshot.standard_spells[100].definition.classic_id;
    let before = snapshot.clone();
    let search =
        monster_reference_choices(&snapshot, None, &query("spells.9", current, "Needle")).unwrap();
    assert_eq!(search.items[0].value, current);
    assert!(search.items[0].available);
    let mut seeking = query("spells.9", current, "");
    seeking.limit = 16;
    seeking.seek_current = true;
    let page = monster_reference_choices(&snapshot, None, &seeking).unwrap();
    assert!(
        page.offset > 0
            && page.items.len() <= 16
            && page.items.iter().any(|choice| choice.value == current)
    );
    for raw in [-current, i16::MIN] {
        let page =
            monster_reference_choices(&snapshot, None, &query("spells.9", raw, &raw.to_string()))
                .unwrap();
        assert_eq!(page.total, 1);
        assert!(!page.items[0].available && page.items[0].value == raw);
    }
    assert!(monster_reference_choices(&snapshot, None, &query("spells.10", 0, "")).is_err());
    assert_eq!(snapshot, before);
}

#[test]
fn monster_weapon_rules_keep_signed_storage_and_runtime_categories_distinct_from_items() {
    let snapshot = snapshot();
    for value in -9..=-1 {
        let page =
            monster_reference_choices(&snapshot, None, &query("weapon", value, &value.to_string()))
                .unwrap();
        let selected = page.items.iter().find(|row| row.value == value).unwrap();
        assert!(selected.available && selected.identity == format!("random-weapon:{value}"));
        assert!(selected.target_identity.is_none());
    }
    for (stored, display) in [(-128, 128), (-3, 253), (-2, -2), (-1, -1), (127, 127)] {
        let page = monster_reference_choices(
            &snapshot,
            None,
            &query("requiredWeapon", stored, &stored.to_string()),
        )
        .unwrap();
        let selected = page.items.iter().find(|row| row.value == stored).unwrap();
        assert_eq!(selected.identity, format!("required-weapon:{display}"));
        assert!(selected.available && selected.target_identity.is_none());
    }
    let mut all = query("requiredWeapon", 0, "");
    all.limit = 128;
    let page = monster_reference_choices(&snapshot, None, &all).unwrap();
    assert_eq!(page.total, 256);
    all.offset = 128;
    let last = monster_reference_choices(&snapshot, None, &all).unwrap();
    assert_eq!(last.items.len(), 128);
    assert_eq!(
        page.items
            .iter()
            .chain(&last.items)
            .filter(|row| row.value == 0)
            .count(),
        1
    );
    assert!(
        page.items
            .iter()
            .chain(&last.items)
            .all(|row| row.available)
    );
}

#[test]
fn monster_replacement_catalog_excludes_zero_inactive_and_non_normal_rows() {
    use crate::model::{MonsterSet, NativeRecordId};
    let mut snapshot = snapshot();
    let mut active = crate::session::new_monster_template(NativeRecordId(7)).unwrap();
    active.display_name = "Replacement Guardian".into();
    let mut inactive = active.clone();
    inactive.hit_dice = 0;
    inactive.native_id = NativeRecordId(8);
    let mut zero = active.clone();
    zero.native_id = NativeRecordId(0);
    snapshot.monster_sets.push(MonsterSet {
        set_id: 0,
        native_path: "Data MD".into(),
        monsters: vec![active, inactive.clone(), zero],
    });
    snapshot.monster_sets.push(MonsterSet {
        set_id: -1,
        native_path: "Data MD1".into(),
        monsters: vec![inactive],
    });
    let page =
        monster_reference_choices(&snapshot, None, &query("replacementMonster", 0, "")).unwrap();
    let available = page
        .items
        .iter()
        .filter(|row| row.available)
        .collect::<Vec<_>>();
    assert_eq!(available.len(), 1);
    assert_eq!(available[0].value, 7);
    assert_eq!(available[0].label, "Replacement Guardian");
    assert!(
        !page
            .items
            .iter()
            .find(|row| row.value == 0)
            .unwrap()
            .available
    );
}
