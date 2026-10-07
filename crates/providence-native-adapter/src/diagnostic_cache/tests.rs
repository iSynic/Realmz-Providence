use super::Cache;
use providence_core::model::{
    ClassicSourceBlob, NativeRecordId, ProjectSnapshot, ScenarioMessage, StableId,
};
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("readiness-source-access".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Current draft".into(),
        authored: true,
    });
    snapshot
}

#[test]
fn readiness_uses_live_truth_without_loading_saved_truth_or_rebuilding_indexes() {
    let directory = tempfile::tempdir().unwrap();
    let mut snapshot = snapshot();
    let store = ProjectStore::create(directory.path(), &snapshot).unwrap();
    std::fs::remove_file(store.local_database_path()).unwrap();
    std::fs::write(store.snapshot_path(), b"unreadable saved snapshot").unwrap();
    snapshot.messages[0].text = "Unsaved draft".into();
    let mut cache = Cache::default();
    for target in ["classic", "rebuilt"] {
        let page = cache
            .evaluate(
                snapshot.clone(),
                Revision(2),
                None,
                &json!({"limit":8}),
                Some((target.into(), Some(store.clone()))),
            )
            .unwrap();
        assert_eq!(page["revision"], 2);
        assert!(!store.local_database_path().exists());
    }
    assert_eq!(
        std::fs::read(store.snapshot_path()).unwrap(),
        b"unreadable saved snapshot"
    );
}

#[test]
fn cached_readiness_still_requires_its_captured_source_bytes() {
    let directory = tempfile::tempdir().unwrap();
    let mut snapshot = snapshot();
    let store = ProjectStore::create(directory.path(), &snapshot).unwrap();
    let bytes = b"retained source";
    let blob = store.put_blob(bytes).unwrap();
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "optional source".into(),
        blob: blob.clone(),
        byte_length: bytes.len() as u64,
    });
    let mut cache = Cache::default();
    let params = json!({"limit":8});
    cache
        .evaluate(
            snapshot.clone(),
            Revision(1),
            None,
            &params,
            Some(("classic".into(), Some(store.clone()))),
        )
        .unwrap();
    let hash = blob.0.strip_prefix("sha256:").unwrap();
    std::fs::remove_file(directory.path().join("blobs/sha256").join(hash)).unwrap();
    let error = cache
        .evaluate(
            snapshot,
            Revision(1),
            None,
            &params,
            Some(("classic".into(), Some(store))),
        )
        .unwrap_err();
    assert!(error.contains("Readiness support"), "{error}");
    assert!(error.contains(hash), "{error}");
}
