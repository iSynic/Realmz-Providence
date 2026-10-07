use super::*;
use zip::{ZipWriter, write::SimpleFileOptions};

fn inspect_documents(
    documents: &[(String, Vec<u8>)],
) -> Result<RebuiltV3ArchiveInspection, RebuiltV3ArchiveError> {
    let files = borrowed_files(documents);
    let manifest = fixture_manifest(&files);
    let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .expect("archive")
        .into_inner();
    inspect_rebuilt_v3_archive(Cursor::new(bytes))
}

fn edit_document(documents: &mut [(String, Vec<u8>)], index: usize, edit: impl FnOnce(&mut Value)) {
    let mut value = serde_json::from_slice(&documents[index].1).expect("JSON");
    edit(&mut value);
    documents[index].1 = serde_json::to_vec(&value).expect("canonical JSON");
}

fn assert_document_error(documents: &[(String, Vec<u8>)], path: &str, reason: &str) {
    assert!(matches!(inspect_documents(documents),
        Err(RebuiltV3ArchiveError::InvalidDocument { path: actual, reason: actual_reason })
        if actual == path && actual_reason.contains(reason)));
}

#[test]
fn document_validation_keeps_header_campaign_start_hook_and_media_precedence() {
    let mut documents = reimportable_documents();
    edit_document(&mut documents, 0, |value| {
        value["kind"] = json!("wrong");
        value["campaign"]["id"] = json!("other");
    });
    edit_document(&mut documents, 1, |value| value["maps"] = json!([]));
    edit_document(&mut documents, 2, |value| {
        value["applicationHooks"]["shop"] = json!("missing")
    });
    edit_document(&mut documents, 3, |value| value["kind"] = json!("wrong"));
    assert_document_error(&documents, "content.json", "kind or schemaVersion");
    edit_document(&mut documents, 0, |value| {
        value["kind"] = json!("realmz2.content")
    });
    assert_document_error(&documents, "assets/index.json", "kind or schemaVersion");
    edit_document(&mut documents, 3, |value| {
        value["kind"] = json!("realmz2.assets")
    });
    assert_document_error(&documents, "content.json", "campaign identity");
    edit_document(&mut documents, 0, |value| {
        value["campaign"]["id"] = json!("archive-fixture")
    });
    assert_document_error(&documents, "world.json", "start map is absent");
    documents[1] = reimportable_documents().remove(1);
    edit_document(&mut documents, 1, |value| {
        value["maps"][0]["width"] = json!(0)
    });
    assert_document_error(&documents, "world.json", "start coordinate");
    documents[1] = reimportable_documents().remove(1);
    assert_document_error(&documents, "scenario.json", "application hook 'missing'");
    edit_document(&mut documents, 2, |value| {
        value["applicationHooks"]["shop"] = Value::Null
    });
    assert!(inspect_documents(&documents).is_ok());
}

#[test]
fn manifest_validation_preserves_first_failure_and_rejects_extended_authored_origin() {
    let documents = reimportable_documents();
    let files = borrowed_files(&documents);
    let mut manifest = fixture_manifest(&files).manifest;
    manifest.schema_version = 4;
    manifest.schema_hash = REBUILT_V4_SCHEMA_SHA256.into();
    manifest.name.clear();
    manifest.capabilities = vec!["unsupported".into()];
    manifest.files.clear();
    let assert_reason = |manifest: &providence_core::rebuilt::RebuiltV3Manifest, reason: &str| {
        assert!(matches!(validate_manifest_contract(manifest),
            Err(RebuiltV3ArchiveError::InvalidManifest(actual)) if actual.contains(reason)));
    };
    assert_reason(&manifest, "imported-schema origin");
    manifest.compiler.project_origin = "imported".into();
    assert_reason(&manifest, "metadata is incomplete");
    manifest.name = "Fixture".into();
    assert_reason(&manifest, "capabilities");
    manifest.capabilities.clear();
    assert!(matches!(validate_manifest_contract(&manifest),
        Err(RebuiltV3ArchiveError::MissingFile(path)) if path == REBUILT_V3_REQUIRED_DOCUMENTS[0]));
}

