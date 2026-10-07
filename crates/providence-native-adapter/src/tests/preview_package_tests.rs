use crate::demo::demo_snapshot;
use crate::dispatch_result_with_store;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;

#[test]
fn rebuilt_package_command_cannot_publish_an_incomplete_project() {
    let temporary = tempfile::tempdir().expect("temporary root");
    let root = temporary.path().join("project");
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(&root, &snapshot).expect("create store");
    let mut session = EditorSession::new(snapshot);
    let output = temporary.path().join("blocked.realmz2");

    let error = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.compile-rebuilt-package",
        json!({
            "path": output,
            "minimumEngineVersion": "0.1.0"
        }),
    )
    .expect_err("incomplete project must not be published");

    assert!(error.starts_with("Rebuilt package compilation is blocked by:"));
    assert!(error.contains("rebuilt.campaign-metadata.missing"));
    assert!(!output.exists());
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn rebuilt_package_command_rejects_a_stale_preview_revision_before_compilation() {
    let temporary = tempfile::tempdir().expect("temporary root");
    let root = temporary.path().join("project");
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(&root, &snapshot).expect("create store");
    let mut session = EditorSession::new(snapshot);
    let output = temporary.path().join("stale.realmz2");

    let error = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.compile-rebuilt-package",
        json!({
            "path": output,
            "minimumEngineVersion": "0.1.0",
            "expectedRevision": 9
        }),
    )
    .expect_err("stale preview compilation must be rejected");

    assert_eq!(error, "revision conflict: expected 9, current 0");
    assert!(!output.exists());
    assert_eq!(session.revision(), Revision(0));
}
