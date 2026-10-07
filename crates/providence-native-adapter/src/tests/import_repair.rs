use super::*;
use crate::{dispatch_result_with_store, transport::serve_io};
use providence_core::{
    model::{ClassicSourceBlob, ProjectSnapshot, StableId},
    session::EditorSession,
};
use providence_storage::ProjectStore;

fn fixture() -> (tempfile::TempDir, ProjectStore, EditorSession) {
    let temporary = tempdir().unwrap();
    let store = ProjectStore::create(
        temporary.path(),
        &ProjectSnapshot::new_authored(StableId("repair".into())),
    )
    .unwrap();
    let bytes = vec![0; providence_core::codecs::SCENARIO_SPELL_BYTES + 3];
    let blob = store.put_blob(&bytes).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Spell".into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    store.save_snapshot(&snapshot).unwrap();
    (temporary, store, EditorSession::new(snapshot))
}

fn shop_fixture(authored: bool) -> (tempfile::TempDir, ProjectStore, EditorSession, Vec<u8>) {
    use providence_core::{
        codecs::{SHOP_RECORD_BYTES, decode_shops},
        model::ShopRecord,
    };
    let (temporary, store, _) = fixture();
    let mut bytes = vec![0; SHOP_RECORD_BYTES * 2];
    bytes[..2].copy_from_slice(&7_i16.to_be_bytes());
    bytes[SHOP_RECORD_BYTES..SHOP_RECORD_BYTES + 2].copy_from_slice(&3000_i16.to_be_bytes());
    bytes[SHOP_RECORD_BYTES + 2..SHOP_RECORD_BYTES + 4].copy_from_slice(&3001_i16.to_be_bytes());
    let blob = store.put_blob(&bytes).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("shop-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.import_interpretation_version = 1;
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD".into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    snapshot.shops = decode_shops(&bytes).records;
    snapshot.shops.push(ShopRecord {
        identity: StableId("shop:1".into()),
        native_id: providence_core::model::NativeRecordId(1),
        item_ids: (0..1000)
            .map(|slot| if slot < 2 { 3000 + slot as i16 } else { 0 })
            .collect(),
        quantities: vec![0; 1000],
        inflation: if authored { 150 } else { 0 },
        authored,
    });
    snapshot.normalize();
    store.save_snapshot(&snapshot).unwrap();
    (temporary, store, EditorSession::new(snapshot), bytes)
}

#[test]
fn shop_correction_reopens_with_exact_source_bytes_and_durable_undo() {
    let (_temporary, store, mut session, bytes) = shop_fixture(false);
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.import-repair.assess",
        json!({}),
    )
    .unwrap();
    assert_eq!(preview["safeCount"], 1);
    assert!(
        preview["assessment"]["entries"][0]["recovered"]
            .as_str()
            .unwrap()
            .contains("preserve original Data SD bytes")
    );
    dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.import-repair.apply",
        params(&preview),
    )
    .unwrap();
    store
        .checkpoint_session(&session, &json!({"method":"project.import-repair.apply"}))
        .unwrap();
    let (_, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.snapshot().shops.len(), 1);
    let source = &reopened.snapshot().classic_sources[0];
    assert_eq!(store.read_blob(&source.blob).unwrap(), bytes);
    assert_eq!(
        providence_core::codecs::encode_shops(&reopened.snapshot().shops, Some(&bytes)).unwrap(),
        bytes
    );
    crate::dispatch_result(&mut reopened, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(reopened.snapshot().shops.len(), 2);
    crate::dispatch_result(&mut reopened, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(reopened.snapshot().shops.len(), 1);
}

#[test]
fn shop_authored_conflict_is_not_excluded_without_reviewed_selection() {
    for replace in [false, true] {
        let (_temporary, store, mut session, _) = shop_fixture(true);
        let preview = dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.import-repair.assess",
            json!({}),
        )
        .unwrap();
        assert_eq!(preview["conflictCount"], 1);
        let mut request = params(&preview);
        if replace {
            request["replaceConflicts"] = json!(["shop:1:quarantine"]);
        }
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.import-repair.apply",
            request,
        )
        .unwrap();
        assert_eq!(session.snapshot().shops.len(), if replace { 1 } else { 2 });
        if !replace {
            assert_eq!(session.snapshot().shops[1].inflation, 150);
        }
    }
}

