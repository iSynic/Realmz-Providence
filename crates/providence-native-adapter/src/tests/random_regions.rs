use crate::dispatch_result_with_store;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use serde_json::{Value, json};

fn dispatch(session: &mut EditorSession, method: &str, params: Value) -> Result<Value, String> {
    dispatch_result_with_store(session, None, method, params)
}

fn draft() -> Value {
    json!({"identity": "land:0:rect:3", "left": 12, "top": 18, "right": 24, "bottom": 26,
        "chanceTenThousand": -1, "battleRange": [0,0], "randomDoors": [0,0,0], "randomDoorPercent": [-35,0,100],
        "only": true, "option": -12, "soundId": 0, "textId": 0})
}

#[test]
fn region_slots_preview_atomic_apply_clear_history_and_stale_drafts() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("regions".into())));
    dispatch(
        &mut session,
        "map.create",
        json!({"expectedRevision":0, "levelType":"land"}),
    )
    .unwrap();
    let open = dispatch(
        &mut session,
        "random-region.open",
        json!({"mapIdentity":"land:0", "slot":3}),
    )
    .unwrap();
    assert_eq!(open["slots"].as_array().unwrap().len(), 20);
    assert_eq!(open["slots"][0]["slot"], 19);
    assert!(open["region"].is_null());
    let original = session.snapshot().clone();
    let params = json!({"mapIdentity":"land:0", "expectedRevision":1, "region":draft()});
    let preview = dispatch(&mut session, "random-region.preview", params.clone()).unwrap();
    assert_eq!(preview["preview"]["coveredCells"], 96);
    assert_eq!(session.snapshot(), &original);
    let applied = dispatch(&mut session, "random-region.apply", params.clone()).unwrap();
    assert_eq!(applied["revision"], 2);
    assert!(applied.get("snapshot").is_none());
    assert!(dispatch(&mut session, "random-region.apply", params).is_err());
    assert!(
        dispatch(
            &mut session,
            "random-region.apply",
            json!({"mapIdentity":"land:0","expectedRevision":2,"region":draft()})
        )
        .unwrap_err()
        .contains("already matches")
    );
    dispatch(
        &mut session,
        "random-region.clear",
        json!({"mapIdentity":"land:0","expectedRevision":2,"slot":3}),
    )
    .unwrap();
    dispatch(&mut session, "history.undo", json!({"expectedRevision":3})).unwrap();
    assert_eq!(
        session.snapshot().world.maps[0]
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles
            .len(),
        1
    );
    dispatch(&mut session, "history.redo", json!({"expectedRevision":4})).unwrap();
    let runtime = session.snapshot().world.maps[0].runtime.as_ref().unwrap();
    assert!(runtime.random_rectangles.is_empty());
}

#[test]
fn unavailable_reference_invalid_bounds_and_signed_percentage_reject_without_mutation() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("regions".into())));
    dispatch(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":"land"}),
    )
    .unwrap();
    let baseline = session.snapshot().clone();
    for (field, value) in [
        ("right", json!(91)),
        ("soundId", json!(32767)),
        ("textId", json!(-300)),
        ("randomDoorPercent", json!([0, -101, 0])),
    ] {
        let mut invalid = draft();
        invalid[field] = value;
        assert!(
            dispatch(
                &mut session,
                "random-region.apply",
                json!({"mapIdentity":"land:0","expectedRevision":1,"region":invalid})
            )
            .is_err()
        );
        assert_eq!(session.snapshot(), &baseline);
        assert_eq!(session.revision().0, 1);
    }
    let page = dispatch(&mut session,"random-region.reference.list",json!({"mapIdentity":"land:0","expectedRevision":1,
        "query":{"field":"door1","currentValue":-23,"search":"-23","showUnavailable":true,"limit":64}})).unwrap();
    assert_eq!(page["page"]["items"][0]["value"], -23);
    assert_eq!(page["page"]["items"][0]["available"], false);
}
