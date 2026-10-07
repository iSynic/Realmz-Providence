use crate::{dispatch_result, transport::serve_io};
use providence_core::{
    model::{BattleRecord, NativeRecordId, ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::io::{Cursor, Write};

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-authoring-adapter".into()));
    let mut battle = BattleRecord {
        identity: StableId("battle:4".into()),
        native_id: NativeRecordId(4),
        grid: vec![0; 169],
        distance: -128,
        message_before: 148,
        message_after: 879,
        battle_macro: 1,
        authored: false,
    };
    battle.grid[35] = -95;
    battle.grid[119] = 96;
    snapshot.battles.push(battle);
    snapshot
}

fn request(method: &str, params: Value) -> String {
    json!({"id": 1, "method": method, "params": params}).to_string() + "\n"
}

#[test]
fn used_by_and_clear_review_include_a_battle_inside_an_authored_range() {
    let mut source = snapshot();
    source
        .extra_codes
        .push(providence_core::model::ExtraCodeRow {
            native_id: NativeRecordId(1),
            values: [0, 32767, 0, 0, 0],
        });
    source
        .extra_action_points
        .push(providence_core::model::ExtraActionPoint {
            identity: StableId("extra-action-point:7".into()),
            native_id: NativeRecordId(7),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![providence_core::model::ClassicAction {
                slot: 3,
                raw_opcode: 2,
                target_native_id: 1,
            }],
        });
    let mut session = EditorSession::new(source.clone());
    let uses = dispatch_result(
        &mut session,
        "reference.used-by",
        json!({"targetKind": "battle", "targetId": "4", "limit": 1}),
    )
    .unwrap();
    assert_eq!(uses["total"], 1);
    assert_eq!(uses["items"][0]["field"], "actions[3].settings.battleLow");
    assert_eq!(uses["items"][0]["targetId"], "4");
    let review = dispatch_result(
        &mut session,
        "battle.clear.prepare",
        json!({"expectedRevision": 0, "nativeId": 4}),
    )
    .unwrap();
    assert_eq!(review["review"]["incomingUses"], 1);
    assert_eq!(session.snapshot(), &source);
    assert_eq!(session.revision(), Revision(0));
}

fn exchange(
    session: &mut EditorSession,
    store: &ProjectStore,
    method: &str,
    params: Value,
) -> Value {
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(request(method, params)),
        &mut output,
    )
    .unwrap();
    serde_json::from_slice(&output).unwrap()
}

fn copied_draft(session: &mut EditorSession, id: &str) -> Value {
    let allocated = dispatch_result(
        session,
        "battle.allocate",
        json!({"expectedRevision": 0, "sourceId": 4}),
    )
    .unwrap();
    json!({"expectedRevision": 0, "operationId": id, "creation": true,
        "battle": allocated["allocation"]["battle"], "copySource": allocated["allocation"]["copySource"]})
}

fn status(id: &str, params: Value) -> Value {
    json!({"operationId": id, "domain": "project", "expectedIntent": {"method": "battle.draft.apply", "params": params}})
}

#[test]
fn battle_copy_is_pure_then_atomic_durable_and_undoable_after_reopen() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot()).unwrap();
    let mut session = EditorSession::new(snapshot());
    let original = copied_draft(&mut session, &"a".repeat(64));
    assert_eq!(session.snapshot(), &snapshot());
    assert_eq!(session.revision(), Revision(0));
    let prepared = exchange(
        &mut session,
        &store,
        "battle.draft.prepare",
        original.clone(),
    );
    assert_eq!(prepared["result"]["valid"], true, "{prepared}");
    assert_eq!(session.revision(), Revision(0));
    let applied = exchange(&mut session, &store, "battle.draft.apply", original);
    assert_eq!(applied["ok"], true, "{applied}");
    assert_eq!(applied["result"]["document"]["battle"]["grid"][35], -95);
    assert_eq!(applied["result"]["document"]["battle"]["grid"][119], 96);
    assert_eq!(applied["result"]["document"]["battle"]["battleMacro"], 1);
    assert!(applied["result"].get("snapshot").is_none());
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(reopened.undo_history().len(), 1);
    assert_eq!(reopened.snapshot().battles.len(), 2);
    assert_eq!(
        exchange(
            &mut reopened,
            &store,
            "history.undo",
            json!({"expectedRevision": 1})
        )["ok"],
        true
    );
    assert_eq!(reopened.snapshot(), &snapshot());
    assert_eq!(
        exchange(
            &mut reopened,
            &store,
            "history.redo",
            json!({"expectedRevision": 2})
        )["ok"],
        true
    );
    assert_eq!(reopened.snapshot().battles[0].distance, -128);
}