fn raw_archive(entries: &[(&str, &[u8])], certified: bool) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for (path, bytes) in entries {
        let options = SimpleFileOptions::default()
            .compression_method(if certified {
                CompressionMethod::Deflated
            } else {
                CompressionMethod::Stored
            })
            .last_modified_time(zip::DateTime::default())
            .unix_permissions(0o644);
        writer.start_file(*path, options).expect("entry");
        std::io::Write::write_all(&mut writer, bytes).expect("payload");
    }
    writer.finish().expect("archive").into_inner()
}

#[test]
fn inspection_rejects_order_then_missing_manifest_then_metadata_then_json() {
    let bytes = raw_archive(&[("z.json", b"bad"), ("a.json", b"bad")], false);
    assert!(matches!(
        inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::NondeterministicEntryOrder)
    ));
    let bytes = raw_archive(&[("a.json", b"bad")], false);
    assert!(matches!(
        inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::MissingManifest)
    ));
    let bytes = raw_archive(&[("manifest.json", b"bad")], false);
    assert!(matches!(inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::NondeterministicEntryMetadata(path)) if path == "manifest.json"));
    let bytes = raw_archive(&[("manifest.json", b"bad")], true);
    assert!(matches!(inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::InvalidJson { path, .. }) if path == "manifest.json"));
}

#[test]
fn payload_integrity_precedes_content_and_package_identity() {
    let documents = reimportable_documents();
    let files = borrowed_files(&documents);
    let mut manifest = fixture_manifest(&files);
    manifest.manifest.content_id = "0".repeat(64);
    manifest.manifest.package_hash = "0".repeat(64);
    manifest.canonical_json =
        serde_json::to_vec(&serde_json::to_value(&manifest.manifest).unwrap()).unwrap();
    let mut entries = documents
        .iter()
        .map(|(path, bytes)| (path.as_str(), bytes.as_slice()))
        .collect::<Vec<_>>();
    entries.push(("manifest.json", &manifest.canonical_json));
    entries.sort_by_key(|(path, _)| *path);
    let original_content = entries
        .iter()
        .position(|(path, _)| *path == "content.json")
        .unwrap();
    entries[original_content].1 = b"bad";
    let bytes = raw_archive(&entries, true);
    assert!(matches!(inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::FileIntegrityMismatch(path)) if path == "content.json"));
    entries[original_content].1 = &documents[0].1;
    let bytes = raw_archive(&entries, true);
    assert!(matches!(inspect_rebuilt_v3_archive(Cursor::new(bytes)),
        Err(RebuiltV3ArchiveError::ContentIdMismatch { expected, .. }) if expected == "0".repeat(64)));
}

#[test]
fn media_inventory_and_integrity_must_match_the_asset_index() {
    let mut documents = reimportable_documents();
    let payload = b"fixture media";
    let digest = crate::integrity::sha256_hex(payload);
    let path = format!("assets/media/{digest}.png");
    documents.push((path.clone(), payload.to_vec()));
    assert_document_error(&documents, "assets/index.json", "media path set");
    let asset = json!({
        "id": "fixture-image", "label": "Fixture", "kind": "image",
        "bytes": payload.len(), "sha256": digest, "path": path
    });
    edit_document(&mut documents, 3, |value| value["assets"] = json!([asset]));
    let inspected = inspect_documents(&documents).expect("media and inventory agree");
    assert_eq!(inspected.archive_file_count, 6);
    assert_eq!(inspected.media_file_count, 1);
    edit_document(&mut documents, 3, |value| {
        value["assets"][0]["bytes"] = json!(0)
    });
    assert_document_error(
        &documents,
        "assets/index.json",
        "asset 'fixture-image' integrity",
    );
}

struct FailedDestination(Cursor<Vec<u8>>);

impl std::io::Write for FailedDestination {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::other("fixture write failure"))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl std::io::Seek for FailedDestination {
    fn seek(&mut self, position: std::io::SeekFrom) -> std::io::Result<u64> {
        self.0.seek(position)
    }
}

#[test]
fn write_failure_never_returns_a_completed_destination() {
    let documents = reimportable_documents();
    let files = borrowed_files(&documents);
    let manifest = fixture_manifest(&files);
    assert!(
        write_rebuilt_v3_archive(
            FailedDestination(Cursor::new(Vec::new())),
            &manifest,
            &files
        )
        .is_err()
    );
}
