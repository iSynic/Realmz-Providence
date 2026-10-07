use crate::dispatch_result;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeSet;

fn catalog_session(count: usize) -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("catalog-protocol".into()));
    let mut normal = providence_core::codecs::decode_monster_set(
        &vec![0; MONSTER_RECORD_BYTES * count],
        "Data MD",
        0,
    );
    for record in &mut normal.monsters {
        record.display_name = format!("Guard {}", record.native_id.0);
    }
    snapshot.monster_sets.push(normal);
    EditorSession::new(snapshot)
}

#[test]
fn monster_catalog_filters_before_paging_and_exposes_only_inventory_fields() {
    let mut session = catalog_session(300);
    let before = session.snapshot().clone();
    let page = dispatch_result(
        &mut session,
        "monster.catalog",
        json!({"setId": 0, "query": "guard", "offset": 128, "limit": 999}),
    )
    .unwrap();
    let top_keys = page
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    assert_eq!(top_keys, BTreeSet::from(["catalog", "revision"]));
    let catalog = &page["catalog"];
    assert_eq!(catalog["total"], 300);
    assert_eq!(catalog["limit"], 128);
    assert_eq!(catalog["truncated"], true);
    let rows = catalog["items"].as_array().unwrap();
    assert_eq!(rows.len(), 128);
    assert_eq!(rows[0]["nativeId"], 128);
    assert_eq!(rows[127]["nativeId"], 255);
    let row_keys = rows[0]
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    assert_eq!(
        row_keys,
        BTreeSet::from([
            "nativeId",
            "displayName",
            "displaySetId",
            "hitDice",
            "armor",
            "agility",
            "iconId",
            "selectedIdentity",
            "availableSets",
            "normalNotOnMenu",
            "battlePlacements",
        ])
    );
    for (offset, expected_len, truncated) in [(256, 44, false), (300, 0, false)] {
        let tail = dispatch_result(
            &mut session,
            "monster.catalog",
            json!({
                "setId": 0, "query": "guard", "offset": offset, "limit": 128,
            }),
        )
        .unwrap();
        assert_eq!(
            tail["catalog"]["items"].as_array().unwrap().len(),
            expected_len
        );
        assert_eq!(tail["catalog"]["truncated"], truncated);
    }
    let filtered = dispatch_result(
        &mut session,
        "monster.catalog",
        json!({
            "setId": 0, "query": "  GUARD 299  ", "limit": 0,
        }),
    )
    .unwrap();
    assert_eq!(filtered["catalog"]["total"], 1);
    assert_eq!(filtered["catalog"]["limit"], 1);
    assert_eq!(filtered["catalog"]["items"][0]["nativeId"], 299);
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision().0, 0);
}

#[test]
fn monster_open_after_variant_switch_never_reuses_the_previous_detail() {
    let base = catalog_session(2);
    let mut snapshot = base.snapshot().clone();
    let mut mega =
        providence_core::codecs::decode_monster_set(&[0; MONSTER_RECORD_BYTES], "Data MD-1", -1);
    mega.monsters[0].display_name = "Mega guard".into();
    snapshot.monster_sets.push(mega);
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let opened = dispatch_result(
        &mut session,
        "monster.open",
        json!({
            "setId": -1, "nativeId": 0,
        }),
    )
    .unwrap();
    assert_eq!(opened["monster"]["displayName"], "Mega guard");
    let page = dispatch_result(
        &mut session,
        "monster.catalog",
        json!({
            "setId": -1, "query": "Guard 1",
        }),
    )
    .unwrap();
    let row = &page["catalog"]["items"][0];
    assert_eq!(row["displaySetId"], 0);
    assert_eq!(row["selectedIdentity"], Value::Null);
    assert!(
        dispatch_result(
            &mut session,
            "monster.open",
            json!({
                "setId": -1, "nativeId": 1,
            })
        )
        .is_err()
    );
    let normal = dispatch_result(
        &mut session,
        "monster.open",
        json!({
            "setId": 0, "nativeId": 1,
        }),
    )
    .unwrap();
    assert_eq!(normal["monster"]["displayName"], "Guard 1");
    assert_ne!(normal["monster"]["identity"], opened["monster"]["identity"]);
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision().0, 0);
}

#[test]
fn monster_catalog_is_bounded_and_never_substitutes_selected_set_detail() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-catalog".into()));
    snapshot
        .monster_sets
        .push(providence_core::codecs::decode_monster_set(
            &vec![0; MONSTER_RECORD_BYTES * 200],
            "Data MD",
            0,
        ));
    let mut session = EditorSession::new(snapshot.clone());
    let result = dispatch_result(
        &mut session,
        "monster.catalog",
        json!({"setId": -1, "limit": 999}),
    )
    .unwrap();
    assert_eq!(result["revision"], 0);
    assert_eq!(result["catalog"]["items"].as_array().unwrap().len(), 128);
    assert_eq!(result["catalog"]["total"], 200);
    assert_eq!(
        result["catalog"]["items"][0]["selectedIdentity"],
        Value::Null
    );
    assert_eq!(result["catalog"]["items"][0]["displaySetId"], 0);
    assert!(dispatch_result(&mut session, "monster.catalog", json!({"setId": 99})).is_err());
    assert!(
        dispatch_result(
            &mut session,
            "monster.open",
            json!({"setId": -1, "nativeId": 0})
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.revision().0, 0);
}
