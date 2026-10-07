use crate::{dispatch_result, transport::serve_io};
use providence_core::session::{EditorSession, Revision};
use providence_core::{
    codecs,
    model::{NativeRecordId, ProjectSnapshot, StableId},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::io::{Cursor, Write};

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-draft-adapter".into()));
    let mut bytes = vec![0; codecs::MONSTER_RECORD_BYTES * 2];
    bytes[codecs::MONSTER_RECORD_BYTES] = 2;
    for (set_id, path) in [(0, "Data MD"), (1, "Data MD1"), (-1, "Data MD-1")] {
        let mut set = codecs::decode_monster_set(&bytes, path, set_id);
        set.monsters[1].display_name = "Source monster".into();
        set.monsters[1].spells[0] = -1101;
        set.monsters[1].type_flags[0] = 7;
        snapshot.monster_sets.push(set);
    }
    snapshot.monster_descriptions =
        codecs::decode_monster_descriptions(&vec![0; codecs::MONSTER_DESCRIPTION_RECORD_BYTES * 2])
            .records;
    snapshot.normalize();
    snapshot
}

fn params(revision: u64, id: &str) -> Value {
    json!({"expectedRevision": revision, "operationId": id, "draft": {
        "setId": -1, "nativeId": 1, "fields": {"armor": 18.0, "items.2": -93.0},
        "description": "Shared description", "normalNotOnMenu": true
    }})
}

fn request(method: &str, params: Value) -> String {
    json!({"id": 1, "method": method, "params": params}).to_string() + "\n"
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

fn status(id: &str, original: Value) -> Value {
    json!({"operationId": id, "domain": "project", "expectedIntent": {
        "method": "monster.draft.apply", "params": original
    }})
}

#[test]
fn monster_draft_transport_applies_three_owners_atomically_and_reopens_with_one_history_entry() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot()).unwrap();
    let mut session = EditorSession::new(snapshot());
    let id = "a".repeat(64);
    let response = exchange(&mut session, &store, "monster.draft.apply", params(0, &id));
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["result"]["change"]["revision"], 1);
    assert_eq!(response["result"]["document"]["normalNotOnMenu"], true);
    assert_eq!(
        response["result"]["document"]["monster"]["spells"][0],
        -1101
    );
    assert!(response["result"].get("snapshot").is_none());
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.undo_history().len(), 1);
    let saved = dispatch_result(
        &mut reopened,
        "monster.open",
        json!({"setId": -1, "nativeId": 1}),
    )
    .unwrap();
    assert_eq!(saved["monster"]["armor"], 18);
    assert_eq!(saved["description"]["text"], "Shared description");
    assert_eq!(saved["monster"]["typeFlags"][0], 7);
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
    assert_eq!(
        reopened.snapshot().monster_descriptions[1].native_id,
        NativeRecordId(1)
    );
    assert_eq!(
        reopened.snapshot().monster_descriptions[1].text,
        "Shared description"
    );
}

#[test]
fn monster_draft_rejection_and_wrong_receipt_identity_do_not_unlock_or_mutate() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot()).unwrap();
    let mut session = EditorSession::new(snapshot());
    let id = "b".repeat(64);
    let original = params(99, &id);
    let rejected = exchange(
        &mut session,
        &store,
        "monster.draft.apply",
        original.clone(),
    );
    assert_eq!(rejected["ok"], false);
    assert!(rejected.get("outcomeUnknown").is_none());
    assert_eq!(session.snapshot(), &snapshot());
    let known = exchange(
        &mut session,
        &store,
        "monster.operation.status",
        status(&id, original),
    );
    assert_eq!(known["result"]["outcome"], "not-committed");
    let foreign = exchange(
        &mut session,
        &store,
        "monster.operation.status",
        status(&id, params(0, &id)),
    );
    assert_eq!(foreign["result"]["outcome"], "unknown");
    assert!(foreign["result"].get("response").is_none());
    assert_eq!(session.revision(), Revision(0));
}

struct LostReply;
impl Write for LostReply {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "lost original reply",
        ))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn monster_draft_lost_reply_is_recovered_from_original_receipt_without_replay() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot()).unwrap();
    let mut session = EditorSession::new(snapshot());
    let id = "c".repeat(64);
    let original = params(0, &id);
    assert!(
        serve_io(
            &mut session,
            Some(&store),
            Cursor::new(request("monster.draft.apply", original.clone())),
            LostReply
        )
        .is_err()
    );
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    let receipt = exchange(
        &mut reopened,
        &store,
        "monster.operation.status",
        status(&id, original.clone()),
    );
    assert_eq!(receipt["result"]["outcome"], "committed");
    assert_eq!(
        receipt["result"]["response"]["result"]["change"]["revision"],
        1
    );
    let replay = exchange(&mut reopened, &store, "monster.draft.apply", original);
    assert_eq!(replay["ok"], false);
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.undo_history().len(), 1);
}

#[test]
fn monster_draft_failed_checkpoint_retains_unknown_receipt_and_stops_following_mutation() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot()).unwrap();
    let retained = temporary.path().join("last-acknowledged.json");
    std::fs::rename(store.snapshot_path(), &retained).unwrap();
    std::fs::create_dir(store.snapshot_path()).unwrap();
    let mut session = EditorSession::new(snapshot());
    let id = "d".repeat(64);
    let original = params(0, &id);
    let mut output = Vec::new();
    let input = request("monster.draft.apply", original.clone())
        + &request("monster.draft.apply", params(1, &"e".repeat(64)));
    serve_io(&mut session, Some(&store), Cursor::new(input), &mut output).unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["outcomeUnknown"], true);
    assert_eq!(session.revision(), Revision(1));
    std::fs::remove_dir(store.snapshot_path()).unwrap();
    std::fs::rename(retained, store.snapshot_path()).unwrap();
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(reopened.revision(), Revision(0));
    assert_eq!(
        exchange(
            &mut reopened,
            &store,
            "monster.operation.status",
            status(&id, original)
        )["result"]["outcome"],
        "unknown"
    );
}
