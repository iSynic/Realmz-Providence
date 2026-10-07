use super::*;
use providence_core::model::{
    ActionPoint, ClassicAction, ExtraActionPoint, ExtraCodeRow, LevelType, NativeRecordId,
    TimedEncounter, TimedEncounterLocationKind,
};

fn point(kind: LevelType, level: u32, record: u8) -> ActionPoint {
    ActionPoint {
        identity: StableId(format!(
            "action-point:{}:{level}:{record}",
            if kind == LevelType::Land {
                "land"
            } else {
                "dungeon"
            }
        )),
        level_type: kind,
        level_index: level,
        record_index: record,
        classic_door_id: i32::from(record),
        coordinate: None,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 2,
            raw_opcode: 8,
            target_native_id: 17,
        }],
    }
}

#[test]
fn record_callers_share_discovery_map_context_and_independent_paging() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("context".into()));
    snapshot.world.action_points = vec![
        point(LevelType::Land, 0, 17),
        point(LevelType::Land, 1, 17),
        point(LevelType::Dungeon, 0, 17),
    ];
    let session = EditorSession::new(snapshot);
    for identity in [
        "action-point:land:0:17",
        "action-point:land:1:17",
        "action-point:dungeon:0:17",
    ] {
        let result = record_open(&session, &json!({"identity":identity,"limit":1})).unwrap();
        assert_eq!(result["paging"]["incomingTotal"], 1);
        assert_eq!(result["incomingReferences"][0]["source"], identity);
        assert_eq!(result["outgoingReferences"][0]["targetIdentity"], identity);
        let next =
            record_open(&session, &json!({"identity":identity,"offset":1,"limit":1})).unwrap();
        assert_eq!(next["paging"]["incomingTotal"], 1);
        assert!(next["incomingReferences"].as_array().unwrap().is_empty());
    }
}

#[test]
fn records_include_shared_row_timed_schedule_callers() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("schedule".into()));
    snapshot.timed_encounters.push(TimedEncounter {
        identity: StableId("timed-encounter:3".into()),
        native_id: NativeRecordId(3),
        day: 2,
        increment: 0,
        percent: 100,
        door: 0,
        required_level: -1,
        required_random_rect: -1,
        required_x: -1,
        required_y: -1,
        required_item: 0,
        required_quest: 0,
        location_kind: TimedEncounterLocationKind::Any,
        authored: true,
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(7),
        values: [3, 100, -1, 0, 2],
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 1,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 4,
            raw_opcode: 54,
            target_native_id: 7,
        }],
    });
    let session = EditorSession::new(snapshot);
    let record = record_open(&session, &json!({"identity":"timed-encounter:3"})).unwrap();
    let callers = session.discovery().incoming("timed-encounter", "3");
    assert!(!callers.is_empty());
    assert_eq!(record["paging"]["incomingTotal"], callers.len());
    assert_eq!(
        record["incomingReferences"][0]["source"],
        "extra-action-point:1"
    );
    assert!(
        record["incomingReferences"][0]["field"]
            .as_str()
            .unwrap()
            .starts_with("actions[4].settings.")
    );
}

#[test]
fn colliding_rule_rows_require_explicit_owner_and_preserve_discovery_scope() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scopes".into()));
    let decoded = providence_core::codecs::decode_standard_spells(&vec![0; 250], None);
    let definition = decoded.spells[0].clone();
    let identity = definition.definition.id.0.clone();
    snapshot.standard_spells.push(definition.clone());
    snapshot.scenario_spells.push(definition);
    let session = EditorSession::new(snapshot);
    assert!(
        record_open(&session, &json!({"identity":identity}))
            .unwrap_err()
            .contains("multiple source owners")
    );
    let stock = record_open(
        &session,
        &json!({"identity":identity,"recordType":"standard-spell"}),
    )
    .unwrap();
    let scenario = record_open(
        &session,
        &json!({"identity":identity,"recordType":"scenario-spell"}),
    )
    .unwrap();
    assert_eq!(stock["record"]["discoveryScope"], "stock");
    assert_eq!(scenario["record"]["discoveryScope"], "scenario");
    assert_eq!(stock["record"]["owningEditorAvailable"], false);
    assert_eq!(scenario["record"]["owningEditorAvailable"], true);
    assert_eq!(stock["record"]["diagnosticOwnershipAmbiguous"], true);
    assert_eq!(scenario["record"]["diagnosticOwnershipAmbiguous"], true);
    assert_eq!(stock["outgoingReferences"], json!([]));
    assert_eq!(scenario["problems"], json!([]));
}
