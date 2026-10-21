use super::*;
use providence_core::model::StableId;

fn fixture() -> (tempfile::TempDir, ProjectStore, ProjectSnapshot) {
    let temporary = tempfile::tempdir().unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("source-annex".into()));
    let store = ProjectStore::create(temporary.path(), &snapshot).unwrap();
    snapshot.classic_sources = replace_sources(&[], &store, &[("Data MD", &[1, 2])]).unwrap();
    (temporary, store, snapshot)
}

fn attach(snapshot: &mut ProjectSnapshot, store: &ProjectStore, annex: Value) -> BlobId {
    let blob = store
        .put_blob(&serde_json::to_vec(&annex).unwrap())
        .unwrap();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    blob
}

#[test]
fn partial_merge_preserves_metadata_and_exact_replacements_without_touching_old_blob() {
    let (_temporary, store, mut snapshot) = fixture();
    let original = json!({"format":ANNEX_FORMAT,"sourceInventoryVersion":2,
        "capture":{"label":"complete native capture"},"files":snapshot.classic_sources});
    let old = attach(&mut snapshot, &store, original.clone());
    let sources = replace_sources(
        &snapshot.classic_sources,
        &store,
        &[("Data MD", &[3, 4, 5]), ("Data DES", &[6])],
    )
    .unwrap();
    let merged = store_source_annex(&snapshot, &store, &sources).unwrap();
    let result: Value = serde_json::from_slice(&store.read_blob(&merged).unwrap()).unwrap();
    assert_eq!(result["files"], json!(sources));
    assert_eq!(result["sourceInventoryVersion"], 2);
    assert_eq!(result["capture"], original["capture"]);
    assert_eq!(
        serde_json::from_slice::<Value>(&store.read_blob(&old).unwrap()).unwrap(),
        original
    );
}

#[test]
fn fresh_legacy_and_unknown_annexes_never_acquire_complete_inventory_evidence() {
    let (_temporary, store, mut snapshot) = fixture();
    for original in [None, Some(b"opaque legacy annex".to_vec()),
        Some(serde_json::to_vec(&json!({"format":"future-format","sourceInventoryVersion":2})).unwrap()),
        Some(serde_json::to_vec(&json!({"format":ANNEX_FORMAT,"files":snapshot.classic_sources})).unwrap()),
        Some(serde_json::to_vec(&json!({"format":ANNEX_FORMAT,"sourceInventoryVersion":3,"files":snapshot.classic_sources})).unwrap())] {
        snapshot.origin = original.as_ref().map_or(ProjectOrigin::Authored, |bytes|
            ProjectOrigin::Imported { compatibility_annex:store.put_blob(bytes).unwrap() });
        let blob = store_source_annex(&snapshot, &store, &snapshot.classic_sources).unwrap();
        let annex: Value = serde_json::from_slice(&store.read_blob(&blob).unwrap()).unwrap();
        assert_ne!(annex.get("sourceInventoryVersion").and_then(Value::as_u64), Some(2));
        assert_eq!(annex["files"], json!(snapshot.classic_sources));
    }
}

#[test]
fn inconsistent_structured_annexes_do_not_transfer_completeness() {
    let (_temporary, store, mut snapshot) = fixture();
    let mut altered = snapshot.classic_sources.clone();
    altered[0].byte_length += 1;
    for files in [
        json!([]),
        json!(altered),
        json!("invalid inventory"),
        json!([snapshot.classic_sources[0], snapshot.classic_sources[0]]),
    ] {
        attach(
            &mut snapshot,
            &store,
            json!({"format":ANNEX_FORMAT,"sourceInventoryVersion":2,"files":files}),
        );
        assert!(store_source_annex(&snapshot, &store, &snapshot.classic_sources).is_err());
    }
}

#[test]
fn partial_merge_cannot_drop_complete_capture_paths_or_create_duplicate_paths() {
    let (_temporary, store, mut snapshot) = fixture();
    let original =
        json!({"format":ANNEX_FORMAT,"sourceInventoryVersion":2,"files":snapshot.classic_sources});
    attach(&mut snapshot, &store, original);
    assert!(
        store_source_annex(&snapshot, &store, &[])
            .unwrap_err()
            .contains("cannot remove")
    );
    let duplicated = vec![snapshot.classic_sources[0].clone(); 2];
    assert!(
        store_source_annex(&snapshot, &store, &duplicated)
            .unwrap_err()
            .contains("repeats Data MD")
    );
}
