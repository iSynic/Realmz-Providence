use std::io::Cursor;
use std::sync::mpsc;
use std::time::Duration;

use crate::Request;
use crate::Response;
use crate::catalogs::CatalogViews;
use providence_core::model::AssetDescriptor;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::ClassicAction;
use providence_core::model::ClassicResourceKey;
use providence_core::model::ExtraActionPoint;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::ScenarioMessage;
use providence_core::model::StableId;
use providence_core::rebuilt::ApplicationMediaAsset;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaSource;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::Value;
use serde_json::json;
use std::time::Instant;

fn session() -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("validation-jobs".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Before".into(),
        authored: true,
    });
    for id in 0..300 {
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId(format!("caller:{id}")),
            native_id: NativeRecordId(id),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 999,
            }],
        });
    }
    EditorSession::new(snapshot)
}

#[test]
fn a_same_revision_project_switch_cannot_receive_an_old_page() {
    let (mut jobs, observed, release) = blocked_first_job();
    let mut original = session();
    let id = begin(&mut jobs, &mut original, json!({}));
    observed.recv_timeout(Duration::from_secs(5)).unwrap();
    let mut other = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "other-project".into(),
    )));
    let result = response(
        &mut jobs,
        &mut other,
        "validation.poll",
        json!({"jobId":id}),
    );
    assert_eq!(result.result.unwrap()["status"], "superseded");
    release.send(()).unwrap();
    let next = begin(&mut jobs, &mut other, json!({}));
    assert_eq!(ready(&jobs, &other, next)["page"]["unfilteredTotal"], 0);
}

#[test]
fn readiness_uses_the_background_worker_and_can_be_cancelled() {
    let mut jobs = Jobs::default();
    let mut project = session();
    let response = response(
        &mut jobs,
        &mut project,
        "readiness.begin",
        json!({"target":"classic", "limit":8}),
    );
    assert!(response.ok);
    let id = response.result.unwrap()["jobId"].as_u64().unwrap();
    assert_eq!(ready(&jobs, &project, id)["status"], "ready");
    assert_eq!(jobs.cancel(id)["cancelled"], true);
    assert_eq!(jobs.poll(id, project.revision())["status"], "superseded");
    assert!(!project.can_undo());
}

fn response(jobs: &mut Jobs, session: &mut EditorSession, method: &str, params: Value) -> Response {
    crate::dispatch(
        session,
        None,
        CatalogViews::default(),
        None,
        jobs,
        Request {
            id: 1,
            method: method.into(),
            params,
        },
    )
}

fn begin(jobs: &mut Jobs, session: &mut EditorSession, params: Value) -> u64 {
    let response = response(jobs, session, "validation.begin", params);
    assert!(response.ok, "{:?}", response.error);
    let result = response.result.unwrap();
    assert_eq!(result["status"], "pending");
    result["jobId"].as_u64().unwrap()
}

fn ready(jobs: &Jobs, session: &EditorSession, id: u64) -> Value {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let result = jobs.poll(id, session.revision());
        if result["status"] != "pending" {
            return result;
        }
        assert!(Instant::now() < deadline, "validation job did not finish");
        thread::yield_now();
    }
}

fn blocked_first_job() -> (Jobs, mpsc::Receiver<u64>, mpsc::Sender<()>) {
    let (started, observed) = mpsc::channel();
    let (release, wait) = mpsc::channel();
    let wait = Mutex::new(wait);
    let jobs = Jobs::with_evaluator(Arc::new(move |work| {
        started.send(work.id).unwrap();
        if work.id == 1 {
            wait.lock()
                .unwrap()
                .recv_timeout(Duration::from_secs(5))
                .unwrap();
        }
        evaluate(work)
    }));
    (jobs, observed, release)
}

