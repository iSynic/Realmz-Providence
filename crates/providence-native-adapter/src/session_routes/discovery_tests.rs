use super::discovery::dispatch;
use providence_core::{
    model::{
        ClassicAction, ExtraActionPoint, ExtraCodeRow, NativeRecordId, ProjectSnapshot, QuestLabel,
        ScenarioMessage, StableId,
    },
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand},
};
use serde_json::{Value, json};
mod execution;
mod rules;
mod semantics;

fn fixture() -> EditorSession {
    let mut s = ProjectSnapshot::new_authored(StableId("discovery-test".into()));
    s.messages.push(ScenarioMessage {
        identity: StableId("message:349".into()),
        native_id: NativeRecordId(349),
        text: format!("{}needle beyond prefix", "x".repeat(2000)),
        authored: true,
    });
    s.quest_labels.push(QuestLabel {
        id: 9,
        label: "Opened eastern gate".into(),
        note: "First line\nSecond line".into(),
    });
    s.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(4),
        values: [9, 3, 1, 3, 12],
    });
    s.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(5),
        values: [8, 11, 0, 0, 12],
    });
    for id in 0..294 {
        let actions = if id == 40 {
            vec![action(0, 1, 349), action(1, 76, 4), action(2, 72, 5)]
        } else if id == 12 {
            vec![action(0, 47, 9), action(1, 39, 40)]
        } else if id == 91 {
            vec![action(0, 47, -9), action(1, 39, 90)]
        } else if id == 90 {
            vec![action(0, 39, 91)]
        } else {
            vec![action(0, 1, 349)]
        };
        s.extra_action_points.push(ExtraActionPoint {
            identity: StableId(format!("extra-action-point:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: id as i32,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions,
        });
    }
    EditorSession::new(s)
}

fn action(slot: u8, raw_opcode: i16, target_native_id: i16) -> ClassicAction {
    ClassicAction {
        slot,
        raw_opcode,
        target_native_id,
    }
}

#[test]
fn discovery_shared_settings_keep_each_consumer_and_multiple_word_meanings() {
    let mut snapshot = fixture().snapshot().clone();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(9),
        values: [7, 7, 40, 349, 10],
    });
    for id in [12, 91] {
        snapshot
            .extra_action_points
            .iter_mut()
            .find(|row| row.native_id.0 == id)
            .unwrap()
            .actions
            .push(action(3, 2, 9));
    }
    let mut session = EditorSession::new(snapshot);
    for id in [12, 91] {
        let links = read(
            &mut session,
            "discovery.links",
            json!({"direction":"outgoing", "identity":format!("extra-action-point:{id}")}),
        );
        let uses: Vec<_> = links["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|link| {
                link["field"]
                    .as_str()
                    .unwrap()
                    .starts_with("actions[3].settings.")
            })
            .collect();
        for kind in ["battle", "message", "sound", "extra-action-point"] {
            assert!(
                uses.iter().any(|link| link["targetKind"] == kind),
                "{id} must retain {kind}: {uses:?}"
            );
        }
        assert!(
            uses.iter()
                .any(|link| link["targetKind"] == "battle" && link["resolution"] == "missing")
        );
    }
    let messages = read(
        &mut session,
        "discovery.links",
        json!({"direction":"incoming", "kind":"message", "id":"349", "offset":0, "limit":128}),
    );
    assert_eq!(messages["total"], 293);
}

#[test]
fn discovery_depth_frontier_expansion_retains_original_cycle_ancestry() {
    let mut session = fixture();
    let branch = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point", "id":"91", "identity":"extra-action-point:91", "scope":"scenario", "depthLimit":1, "ancestors":["extra-action-point:90", "extra-action-point:91"]}),
    );
    let rows = branch["trace"]["items"].as_array().unwrap();
    assert!(
        rows.iter()
            .any(|row| row["link"]["source"] == "extra-action-point:90"
                && row["cycle"] == true
                && row["depthLimited"] == false)
    );
    let mut invalid = json!({"kind":"extra-action-point", "id":"91", "ancestors":vec!["extra-action-point:90";129]});
    invalid["projectId"] = json!(session.snapshot().project_id);
    invalid["expectedRevision"] = json!(session.revision());
    assert!(
        dispatch(&mut session, "discovery.trace", invalid)
            .unwrap_err()
            .contains("ancestry")
    );
}
fn read(session: &mut EditorSession, method: &str, mut p: Value) -> Value {
    p["projectId"] = json!(session.snapshot().project_id);
    p["expectedRevision"] = json!(session.revision());
    dispatch(session, method, p).unwrap()
}

#[test]
fn discovery_connected_search_roles_paging_and_cycles_use_real_adapter_routes() {
    let mut session = fixture();
    for query in ["string 349", "str:349", "needle beyond prefix"] {
        let result = read(&mut session, "discovery.search", json!({"query":query}));
        assert_eq!(result["items"][0]["record"]["identity"], "message:349");
    }
    let result = read(
        &mut session,
        "discovery.links",
        json!({"direction":"incoming","kind":"message","id":"349","offset":128,"limit":128}),
    );
    assert_eq!(result["total"], 291);
    assert_eq!(result["items"].as_array().unwrap().len(), 128);
    assert_eq!(result["remaining"], 35);
    let checks = read(&mut session, "quest.flow", json!({"id":9,"role":"checks"}));
    let changes = read(&mut session, "quest.flow", json!({"id":9,"role":"changes"}));
    assert_eq!(checks["total"], 2);
    assert_eq!(changes["total"], 3);
    assert!(
        changes["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["effect"] == "Clear")
    );
    assert!(
        changes["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["checks"] == true && r["changes"] == true)
    );
    let trace = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"90"}),
    );
    assert!(
        trace["trace"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["cycle"] == true)
    );
}

