use super::*;
use providence_core::model::StableId;

fn ready_job() -> (Jobs, EditorSession, ProjectStore, TempDir) {
    let active_root = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("import-job-test".into()));
    let store = ProjectStore::create_new(active_root.path().join("active"), &snapshot).unwrap();
    let session = EditorSession::new(snapshot.clone());
    let root = tempfile::tempdir().unwrap();
    let staged = ProjectStore::create_new(root.path().join("staged"), &snapshot).unwrap();
    let mut imported = snapshot;
    imported.origin = providence_core::model::ProjectOrigin::Imported {
        compatibility_annex: staged.put_blob(b"controlled annex").unwrap(),
    };
    let prepared = Prepared {
        snapshot: imported,
        acknowledgement: json!({"counts": {}}),
        store: staged,
        _root: root,
    };
    let worker = thread::spawn(|| {});
    let job = Job {
        id: 1,
        project: session.snapshot().project_id.clone(),
        revision: session.revision(),
        destination: store.root().into(),
        cancel: Arc::new(AtomicBool::new(false)),
        state: Arc::new(Mutex::new(State {
            phase: "complete".into(),
            completed: 1,
            result: Some(Ok(prepared)),
            ..Default::default()
        })),
        worker,
    };
    (
        Jobs {
            next_id: 1,
            current: Some(job),
        },
        session,
        store,
        active_root,
    )
}

#[test]
fn cancellation_discards_ready_truth_and_never_commits() {
    let (mut jobs, mut session, store, _root) = ready_job();
    let before = session.snapshot().clone();
    let scratch = jobs
        .current
        .as_ref()
        .unwrap()
        .state
        .lock()
        .unwrap()
        .result
        .as_ref()
        .unwrap()
        .as_ref()
        .unwrap()
        ._root
        .path()
        .to_owned();
    let params = json!({"jobId": 1});
    assert_eq!(
        jobs.continue_job(&mut session, Some(&store), "cancel", &params)
            .unwrap()["status"],
        "cancelled"
    );
    assert_eq!(
        jobs.continue_job(&mut session, Some(&store), "commit", &params)
            .unwrap()["status"],
        "cancelled"
    );
    assert_eq!(*session.snapshot(), before);
    assert!(!scratch.exists());
}

#[test]
fn a_ready_job_cannot_publish_into_another_project() {
    let (mut jobs, _, store, _root) = ready_job();
    let mut replacement =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("other".into())));
    assert!(
        jobs.continue_job(
            &mut replacement,
            Some(&store),
            "commit",
            &json!({"jobId": 1})
        )
        .unwrap_err()
        .contains("stale")
    );
    assert_eq!(replacement.revision(), Revision(0));
}

#[test]
fn commit_is_single_use_and_requests_a_complete_refresh() {
    let (mut jobs, mut session, store, _root) = ready_job();
    let params = json!({"jobId": 1});
    let result = jobs
        .continue_job(&mut session, Some(&store), "commit", &params)
        .unwrap();
    assert_eq!(result["refreshRequired"], true);
    assert_eq!(session.revision(), Revision(1));
    assert!(
        jobs.continue_job(&mut session, Some(&store), "commit", &params)
            .unwrap_err()
            .contains("stale")
    );
    assert_eq!(session.revision(), Revision(1));
}

#[test]
fn cancellation_after_commit_reports_the_committed_baseline() {
    let (mut jobs, mut session, store, _root) = ready_job();
    let params = json!({"jobId":1});
    jobs.continue_job(&mut session, Some(&store), "commit", &params)
        .unwrap();
    let result = jobs
        .continue_job(&mut session, Some(&store), "cancel", &params)
        .unwrap();
    assert_eq!(result["status"], "committed");
    assert_eq!(result["committed"], true);
    assert_eq!(session.revision(), Revision(1));
}

#[test]
fn connection_shutdown_waits_for_private_worker_cleanup() {
    let (mut jobs, session, store, _root) = ready_job();
    let mut job = jobs.current.take().unwrap();
    job.state.lock().unwrap().result = None;
    let scratch = tempfile::tempdir().unwrap();
    let path = scratch.path().to_owned();
    let cancel = job.cancel.clone();
    job.worker.join().unwrap();
    job.worker = thread::spawn(move || {
        while !cancel.load(Ordering::Relaxed) {
            thread::yield_now();
        }
        drop(scratch);
    });
    jobs.current = Some(job);
    drop(jobs);
    assert!(!path.exists());
    assert_eq!(session.revision(), Revision(0));
    assert_eq!(store.load_snapshot().unwrap(), *session.snapshot());
}

#[test]
fn captured_inputs_are_pinned_and_receipts_do_not_enter_the_import_directory() {
    let source = tempfile::tempdir().unwrap();
    let captured = tempfile::tempdir().unwrap();
    fs::write(source.path().join("Scenario.rsrc"), b"original").unwrap();
    let inputs = capture_directory(
        source.path(),
        captured.path(),
        "scenario source files",
        &AtomicBool::new(false),
    )
    .unwrap();
    fs::write(source.path().join("Scenario.rsrc"), b"changed").unwrap();
    assert_eq!(
        fs::read(captured.path().join("Scenario.rsrc")).unwrap(),
        b"original"
    );
    assert_eq!(inputs.len(), 1);
    assert_eq!(fs::read_dir(captured.path()).unwrap().count(), 1);
    assert!(
        capture_directory(
            source.path(),
            captured.path(),
            "scenario source files",
            &AtomicBool::new(true)
        )
        .is_err()
    );
}
