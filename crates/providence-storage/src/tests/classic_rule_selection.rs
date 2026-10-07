use super::*;
use providence_core::model::{
    ClassicRuleSelectionContextV1, ClassicRuleSelectionEvidence, classic_source_set_sha256,
};
use serde_json::Value;

fn context(snapshot: &ProjectSnapshot) -> ClassicRuleSelectionContextV1 {
    ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: snapshot.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(snapshot).unwrap(),
        native_menu_selection: 10,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    }
}

#[test]
fn selection_and_clear_survive_reopen_undo_redo_and_portable_copy() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Before")).unwrap();
    let mut initial = snapshot("Before");
    attach_imported_source(&store, &mut initial);
    let selected = context(&initial);
    let mut session = EditorSession::new(initial);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ClassicRuleSelection(
                providence_core::session::ClassicRuleSelectionCommand::Set {
                    context: selected.clone(),
                    expected_previous_identity: None,
                    expected_source_set_sha256: selected.captured_source_set_sha256.clone(),
                },
            ),
        })
        .unwrap();
    store
        .checkpoint_session(&session, &json!({"method":"classic-rule-selection.set"}))
        .unwrap();
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(
        reopened.snapshot().classic_rule_selection,
        Some(selected.clone())
    );
    reopened
        .execute(ExpectedRevisionCommand {
            expected_revision: reopened.revision(),
            command: EditorCommand::ClassicRuleSelection(
                providence_core::session::ClassicRuleSelectionCommand::Clear {
                    expected_previous_identity: Some(selected.identity()),
                    expected_source_set_sha256: selected.captured_source_set_sha256.clone(),
                },
            ),
        })
        .unwrap();
    store
        .checkpoint_session(&reopened, &json!({"method":"classic-rule-selection.clear"}))
        .unwrap();
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert!(reopened.snapshot().classic_rule_selection.is_none());
    reopened
        .execute(ExpectedRevisionCommand {
            expected_revision: reopened.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    store
        .checkpoint_session(&reopened, &json!({"method":"history.undo"}))
        .unwrap();
    let (_, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(reopened.snapshot().classic_rule_selection, Some(selected));
    verify_portable_copy(&store, &mut reopened);
}

fn verify_portable_copy(store: &ProjectStore, reopened: &mut EditorSession) {
    let copy = tempfile::tempdir().unwrap();
    let copied = ProjectStore::create(copy.path(), &snapshot("Copy")).unwrap();
    for source in &reopened.snapshot().classic_sources {
        copied
            .put_blob(&store.read_blob(&source.blob).unwrap())
            .unwrap();
    }
    copied.save_snapshot(reopened.snapshot()).unwrap();
    assert_eq!(copied.load_snapshot().unwrap(), *reopened.snapshot());
    reopened
        .execute(ExpectedRevisionCommand {
            expected_revision: reopened.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert!(reopened.snapshot().classic_rule_selection.is_none());
}

fn attach_imported_source(store: &ProjectStore, initial: &mut ProjectSnapshot) {
    let blob = store.put_blob(b"original source bytes").unwrap();
    initial.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    initial.classic_sources = vec![ClassicSourceBlob {
        native_path: "Data Race".into(),
        blob,
        byte_length: 21,
    }];
}

#[test]
fn version_35_segmented_project_gets_exact_retained_backup_and_no_inferred_selection() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Original")).unwrap();
    let mut root: Value =
        serde_json::from_slice(&fs::read(store.snapshot_path()).unwrap()).unwrap();
    root["snapshotFormatVersion"] = json!(35);
    root["segments"]
        .as_object_mut()
        .unwrap()
        .remove("classicRuleSelection");
    root["segments"]
        .as_object_mut()
        .unwrap()
        .remove("terrainMappings");
    root["segments"]
        .as_object_mut()
        .unwrap()
        .remove("importInterpretationVersion");
    root["segments"]["formatVersion"] =
        serde_json::to_value(store.put_blob(b"35").unwrap()).unwrap();
    let original = serde_json::to_vec_pretty(&root).unwrap();
    fs::write(store.snapshot_path(), &original).unwrap();
    let loaded = store.load_snapshot().unwrap();
    assert_eq!(loaded.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(loaded.classic_rule_selection.is_none());
    store.save_snapshot(&loaded).unwrap();
    assert_eq!(
        fs::read(temporary.path().join("snapshot-v35-backup.json")).unwrap(),
        original
    );
    let replacement = EditorSession::new(snapshot("Replacement"));
    let pruned = store
        .checkpoint_session(&replacement, &json!({"method":"project.save"}))
        .unwrap();
    assert!(pruned.infrastructure_warning.is_none());
    let recovered =
        ProjectStore::load_snapshot_file(temporary.path().join("snapshot-v35-backup.json"))
            .unwrap();
    assert_eq!(recovered.messages[0].text, "Original");
    let recovered =
        ProjectStore::load_snapshot_file(temporary.path().join("snapshot-v35-backup.json"))
            .unwrap();
    assert_eq!(recovered.messages[0].text, "Original");
    store.save_snapshot(&loaded).unwrap();
    assert_eq!(
        fs::read(temporary.path().join("snapshot-v35-backup.json")).unwrap(),
        original
    );
}

#[test]
fn invalid_binding_or_failed_checkpoint_never_replaces_durable_context() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Original")).unwrap();
    let before = fs::read(store.snapshot_path()).unwrap();
    let mut invalid = snapshot("Original");
    invalid.classic_rule_selection = Some(context(&invalid));
    assert!(store.save_snapshot(&invalid).is_err());
    assert_eq!(fs::read(store.snapshot_path()).unwrap(), before);
    invalid.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "c".repeat(64))),
    };
    assert!(store.save_snapshot(&invalid).is_err());
    assert_eq!(fs::read(store.snapshot_path()).unwrap(), before);
}
