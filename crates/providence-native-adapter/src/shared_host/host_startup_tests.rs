use super::receipt_path;
use std::fs;

#[cfg(windows)]
#[test]
fn receipt_accepts_the_windows_session_directory_entry_after_file_redirection() {
    let project = tempfile::tempdir().unwrap();
    let descriptor = providence_session_client::endpoint::descriptor_path(project.path()).unwrap();
    let directory = descriptor.parent().unwrap();
    let receipt = tempfile::Builder::new()
        .prefix("startup-")
        .suffix(".json")
        .tempfile_in(directory)
        .unwrap()
        .into_temp_path();
    assert_eq!(
        receipt_path(&receipt, directory, &"0".repeat(64)).unwrap(),
        receipt.canonicalize().unwrap()
    );
}

#[test]
fn receipt_must_be_the_empty_named_entry_in_the_session_directory() {
    let directory = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let path = directory.path().join("startup-test.json");
    let other = outside.path().join("startup-test.json");
    fs::write(&path, []).unwrap();
    fs::write(&other, []).unwrap();
    let nonce = "0".repeat(64);
    assert_eq!(
        receipt_path(&path, directory.path(), &nonce).unwrap(),
        path.canonicalize().unwrap()
    );
    assert!(receipt_path(&other, directory.path(), &nonce).is_err());
    assert!(receipt_path(&path, directory.path(), "short").is_err());
    fs::write(&path, b"already written").unwrap();
    assert!(receipt_path(&path, directory.path(), &nonce).is_err());
    let unrelated = directory.path().join("unrelated.json");
    fs::write(&unrelated, []).unwrap();
    assert!(receipt_path(&unrelated, directory.path(), &nonce).is_err());
    fs::create_dir(directory.path().join("startup-directory")).unwrap();
    assert!(
        receipt_path(
            &directory.path().join("startup-directory"),
            directory.path(),
            &nonce
        )
        .is_err()
    );
}

#[cfg(unix)]
#[test]
fn receipt_cannot_redirect_through_a_file_symlink() {
    let directory = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let target = outside.path().join("startup-link.json");
    fs::write(&target, []).unwrap();
    let link = directory.path().join("startup-link.json");
    std::os::unix::fs::symlink(&target, &link).unwrap();
    let nonce = "0".repeat(64);
    assert!(receipt_path(&link, directory.path(), &nonce).is_err());
    assert!(receipt_path(&target, directory.path(), &nonce).is_err());
}

#[test]
fn a_launched_host_counts_as_reported_once_its_reply_is_written() {
    let directory = tempfile::tempdir().unwrap();
    let path = tempfile::Builder::new()
        .prefix("startup-")
        .suffix(".json")
        .tempfile_in(directory.path())
        .unwrap()
        .into_temp_path();
    let pending = super::Pending {
        path,
        nonce: "0".repeat(64),
    };
    assert!(!pending.reported().unwrap());
    assert_eq!(pending.failure().unwrap(), None);
    fs::write(&pending.path, b"{}").unwrap();
    assert!(pending.reported().unwrap());
}
