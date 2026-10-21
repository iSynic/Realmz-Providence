use super::*;
use std::{
    fs,
    time::{Duration, Instant},
};

pub(super) fn prepared() -> Fixture {
    let mut fixture = Fixture::new();
    let mut snapshot = crate::demo::demo_snapshot();
    snapshot.project_id = StableId("mcp-fixture".into());
    snapshot
        .messages
        .iter_mut()
        .find(|row| row.native_id.0 == 47)
        .unwrap()
        .text = "Before capture".into();
    fixture.session = EditorSession::new(snapshot);
    crate::dispatch_result(
        &mut fixture.session,
        "action-reference.retarget",
        json!({
            "expectedRevision":0,"source":"action-point:land:0:17","slot":0,"targetNativeId":47
        }),
    )
    .unwrap();
    let output = fixture.root.path().join("outputs");
    fs::create_dir(&output).unwrap();
    fixture.attach_with_access(1, "mcp", json!({"outputRoot":output}));
    fixture
}

pub(super) fn begin(fixture: &mut Fixture) -> Value {
    let mut request = fixture.meta();
    request["format"] = json!("classic");
    request["path"] = json!(fixture.root.path().join("outputs/Classic"));
    request["operationId"] = json!("captured-export");
    let start = Instant::now();
    let result = fixture.request(1, "export.begin", request);
    assert!(result.ok, "{:?}", result.error);
    assert!(start.elapsed() < Duration::from_secs(2));
    result.result.unwrap()
}

pub(super) fn read(fixture: &mut Fixture, job: &Value, method: &str) -> Value {
    let mut request = fixture.meta();
    request["jobId"] = job["jobId"].clone();
    let response = fixture.request(1, method, request);
    assert!(response.ok, "{:?}", response.error);
    response.result.unwrap()
}

pub(super) fn settled(fixture: &mut Fixture, job: &Value) -> Value {
    let start = Instant::now();
    loop {
        let result = read(fixture, job, "export.poll");
        if matches!(
            result["state"].as_str().unwrap(),
            "completed" | "failed" | "cancelled" | "interrupted" | "uncertain"
        ) {
            return result;
        }
        assert!(start.elapsed() < Duration::from_secs(5), "{result}");
        std::thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn export_captures_the_revision_without_blocking_later_project_edits() {
    let mut fixture = prepared();
    let (ready, release) = fixture
        .state
        .hold_export(super::super::export_jobs::TestPoint::BeforeCompile);
    let job = begin(&mut fixture);
    ready.recv_timeout(Duration::from_secs(2)).unwrap();
    let revision = fixture.session.revision().0;
    fixture.group(
        json!([{"name":"text","tool":"providence_text_apply_draft","arguments":{"draft":{
            "family":"message","nativeId":47,"expectedText":"Before capture","text":"After capture"
        }}}]),
        "edit-after-capture",
    );
    release.send(()).unwrap();
    let result = settled(&mut fixture, &job);
    assert_eq!(result["state"], "completed", "{result}");
    assert_eq!(result["committed"], true);
    assert_eq!(result["sourceRevision"], revision);
    assert_eq!(fixture.session.revision().0, revision + 1);
    let bytes = fs::read(fixture.root.path().join("outputs/Classic/Data SD2")).unwrap();
    assert!(bytes.windows(14).any(|part| part == b"Before capture"));
    assert!(!bytes.windows(13).any(|part| part == b"After capture"));
}

#[test]
fn cancellation_before_publication_cleans_only_the_owned_staging_directory() {
    let mut fixture = prepared();
    fs::write(fixture.root.path().join("outputs/unrelated.keep"), b"keep").unwrap();
    let (ready, release) = fixture
        .state
        .hold_export(super::super::export_jobs::TestPoint::BeforePublish);
    let job = begin(&mut fixture);
    ready.recv_timeout(Duration::from_secs(2)).unwrap();
    fixture.attach(2, "native");
    assert_eq!(
        read(&mut fixture, &job, "export.cancel")["cancelRequested"],
        true
    );
    release.send(()).unwrap();
    let result = settled(&mut fixture, &job);
    assert_eq!(result["state"], "cancelled", "{result}");
    assert_eq!(result["committed"], false);
    let names: Vec<_> = fs::read_dir(fixture.root.path().join("outputs"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    assert_eq!(names, vec![std::ffi::OsString::from("unrelated.keep")]);
}

#[test]
fn recovered_journals_distinguish_interruption_from_an_uncertain_publication() {
    let mut fixture = prepared();
    let job = begin(&mut fixture);
    let completed = settled(&mut fixture, &job);
    assert_eq!(completed["state"], "completed", "{completed}");
    let original = fs::read(fixture.root.path().join("outputs/Classic/Data SD2")).unwrap();
    let journal = fixture
        .root
        .path()
        .join(".providence/export-jobs")
        .join(format!("{}.json", job["jobId"].as_str().unwrap()));
    let saved: Value = serde_json::from_slice(&fs::read(journal).unwrap()).unwrap();
    for (suffix, phase, state, committed) in [
        ("a", "compiling", "interrupted", json!(false)),
        ("b", "publishing", "uncertain", Value::Null),
    ] {
        let id = suffix.repeat(64);
        let mut simulated = saved.clone();
        simulated["jobId"] = json!(id);
        simulated["state"] = json!(phase);
        simulated["committed"] = Value::Null;
        let path = fixture
            .root
            .path()
            .join(".providence/export-jobs")
            .join(format!("{id}.json"));
        fs::write(&path, serde_json::to_vec(&simulated).unwrap()).unwrap();
        let recovered = read(&mut fixture, &simulated, "export.poll");
        assert_eq!(recovered["state"], state);
        assert_eq!(recovered["committed"], committed);
        assert!(
            recovered["error"]
                .as_str()
                .unwrap()
                .contains("no automatic retry")
                || state == "uncertain"
        );
        let persisted: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        assert_eq!(persisted["state"], state);
    }
    assert_eq!(
        fs::read(fixture.root.path().join("outputs/Classic/Data SD2")).unwrap(),
        original
    );
}

#[test]
fn late_cancellation_keeps_a_completed_publication_and_its_receipt() {
    let mut fixture = prepared();
    let job = begin(&mut fixture);
    let result = settled(&mut fixture, &job);
    assert_eq!(result["state"], "completed", "{result}");
    let cancelled = read(&mut fixture, &job, "export.cancel");
    assert_eq!(cancelled["committed"], true);
    assert_eq!(cancelled["artifactSha256"], result["artifactSha256"]);
    assert!(
        fixture
            .root
            .path()
            .join("outputs/Classic/Data SD2")
            .is_file()
    );
}