#[test]
fn discovery_rejects_old_project_and_revision_after_commands_and_history() {
    let mut session = fixture();
    let old = json!({"projectId":session.snapshot().project_id,"expectedRevision":session.revision(),"query":"gate"});
    assert!(dispatch(&mut session, "discovery.search", old.clone()).is_ok());
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::UpsertQuestLabel {
                label: QuestLabel {
                    id: 9,
                    label: "New label".into(),
                    note: "One\nTwo".into(),
                },
            },
        })
        .unwrap();
    assert!(
        dispatch(&mut session, "discovery.search", old.clone())
            .unwrap_err()
            .contains("stale")
    );
    assert_eq!(
        read(
            &mut session,
            "discovery.search",
            json!({"query":"New label"})
        )["total"],
        1
    );
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(
        read(
            &mut session,
            "discovery.search",
            json!({"query":"New label"})
        )["total"],
        0
    );
    execute(&mut session, EditorCommand::Redo);
    let mut reopened = EditorSession::from_persisted_state(session.persisted_state());
    assert_eq!(
        read(
            &mut reopened,
            "discovery.search",
            json!({"query":"New label"})
        )["total"],
        1
    );
    assert!(!before.to_string().contains("discoveryIndex"));
    let invalid = json!({"projectId":"another", "expectedRevision":session.revision()});
    assert!(
        dispatch(&mut session, "discovery.search", invalid)
            .unwrap_err()
            .contains("another project")
    );
}

fn execute(session: &mut EditorSession, command: EditorCommand) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command,
        })
        .unwrap();
}

#[test]
fn discovery_trace_continues_beyond_4096_without_losing_caller_occurrences() {
    let mut snapshot = fixture().snapshot().clone();
    snapshot.extra_action_points.truncate(1);
    snapshot.extra_action_points[0].actions = vec![action(0, 1, 349)];
    for id in 1..600 {
        let mut row = snapshot.extra_action_points[0].clone();
        row.identity = StableId(format!("extra-action-point:{id}"));
        row.native_id = NativeRecordId(id);
        row.actions = (0..8).map(|slot| action(slot, 39, 0)).collect();
        snapshot.extra_action_points.push(row);
    }
    let mut session = EditorSession::new(snapshot);
    let first = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"0","limit":128}),
    );
    assert_eq!(first["trace"]["total"], 4096);
    assert_eq!(first["trace"]["workLimited"], true);
    let token = first["trace"]["batchToken"].clone();
    let last_page = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"0","batchToken":token,"offset":3968,"limit":128}),
    );
    assert_eq!(last_page["trace"]["items"].as_array().unwrap().len(), 128);
    let next = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"extra-action-point","id":"0","batchToken":token,"advanceWork":true,"limit":128}),
    );
    assert_eq!(next["trace"]["total"], 696);
    assert_eq!(next["trace"]["workLimited"], false);
    assert_ne!(next["trace"]["batchToken"], token);
    assert_ne!(
        first["trace"]["items"][0]["link"]["occurrence"],
        next["trace"]["items"][0]["link"]["occurrence"]
    );
    execute(
        &mut session,
        EditorCommand::UpsertQuestLabel {
            label: QuestLabel {
                id: 9,
                label: "Changed".into(),
                note: "".into(),
            },
        },
    );
    let stale = json!({"projectId":session.snapshot().project_id,"expectedRevision":session.revision(),"kind":"extra-action-point","id":"0","batchToken":token});
    assert!(
        dispatch(&mut session, "discovery.trace", stale)
            .unwrap_err()
            .contains("expired")
    );
}

#[test]
fn discovery_quest_ranges_focus_their_endpoints_and_ignore_unconditional_tests() {
    let mut snapshot = fixture().snapshot().clone();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(6),
        values: [9, 2, 0, 12, 0],
    });
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(7),
        values: [9, 99, 0, 12, 0],
    });
    snapshot.extra_action_points[40]
        .actions
        .extend([action(3, 46, 6), action(4, 46, 7)]);
    let mut session = EditorSession::new(snapshot);
    let checks = read(&mut session, "quest.flow", json!({"id":9,"role":"checks"}));
    assert_eq!(checks["total"], 2);
    assert!(
        checks["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["field"] == "actions[2].settings.testA")
    );
    let end = read(&mut session, "quest.flow", json!({"id":11,"role":"checks"}));
    assert_eq!(end["items"][0]["field"], "actions[2].settings.testB");
    let ignored: Vec<_> = session
        .discovery()
        .quests
        .iter()
        .filter(|row| !row.checks && !row.changes)
        .collect();
    assert_eq!(ignored.len(), 2);
    assert!(
        ignored
            .iter()
            .any(|row| row.condition.contains("Always branch"))
    );
    assert!(
        ignored
            .iter()
            .any(|row| row.condition.contains("unsupported"))
    );
}