#[test]
fn a_blocked_checker_leaves_mutations_available_and_cannot_publish_an_old_revision() {
    let (mut jobs, observed, release) = blocked_first_job();
    let mut session = session();
    let id = begin(&mut jobs, &mut session, json!({"limit":8}));
    assert_eq!(observed.recv_timeout(Duration::from_secs(5)).unwrap(), id);
    assert_eq!(jobs.poll(id, session.revision())["status"], "pending");
    let changed = response(
        &mut jobs,
        &mut session,
        "message.update",
        json!({
            "expectedRevision":0, "identity":"message:0", "text":"While checking",
        }),
    );
    assert!(changed.ok, "{:?}", changed.error);
    assert_eq!(session.revision(), Revision(1));
    let outdated = jobs.poll(id, session.revision());
    assert_eq!(outdated["status"], "outdated");
    assert_eq!(outdated["revision"], 1);
    assert!(outdated.get("page").is_none());
    release.send(()).unwrap();
    let next = begin(&mut jobs, &mut session, json!({"limit":8}));
    let result = ready(&jobs, &session, next);
    assert_eq!(result["status"], "ready");
    assert_eq!(result["page"]["revision"], 1);
    assert_eq!(jobs.poll(id, session.revision())["status"], "superseded");
    assert_eq!(session.undo_history().len(), 1);
}

#[test]
fn only_the_latest_pending_query_runs_and_old_cancellation_cannot_cancel_it() {
    let (mut jobs, observed, release) = blocked_first_job();
    let mut session = session();
    let first = begin(&mut jobs, &mut session, json!({"limit":8}));
    assert_eq!(
        observed.recv_timeout(Duration::from_secs(5)).unwrap(),
        first
    );
    let obsolete = begin(
        &mut jobs,
        &mut session,
        json!({"query":"caller:101", "limit":8}),
    );
    let latest = begin(
        &mut jobs,
        &mut session,
        json!({"query":"caller:299", "limit":8}),
    );
    assert_eq!(lock(&jobs.shared).pending.as_ref().unwrap().id, latest);
    assert_eq!(
        jobs.poll(obsolete, session.revision())["status"],
        "superseded"
    );
    assert_eq!(jobs.cancel(obsolete)["cancelled"], false);
    release.send(()).unwrap();
    assert_eq!(
        observed.recv_timeout(Duration::from_secs(5)).unwrap(),
        latest
    );
    let result = ready(&jobs, &session, latest);
    assert_eq!(result["page"]["total"], 1);
    assert_eq!(result["page"]["items"][0]["entity"], "caller:299");
    assert!(observed.try_recv().is_err());
    assert_eq!(session.revision(), Revision(0));
    assert!(!session.can_undo());
}

