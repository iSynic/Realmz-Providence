use super::references::references;
use crate::model::{NativeRecordId, ProjectSnapshot, ScenarioMessage, StableId};
use crate::monster_reference_catalog::MonsterReferenceQuery;

#[test]
fn signed_reference_search_seek_current_paging_and_unavailable_values_are_consistent() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("region-pickers".into()));
    for id in 1..=200 {
        snapshot.messages.push(ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("Village arrival {id}"),
            authored: true,
        });
    }
    let mut query = MonsterReferenceQuery {
        field: "textId".into(),
        current_value: -123,
        search: String::new(),
        ownership: "all".into(),
        show_unavailable: false,
        offset: 0,
        seek_current: true,
        limit: 64,
    };
    let page = references(&snapshot, None, &query).unwrap();
    assert_eq!(page.total, 401);
    assert!(
        page.items
            .iter()
            .any(|row| row.value == -123 && row.target_identity.as_deref() == Some("message:123"))
    );
    query.search = "-123".into();
    query.seek_current = false;
    let signed = references(&snapshot, None, &query).unwrap();
    assert_eq!(signed.items[0].value, -123);
    query.search = "123".into();
    let positive = references(&snapshot, None, &query).unwrap();
    assert_eq!(positive.items[0].value, 123);
    assert_ne!(positive.items[0].identity, signed.items[0].identity);
    query.search = "village arrival 42".into();
    assert!(
        references(&snapshot, None, &query)
            .unwrap()
            .items
            .iter()
            .all(|row| row.available)
    );
    check_unavailable_and_empty(&snapshot, query);
}

fn check_unavailable_and_empty(snapshot: &ProjectSnapshot, mut query: MonsterReferenceQuery) {
    query.current_value = -321;
    query.search.clear();
    query.seek_current = true;
    assert!(
        references(snapshot, None, &query)
            .unwrap()
            .items
            .iter()
            .any(|row| row.value == -321 && !row.available)
    );
    query.search = "no match".into();
    assert!(references(snapshot, None, &query).unwrap().items.is_empty());
    query.field = "battleLow".into();
    query.current_value = 0;
    query.search.clear();
    query.show_unavailable = true;
    let missing_battle = references(snapshot, None, &query).unwrap();
    assert!(!missing_battle.items[0].available);
    assert_ne!(missing_battle.items[0].identity, "none");
}
