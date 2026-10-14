use crate::dispatch_result;
use providence_core::{
    model::{
        ActionPoint, ClassicAction, ExtraActionPoint, ExtraCodeRow, LevelType, MapCoordinate,
        MapLevel, NativeRecordId, ProjectSnapshot, StableId,
    },
    session::EditorSession,
};
use serde_json::{Value, json};

fn fixture() -> EditorSession {
    let mut s = ProjectSnapshot::new_authored(StableId("activation-authoring".into()));
    let mut tiles = vec![0; 90 * 90];
    tiles[3 * 90 + 3] = 1000;
    s.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Test Land".into(),
        tiles,
        runtime: None,
    });
    for record in [0, 7] {
        s.world.action_points.push(ActionPoint {
            identity: StableId(format!("action-point:land:0:{record}")),
            level_type: LevelType::Land,
            level_index: 0,
            record_index: record,
            classic_door_id: 101,
            coordinate: Some(MapCoordinate { x: 1, y: 1 }),
            post_action_level: 0,
            post_action_x: 1,
            post_action_y: 1,
            chance_percent: if record == 0 { 0 } else { 100 },
            actions: if record == 0 {
                vec![]
            } else {
                vec![ClassicAction {
                    slot: 2,
                    raw_opcode: 777,
                    target_native_id: 0,
                }]
            },
        });
    }
    add_unplaced(&mut s);
    s.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(0),
        values: [0, 7, 100, 7, 7],
    });
    s.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:40".into()),
        native_id: NativeRecordId(40),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 13,
            target_native_id: 0,
        }],
    });
    EditorSession::new(s)
}

fn add_unplaced(s: &mut ProjectSnapshot) {
    let mut unplaced = s.world.action_points[1].clone();
    unplaced.identity = StableId("action-point:land:0:2".into());
    unplaced.record_index = 2;
    unplaced.classic_door_id = 0;
    unplaced.coordinate = None;
    unplaced.chance_percent = 0;
    s.world.action_points.push(unplaced);
}

fn open(s: &mut EditorSession) -> Value {
    dispatch_result(
        s,
        "action-point.open",
        json!({"identity":"action-point:land:0:7"}),
    )
    .unwrap()
}

#[test]
fn activation_facts_agree_across_ap_map_and_flow_and_keep_exact_change_owner() {
    let mut session = fixture();
    let ap = open(&mut session);
    let status = &ap["actionPoint"]["activation"];
    assert_eq!(status["entryMarker"], false);
    assert_eq!(status["chancePercent"], 100);
    assert_eq!(status["shadowedBy"], "action-point:land:0:0");
    assert_eq!(status["unknownSlots"], json!([2]));
    let links = ap["knownActivationLinks"].as_array().unwrap();
    assert!(!links.is_empty());
    let link = links
        .iter()
        .find(|link| link["field"] == "actions[0].settings.singleTrigger")
        .unwrap();
    assert_eq!(link["relationship"], "state-change");
    assert_eq!(link["source"], "extra-action-point:40");
    assert_eq!(link["field"], "actions[0].settings.singleTrigger");
    let map = dispatch_result(&mut session, "map.open", json!({"identity":"land:0"})).unwrap();
    let map_ap = map["actionPoints"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ap| ap["recordIndex"] == 7)
        .unwrap();
    assert_eq!(map_ap["activation"], *status);
    assert_eq!(
        map["viewOverlays"]["unmatchedEntryMarkers"],
        json!([{"x":3,"y":3}])
    );
    let flow = dispatch_result(
        &mut session,
        "discovery.flow-summaries",
        json!({
            "projectId":"activation-authoring", "expectedRevision":0,
            "selections":[{"identity":"action-point:land:0:7", "scope":"scenario"}],
        }),
    )
    .unwrap();
    assert_eq!(flow["items"][0]["summary"]["activation"], *status);
    assert_eq!(session.revision().0, 0);
}

#[test]
fn activation_filters_intersect_scope_and_preserve_empty_results_and_unknowns() {
    let mut session = fixture();
    let params = json!({"mapIdentity":"land:0", "filter":"current-map", "limit":1,
        "activationFilters":{"chance":"positive", "marker":"absent", "precedence":"shadowed", "checks":"unknown"}});
    let filtered = dispatch_result(&mut session, "action-point.list", params).unwrap();
    assert_eq!(filtered["total"], 1);
    assert_eq!(filtered["items"][0]["recordIndex"], 7);
    let empty = dispatch_result(
        &mut session,
        "action-point.list",
        json!({"mapIdentity":"land:0", "filter":"current-map",
        "activationFilters":{"chance":"positive", "marker":"present"}}),
    )
    .unwrap();
    assert_eq!(empty["total"], 0);
    let all = dispatch_result(
        &mut session,
        "action-point.list",
        json!({"mapIdentity":"land:0", "filter":"current-map"}),
    )
    .unwrap();
    assert_eq!(all["total"], 3);
    let unplaced = dispatch_result(&mut session, "action-point.list", json!({"mapIdentity":"land:0", "filter":"current-map", "activationFilters":{"marker":"unavailable"}})).unwrap();
    assert_eq!(unplaced["total"], 1);
    assert_eq!(unplaced["items"][0]["recordIndex"], 2);
    assert!(
        dispatch_result(
            &mut session,
            "action-point.list",
            json!({"mapIdentity":"land:0", "activationFilters":{"chance":"active"}})
        )
        .is_err()
    );
}

#[test]
fn marker_route_refreshes_colocated_facts_and_rejects_stale_or_invalid_requests() {
    let mut session = fixture();
    let changed = dispatch_result(
        &mut session,
        "action-point.entry-marker",
        json!({
            "identity":"action-point:land:0:7", "enabled":true, "expectedRevision":0,
        }),
    )
    .unwrap();
    assert_eq!(
        changed["document"]["actionPoint"]["activation"]["entryMarker"],
        true
    );
    assert_eq!(session.snapshot().world.action_points[0].chance_percent, 0);
    assert!(
        dispatch_result(
            &mut session,
            "action-point.entry-marker",
            json!({
                "identity":"action-point:land:0:7", "enabled":false, "expectedRevision":0,
            })
        )
        .is_err()
    );
    assert!(
        dispatch_result(
            &mut session,
            "action-point.entry-marker",
            json!({
                "identity":"action-point:land:0:7", "enabled":"false", "expectedRevision":1,
            })
        )
        .is_err()
    );
    assert_eq!(session.snapshot().world.maps[0].tiles[91], 1000);
}

#[test]
fn caller_dependent_chance_change_does_not_invent_a_map_specific_target() {
    let mut session = fixture();
    let mut snapshot = session.snapshot().clone();
    snapshot.extra_codes[0].values = [0, 7, 100, 0, 0];
    session = EditorSession::new(snapshot);
    let ap = open(&mut session);
    assert_eq!(ap["knownActivationLinksTotal"], 0);
    assert!(session.discovery().links.iter().any(|link| {
        link.source == "extra-action-point:40"
            && link.contextual
            && link.field == "actions[0].settings.singleTrigger"
    }));
}
