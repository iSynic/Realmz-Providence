use super::*;

#[test]
fn action_catalogs_filter_search_page_and_clamp_on_the_server() {
    let mut snapshot = demo_snapshot();
    add_catalog_states(&mut snapshot);
    let mut session = EditorSession::new(snapshot);
    assert_action_point_filters(&mut session);
    assert_clamped_page(&mut session);
    assert_extra_action_point_filter(&mut session);
}

fn add_catalog_states(snapshot: &mut providence_core::model::ProjectSnapshot) {
    let mut reusable = snapshot.world.action_points[0].clone();
    reusable.identity = StableId("action-point:land:0:18".into());
    reusable.record_index = 18;
    reusable.classic_door_id = 0;
    reusable.coordinate = None;
    reusable.chance_percent = 0;
    reusable.actions.clear();
    let mut preserved = reusable.clone();
    preserved.identity = StableId("action-point:land:0:19".into());
    preserved.record_index = 19;
    preserved.classic_door_id = 7;
    preserved.level_index = 1;
    snapshot.world.action_points.extend([reusable, preserved]);

    let mut empty_macro = snapshot.extra_action_points[0].clone();
    empty_macro.identity = StableId("extra-action-point:41".into());
    empty_macro.native_id = NativeRecordId(41);
    empty_macro.chance_percent = 0;
    empty_macro.actions.clear();
    snapshot.extra_action_points.push(empty_macro);
}

fn assert_action_point_filters(session: &mut EditorSession) {
    let reusable = dispatch_result(
        session,
        "action-point.list",
        json!({"mapIdentity": "land:0", "offset": 0, "limit": 1, "filter": "reusable"}),
    )
    .expect("filter reusable Action Points");
    assert_eq!(reusable["counts"]["all"], 3);
    assert_eq!(reusable["counts"]["current-map"], 2);
    assert_eq!(reusable["counts"]["active"], 1);
    assert_eq!(reusable["total"], 1);
    assert_eq!(reusable["items"][0]["recordIndex"], 18);
    assert_eq!(reusable["items"][0]["chancePercent"], 0);

    let current = dispatch_result(
        session,
        "action-point.list",
        json!({"mapIdentity": "land:0", "offset": 0, "limit": 10, "filter": "current-map"}),
    )
    .expect("filter Action Points to the selected map");
    assert_eq!(current["total"], 2);
    assert!(
        current["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["currentMap"] == true)
    );
    for summary in current["items"].as_array().unwrap() {
        let opened = dispatch_result(
            session,
            "action-point.open",
            json!({"identity": summary["identity"]}),
        )
        .expect("open the listed Action Point");
        assert_eq!(
            summary["chancePercent"],
            opened["actionPoint"]["chancePercent"]
        );
    }
}

fn assert_clamped_page(session: &mut EditorSession) {
    let clamped = dispatch_result(
        session,
        "action-point.list",
        json!({"mapIdentity": "land:0", "offset": 999, "limit": 1, "search": "action point"}),
    )
    .expect("clamp an Action Point page past the end");
    assert_eq!(clamped["offset"], 2);
    assert_eq!(clamped["items"][0]["recordIndex"], 19);
}

fn assert_extra_action_point_filter(session: &mut EditorSession) {
    let macro_rows = dispatch_result(
        session,
        "extra-action-point.list",
        json!({"offset": 0, "limit": 1, "filter": "macro", "search": "40"}),
    )
    .expect("filter macro Extra Action Points");
    assert_eq!(macro_rows["counts"]["all"], 2);
    assert_eq!(macro_rows["counts"]["macro"], 1);
    assert_eq!(macro_rows["counts"]["padding"], 1);
    assert_eq!(macro_rows["counts"]["noKnownCaller"], 1);
    assert_eq!(macro_rows["counts"]["authoredWithoutKnownCaller"], 0);
    assert_eq!(macro_rows["counts"]["errors"], 0);
    assert_eq!(macro_rows["counts"]["warnings"], 0);
    assert_eq!(macro_rows["counts"]["information"], 0);
    assert!(macro_rows["counts"].get("unlinked").is_none());
    assert!(macro_rows["counts"].get("orphan").is_none());
    assert_eq!(macro_rows["total"], 1);
    assert_eq!(macro_rows["items"][0]["nativeId"], 40);
    assert_eq!(macro_rows["items"][0]["errors"], 0);
    assert_eq!(macro_rows["items"][0]["warnings"], 0);
    assert_eq!(macro_rows["items"][0]["information"], 0);

    let no_caller = dispatch_result(
        session,
        "extra-action-point.list",
        json!({"offset": 0, "limit": 1, "filter": "no-known-caller"}),
    )
    .expect("filter Extra Action Points with no known caller");
    assert_eq!(no_caller["total"], 1);
    assert_eq!(no_caller["items"][0]["nativeId"], 41);
}
