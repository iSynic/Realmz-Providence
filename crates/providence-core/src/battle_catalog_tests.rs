use super::*;
use crate::codecs::{MONSTER_RECORD_BYTES, decode_monster_set};
use crate::model::{ExtraActionPoint, NativeRecordId, ScenarioMessage, StableId};

fn snapshot() -> ProjectSnapshot {
    let mut result = ProjectSnapshot::new_authored(StableId("battle-catalog".into()));
    for id in 0..880 {
        result.messages.push(ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("String {id}: Royal Guard attack"),
            authored: true,
        });
    }
    for id in 0..=2 {
        result.extra_action_points.push(ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            actions: vec![],
            classic_door_id: id as i32,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
        });
    }
    for (set_id, path) in [(0, "Data MD"), (1, "Data MD1"), (-1, "Data MD-1")] {
        let mut bytes = vec![0; MONSTER_RECORD_BYTES * 3];
        bytes[MONSTER_RECORD_BYTES] = 2;
        let mut set = decode_monster_set(&bytes, path, set_id);
        set.monsters[1].display_name = "Royal Guard".into();
        result.monster_sets.push(set);
    }
    result
}

fn query(field: &str, value: i16) -> MonsterReferenceQuery {
    MonsterReferenceQuery {
        field: field.into(),
        current_value: value,
        search: String::new(),
        ownership: "all".into(),
        show_unavailable: false,
        offset: 0,
        seek_current: true,
        limit: 64,
    }
}

#[test]
fn macro_signed_identity_availability_and_zero_choice_survive_filtering() {
    let snapshot = snapshot();
    let mut query = query("battleMacro", 1);
    let initial = references(&snapshot, &query).unwrap();
    assert!(
        initial
            .items
            .iter()
            .any(|row| row.value == 1 && !row.available && row.reason.contains("positive"))
    );
    assert!(
        initial
            .items
            .iter()
            .any(|row| row.value == -1 && row.available)
    );
    query.search = "-1".into();
    let found = references(&snapshot, &query).unwrap();
    assert_eq!(found.items[0].identity, "battle-macro:-1");
    assert!(found.items[0].available);
    query.search = "Extra Action Point".into();
    query.show_unavailable = true;
    let found = references(&snapshot, &query).unwrap();
    assert!(
        found
            .items
            .iter()
            .any(|row| row.identity == "battle-macro:+1" && !row.available)
    );
    query.search.clear();
    query.current_value = 0;
    let zero = references(&snapshot, &query).unwrap();
    assert_eq!(zero.items[0].identity, "none");
    assert!(zero.items[0].available);
    assert!(
        zero.items
            .iter()
            .any(|row| row.identity == "battle-macro:+0" && !row.available)
    );
}

#[test]
fn strings_search_full_text_seek_current_and_page_complete_catalog() {
    let snapshot = snapshot();
    let mut query = query("messageBefore", 879);
    let found = references(&snapshot, &query).unwrap();
    assert!(found.items.iter().any(|row| row.value == 879));
    assert!(found.offset > 128);
    assert!(found.items.len() <= 64);
    query.search = "148".into();
    let found = references(&snapshot, &query).unwrap();
    assert_eq!(found.items[0].value, 148);
    query.search = "Royal Guard attack".into();
    query.seek_current = false;
    assert_eq!(references(&snapshot, &query).unwrap().total, 879);
    query.search = "absent text".into();
    assert!(references(&snapshot, &query).unwrap().items.is_empty());
}

#[test]
fn missing_difficulty_does_not_substitute_a_record_or_become_available_through_search() {
    let mut snapshot = snapshot();
    snapshot
        .monster_sets
        .iter_mut()
        .find(|set| set.set_id == -1)
        .unwrap()
        .monsters
        .remove(1);
    let mut query = PaletteQuery {
        set_id: -1,
        current_id: 1,
        retained_ids: vec![1, 218],
        only_retained: false,
        search: "royal".into(),
        show_unavailable: true,
        offset: 0,
        limit: 64,
    };
    let found = palette(&snapshot, &query).unwrap();
    assert_eq!(found.items.len(), 1);
    assert!(found.items[0].monster.is_none());
    assert!(!found.items[0].available);
    query.set_id = 0;
    query.search = "1".into();
    let found = palette(&snapshot, &query).unwrap();
    assert!(found.items[0].monster.is_some());
    assert!(!found.items[0].available);
    assert!(found.items[0].reason.contains("lacks Monster 1"));
    query.search = "218".into();
    let found = palette(&snapshot, &query).unwrap();
    assert_eq!(found.items[0].native_id, 218);
    assert!(!found.items[0].available);
}