fn params(preview: &Value) -> Value {
    json!({"expectedRevision":preview["revision"], "expectedProjectId":preview["projectId"],
        "expectedSourceIdentity":preview["assessment"]["sourceIdentity"],
        "expectedInterpretationVersion":preview["assessment"]["previousVersion"],"replaceConflicts":[]})
}

#[test]
fn repair_preview_is_bounded_and_repaired_history_survives_reopen() {
    let (_temporary, store, mut session) = fixture();
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.import-repair.assess",
        json!({"limit":1}),
    )
    .unwrap();
    assert_eq!(
        preview["assessment"]["entries"].as_array().unwrap().len(),
        1
    );
    assert_eq!(preview["total"], 105);
    assert_eq!(session.revision().0, 0); // Preview/Cancel cannot author data.
    let request = json!({"id":1,"method":"project.import-repair.apply","params":params(&preview)});
    let mut output = Vec::new();
    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{request}\n")),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true);
    let (_, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(
        reopened.snapshot().import_interpretation_version,
        providence_core::import_repair::INTERPRETATION_VERSION
    );
    assert_eq!(reopened.snapshot().scenario_spells.len(), 105);
    assert_eq!(reopened.undo_history().len(), 1);
    crate::dispatch_result(&mut reopened, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(reopened.snapshot().import_interpretation_version, 0);
    assert!(reopened.snapshot().scenario_spells.is_empty());
    crate::dispatch_result(&mut reopened, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(reopened.snapshot().scenario_spells.len(), 105);
}

#[test]
fn stale_and_unknown_repair_selections_leave_the_project_unchanged() {
    let (_temporary, store, mut session) = fixture();
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.import-repair.assess",
        json!({}),
    )
    .unwrap();
    let before = session.snapshot().clone();
    let mut request = params(&preview);
    request["replaceConflicts"] = json!(["spell:0"]);
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.import-repair.apply",
            request
        )
        .is_err()
    );
    let mut request = params(&preview);
    request["expectedRevision"] = json!(999);
    assert!(
        dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.import-repair.apply",
            request
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert!(session.undo_history().is_empty());
}

#[test]
fn failed_repair_checkpoint_reports_uncertainty_and_does_not_process_another_command() {
    let (_temporary, store, mut session) = fixture();
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.import-repair.assess",
        json!({}),
    )
    .unwrap();
    let saved = store.root().join("acknowledged.json");
    std::fs::rename(store.snapshot_path(), &saved).unwrap();
    std::fs::create_dir(store.snapshot_path()).unwrap();
    let request = json!({"id":1,"method":"project.import-repair.apply","params":params(&preview)});
    let later = json!({"id":2,"method":"session.describe","params":{}});
    let mut output = Vec::new();
    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(format!("{request}\n{later}\n")),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["id"], 1);
    assert_eq!(response["ok"], false);
    assert_eq!(response["outcomeUnknown"], true);
    std::fs::remove_dir(store.snapshot_path()).unwrap();
    std::fs::rename(saved, store.snapshot_path()).unwrap();
    let (_, reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.revision().0, 0);
    assert!(reopened.snapshot().scenario_spells.is_empty());
}

#[test]
fn a_lost_repair_reply_does_not_lose_the_durable_change_or_undo() {
    struct LostReply;
    impl std::io::Write for LostReply {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::ErrorKind::BrokenPipe.into())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let (_temporary, store, mut session) = fixture();
    let preview = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.import-repair.assess",
        json!({}),
    )
    .unwrap();
    let request = json!({"id":1,"method":"project.import-repair.apply","params":params(&preview)});
    assert!(
        serve_io(
            &mut session,
            Some(&store),
            Cursor::new(format!("{request}\n")),
            &mut LostReply
        )
        .is_err()
    );
    let (_, mut reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.revision().0, 1);
    assert_eq!(reopened.snapshot().scenario_spells.len(), 105);
    assert_eq!(reopened.undo_history().len(), 1);
    crate::dispatch_result(&mut reopened, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert!(reopened.snapshot().scenario_spells.is_empty());
}
