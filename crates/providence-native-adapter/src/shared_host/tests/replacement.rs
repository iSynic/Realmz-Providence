use super::export_jobs::{begin, prepared, read, settled};
use super::*;
use std::{fs, time::Duration};

fn replacing(fixture: &mut Fixture, original: &Value) -> Value {
    let mut params = fixture.meta();
    params["operationId"] = json!("replace-artifact");
    params["format"] = json!("classic");
    params["path"] = json!(fixture.root.path().join("outputs/Classic"));
    params["replacement"] = json!({"expectedSha256":original["artifactSha256"]});
    let result = fixture.request(1, "export.begin", params);
    assert!(result.ok, "{:?}", result.error);
    result.result.unwrap()
}

#[test]
fn changed_artifact_at_publication_is_preserved_without_a_backup_move() {
    let mut fixture = prepared();
    let initial = begin(&mut fixture);
    let original = settled(&mut fixture, &initial);
    let (ready, release) = fixture
        .state
        .hold_export(super::super::export_jobs::TestPoint::BeforePublish);
    let job = replacing(&mut fixture, &original);
    ready.recv_timeout(Duration::from_secs(2)).unwrap();
    let changed = fixture.root.path().join("outputs/Classic/Data SD2");
    fs::write(&changed, b"Externally changed").unwrap();
    release.send(()).unwrap();
    let result = settled(&mut fixture, &job);
    assert_eq!(result["state"], "failed", "{result}");
    assert_eq!(result["committed"], false);
    assert!(
        result["error"]
            .as_str()
            .unwrap()
            .contains("export-artifact-changed")
    );
    assert_eq!(fs::read(changed).unwrap(), b"Externally changed");
    assert!(!std::path::Path::new(result["replacement"]["backupPath"].as_str().unwrap()).exists());
}

#[test]
fn cancellation_after_backup_restores_original_without_overwriting_anything() {
    let mut fixture = prepared();
    let initial = begin(&mut fixture);
    let original = settled(&mut fixture, &initial);
    let expected = fs::read(fixture.root.path().join("outputs/Classic/Data SD2")).unwrap();
    let (ready, release) = fixture
        .state
        .hold_export(super::super::export_jobs::TestPoint::AfterBackup);
    let job = replacing(&mut fixture, &original);
    ready.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(!fixture.root.path().join("outputs/Classic").exists());
    read(&mut fixture, &job, "export.cancel");
    release.send(()).unwrap();
    let result = settled(&mut fixture, &job);
    assert_eq!(result["state"], "cancelled", "{result}");
    assert_eq!(result["committed"], false);
    assert_eq!(result["replacement"]["state"], "restored");
    assert_eq!(
        fs::read(fixture.root.path().join("outputs/Classic/Data SD2")).unwrap(),
        expected
    );
    assert!(!std::path::Path::new(result["replacement"]["backupPath"].as_str().unwrap()).exists());
}

#[test]
fn destination_race_retains_external_output_and_the_complete_original_backup() {
    let mut fixture = prepared();
    let initial = begin(&mut fixture);
    let original = settled(&mut fixture, &initial);
    let expected = fs::read(fixture.root.path().join("outputs/Classic/Data SD2")).unwrap();
    let (ready, release) = fixture
        .state
        .hold_export(super::super::export_jobs::TestPoint::AfterBackup);
    let job = replacing(&mut fixture, &original);
    ready.recv_timeout(Duration::from_secs(2)).unwrap();
    let destination = fixture.root.path().join("outputs/Classic");
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("external.keep"), b"External publisher").unwrap();
    release.send(()).unwrap();
    let result = settled(&mut fixture, &job);
    assert_eq!(result["state"], "failed", "{result}");
    assert_eq!(result["committed"], false);
    assert_eq!(result["replacement"]["state"], "restore-blocked");
    assert!(
        result["error"]
            .as_str()
            .unwrap()
            .contains("export-replacement-restore-blocked")
    );
    let backup = std::path::Path::new(result["replacement"]["backupPath"].as_str().unwrap());
    assert_eq!(fs::read(backup.join("Data SD2")).unwrap(), expected);
    assert_eq!(
        fs::read(destination.join("external.keep")).unwrap(),
        b"External publisher"
    );
    assert!(!destination.join("Data SD2").exists());
}
