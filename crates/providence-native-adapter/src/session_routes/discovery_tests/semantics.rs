use super::{action, fixture, read};
use providence_core::{
    model::{
        ActionPoint, ExtraCodeRow, LevelType, MapLevel, NativeRecordId, SimpleEncounter, StableId,
    },
    session::EditorSession,
};
use serde_json::json;

#[test]
fn discovery_quest_change_limit_and_encounter_record_branches_follow_castle() {
    let mut s = fixture().snapshot().clone();
    s.extra_codes.extend([
        ExtraCodeRow {
            native_id: NativeRecordId(6),
            values: [110, 1, 2, 3, 40],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(7),
            values: [9, 99, 2, 40, 41],
        },
    ]);
    s.extra_action_points[12]
        .actions
        .extend([action(2, 76, 6), action(3, 77, 7)]);
    let mut session = EditorSession::new(s);
    let changes = read(
        &mut session,
        "quest.flow",
        json!({"id":110,"role":"changes"}),
    );
    assert_eq!(changes["total"], 0);
    let checks = read(
        &mut session,
        "quest.flow",
        json!({"id":110,"role":"checks"}),
    );
    assert_eq!(checks["total"], 1);
    assert_eq!(checks["items"][0]["branch"], "Simple Encounter 40");
    assert!(
        checks["items"][0]["effect"]
            .as_str()
            .unwrap()
            .contains("Change ignored")
    );
    let checks = read(&mut session, "quest.flow", json!({"id":9,"role":"checks"}));
    assert!(
        checks["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["branch"] == "False: Complex Encounter 40; True: Complex Encounter 41")
    );
}

#[test]
fn discovery_quest_origin_is_revealed_beyond_the_first_page() {
    let mut s = fixture().snapshot().clone();
    for row in &mut s.extra_action_points {
        row.actions = vec![action(0, 47, 9)];
    }
    let mut session = EditorSession::new(s);
    let page = read(
        &mut session,
        "quest.flow",
        json!({"id":9,"role":"changes","origin":"extra-action-point:200|actions[0]"}),
    );
    assert_eq!(page["offset"], 192);
    assert_eq!(page["originFound"], true);
    assert!(
        page["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["occurrence"] == "extra-action-point:200|actions[0]")
    );
    let opposite = read(
        &mut session,
        "quest.flow",
        json!({"id":9,"role":"checks","origin":"extra-action-point:200|actions[0]"}),
    );
    assert_eq!(opposite["originFound"], false);
}

#[test]
fn discovery_shared_row_ap_address_uses_explicit_destination_map() {
    let mut s = fixture().snapshot().clone();
    for index in [0, 5] {
        s.world.maps.push(MapLevel {
            identity: StableId(format!("land:{index}")),
            level_type: LevelType::Land,
            native_index: index,
            name: format!("Land {index}"),
            tiles: vec![0; 8100],
            runtime: None,
        });
        s.world.action_points.push(ActionPoint {
            identity: StableId(format!("action-point:land:{index}:7")),
            level_type: LevelType::Land,
            level_index: index,
            record_index: 7,
            classic_door_id: 0,
            coordinate: None,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![],
        });
    }
    s.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(6),
        values: [5, 7, 100, 1, 0],
    });
    s.world.action_points[0].actions.push(action(0, 13, 6));
    s.extra_action_points[12].actions.push(action(2, 13, 6));
    let mut session = EditorSession::new(s);
    for source in ["action-point:land:0:7", "extra-action-point:12"] {
        let page = read(
            &mut session,
            "discovery.links",
            json!({"direction":"outgoing","identity":source}),
        );
        let ap = page["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["targetKind"] == "action-point")
            .unwrap();
        assert_eq!(ap["targetIdentity"], "action-point:land:5:7");
    }
}

#[test]
fn discovery_trace_separates_encounter_results_and_shows_local_branch_positions() {
    let s = result_owner_fixture();
    let mut session = EditorSession::new(s);
    let uses = read(
        &mut session,
        "discovery.links",
        json!({"direction":"outgoing","identity":"simple-encounter:3:result:1"}),
    );
    assert!(
        uses["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["field"] != "actions[0].target")
    );
    assert!(
        uses["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["targetIdentity"] == "simple-encounter:3:result:0"
                && r["meaning"].as_str().unwrap().contains("code position 3"))
    );
    let trace = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"12","identity":"extra-action-point:12","depthLimit":8}),
    );
    let rows = trace["trace"]["items"].as_array().unwrap();
    assert!(
        rows.iter()
            .any(|r| r["link"]["field"] == "choiceResults[0]")
    );
    assert!(
        !rows.iter().any(|r| r["link"]["field"] == "choiceResults[1]"
            && r["path"].as_array().unwrap().last().unwrap() == "simple-encounter:3:result:0")
    );
    assert!(rows.iter().any(|r| {
        r["path"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id == "simple-encounter:3:result:0")
    }));
}

fn result_owner_fixture() -> providence_core::model::ProjectSnapshot {
    let mut s = fixture().snapshot().clone();
    s.simple_encounters.push(SimpleEncounter {
        identity: StableId("simple-encounter:3".into()),
        native_id: NativeRecordId(3),
        actions: vec![action(0, 39, 12), action(8, 39, 40), action(9, 46, 6)],
        choice_results: [1, 2, 0, 0],
        can_back_out: true,
        max_times: 0,
        caste_success: 0,
        prompt_message_native_id: 349,
        texts: ["Left".into(), "Right".into(), "".into(), "".into()],
        authored: true,
    });
    s.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(6),
        values: [9, 1, 1, 0, 3],
    });
    s
}