#[test]
fn cancellation_removes_the_pending_input_and_late_work_cannot_restore_it() {
    let (mut jobs, observed, release) = blocked_first_job();
    let mut session = session();
    let first = begin(&mut jobs, &mut session, json!({}));
    assert_eq!(
        observed.recv_timeout(Duration::from_secs(5)).unwrap(),
        first
    );
    let queued = begin(&mut jobs, &mut session, json!({"query":"obsolete"}));
    assert_eq!(jobs.cancel(queued)["cancelled"], true);
    assert!(lock(&jobs.shared).pending.is_none());
    assert!(lock(&jobs.shared).latest.is_none());
    release.send(()).unwrap();
    let latest = begin(&mut jobs, &mut session, json!({"limit":3}));
    assert_eq!(
        observed.recv_timeout(Duration::from_secs(5)).unwrap(),
        latest
    );
    assert_eq!(
        ready(&jobs, &session, latest)["page"]["items"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        jobs.poll(queued, session.revision())["status"],
        "superseded"
    );
    assert_eq!(jobs.poll(first, session.revision())["status"], "superseded");
}

#[test]
fn worker_panic_and_invalid_requests_preserve_authored_state_and_allow_retry() {
    let mut jobs = Jobs::with_evaluator(Arc::new(|work| {
        if work.id == 1 {
            panic!("controlled validation panic");
        }
        evaluate(work)
    }));
    let mut session = session();
    let before = serde_json::to_value(session.persisted_state()).unwrap();
    let id = begin(&mut jobs, &mut session, json!({}));
    let failed = ready(&jobs, &session, id);
    assert_eq!(failed["status"], "failed");
    assert!(failed["error"].as_str().unwrap().contains("Try again"));
    let next = begin(&mut jobs, &mut session, json!({}));
    assert_eq!(ready(&jobs, &session, next)["status"], "ready");
    for (method, params) in [
        ("validation.begin", json!({"severity":"unexpected"})),
        ("validation.begin", json!({"selection":{"code":4}})),
        ("validation.poll", json!({"jobId":-1})),
        ("validation.poll", json!({"jobId":"1"})),
        ("validation.cancel", json!({})),
    ] {
        assert!(!response(&mut jobs, &mut session, method, params).ok);
        assert_eq!(jobs.poll(next, session.revision())["status"], "ready");
    }
    assert_eq!(
        serde_json::to_value(session.persisted_state()).unwrap(),
        before
    );
}

#[test]
fn background_pages_match_the_synchronous_projection_exactly_and_stay_bounded() {
    let mut jobs = Jobs::default();
    let mut session = session();
    for params in [
        json!({}),
        json!({"limit":8, "offset":296, "clampOffset":true}),
        json!({"query":"caller:299", "category":"links", "limit":8}),
        json!({"limit":128, "selection":{"code":"reference.message.missing", "entity":"caller:299", "field":"actions[0].target"}, "locateSelection":true}),
    ] {
        let expected = project(&session, None, &params).unwrap();
        let id = begin(&mut jobs, &mut session, params);
        let result = ready(&jobs, &session, id);
        assert_eq!(result["page"], expected);
        assert!(result["page"]["items"].as_array().unwrap().len() <= 128);
        assert!(result["page"].get("snapshot").is_none());
    }
}

#[test]
fn line_protocol_jobs_are_session_scoped_read_only_and_revision_checked() {
    let mut session = session();
    let requests = [
        json!({"id":1,"method":"validation.begin","params":{"limit":8}}),
        json!({"id":2,"method":"message.update","params":{"expectedRevision":0,"identity":"message:0","text":"After"}}),
        json!({"id":3,"method":"validation.poll","params":{"jobId":1}}),
        json!({"id":4,"method":"validation.cancel","params":{"jobId":1}}),
    ].into_iter().map(|value| format!("{value}\n")).collect::<String>();
    let mut output = Vec::new();
    crate::transport::serve_io(&mut session, None, Cursor::new(requests), &mut output).unwrap();
    let responses = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 4);
    assert!(responses.iter().all(|response| response["ok"] == true));
    assert_eq!(responses[0]["result"]["status"], "pending");
    assert_eq!(responses[2]["result"]["status"], "outdated");
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(session.undo_history().len(), 1);
}

#[test]
fn background_validation_uses_the_same_exact_application_catalog_without_importing_it() {
    use providence_core::model::BlobId;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("validation-media".into()));
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = -4;
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Application tile".into(),
        tiles,
        runtime: None,
    });
    let session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let blob =
        BlobId("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".into());
    let source = StableId("controlled-application".into());
    let mut catalog = ApplicationMediaCatalog::empty(StableId("validation-library".into()));
    catalog.sources.push(ApplicationMediaSource {
        identity: source.clone(),
        native_name: "Controlled source".into(),
        priority: 0,
        blob: blob.clone(),
        byte_length: 0,
    });
    catalog.assets.push(ApplicationMediaAsset {
        source,
        source_priority: 0,
        descriptor: AssetDescriptor {
            identity: StableId("application-tile:-4".into()),
            label: "Controlled tile".into(),
            kind: "special-land-tile".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: -4,
            }),
            scenario_music_slot: None,
            blob,
            byte_length: 0,
            classic_payload_blob: None,
            classic_payload_byte_length: None,
            extension: Some("png".into()),
            width: Some(32),
            height: Some(32),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "Controlled catalog metadata".into(),
        },
    });
    let params = json!({"query":"reference.special-land-tile.missing", "limit":8});
    assert_eq!(project(&session, None, &params).unwrap()["total"], 1);
    let mut jobs = Jobs::default();
    for (kind, unresolved) in [("special-land-tile", 0), ("icon", 1)] {
        catalog.assets[0].descriptor.kind = kind.into();
        let expected = project(&session, Some(&catalog), &params).unwrap();
        assert_eq!(expected["total"], unresolved);
        let ticket = jobs.begin(&session, Some(&catalog), &params).unwrap();
        let actual = ready(&jobs, &session, ticket["jobId"].as_u64().unwrap());
        assert_eq!(actual["page"], expected);
        assert_eq!(session.snapshot(), &before);
        assert!(session.snapshot().assets.is_empty());
    }
}
use super::*;