#[test]
fn battle_invalid_and_stale_drafts_preserve_record_and_receive_known_rejection() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot()).unwrap();
    let mut session = EditorSession::new(snapshot());
    let mut invalid = copied_draft(&mut session, &"b".repeat(64));
    invalid["battle"]["distance"] = json!(128.0);
    let prepared = exchange(
        &mut session,
        &store,
        "battle.draft.prepare",
        invalid.clone(),
    );
    assert_eq!(prepared["result"]["valid"], false);
    assert_eq!(prepared["result"]["issues"][0]["field"], "distance");
    assert_eq!(
        exchange(&mut session, &store, "battle.draft.apply", invalid)["ok"],
        false
    );
    let mut stale = copied_draft(&mut session, &"c".repeat(64));
    stale["expectedRevision"] = json!(99);
    assert_eq!(
        exchange(&mut session, &store, "battle.draft.apply", stale.clone())["ok"],
        false
    );
    let receipt = exchange(
        &mut session,
        &store,
        "battle.operation.status",
        status(&"c".repeat(64), stale.clone()),
    );
    assert_eq!(receipt["result"]["outcome"], "not-committed");
    stale["battle"]["distance"] = json!(18);
    assert_eq!(
        exchange(
            &mut session,
            &store,
            "battle.operation.status",
            status(&"c".repeat(64), stale)
        )["result"]["outcome"],
        "unknown"
    );
    assert_eq!(session.snapshot(), &snapshot());
    assert!(session.undo_history().is_empty());
}

struct LostReply;
impl Write for LostReply {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "lost Battle acknowledgement",
        ))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn battle_lost_acknowledgement_checks_original_without_replaying_mutation() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot()).unwrap();
    let mut session = EditorSession::new(snapshot());
    let id = "d".repeat(64);
    let original = copied_draft(&mut session, &id);
    assert!(
        serve_io(
            &mut session,
            Some(&store),
            Cursor::new(request("battle.draft.apply", original.clone())),
            LostReply
        )
        .is_err()
    );
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    let receipt = exchange(
        &mut reopened,
        &store,
        "battle.operation.status",
        status(&id, original.clone()),
    );
    assert_eq!(receipt["result"]["outcome"], "committed");
    assert_eq!(
        receipt["result"]["response"]["result"]["change"]["revision"],
        1
    );
    assert_eq!(
        exchange(&mut reopened, &store, "battle.draft.apply", original)["ok"],
        false
    );
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.undo_history().len(), 1);
}

#[test]
fn battle_search_seek_and_clear_review_are_bounded_read_only_projections() {
    let mut snapshot = snapshot();
    let source = snapshot.battles[0].clone();
    snapshot.battles = (0..880)
        .map(|id| {
            let mut row = source.clone();
            row.identity = StableId(format!("battle:{id}"));
            row.native_id = NativeRecordId(id);
            row
        })
        .collect();
    let mut session = EditorSession::new(snapshot.clone());
    let list = dispatch_result(
        &mut session,
        "battle.list",
        json!({"seekNativeId": 879, "limit": 16}),
    )
    .unwrap();
    assert_eq!(list["offset"], 864);
    assert_eq!(list["items"].as_array().unwrap().len(), 16);
    let filtered = dispatch_result(&mut session, "battle.list", json!({"search": "879"})).unwrap();
    assert_eq!(filtered["total"], 1);
    let clear = dispatch_result(
        &mut session,
        "battle.clear.prepare",
        json!({"expectedRevision": 0, "nativeId": 879}),
    )
    .unwrap();
    assert_eq!(clear["review"]["occupantsRemoved"], 2);
    assert_eq!(clear["review"]["battle"]["nativeId"], 879);
    assert!(
        clear["review"]["battle"]["grid"]
            .as_array()
            .unwrap()
            .iter()
            .all(|value| value == 0)
    );
    assert_eq!(session.snapshot(), &snapshot);
    assert!(session.undo_history().is_empty());
}
