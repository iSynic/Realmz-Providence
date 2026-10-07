use super::{SOURCE_FILES, TACTICALS, VerifiedSources};
use crate::build::encoding;
use serde_json::{Value, json};
use std::{fs, path::Path};
use tempfile::TempDir;

fn source_set() -> (TempDir, Value) {
    let root = TempDir::new().unwrap();
    let files = SOURCE_FILES
        .into_iter()
        .chain([TACTICALS])
        .map(|name| {
            let payload = name.as_bytes();
            fs::write(root.path().join(name), payload).unwrap();
            json!({"name": name, "bytes": payload.len(), "sha256": encoding::sha256(payload)})
        })
        .collect::<Vec<_>>();
    let manifest = json!({
        "sourceRepository": "synthetic", "sourceCommit": "source",
        "donorRepository": "synthetic", "donorCommit": "donor", "files": files
    });
    write_manifest(root.path(), &manifest);
    (root, manifest)
}

fn write_manifest(root: &Path, manifest: &Value) {
    fs::write(
        root.join("manifest.json"),
        serde_json::to_vec(manifest).unwrap(),
    )
    .unwrap();
}

fn failure(root: &Path) -> String {
    match VerifiedSources::load(root) {
        Ok(_) => panic!("invalid pinned source set was accepted"),
        Err(reason) => reason,
    }
}

#[test]
fn verified_sources_retain_manifest_and_do_not_load_unrequested_files() {
    let (root, mut manifest) = source_set();
    manifest["files"].as_array_mut().unwrap().push(json!({
        "name": "unrequested", "bytes": 5, "sha256": "not-an-input"
    }));
    write_manifest(root.path(), &manifest);
    let sources = VerifiedSources::load(root.path()).unwrap();
    assert_eq!(
        sources.manifest_bytes,
        fs::read(root.path().join("manifest.json")).unwrap()
    );
    assert_eq!(sources.manifest.files.len(), 10);
    assert_eq!(sources.bytes("Data ID").unwrap(), b"Data ID");
    assert_eq!(
        sources.bytes("unrequested").unwrap_err(),
        "source bytes for unrequested are absent"
    );
}

#[test]
fn required_declaration_is_not_replaced_by_a_file_found_on_disk() {
    let (root, mut manifest) = source_set();
    manifest["files"]
        .as_array_mut()
        .unwrap()
        .retain(|file| file["name"] != "Custom Names.rsrc");
    write_manifest(root.path(), &manifest);
    assert_eq!(
        failure(root.path()),
        "source manifest does not declare Custom Names.rsrc"
    );
}

#[test]
fn size_and_hash_mismatches_both_reject_pinned_sources() {
    let (root, _) = source_set();
    fs::write(root.path().join("Data S"), b"longer payload").unwrap();
    assert_eq!(
        failure(root.path()),
        "source file Data S does not match its pinned manifest"
    );
    fs::write(root.path().join("Data S"), b"xxxxxx").unwrap();
    assert_eq!(
        failure(root.path()),
        "source file Data S does not match its pinned manifest"
    );
}

#[test]
fn multiple_source_failures_keep_stable_native_filename_precedence() {
    let (root, mut manifest) = source_set();
    manifest["files"].as_array_mut().unwrap().reverse();
    write_manifest(root.path(), &manifest);
    fs::write(root.path().join("Data S"), b"bad").unwrap();
    fs::write(root.path().join("Data Caste"), b"bad").unwrap();
    assert_eq!(
        failure(root.path()),
        "source file Data Caste does not match its pinned manifest"
    );
}
